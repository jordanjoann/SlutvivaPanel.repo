import { GaugeIcon } from "lucide-react";
import { PageHeader } from "@/components/panel/page-header";
import { SectionCard } from "@/components/panel/section-card";

export function LimitedDashboard() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Dashboard" description="Your panel account is active." icon={GaugeIcon} />
      <SectionCard>
        <p className="py-8 text-center text-sm text-muted-foreground">
          Your role does not have panel tools assigned yet.
        </p>
      </SectionCard>
    </div>
  );
}
