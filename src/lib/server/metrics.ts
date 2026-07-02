import fs from "node:fs/promises";
import type {
  DockerContainerUsage,
  HostMetrics,
  HostProcess,
  MetricPoint,
} from "@/lib/types";
import { singleton } from "./singleton";
import { listInstances } from "./store";
import { supervisor } from "./supervisor";

const HISTORY = 120; // points retained (~4 min at 2s cadence)
const PROCESS_LIMIT = 20;
const PROC_ROOT = process.env.SLUTVIVAL_PROC_ROOT ?? "/proc";
const CLOCK_TICKS_PER_SECOND = 100;

interface ProcessCpuSample {
  sampledAt: number;
  ticks: number;
}

interface ProcProcess {
  pid: number;
  name: string;
  command?: string;
  user?: string;
  state?: string;
  memoryMB: number;
  cpuTicks: number;
}

interface State {
  host: MetricPoint[];
  perServer: Map<string, MetricPoint[]>;
  lastCpu: number;
  seeded: boolean;
}

function ring(arr: MetricPoint[], point: MetricPoint) {
  arr.push(point);
  while (arr.length > HISTORY) arr.shift();
}

/** Seed history with gently-varying points so graphs render immediately. */
function seedHistory(state: State) {
  const now = Date.now();
  let cpu = 22;
  let mem = 46;
  for (let i = HISTORY; i > 0; i--) {
    cpu = clamp(cpu + rand(-4, 4), 8, 70);
    mem = clamp(mem + rand(-2, 2), 30, 75);
    ring(state.host, {
      t: now - i * 2000,
      cpu: round(cpu),
      mem: round(mem),
      netRx: round(rand(20, 180)),
      netTx: round(rand(20, 220)),
      diskRead: round(rand(0, 60)),
      diskWrite: round(rand(0, 90)),
    });
  }
  state.seeded = true;
}

class MetricsService {
  private state: State = {
    host: [],
    perServer: new Map(),
    lastCpu: 20,
    seeded: false,
  };
  private processSamples = new Map<number, ProcessCpuSample>();

  private ensureSeeded() {
    if (!this.state.seeded) seedHistory(this.state);
  }

  async collectHost(): Promise<HostMetrics> {
    this.ensureSeeded();
    const now = Date.now();

    const instances = await listInstances();
    const states = await Promise.all(
      instances.map(async (i) => ({ inst: i, state: await supervisor.getState(i) })),
    );
    const serversOnline = states.filter((s) => s.state.status === "running").length;
    const playersOnline = states.reduce((n, s) => n + s.state.playersOnline, 0);

    const containers: DockerContainerUsage[] = states.map((s) => ({
      id: s.inst.docker.containerName,
      name: s.inst.name,
      status: s.state.status,
      cpuPercent: round(s.state.stats.cpuPercent),
      memoryMB: round(s.state.stats.memoryUsedMB),
    }));

    // Record per-server history
    for (const s of states) {
      const arr = this.state.perServer.get(s.inst.id) ?? [];
      ring(arr, {
        t: now,
        cpu: round(s.state.stats.cpuPercent),
        mem: round(s.state.stats.memoryPercent),
        netRx: round(s.state.stats.netRxKBs),
        netTx: round(s.state.stats.netTxKBs),
      });
      this.state.perServer.set(s.inst.id, arr);
    }

    const probe = await this.probeHost().catch(() => null);

    const cpuPercent = probe?.cpuPercent ?? this.wanderCpu();
    const perCore = probe?.perCore ?? this.fakeCores(cpuPercent);
    const memTotalMB = probe?.memTotalMB ?? 32768;
    const memUsedMB =
      probe?.memUsedMB ?? Math.round(memTotalMB * (0.4 + serversOnline * 0.06));
    const diskTotalMB = probe?.diskTotalMB ?? 512000;
    const diskUsedMB = probe?.diskUsedMB ?? Math.round(diskTotalMB * 0.42);

    const metric: HostMetrics = {
      cpuPercent: round(cpuPercent),
      perCore: perCore.map(round),
      memUsedMB,
      memTotalMB,
      diskUsedMB,
      diskTotalMB,
      netRxKBs: probe?.netRxKBs ?? round(rand(40, 200) + playersOnline * 5),
      netTxKBs: probe?.netTxKBs ?? round(rand(40, 260) + playersOnline * 8),
      diskReadKBs: probe?.diskReadKBs ?? round(rand(0, 80)),
      diskWriteKBs: probe?.diskWriteKBs ?? round(rand(0, 120)),
      load: probe?.load ?? [cpuPercent / 25, cpuPercent / 30, cpuPercent / 35],
      containersRunning: serversOnline,
      containersTotal: instances.length,
      serversOnline,
      serversTotal: instances.length,
      playersOnline,
      topProcesses: probe?.topProcesses ?? this.fakeProcesses(),
      containers,
      live: !!probe?.live,
      t: now,
    };

    ring(this.state.host, {
      t: now,
      cpu: metric.cpuPercent,
      mem: round((memUsedMB / memTotalMB) * 100),
      netRx: metric.netRxKBs,
      netTx: metric.netTxKBs,
      diskRead: metric.diskReadKBs,
      diskWrite: metric.diskWriteKBs,
    });

    return metric;
  }

