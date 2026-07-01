import type { ServerStatus } from "./types";

export interface StatusMeta {
  label: string;
  /** Tailwind text color class for the status dot / label. */
  dot: string;
  text: string;
  bg: string;
  ring: string;
  pulse: boolean;
}

export const STATUS_META: Record<ServerStatus, StatusMeta> = {
  running: {
    label: "Running",
    dot: "bg-success",
    text: "text-success",
    bg: "bg-success/10",
    ring: "ring-success/25",
    pulse: true,
  },
  stopped: {
    label: "Stopped",
    dot: "bg-muted-foreground",
    text: "text-muted-foreground",
    bg: "bg-muted-foreground/10",
    ring: "ring-border",
    pulse: false,
  },
  starting: {
    label: "Starting",
    dot: "bg-warning",
    text: "text-warning",
    bg: "bg-warning/10",
    ring: "ring-warning/25",
    pulse: true,
  },
  stopping: {
    label: "Stopping",
    dot: "bg-warning",
    text: "text-warning",
    bg: "bg-warning/10",
    ring: "ring-warning/25",
    pulse: true,
  },
  restarting: {
    label: "Restarting",
    dot: "bg-warning",
    text: "text-warning",
    bg: "bg-warning/10",
    ring: "ring-warning/25",
    pulse: true,
  },
  crashed: {
    label: "Crashed",
    dot: "bg-destructive",
    text: "text-destructive",
    bg: "bg-destructive/10",
    ring: "ring-destructive/25",
    pulse: false,
  },
  installing: {
    label: "Installing",
    dot: "bg-info",
    text: "text-info",
    bg: "bg-info/10",
    ring: "ring-info/25",
    pulse: true,
  },
  updating: {
    label: "Updating",
    dot: "bg-info",
    text: "text-info",
    bg: "bg-info/10",
    ring: "ring-info/25",
    pulse: true,
  },
  unknown: {
    label: "Unknown",
    dot: "bg-muted-foreground",
    text: "text-muted-foreground",
    bg: "bg-muted-foreground/10",
    ring: "ring-border",
    pulse: false,
  },
};

export function statusMeta(status: ServerStatus): StatusMeta {
  return STATUS_META[status] ?? STATUS_META.unknown;
}

/** Whether the primary power button should read "Stop" (server is up-ish). */
export function isPoweredOn(status: ServerStatus): boolean {
  return status === "running" || status === "starting" || status === "restarting";
}

/** Color used for a usage bar/graph based on utilization. */
export function usageColor(percent: number): string {
  if (percent >= 90) return "text-destructive";
  if (percent >= 75) return "text-warning";
  return "text-primary";
}
