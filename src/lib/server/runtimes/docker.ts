import type { Duplex } from "node:stream";
import Docker from "dockerode";
import type { Instance, Player, ServerStats, ServerStatus } from "@/lib/types";
import { config } from "../config";
import { consoleBus } from "../console-bus";
import type { Runtime } from "./types";

let dockerClient: Docker | null = null;
function docker(): Docker {
  if (!dockerClient) dockerClient = new Docker({ socketPath: config.docker.socket });
  return dockerClient;
}

/** Cheap availability probe used by the runtime factory. */
export async function dockerAvailable(): Promise<boolean> {
  try {
    await docker().ping();
    return true;
  } catch {
    return false;
  }
}

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

  private container() {
    return docker().getContainer(this.instance.docker.containerName);
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
      const info = await this.container().inspect();
      this.status = info.State.Running ? "running" : "stopped";
      if (info.State.StartedAt)
        this.startedAt = new Date(info.State.StartedAt).getTime();
      if (info.State.Running && !this.logStream) await this.attachLogs();
    } catch {
      this.status = "unknown";
    }
    return this.status;
  }

  private async attachLogs() {
    try {
      const stream = (await this.container().logs({
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
    await this.container().start();
    this.startedAt = Date.now();
    this.status = "running";
    await this.attachLogs();
  }

  async stop() {
    this.status = "stopping";
    await this.container().stop({ t: 15 });
    this.status = "stopped";
    this.players.clear();
  }

  async restart() {
    this.status = "restarting";
    await this.container().restart({ t: 15 });
    this.status = "running";
  }

  async kill() {
    await this.container().kill();
    this.status = "stopped";
  }

  async sendCommand(command: string) {
    consoleBus.push(this.instance.id, `> ${command}`, "command");
    try {
      if (!this.stdin) {
        const stream = (await this.container().attach({
          stream: true,
          stdin: true,
          stdout: false,
          stderr: false,
          hijack: true,
        })) as unknown as Duplex;
        this.stdin = stream;
      }
      this.stdin.write(command.replace(/^\//, "") + "\n");
    } catch {
      consoleBus.push(
        this.instance.id,
        "Failed to deliver command to container stdin.",
        "system",
        "error",
      );
    }
  }

  async sample() {
    try {
      const s = (await this.container().stats({ stream: false })) as unknown as {
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
  }

  getStats() {
    return { ...this.stats };
  }
  getPlayers() {
    return [...this.players.values()];
  }
}
