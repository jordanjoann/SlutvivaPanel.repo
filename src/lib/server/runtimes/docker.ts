import type { Duplex } from "node:stream";
import type Docker from "dockerode";
import type { Instance, Player, ServerStats, ServerStatus } from "@/lib/types";
import { config } from "../config";
import { consoleBus } from "../console-bus";
import { normalizeConsoleCommand } from "../commands";
import type { CommandDeliveryResult, Runtime } from "./types";
import {
  backendPortBindings,
  normalizeDockerRuntimeStats,
} from "./docker-helpers";
import { ensureFxServerBaseImage } from "../gta/base-image";
import { hasUsableGtaSecret } from "../gta/server-data";
import {
  dockerCommand,
  dockerMounts,
  ensureInstanceDockerFiles,
  ensureServerInstalled,
  normalizeDockerImage,
} from "../provisioning";
import { ensureRunnableServerConfig } from "../seed";

export {
  backendPortBindings,
  normalizeDockerRuntimeStats,
} from "./docker-helpers";

let dockerClient: Docker | null = null;
async function docker(): Promise<Docker> {
  if (!dockerClient) {
    const { default: DockerClient } = await import("dockerode");
    dockerClient = new DockerClient({ socketPath: config.docker.socket });
  }
  return dockerClient;
}

/** Cheap availability probe used by the runtime factory. */
export async function dockerAvailable(): Promise<boolean> {
  try {
    await (await docker()).ping();
    return true;
  } catch {
    return false;
  }
}

type DockerInspect = {
  State: {
    Running: boolean;
    Restarting?: boolean;
    StartedAt?: string;
  };
  Config: {
    Image?: string;
    Cmd?: string[];
  };
  HostConfig: {
    Binds?: string[];
    NetworkMode?: string;
    PortBindings?: Record<string, Array<{ HostPort?: string }>>;
  };
};

/**
 * Supervises an instance running as a docker container on the
 * `slutvival-net` network. Streams container logs to the console bus and
 * forwards commands over the attached stdin stream.
 */
export class DockerRuntime implements Runtime {
  readonly kind = "docker" as const;
  readonly live = true;

  private status: ServerStatus = "unknown";
  private startedAt = 0;
  private stats: ServerStats;
  private players = new Map<string, Player>();
  private stdin?: Duplex;
  private logStream?: NodeJS.ReadableStream;

  constructor(private instance: Instance) {
    this.stats = {
      cpuPercent: 0,
      memoryUsedMB: 0,
      memoryLimitMB: instance.resources.memoryLimitMB,
      memoryPercent: 0,
      netRxKBs: 0,
      netTxKBs: 0,
      diskUsedMB: 0,
      diskTotalMB: 51200,
      threads: 0,
    };
  }

  private async container() {
    return (await docker()).getContainer(this.instance.docker.containerName);
  }

  private image() {
    return normalizeDockerImage(this.instance.docker.image, this.instance.game);
  }

  getStatus() {
    return this.status;
  }
  uptimeSeconds() {
    return this.status === "running" && this.startedAt
      ? Math.floor((Date.now() - this.startedAt) / 1000)
      : 0;
  }

  async refresh() {
    try {
      const info = (await (await this.container()).inspect()) as DockerInspect;
      this.status = info.State.Restarting
        ? "starting"
        : info.State.Running
          ? "running"
          : "stopped";
      if (info.State.StartedAt)
        this.startedAt = new Date(info.State.StartedAt).getTime();
      if (info.State.Running && !this.logStream) await this.attachLogs();
    } catch (e) {
      this.status = isDockerNotFound(e) ? "stopped" : "unknown";
    }
    this.stats = normalizeDockerRuntimeStats(this.status, this.stats);
    return this.status;
  }

  private async attachLogs() {
    try {
      const stream = (await (await this.container()).logs({
        follow: true,
        stdout: true,
        stderr: true,
        tail: 200,
        timestamps: false,
      })) as unknown as NodeJS.ReadableStream;
      this.logStream = stream;
      stream.on("data", (b: Buffer) => {
        // strip docker multiplexing header (8 bytes) when present
        const text = b.length > 8 ? b.slice(8).toString() : b.toString();
        for (const line of text.split(/\r?\n/)) {
          if (line.trim()) consoleBus.push(this.instance.id, line.trimEnd());
        }
      });
      stream.on("end", () => (this.logStream = undefined));
    } catch {
      /* logs are best-effort */
    }
  }

