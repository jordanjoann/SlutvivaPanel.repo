"use client";

import useSWR from "swr";
import { useParams } from "next/navigation";
import { toast } from "sonner";
import {
  GlobeIcon,
  DownloadIcon,
  UploadIcon,
  CopyIcon,
  Trash2Icon,
  SlidersHorizontalIcon,
} from "lucide-react";
import { api } from "@/lib/api";
import { PageHeader } from "@/components/panel/page-header";
import { SectionCard } from "@/components/panel/section-card";
import { useConfirm } from "@/components/panel/confirm-dialog";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { formatBytes, formatDateTime } from "@/lib/format";

export default function WorldPage() {
  const { id } = useParams<{ id: string }>();
  const { confirm, node } = useConfirm();
  const { data: world } = useSWR(["world", id], () => api.world.get(id));

  const notImplemented = (what: string) => () => {
    toast.info(`${what} — will run the corresponding server workflow.`);
  };

  return (
    <div className="flex flex-col gap-5">
      {node}
      <PageHeader
        title="World"
        icon={GlobeIcon}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" onClick={notImplemented("Export world")}>
              <DownloadIcon /> Export
            </Button>
            <Button variant="outline" onClick={notImplemented("Import world")}>
              <UploadIcon /> Import
            </Button>
            <Button variant="outline" onClick={notImplemented("Duplicate world")}>
              <CopyIcon /> Duplicate
            </Button>
            <Button
              variant="destructive"
              onClick={() =>
                confirm({
                  title: "Delete world?",
                  description:
                    "This permanently deletes the world save. This cannot be undone — export or back up first.",
                  confirmLabel: "Delete world",
                  destructive: true,
                  confirmPhrase: world?.name,
                  onConfirm: notImplemented("Delete world"),
                })
              }
            >
              <Trash2Icon /> Delete
            </Button>
          </div>
        }
      />

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
