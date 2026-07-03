"use client";

import { MountainIcon, ServerIcon } from "lucide-react";
import { useInstances } from "@/hooks/use-instances";
import { PageHeader } from "@/components/panel/page-header";
import { EmptyState } from "@/components/panel/empty-state";
import { InstanceCard } from "@/components/vintage-story/instance-card";
import { CreateServerDialog } from "@/components/vintage-story/create-server-dialog";
import { VintageNetworkPanel } from "@/components/vintage-story/network-panel";
import { Skeleton } from "@/components/ui/skeleton";
import type { InstanceWithState } from "@/lib/types";

export default function VintageStoryPage() {
  const { data: instances, isLoading } = useInstances("vintage-story");

  const groups = groupInstances(instances ?? []);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Vintage Story"
        description="Manage your Vintage Story server instances. Select one to open its management interface."
        icon={MountainIcon}
        actions={<CreateServerDialog />}
      />

      <VintageNetworkPanel />

      {isLoading && !instances ? (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-56 w-full rounded-xl" />
          ))}
        </div>
      ) : instances && instances.length === 0 ? (
        <EmptyState
          icon={ServerIcon}
          title="No servers yet"
          description="Create your first Vintage Story instance to get started."
          action={<CreateServerDialog />}
        />
      ) : (
        <div className="flex flex-col gap-8">
          {groups.map(([group, list]) => (
            <section key={group} className="flex flex-col gap-3">
              <div className="flex items-center gap-2">
                <h2 className="font-heading text-sm font-semibold text-foreground">{group}</h2>
                <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                  {list.length}
                </span>
              </div>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                {list.map((inst) => (
                  <InstanceCard key={inst.id} instance={inst} />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

function groupInstances(instances: InstanceWithState[]): [string, InstanceWithState[]][] {
  const servers = instances.filter((inst) => !isDevelopmentInstance(inst));
  const development = instances.filter(isDevelopmentInstance);
  return [
    ["Servers", servers],
    ["Development", development],
  ].filter(([, list]) => list.length > 0) as [string, InstanceWithState[]][];
}

function isDevelopmentInstance(instance: InstanceWithState): boolean {
  return (
    instance.development ||
    instance.group === "Development" ||
    instance.id === "development"
  );
}
