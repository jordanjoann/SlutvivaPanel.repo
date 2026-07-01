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
    const procs = await si.processes().catch(() => null);

    const disk = [...fs].sort((a, b) => b.size - a.size)[0];
    const net0 = Array.isArray(net) ? net[0] : net;
    const top: HostProcess[] =
      procs?.list
        .sort((a, b) => b.cpu - a.cpu)
        .slice(0, 6)
        .map((p) => ({
          pid: p.pid,
          name: p.name,
          cpuPercent: round(p.cpu),
          memoryMB: round(p.memRss / 1024),
        })) ?? this.fakeProcesses();

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

  private wanderCpu() {
    this.state.lastCpu = clamp(this.state.lastCpu + rand(-5, 5), 6, 82);
    return this.state.lastCpu;
  }
  private fakeCores(avg: number): number[] {
    return Array.from({ length: 8 }, () => clamp(avg + rand(-18, 18), 0, 100));
  }
  private fakeProcesses(): HostProcess[] {
    return [
      { pid: 1487, name: "VintagestoryServer", cpuPercent: round(rand(10, 40)), memoryMB: round(rand(900, 2600)) },
      { pid: 1502, name: "VintagestoryServer", cpuPercent: round(rand(8, 32)), memoryMB: round(rand(700, 2100)) },
      { pid: 883, name: "dockerd", cpuPercent: round(rand(1, 8)), memoryMB: round(rand(120, 380)) },
      { pid: 421, name: "caddy", cpuPercent: round(rand(0, 4)), memoryMB: round(rand(40, 120)) },
      { pid: 77, name: "node (panel)", cpuPercent: round(rand(1, 9)), memoryMB: round(rand(180, 420)) },
      { pid: 990, name: "postgres", cpuPercent: round(rand(0, 5)), memoryMB: round(rand(120, 300)) },
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

export const metrics = singleton("metrics", () => new MetricsService());
