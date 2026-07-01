import type {
  Instance,
  Player,
  RuntimeKind,
  ServerStats,
  ServerStatus,
} from "@/lib/types";

/**
 * A Runtime supervises exactly one server instance. Implementations:
 *  - DockerRuntime    (docker container via dockerode)
 *  - ProcessRuntime   (local `dotnet VintagestoryServer.dll` child process)
 *  - SimulatedRuntime (built-in simulator — dev fallback, fully interactive)
 */
export interface Runtime {
  readonly kind: RuntimeKind;
  /** True when backed by a real container/process (not simulated). */
  readonly live: boolean;

  getStatus(): ServerStatus;
  uptimeSeconds(): number;

  start(): Promise<void>;
  stop(): Promise<void>;
  restart(): Promise<void>;
  kill(): Promise<void>;

  sendCommand(command: string): Promise<void>;

  getStats(): ServerStats;
  getPlayers(): Player[];
}

export type RuntimeContext = {
  instance: Instance;
};
