import { ConstructionIcon } from "lucide-react";
import { PageHeader } from "./page-header";

export function ComingSoon({
  title,
  description,
  icon: Icon = ConstructionIcon,
  features,
}: {
  title: string;
  description: string;
  icon?: React.ComponentType<{ className?: string }>;
  features?: string[];
}) {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={title} description={description} icon={Icon} />
      <div className="bg-grid relative flex flex-col items-center justify-center overflow-hidden rounded-2xl border border-border bg-card/40 px-6 py-20 text-center">
        <div className="mb-5 flex size-14 items-center justify-center rounded-2xl bg-primary/10 text-primary ring-1 ring-primary/20">
          <Icon className="size-7" />
        </div>
        <span className="mb-2 rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary ring-1 ring-primary/20">
          Coming soon
        </span>
        <h2 className="font-heading text-lg font-semibold">{title} is on the roadmap</h2>
        <p className="mt-2 max-w-md text-sm text-muted-foreground text-balance">{description}</p>
        {features && features.length > 0 && (
          <div className="mt-6 flex flex-wrap justify-center gap-2">
            {features.map((f) => (
              <span
                key={f}
                className="rounded-lg border border-border bg-card px-3 py-1.5 text-xs text-muted-foreground"
              >
                {f}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
