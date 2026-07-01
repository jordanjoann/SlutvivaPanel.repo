import type {
  Instance,
  Player,
  ServerStats,
  ServerStatus,
} from "@/lib/types";
import { consoleBus } from "../console-bus";
import type { Runtime } from "./types";

const NAME_POOL = [
  "AshFallen",
  "CopperKettle",
  "NightForge",
  "PineWhisper",
  "SaltMarsh",
  "RustyPickaxe",
  "MossyStone",
  "EmberKiln",
  "FrostElk",
  "ClayHollow",
  "WillowBark",
  "IronBloom",
];

function rand(min: number, max: number) {
  return min + Math.random() * (max - min);
}
function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}
function ts(): string {
  return new Date().toISOString().replace("T", " ").slice(0, 19);
}

/**
 * A believable, fully-interactive Vintage Story server simulation. It emits
 * VS-style log lines, tracks players joining/leaving, wanders resource usage,
 * and responds to the common admin commands the panel issues. Used whenever no
 * real docker container or dotnet process is available (e.g. Windows dev).
 */
export class SimulatedRuntime implements Runtime {
  readonly kind = "simulated" as const;
  readonly live = false;

  private status: ServerStatus = "stopped";
  private startedAt = 0;
  private tick?: ReturnType<typeof setInterval>;
  private players: Player[] = [];
  private stats: ServerStats;
  private cpuBias = rand(6, 14);

  constructor(private instance: Instance) {
    this.stats = {
      cpuPercent: 0,
      memoryUsedMB: 0,
      memoryLimitMB: instance.resources.memoryLimitMB,
      memoryPercent: 0,
      netRxKBs: 0,
      netTxKBs: 0,
      diskUsedMB: Math.round(rand(2200, 6400)),
      diskTotalMB: 51200,
      threads: 0,
    };
  }

  getStatus() {
    return this.status;
  }

  uptimeSeconds() {
    return this.status === "running" && this.startedAt
      ? Math.floor((Date.now() - this.startedAt) / 1000)
      : 0;
  }

  private log(text: string) {
    consoleBus.push(this.instance.id, text, "stdout");
  }

  async start() {
    if (this.status === "running" || this.status === "starting") return;
    this.status = "starting";
    const v = this.instance.version;
    this.log(`Game Version: v${v} (Stable)`);
    this.log(`Loading server config from serverconfig.json`);
    this.log(
      `Server: dotnet VintagestoryServer.dll --dataPath ${this.instance.dataPath}`,
    );
    this.log(`Mods: loaded ${Math.round(rand(4, 22))} mods`);
    await new Promise((r) => setTimeout(r, 900));
    this.log(
      `Loading world '${this.instance.worldName ?? "default"}' (seed ${this.instance.seed ?? "random"})`,
    );
    await new Promise((r) => setTimeout(r, 700));
    this.status = "running";
    this.startedAt = Date.now();
    this.stats.threads = Math.round(rand(18, 32));
    this.log(`Dedicated Server now running on Port ${this.instance.port}!`);
    this.log(
      `[Server Event] Server startup complete. Ready to accept connections.`,
    );
    // seed a couple of players
    const initial = Math.floor(rand(0, Math.min(4, this.instance.maxPlayers)));
    for (let i = 0; i < initial; i++) this.addPlayer(true);
    this.startTicker();
  }

  async stop() {
    if (this.status === "stopped") return;
    this.status = "stopping";
    this.log(`[Server Event] Saving world before shutdown...`);
    for (const p of this.players) {
      consoleBus.push(this.instance.id, `Player ${p.name} got disconnected`, "stdout");
    }
    await new Promise((r) => setTimeout(r, 600));
    this.stopTicker();
    this.players = [];
    this.status = "stopped";
    this.startedAt = 0;
    this.resetStats();
    this.log(`[Server Event] Server stopped.`);
  }

  async restart() {
    this.log(`[Server Event] Restart requested by panel.`);
    await this.stop();
    await new Promise((r) => setTimeout(r, 500));
    await this.start();
  }

  async kill() {
    this.stopTicker();
    this.players = [];
    this.status = "stopped";
    this.startedAt = 0;
    this.resetStats();
    this.log(`[Server Event] Process killed (SIGKILL).`);
  }

  private resetStats() {
    this.stats.cpuPercent = 0;
    this.stats.memoryUsedMB = 0;
    this.stats.memoryPercent = 0;
    this.stats.netRxKBs = 0;
    this.stats.netTxKBs = 0;
    this.stats.threads = 0;
  }

  private addPlayer(silent = false): Player {
    const name = pick(
      NAME_POOL.filter((n) => !this.players.some((p) => p.name === n)),
    );
    if (!name) return this.players[0];
    const p: Player = {
      uid: `sim-${name}`,
      name,
      online: true,
      pingMs: Math.round(rand(18, 120)),
      playtimeSeconds: Math.round(rand(600, 90000)),
      isOp: Math.random() < 0.2,
      isWhitelisted: true,
      lastSeen: Date.now(),
    };
    this.players.push(p);
    if (!silent) {
      this.log(`[${ts()}] ${name} joins. Now 1 player(s)`);
      consoleBus.push(this.instance.id, `${name} [joined the server]`, "stdout");
    }
    return p;
  }

