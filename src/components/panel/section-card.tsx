import { cn } from "@/lib/utils";
import { Card } from "@/components/ui/card";

export function SectionCard({
  title,
  description,
  icon: Icon,
  action,
  className,
  bodyClassName,
  children,
}: {
  title?: React.ReactNode;
  description?: React.ReactNode;
  icon?: React.ComponentType<{ className?: string }>;
  action?: React.ReactNode;
  className?: string;
  bodyClassName?: string;
  children: React.ReactNode;
}) {
  return (
    <Card className={cn("gap-0 overflow-hidden p-0", className)}>
      {(title || action) && (
        <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
          <div className="flex items-center gap-2.5 min-w-0">
            {Icon && (
              <span className="flex size-7 items-center justify-center rounded-md bg-muted text-muted-foreground">
                <Icon className="size-4" />
              </span>
            )}
            <div className="min-w-0">
              {title && (
                <h3 className="truncate font-heading text-sm font-semibold text-foreground">
                  {title}
                </h3>
              )}
              {description && (
                <p className="truncate text-xs text-muted-foreground">{description}</p>
              )}
            </div>
          </div>
          {action && <div className="flex shrink-0 items-center gap-2">{action}</div>}
        </div>
      )}
      <div className={cn("p-4", bodyClassName)}>{children}</div>
    </Card>
  );
}