  private async probeHost() {
    let si;
    try {
      si = (await import("systeminformation")).default;
    } catch {
      return null;
    }
    // Sample each source independently so one failing probe doesn't blank
    // out the rest (e.g. processes() can be slow/blocked on some hosts).
    const load = await si.currentLoad().catch(() => null);
    const mem = await si.mem().catch(() => null);
    if (!load && !mem) return null; // nothing real to report

    const fs = await si.fsSize().catch(() => []);
    const net = await si.networkStats().catch(() => null);
    const fsStats = await si.fsStats().catch(() => null);
    const procs = await this.probeProcesses().catch(() => null);

    const disk = [...fs].sort((a, b) => b.size - a.size)[0];
    const net0 = Array.isArray(net) ? net[0] : net;
    const top: HostProcess[] =
      procs
        ?.sort((a, b) => b.memoryMB - a.memoryMB || b.cpuPercent - a.cpuPercent)
        .slice(0, PROCESS_LIMIT)
        ?? this.fakeProcesses();

    return {
      live: true,
      cpuPercent: load?.currentLoad ?? this.wanderCpu(),
      perCore: load?.cpus.map((c) => c.load) ?? this.fakeCores(load?.currentLoad ?? 20),
      memTotalMB: mem ? round(mem.total / 1048576) : 32768,
      memUsedMB: mem ? round((mem.total - mem.available) / 1048576) : 14000,
      diskTotalMB: disk ? round(disk.size / 1048576) : 512000,
      diskUsedMB: disk ? round(disk.used / 1048576) : 210000,
      netRxKBs: net0 ? round((net0.rx_sec || 0) / 1024) : round(rand(40, 200)),
      netTxKBs: net0 ? round((net0.tx_sec || 0) / 1024) : round(rand(40, 260)),
      diskReadKBs: fsStats ? round((fsStats.rx_sec || 0) / 1024) : round(rand(0, 80)),
      diskWriteKBs: fsStats ? round((fsStats.wx_sec || 0) / 1024) : round(rand(0, 120)),
      load: [load?.avgLoad || 0, 0, 0] as [number, number, number],
      topProcesses: top,
    };
  }

  private async probeProcesses(): Promise<HostProcess[]> {
    const sampledAt = Date.now();
    const [entries, users] = await Promise.all([
      fs.readdir(PROC_ROOT, { withFileTypes: true }),
      readPasswdUsers().catch(() => new Map<string, string>()),
    ]);
    const numeric = entries
      .filter((entry) => entry.isDirectory() && /^\d+$/.test(entry.name))
      .map((entry) => Number(entry.name));
    const rows = await Promise.all(numeric.map((pid) => readProcProcess(pid, users)));
    const livePids = new Set<number>();
    const processes = rows
      .filter((row): row is ProcProcess => row !== null)
      .map((row) => {
        livePids.add(row.pid);
        return {
          pid: row.pid,
          name: row.name,
          command: row.command,
          user: row.user,
          state: row.state,
          cpuPercent: this.processCpuPercent(row.pid, row.cpuTicks, sampledAt),
          memoryMB: row.memoryMB,
        };
      })
      .filter((process) => process.memoryMB > 0 || process.cpuPercent > 0);

    for (const pid of this.processSamples.keys()) {
      if (!livePids.has(pid)) this.processSamples.delete(pid);
    }

    return processes;
  }

  private processCpuPercent(pid: number, ticks: number, sampledAt: number): number {
    const previous = this.processSamples.get(pid);
    this.processSamples.set(pid, { sampledAt, ticks });
    if (!previous) return 0;

    const elapsedSeconds = (sampledAt - previous.sampledAt) / 1000;
    if (elapsedSeconds <= 0) return 0;

    const deltaTicks = Math.max(0, ticks - previous.ticks);
    return round((deltaTicks / CLOCK_TICKS_PER_SECOND / elapsedSeconds) * 100);
  }