  async start() {
    this.status = "starting";
    await this.ensureContainer();
    const info = (await (await this.container()).inspect()) as DockerInspect;
    if (info.State.Running && !info.State.Restarting) {
      this.status = "running";
      return;
    }
    await (await this.container()).start();
    this.startedAt = Date.now();
    this.status = "running";
    await this.attachLogs();
  }

  async stop() {
    this.status = "stopping";
    try {
      await (await this.container()).stop({ t: 15 });
    } catch (e) {
      if (!isDockerNotFound(e) && !isDockerNotModified(e)) throw e;
    }
    this.status = "stopped";
    this.players.clear();
    this.stats = normalizeDockerRuntimeStats(this.status, this.stats);
  }

  async restart() {
    this.status = "restarting";
    await this.ensureContainer();
    await (await this.container()).restart({ t: 15 });
    this.status = "running";
  }

  async kill() {
    try {
      await (await this.container()).kill();
    } catch (e) {
      if (!isDockerNotFound(e) && !isDockerNotModified(e)) throw e;
    }
    this.status = "stopped";
    this.stats = normalizeDockerRuntimeStats(this.status, this.stats);
  }

  async sendCommand(command: string): Promise<CommandDeliveryResult> {
    const normalized = normalizeConsoleCommand(command);
    if (!normalized) return { ok: false, error: "command is required" };
    consoleBus.push(this.instance.id, normalized, "command");
    try {
      if (!this.stdin) {
        const stream = (await (await this.container()).attach({
          stream: true,
          stdin: true,
          stdout: false,
          stderr: false,
          hijack: true,
        })) as unknown as Duplex;
        this.stdin = stream;
      }
      await writeLine(this.stdin, `${normalized}\n`);
      return { ok: true };
    } catch {
      consoleBus.push(
        this.instance.id,
        "Failed to deliver command to container stdin.",
        "system",
        "error",
      );
      return {
        ok: false,
        error: "Failed to deliver command to container stdin.",
      };
    }
  }

  async sample() {
    if (this.status !== "running") {
      this.stats = normalizeDockerRuntimeStats(this.status, this.stats);
      return;
    }
    try {
      const s = (await (await this.container()).stats({ stream: false })) as unknown as {
        cpu_stats: { cpu_usage: { total_usage: number }; system_cpu_usage: number; online_cpus: number };
        precpu_stats: { cpu_usage: { total_usage: number }; system_cpu_usage: number };
        memory_stats: { usage: number; limit: number };
        networks?: Record<string, { rx_bytes: number; tx_bytes: number }>;
      };
      const cpuDelta = s.cpu_stats.cpu_usage.total_usage - s.precpu_stats.cpu_usage.total_usage;
      const sysDelta = s.cpu_stats.system_cpu_usage - s.precpu_stats.system_cpu_usage;
      const cpus = s.cpu_stats.online_cpus || 1;
      if (sysDelta > 0)
        this.stats.cpuPercent = Math.round((cpuDelta / sysDelta) * cpus * 1000) / 10;
      this.stats.memoryUsedMB = Math.round(s.memory_stats.usage / 1048576);
      this.stats.memoryLimitMB = Math.round(s.memory_stats.limit / 1048576) || this.stats.memoryLimitMB;
      this.stats.memoryPercent = (this.stats.memoryUsedMB / this.stats.memoryLimitMB) * 100;
      const net = Object.values(s.networks ?? {})[0];
      if (net) {
        this.stats.netRxKBs = Math.round(net.rx_bytes / 1024);
        this.stats.netTxKBs = Math.round(net.tx_bytes / 1024);
      }
    } catch {
      /* sampling best-effort */
    }
    this.stats = normalizeDockerRuntimeStats(this.status, this.stats);
  }

  getStats() {
    return normalizeDockerRuntimeStats(this.status, this.stats);
  }
  getPlayers() {
    return [...this.players.values()];
  }

