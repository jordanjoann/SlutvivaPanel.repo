"use client";

import * as React from "react";
import useSWR from "swr";
import { useParams } from "next/navigation";
import { toast } from "sonner";
import {
  DatabaseBackupIcon,
  PlusIcon,
  RotateCcwIcon,
  Trash2Icon,
  DownloadIcon,
  Loader2Icon,
  ArchiveIcon,
} from "lucide-react";
import { api } from "@/lib/api";
import { PageHeader } from "@/components/panel/page-header";
import { SectionCard } from "@/components/panel/section-card";
import { EmptyState } from "@/components/panel/empty-state";
import { useConfirm } from "@/components/panel/confirm-dialog";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { formatBytes, formatRelative } from "@/lib/format";
import type { Backup, BackupKind } from "@/lib/types";

const KIND_STYLE: Record<BackupKind, string> = {
  manual: "bg-info/15 text-info",
  auto: "bg-success/15 text-success",
  "pre-update": "bg-warning/15 text-warning",
};

export default function BackupsPage() {
  const { id } = useParams<{ id: string }>();
  const [creating, setCreating] = React.useState(false);
  const { confirm, node } = useConfirm();
  const { data, isLoading, mutate } = useSWR(["backups", id], () => api.backups.list(id));

  async function create() {
    try {
      setCreating(true);
      await api.backups.op(id, { op: "create" });
      toast.success("Backup created");
      mutate();
    } catch (e) {
      toast.error("Backup failed", { description: e instanceof Error ? e.message : undefined });
    } finally {
      setCreating(false);
    }
  }

  async function run(op: string, backupId: string, msg: string) {
    try {
      await api.backups.op(id, { op, backupId });
      toast.success(msg);
      mutate();
    } catch (e) {
      toast.error("Action failed", { description: e instanceof Error ? e.message : undefined });
    }
  }

  const backups = data?.backups ?? [];

  return (
    <div className="flex flex-col gap-5">
      {node}
      <PageHeader
        title="Backups"
        description="Create, restore and manage world backups for this server."
        icon={DatabaseBackupIcon}
        actions={
          <Button onClick={create} disabled={creating}>
            {creating ? <Loader2Icon className="animate-spin" /> : <PlusIcon />}
            Create backup
          </Button>
        }
      />

      {isLoading && !data ? (
        <Skeleton className="h-64 w-full rounded-xl" />
      ) : backups.length === 0 ? (
        <EmptyState
          icon={ArchiveIcon}
          title="No backups yet"
          description="Create a backup to snapshot the current world state."
          action={
            <Button onClick={create} disabled={creating}>
              <PlusIcon /> Create backup
            </Button>
          }
        />
      ) : (
        <SectionCard title={`${backups.length} backups`} icon={ArchiveIcon} bodyClassName="p-0">
          <div className="divide-y divide-border">
            {backups.map((b) => (
              <BackupRow
                key={b.id}
                backup={b}
                onRestore={() =>
                  confirm({
                    title: `Restore “${b.name}”?`,
                    description:
                      "This replaces the current world with this backup on the next start. The current world will be overwritten.",
                    confirmLabel: "Restore backup",
                    destructive: true,
                    onConfirm: () => run("restore", b.id, "Restore scheduled"),
                  })
                }
                onDelete={() =>
                  confirm({
                    title: `Delete “${b.name}”?`,
                    description: "This permanently deletes the backup archive.",
                    confirmLabel: "Delete backup",
                    destructive: true,
                    onConfirm: () => run("delete", b.id, "Backup deleted"),
                  })
                }
                onDownload={() => toast.info("Download — will stream the archive from the host.")}
              />
            ))}
          </div>
        </SectionCard>
      )}
    </div>
  );
}

function BackupRow({
  backup,
  onRestore,
  onDelete,
  onDownload,
}: {
  backup: Backup;
  onRestore: () => void;
  onDelete: () => void;
  onDownload: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-3 px-4 py-3">
      <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
        <ArchiveIcon className="size-4" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-sm font-medium">{backup.name}</span>
          <span className={cn("rounded px-1.5 py-0.5 text-[10px] font-medium capitalize", KIND_STYLE[backup.kind])}>
            {backup.kind}
          </span>
        </div>
        <div className="mt-0.5 flex items-center gap-3 text-xs text-muted-foreground">
          <span>{formatBytes(backup.sizeBytes)}</span>
          <span>·</span>
          <span>{formatRelative(backup.createdAt)}</span>
          {backup.note && (
            <>
              <span>·</span>
              <span className="truncate">{backup.note}</span>
            </>
          )}
        </div>
      </div>
      <div className="flex items-center gap-1.5">
        <Button variant="outline" size="sm" onClick={onDownload}>
          <DownloadIcon /> Download
        </Button>
        <Button variant="outline" size="sm" onClick={onRestore}>
          <RotateCcwIcon /> Restore
        </Button>
        <Button variant="destructive" size="icon-sm" onClick={onDelete} aria-label="Delete backup">
          <Trash2Icon />
        </Button>
      </div>
    </div>
  );
}
