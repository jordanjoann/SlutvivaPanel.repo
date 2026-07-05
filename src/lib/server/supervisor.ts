import type {
  Backup,
  Instance,
  InstanceRuntimeState,
  Player,
  PowerAction,
} from "@/lib/types";
import { config } from "./config";
import { singleton } from "./singleton";
import type { CommandDeliveryResult, Runtime } from "./runtimes/types";
import { SimulatedRuntime } from "./runtimes/simulated";
import { ProcessRuntime } from "./runtimes/process";
import { DockerRuntime, dockerAvailable } from "./runtimes/docker";
import { maybeCreateScheduledBackup } from "./backups";
import { publishDiscordNotification } from "./discord";

class Supervisor {
  private runtimes = new Map<string, Runtime>();
  private booted = new Set<string>();

  private async createRuntime(inst: Instance): Promise<Runtime> {
    const pref = config.preferredRuntime;

    if (pref !== "simulated") {
      const wantDocker = pref === "docker" || pref === "auto";
      if (wantDocker && (await dockerAvailable())) {
        try {
          const r = new DockerRuntime(inst);
          await r.refresh();
          return r;
        } catch {
          /* fall through */
        }
      }
      const wantProcess = pref === "process" || pref === "auto";
      if (wantProcess && ProcessRuntime.isAvailable(inst.id)) {
        return new ProcessRuntime(inst);
      }
    }
    return new SimulatedRuntime(inst);
  }

  private async ensureRuntime(inst: Instance): Promise<Runtime> {
    let rt = this.runtimes.get(inst.id);
    if (!rt) {
      rt = await this.createRuntime(inst);
      this.runtimes.set(inst.id, rt);
      // Honor auto-restart: bring the server up when the panel first
      // touches it (only meaningful for the simulator in dev).
      if (!this.booted.has(inst.id)) {
        this.booted.add(inst.id);
        if (inst.autoRestart && rt.kind === "simulated") {
          void rt.start();
        }
      }
    }
    return rt;
  }

  async getState(inst: Instance): Promise<InstanceRuntimeState> {
    const rt = await this.ensureRuntime(inst);
    void maybeCreateScheduledBackup(inst, (backup) =>
      notifyScheduledBackup(inst, backup),
    ).catch(() => {});
    if (rt instanceof DockerRuntime) {
      await rt.refresh();
      await rt.sample();
    }
    const players = rt.getPlayers();
    return {
      status: rt.getStatus(),
      runtime: rt.kind,
      live: rt.live,
      uptimeSeconds: rt.uptimeSeconds(),
      playersOnline: players.length,
      stats: rt.getStats(),
    };
  }

  async power(inst: Instance, action: PowerAction): Promise<void> {
    const rt = await this.ensureRuntime(inst);
    switch (action) {
      case "start":
        return rt.start();
      case "stop":
        return rt.stop();
      case "restart":
        return rt.restart();
      case "kill":
        return rt.kill();
    }
  }

  async command(inst: Instance, cmd: string): Promise<CommandDeliveryResult> {
    const rt = await this.ensureRuntime(inst);
    return rt.sendCommand(cmd);
  }

  async players(inst: Instance): Promise<Player[]> {
    const rt = await this.ensureRuntime(inst);
    return rt.getPlayers();
  }

  /** Drop a runtime (e.g. on instance deletion). */
  forget(id: string): void {
    const rt = this.runtimes.get(id);
    if (rt) void rt.kill().catch(() => {});
    this.runtimes.delete(id);
    this.booted.delete(id);
  }
}

export const supervisor = singleton("supervisor", () => new Supervisor());

async function notifyScheduledBackup(inst: Instance, backup: Backup) {
  if (backup.kind === "restore-point") return;
  try {
    await publishDiscordNotification(
      inst,
      "admin",
      `backup '${backup.name}' completed.`,
    );
  } catch (error) {
    console.warn("Discord scheduled backup notification failed", error);
  }
}