  private removePlayer() {
    if (this.players.length === 0) return;
    const idx = Math.floor(Math.random() * this.players.length);
    const [p] = this.players.splice(idx, 1);
    this.log(`Player ${p.name} got disconnected`);
  }

  private startTicker() {
    this.stopTicker();
    this.tick = setInterval(() => this.onTick(), 3000);
  }
  private stopTicker() {
    if (this.tick) clearInterval(this.tick);
    this.tick = undefined;
  }

  private onTick() {
    if (this.status !== "running") return;
    const load = 1 + this.players.length * 0.6;
    this.stats.cpuPercent = Math.max(
      1,
      Math.min(95, this.cpuBias + load * rand(2, 6) + rand(-3, 3)),
    );
    const baseMem = 700 + this.players.length * 90;
    this.stats.memoryUsedMB = Math.min(
      this.stats.memoryLimitMB,
      baseMem + rand(-40, 120),
    );
    this.stats.memoryPercent =
      (this.stats.memoryUsedMB / this.stats.memoryLimitMB) * 100;
    this.stats.netRxKBs = this.players.length * rand(2, 12);
    this.stats.netTxKBs = this.players.length * rand(4, 24);
    this.stats.diskUsedMB += rand(0, 0.4);

    // occasional world events
    const roll = Math.random();
    if (roll < 0.12 && this.players.length < this.instance.maxPlayers)
      this.addPlayer();
    else if (roll > 0.93 && this.players.length > 0) this.removePlayer();
    else if (roll > 0.6 && roll < 0.64)
      this.log(`[Server Event] Autosaving world...`);
    else if (roll > 0.5 && roll < 0.52 && this.stats.cpuPercent > 70)
      consoleBus.push(
        this.instance.id,
        `[${ts()}] Server overloaded. Ticks taking longer than 33ms.`,
        "stdout",
        "warning",
      );

    for (const p of this.players) {
      p.pingMs = Math.max(8, p.pingMs + rand(-8, 8));
      p.playtimeSeconds += 3;
    }
  }

  getStats() {
    return { ...this.stats };
  }

  getPlayers() {
    return this.players.map((p) => ({ ...p }));
  }

  async sendCommand(command: string) {
    const id = this.instance.id;
    consoleBus.push(id, `> ${command}`, "command");
    const [cmd, ...args] = command.trim().replace(/^\//, "").split(/\s+/);
    const arg = args.join(" ");

    if (this.status !== "running" && cmd !== "start") {
      consoleBus.push(id, `Server is not running.`, "system", "warning");
      return;
    }

    switch (cmd.toLowerCase()) {
      case "list":
      case "players":
        consoleBus.push(
          id,
          `Online players (${this.players.length}/${this.instance.maxPlayers}): ${this.players.map((p) => p.name).join(", ") || "none"}`,
        );
        break;
      case "help":
        consoleBus.push(
          id,
          `Available: /list /stats /time /op <p> /deop <p> /kick <p> /ban <p> /whitelist /setname /setmotd /stop`,
        );
        break;
      case "stats":
        consoleBus.push(
          id,
          `CPU ${this.stats.cpuPercent.toFixed(1)}% | RAM ${Math.round(this.stats.memoryUsedMB)}/${this.stats.memoryLimitMB} MB | Players ${this.players.length}`,
        );
        break;
      case "time":
        consoleBus.push(id, `Current time set to ${arg || "day"}.`);
        break;
      case "op": {
        const p = this.players.find((x) => x.name.toLowerCase() === arg.toLowerCase());
        if (p) {
          p.isOp = true;
          consoleBus.push(id, `Granted operator rights to ${p.name}.`);
        } else consoleBus.push(id, `Player '${arg}' not found.`, "system", "warning");
        break;
      }
      case "deop": {
        const p = this.players.find((x) => x.name.toLowerCase() === arg.toLowerCase());
        if (p) {
          p.isOp = false;
          consoleBus.push(id, `Removed operator rights from ${p.name}.`);
        } else consoleBus.push(id, `Player '${arg}' not found.`, "system", "warning");
        break;
      }
      case "kick": {
        const i = this.players.findIndex((x) => x.name.toLowerCase() === arg.toLowerCase());
        if (i >= 0) {
          const [p] = this.players.splice(i, 1);
          consoleBus.push(id, `Kicked ${p.name} from the server.`);
        } else consoleBus.push(id, `Player '${arg}' not found.`, "system", "warning");
        break;
      }
      case "ban": {
        const i = this.players.findIndex((x) => x.name.toLowerCase() === arg.toLowerCase());
        if (i >= 0) {
          const [p] = this.players.splice(i, 1);
          consoleBus.push(id, `Banned ${p.name}.`);
        } else consoleBus.push(id, `Banned '${arg}'.`);
        break;
      }
      case "setname":
        consoleBus.push(id, `Server name set to '${arg}'.`);
        break;
      case "setmotd":
        consoleBus.push(id, `MOTD updated.`);
        break;
      case "announce":
        consoleBus.push(id, `[Announcement] ${arg}`);
        break;
      case "saveworld":
      case "autosave":
        consoleBus.push(id, `Saved the world to disk.`);
        break;
      case "stop":
        await this.stop();
        break;
      default:
        consoleBus.push(id, `Unknown command '${cmd}'. Type /help.`, "system", "warning");
    }
  }
}
