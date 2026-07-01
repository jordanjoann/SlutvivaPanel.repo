import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import type { Instance, Player, ServerStats, ServerStatus } from "@/lib/types";
import { instanceDir, instanceDataPath } from "../config";
import { consoleBus } from "../console-bus";
import type { Runtime } from "./types";

/**
 * Launches Vintage Story directly as a child process:
 *   dotnet VintagestoryServer.dll --dataPath <dataPath>
 * or the self-contained `./VintagestoryServer` binary when present.
 *
 * Streams stdout/stderr to the console bus and forwards panel commands to
 * the server's stdin. Available whenever the server files are installed
 * under the instance directory.
 */
export class ProcessRuntime implements Runtime {
  readonly kind = "process" as const;
  readonly live = true;

  private child?: ChildProcessWithoutNullStreams;
  private status: ServerStatus = "stopped";
  private startedAt = 0;
  private players = new Map<string, Player>();
  private stats: ServerStats;
  private sampler?: ReturnType<typeof setInterval>;

  constructor(private instance: Instance) {
    this.stats = emptyStats(instance.resources.memoryLimitMB);
  }

  /** Locate the launch command for this instance, if installed. */
  static resolveLaunch(
    serverId: string,
  ): { cmd: string; args: string[]; cwd: string } | null {
    const dir = instanceDir(serverId);
    const data = instanceDataPath(serverId);
    const binNames = process.platform === "win32"
      ? ["VintagestoryServer.exe"]
      : ["VintagestoryServer"];
    for (const b of binNames) {
      const p = path.join(dir, b);
      if (fs.existsSync(p)) return { cmd: p, args: ["--dataPath", data], cwd: dir };
    }
    const dll = path.join(dir, "VintagestoryServer.dll");
    if (fs.existsSync(dll))
      return { cmd: "dotnet", args: [dll, "--dataPath", data], cwd: dir };
    return null;
  }

  static isAvailable(serverId: string): boolean {
    return ProcessRuntime.resolveLaunch(serverId) !== null;
  }

  getStatus() {
    return this.status;
  }
  uptimeSeconds() {
    return this.status === "running" && this.startedAt
      ? Math.floor((Date.now() - this.startedAt) / 1000)
      : 0;
  }

  async start() {
    if (this.child) return;
    const launch = ProcessRuntime.resolveLaunch(this.instance.id);
    if (!launch) throw new Error("Vintage Story server files not found");
    this.status = "starting";
    consoleBus.push(
      this.instance.id,
      `Launching: ${launch.cmd} ${launch.args.join(" ")}`,
      "system",
    );
    const child = spawn(launch.cmd, launch.args, {
      cwd: launch.cwd,
      env: process.env,
    }) as ChildProcessWithoutNullStreams;
    this.child = child;
    this.startedAt = Date.now();
    this.status = "running";

    child.stdout.on("data", (b: Buffer) => this.ingest(b.toString(), "stdout"));
    child.stderr.on("data", (b: Buffer) => this.ingest(b.toString(), "stderr"));
    child.on("exit", (code) => {
      this.status = code === 0 ? "stopped" : "crashed";
      this.child = undefined;
      this.startedAt = 0;
      this.players.clear();
      this.stopSampler();
      consoleBus.push(
        this.instance.id,
        `Server process exited with code ${code}`,
        "system",
        code === 0 ? "info" : "error",
      );
    });
    this.startSampler(child.pid);
  }

  async stop() {
    if (!this.child) return;
    this.status = "stopping";
    // VS responds to a graceful /stop on stdin
    try {
      this.child.stdin.write("/stop\n");
    } catch {
      this.child.kill("SIGTERM");
    }
    const child = this.child;
    await new Promise<void>((resolve) => {
      const t = setTimeout(() => {
        child.kill("SIGKILL");
        resolve();
      }, 15000);
      child.once("exit", () => {
        clearTimeout(t);
        resolve();
      });
    });
  }

  async restart() {
    await this.stop();
    await new Promise((r) => setTimeout(r, 800));
    await this.start();
  }

  async kill() {
    this.child?.kill("SIGKILL");
  }

  async sendCommand(command: string) {
    consoleBus.push(this.instance.id, `> ${command}`, "command");
    if (!this.child) {
      consoleBus.push(this.instance.id, "Server is not running.", "system", "warning");
      return;
    }
    this.child.stdin.write(command.replace(/^\//, "") + "\n");
  }

  private ingest(chunk: string, stream: "stdout" | "stderr") {
    for (const raw of chunk.split(/\r?\n/)) {
      const line = raw.trimEnd();
      if (!line) continue;
      consoleBus.push(this.instance.id, line, stream);
      this.parsePlayers(line);
    }
  }

  private parsePlayers(line: string) {
    const join = /(\w[\w-]*) joins\./.exec(line);
    if (join) {
      const name = join[1];
      this.players.set(name, {
        uid: name,
        name,
        online: true,
        pingMs: 0,
        playtimeSeconds: 0,
        isOp: false,
        isWhitelisted: true,
        lastSeen: Date.now(),
      });
    }
    const left = /Player (\w[\w-]*) got disconnected/.exec(line);
    if (left) this.players.delete(left[1]);
  }

  private startSampler(pid?: number) {
    if (!pid) return;
    this.stopSampler();
    this.sampler = setInterval(async () => {
      try {
        const si = (await import("systeminformation")).default;
        const load = await si.processLoad("");
        // Fallback: read from full process list matched by pid
        const procs = await si.processes();
        const p = procs.list.find((x) => x.pid === pid);
        if (p) {
          this.stats.cpuPercent = Math.round(p.cpu * 10) / 10;
          this.stats.memoryUsedMB = Math.round(p.memRss / 1024);
          this.stats.memoryPercent =
            (this.stats.memoryUsedMB / this.stats.memoryLimitMB) * 100;
        }
        void load;
      } catch {
        /* sampling is best-effort */
      }
    }, 4000);
  }
  private stopSampler() {
    if (this.sampler) clearInterval(this.sampler);
    this.sampler = undefined;
  }

  getStats() {
    return { ...this.stats };
  }
  getPlayers() {
    return [...this.players.values()];
  }
}

function emptyStats(limit: number): ServerStats {
  return {
    cpuPercent: 0,
    memoryUsedMB: 0,
    memoryLimitMB: limit,
    memoryPercent: 0,
    netRxKBs: 0,
    netTxKBs: 0,
    diskUsedMB: 0,
    diskTotalMB: 51200,
    threads: 0,
  };
}
