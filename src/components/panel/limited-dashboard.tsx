import Link from "next/link";
import { ArrowRightIcon, GaugeIcon, MountainIcon } from "lucide-react";
import { PageHeader } from "@/components/panel/page-header";
import { SectionCard } from "@/components/panel/section-card";
import { Button } from "@/components/ui/button";
import type { PanelRole } from "@/lib/server/panel-users";

export function LimitedDashboard({ role }: { role: Exclude<PanelRole, "owner"> }) {
  const canManageVintageStory = role === "admin" || role === "moderator";

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Dashboard" description="Your panel account is active." icon={GaugeIcon} />
      {canManageVintageStory ? (
        <SectionCard
          title="Vintage Story"
          description="Manage players, whitelist entries, roles, mods, and basic power actions."
          icon={MountainIcon}
          action={
            <Button size="sm" nativeButton={false} render={<Link href="/vintage-story" />}>
              Open
              <ArrowRightIcon />
            </Button>
          }
        >
          <p className="text-sm text-muted-foreground">
            Admin and moderator access is limited to Vintage Story overview, players, and mods.
          </p>
        </SectionCard>
      ) : (
        <SectionCard>
          <p className="py-8 text-center text-sm text-muted-foreground">
            Your role does not have panel tools assigned yet.
          </p>
        </SectionCard>
      )}
    </div>
  );
}
