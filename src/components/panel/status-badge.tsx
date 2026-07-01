import { cn } from "@/lib/utils";
import { statusMeta } from "@/lib/status";
import type { ServerStatus } from "@/lib/types";

export function StatusDot({
  status,
  className,
}: {
  status: ServerStatus;
  className?: string;
}) {
  const meta = statusMeta(status);
  return (
    <span className={cn("relative flex size-2.5 shrink-0", className)}>
      <span className={cn("size-2.5 rounded-full", meta.dot, meta.pulse && "pulse-dot")} />
    </span>
  );
}

export function StatusBadge({
  status,
  className,
}: {
  status: ServerStatus;
  className?: string;
}) {
  const meta = statusMeta(status);
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset",
        meta.bg,
        meta.text,
        meta.ring,
        className,
      )}
    >
      <span className={cn("size-1.5 rounded-full", meta.dot, meta.pulse && "pulse-dot")} />
      {meta.label}
    </span>
  );
}