  private async ensureContainer() {
    await ensureRunnableServerConfig(this.instance);
    if (this.instance.game === "gta" && !(await hasUsableGtaSecret(this.instance))) {
      consoleBus.push(
        this.instance.id,
        "GTA setup incomplete: add a real Cfx.re sv_licenseKey to server-data/server.secret.cfg.",
        "system",
        "error",
      );
      throw new Error("GTA setup incomplete: missing Cfx.re sv_licenseKey");
    }
    await ensureServerInstalled(this.instance, {
      onLog: (message) => consoleBus.push(this.instance.id, message, "system"),
    });
    await this.ensureImage();

    const info = await this.inspectContainer();
    if (info && !info.State.Restarting && !this.needsRecreate(info)) return;

    if (info) {
      consoleBus.push(
        this.instance.id,
        info.State.Restarting
          ? "Recreating container after Docker restart loop."
          : "Recreating container to match the panel-managed instance config.",
        "system",
      );
      await this.removeContainer();
    }

    await ensureInstanceDockerFiles(this.instance);
    const port = String(this.instance.port);
    const portBindings = backendPortBindings(this.instance);
    await (await docker()).createContainer({
      name: this.instance.docker.containerName,
      Image: this.image(),
      WorkingDir: this.instance.game === "gta" ? "/server-data" : "/server",
      Cmd: dockerCommand(this.instance),
      OpenStdin: true,
      AttachStdin: true,
      Tty: false,
      ExposedPorts: {
        [`${port}/tcp`]: {},
        [`${port}/udp`]: {},
      },
      Env: this.instance.game === "gta"
        ? [`FXSERVER_BUILD=${this.instance.version}`, "FXSERVER_DATA_PATH=/server-data"]
        : [`VINTAGE_STORY_SERVER_VERSION=${this.instance.version}`, "VINTAGE_STORY_DATA_PATH=/data"],
      Labels: {
        "slutvival.panel.managed": "true",
        "slutvival.panel.instance": this.instance.id,
        "slutvival.panel.game": this.instance.game,
      },
      HostConfig: {
        Binds: dockerMounts(this.instance),
        NetworkMode: this.instance.docker.network,
        PortBindings: portBindings,
        RestartPolicy: { Name: "unless-stopped" },
        Memory: this.instance.resources.memoryLimitMB * 1024 * 1024,
        NanoCpus:
          this.instance.resources.cpuLimit > 0
            ? Math.round(this.instance.resources.cpuLimit * 1_000_000_000)
            : 0,
      },
    });
  }

  private async inspectContainer(): Promise<DockerInspect | null> {
    try {
      return (await (await this.container()).inspect()) as DockerInspect;
    } catch (e) {
      if (isDockerNotFound(e)) return null;
      throw e;
    }
  }

  private needsRecreate(info: DockerInspect): boolean {
    const mounts = dockerMounts(this.instance);
    const binds = info.HostConfig.Binds ?? [];
    const ports = info.HostConfig.PortBindings ?? {};
    const command = info.Config.Cmd ?? [];

    return (
      info.Config.Image !== this.image() ||
      info.HostConfig.NetworkMode !== this.instance.docker.network ||
      !mounts.every((mount) => binds.includes(mount)) ||
      JSON.stringify(ports) !== JSON.stringify(backendPortBindings(this.instance)) ||
      command.join("\0") !== dockerCommand(this.instance).join("\0")
    );
  }

  private async removeContainer() {
    try {
      const info = await this.inspectContainer();
      if (info?.State.Running) await (await this.container()).stop({ t: 15 });
      await (await this.container()).remove({ force: true });
    } catch (e) {
      if (!isDockerNotFound(e)) throw e;
    }
  }

  private async ensureImage() {
    try {
      await (await docker()).getImage(this.image()).inspect();
      return;
    } catch (e) {
      if (!isDockerNotFound(e)) throw e;
    }

    if (this.instance.game === "gta") {
      await ensureFxServerBaseImage(await docker(), this.image(), (message) =>
        consoleBus.push(this.instance.id, message, "system"),
      );
      return;
    }

    consoleBus.push(
      this.instance.id,
      `Pulling Docker image ${this.image()}...`,
      "system",
    );
    const client = await docker();
    const stream = await client.pull(this.image());
    await new Promise<void>((resolve, reject) => {
      client.modem.followProgress(stream, (err: Error | null) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }
}

function writeLine(stream: NodeJS.WritableStream, line: string): Promise<void> {
  return new Promise((resolve, reject) => {
    stream.write(line, (error?: Error | null) => {
      if (error) reject(error);
      else resolve();
    });
  });
}

function isDockerNotFound(error: unknown): error is { statusCode: 404 } {
  return (
    typeof error === "object" &&
    error !== null &&
    "statusCode" in error &&
    error.statusCode === 404
  );
}

function isDockerNotModified(error: unknown): error is { statusCode: 304 } {
  return (
    typeof error === "object" &&
    error !== null &&
    "statusCode" in error &&
    error.statusCode === 304
  );
}
