"use client";

import useSWR from "swr";
import { useParams } from "next/navigation";
import {
  GlobeIcon,
  SlidersHorizontalIcon,
} from "lucide-react";
import { api } from "@/lib/api";
import { PageHeader } from "@/components/panel/page-header";
import { SectionCard } from "@/components/panel/section-card";
import { Skeleton } from "@/components/ui/skeleton";
import { formatBytes, formatDateTime } from "@/lib/format";

export default function WorldPage() {
  const { id } = useParams<{ id: string }>();
  const { data: world } = useSWR(["world", id], () => api.world.get(id));

  return (
    <div className="flex flex-col gap-5">
      <PageHeader title="World" icon={GlobeIcon} />

      {!world ? (
        <div className="grid gap-4 lg:grid-cols-2">
          <Skeleton className="h-64 rounded-xl" />
          <Skeleton className="h-64 rounded-xl" />
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          <SectionCard title="World details" icon={GlobeIcon}>
            <dl className="grid grid-cols-2 gap-x-6 gap-y-3">
              <Field label="Name" value={world.name} />
              <Field label="Seed" value={world.seed || "random"} mono />
              <Field label="Play style" value={world.playStyle} />
              <Field label="World type" value={world.worldType} />
              <Field label="Size on disk" value={formatBytes(world.sizeBytes)} />
              <Field label="Created" value={formatDateTime(world.createdAt)} />
            </dl>
          </SectionCard>

          <SectionCard title="Generation settings" icon={SlidersHorizontalIcon}>
            {Object.keys(world.settings).length === 0 ? (
              <p className="text-sm text-muted-foreground">No custom generation settings.</p>
            ) : (
              <dl className="grid grid-cols-1 gap-y-2.5">
                {Object.entries(world.settings).map(([k, v]) => (
                  <div key={k} className="flex items-center justify-between gap-4 text-sm">
                    <dt className="text-muted-foreground">{k}</dt>
                    <dd className="font-medium">{v}</dd>
                  </div>
                ))}
              </dl>
            )}
          </SectionCard>
        </div>
      )}
    </div>
  );
}

function Field({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className={`mt-0.5 text-sm ${mono ? "font-mono text-xs" : ""}`}>{value}</dd>
    </div>
  );
}