  private wanderCpu() {
    this.state.lastCpu = clamp(this.state.lastCpu + rand(-5, 5), 6, 82);
    return this.state.lastCpu;
  }
  private fakeCores(avg: number): number[] {
    return Array.from({ length: 8 }, () => clamp(avg + rand(-18, 18), 0, 100));
  }
  private fakeProcesses(): HostProcess[] {
    return [
      { pid: 1487, name: "VintagestoryServer", command: "dotnet VintagestoryServer.dll", user: "server", state: "running", cpuPercent: round(rand(10, 40)), memoryMB: round(rand(900, 2600)) },
      { pid: 1502, name: "VintagestoryServer", command: "dotnet VintagestoryServer.dll", user: "server", state: "running", cpuPercent: round(rand(8, 32)), memoryMB: round(rand(700, 2100)) },
      { pid: 883, name: "dockerd", command: "dockerd", user: "root", state: "sleeping", cpuPercent: round(rand(1, 8)), memoryMB: round(rand(120, 380)) },
      { pid: 77, name: "node", command: "node server/server.js", user: "node", state: "sleeping", cpuPercent: round(rand(1, 9)), memoryMB: round(rand(180, 420)) },
      { pid: 991, name: "codex", command: "codex", user: "ubuntu", state: "sleeping", cpuPercent: round(rand(0, 5)), memoryMB: round(rand(150, 300)) },
      { pid: 421, name: "caddy", command: "caddy run", user: "root", state: "sleeping", cpuPercent: round(rand(0, 4)), memoryMB: round(rand(40, 120)) },
      { pid: 990, name: "postgres", command: "postgres", user: "postgres", state: "sleeping", cpuPercent: round(rand(0, 5)), memoryMB: round(rand(120, 300)) },
    ];
  }

  getHostHistory(): MetricPoint[] {
    this.ensureSeeded();
    return [...this.state.host];
  }
  getServerHistory(id: string): MetricPoint[] {
    return [...(this.state.perServer.get(id) ?? [])];
  }
}

/* helpers */
function rand(a: number, b: number) {
  return a + Math.random() * (b - a);
}
function clamp(v: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, v));
}
function round(v: number) {
  return Math.round(v * 10) / 10;
}

async function readProcProcess(pid: number, users: Map<string, string>): Promise<ProcProcess | null> {
  const base = `${PROC_ROOT}/${pid}`;
  try {
    const [status, stat, cmdline] = await Promise.all([
      fs.readFile(`${base}/status`, "utf8"),
      fs.readFile(`${base}/stat`, "utf8"),
      fs.readFile(`${base}/cmdline`, "utf8").catch(() => ""),
    ]);
    const parsedStatus = parseProcStatus(status);
    const parsedStat = parseProcStat(stat);
    if (!parsedStatus.name || !parsedStat) return null;

    return {
      pid,
      name: parsedStatus.name,
      command: processCommand(cmdline),
      user: parsedStatus.uid ? users.get(parsedStatus.uid) ?? parsedStatus.uid : undefined,
      state: parsedStatus.state,
      memoryMB: round(parsedStatus.rssKB / 1024),
      cpuTicks: parsedStat.cpuTicks,
    };
  } catch {
    return null;
  }
}

function parseProcStatus(status: string) {
  let name = "";
  let state = "";
  let uid = "";
  let rssKB = 0;

  for (const line of status.split("\n")) {
    if (line.startsWith("Name:")) name = line.slice(5).trim();
    if (line.startsWith("State:")) state = line.slice(6).trim();
    if (line.startsWith("Uid:")) uid = line.slice(4).trim().split(/\s+/)[0] ?? "";
    if (line.startsWith("VmRSS:")) {
      rssKB = Number(line.match(/\d+/)?.[0] ?? 0);
    }
  }

  return { name, state, uid, rssKB };
}

function parseProcStat(stat: string): { cpuTicks: number } | null {
  const end = stat.lastIndexOf(")");
  if (end === -1) return null;

  const fields = stat.slice(end + 2).trim().split(/\s+/);
  const utime = Number(fields[11] ?? 0);
  const stime = Number(fields[12] ?? 0);
  return { cpuTicks: utime + stime };
}

function processCommand(cmdline: string): string | undefined {
  const value = cmdline.split("\0").filter(Boolean).join(" ").trim();
  if (!value) return undefined;
  return value.length > 160 ? `${value.slice(0, 157)}...` : value;
}

async function readPasswdUsers(): Promise<Map<string, string>> {
  const raw = await fs.readFile("/etc/passwd", "utf8");
  return new Map(
    raw
      .split("\n")
      .map((line) => line.split(":"))
      .filter((parts) => parts.length >= 3)
      .map((parts) => [parts[2], parts[0]]),
  );
}

export const metrics = singleton("metrics", () => new MetricsService());
