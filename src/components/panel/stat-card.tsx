import { cn } from "@/lib/utils";
import { Card } from "@/components/ui/card";

export function StatCard({
  label,
  value,
  sub,
  icon: Icon,
  accent = "primary",
  progress,
  className,
}: {
  label: string;
  value: React.ReactNode;
  sub?: React.ReactNode;
  icon?: React.ComponentType<{ className?: string }>;
  accent?: "primary" | "success" | "warning" | "info" | "destructive" | "muted";
  progress?: number;
  className?: string;
}) {
  const accentMap: Record<string, { text: string; bg: string; bar: string }> = {
    primary: { text: "text-primary", bg: "bg-primary/10", bar: "bg-primary" },
    success: { text: "text-success", bg: "bg-success/10", bar: "bg-success" },
    warning: { text: "text-warning", bg: "bg-warning/10", bar: "bg-warning" },
    info: { text: "text-info", bg: "bg-info/10", bar: "bg-info" },
    destructive: { text: "text-destructive", bg: "bg-destructive/10", bar: "bg-destructive" },
    muted: { text: "text-muted-foreground", bg: "bg-muted", bar: "bg-muted-foreground" },
  };
  const a = accentMap[accent];
  return (
    <Card className={cn("gap-0 p-4", className)}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            {label}
          </p>
          <p className="mt-2 font-heading text-2xl font-semibold tabular-nums tracking-tight">
            {value}
          </p>
        </div>
        {Icon && (
          <div className={cn("flex size-9 items-center justify-center rounded-lg", a.bg, a.text)}>
            <Icon className="size-4.5" />
          </div>
        )}
      </div>
      {progress !== undefined && (
        <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-muted">
          <div
            className={cn("h-full rounded-full transition-all duration-500", a.bar)}
            style={{ width: `${Math.max(2, Math.min(100, progress))}%` }}
          />
        </div>
      )}
      {sub && <p className="mt-2 text-xs text-muted-foreground">{sub}</p>}
    </Card>
  );
}
