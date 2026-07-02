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
import type { Backup, BackupKind, BackupPolicyStatus } from "@/lib/types";

const KIND_STYLE: Record<BackupKind, string> = {
  manual: "bg-info/15 text-info",
  auto: "bg-success/15 text-success",
  "pre-update": "bg-warning/15 text-warning",
  "restore-point": "bg-primary/15 text-primary",
};

const KIND_LABEL: Record<BackupKind, string> = {
  manual: "main",
  auto: "daily",
  "pre-update": "pre-update",
  "restore-point": "restore point",
};

export default function BackupsPage() {
  const { id } = useParams<{ id: string }>();
  const [creating, setCreating] = React.useState<BackupKind | null>(null);
  const { confirm, node } = useConfirm();
  const { data, isLoading, mutate } = useSWR(["backups", id], () => api.backups.list(id));

  async function create(kind: BackupKind = "manual") {
    try {
      setCreating(kind);
      await api.backups.op(id, {
        op: "create",
        kind,
        note: kind === "restore-point" ? "Manual rolling restore point" : undefined,
      });
      toast.success(kind === "restore-point" ? "Restore point created" : "Backup created");
      mutate();
    } catch (e) {
      toast.error("Backup failed", { description: e instanceof Error ? e.message : undefined });
    } finally {
      setCreating(null);
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
  const policy = data?.policy;
  const mainBackups = backups.filter((b) => b.kind !== "restore-point");
  const restorePoints = backups.filter((b) => b.kind === "restore-point");
  const hasAny = backups.length > 0;

  return (
    <div className="flex flex-col gap-5">
      {node}
      <PageHeader
        title="Backups"
        description="Create protected main backups and restore rolling points in time."
        icon={DatabaseBackupIcon}
        actions={
          <>
            <Button onClick={() => create("manual")} disabled={creating !== null}>
              {creating === "manual" ? <Loader2Icon className="animate-spin" /> : <PlusIcon />}
              Backup
            </Button>
            <Button
              variant="outline"
              onClick={() => create("restore-point")}
              disabled={creating !== null}
            >
              {creating === "restore-point" ? <Loader2Icon className="animate-spin" /> : <PlusIcon />}
              New Restore Point
            </Button>
          </>
        }
      />

      {isLoading && !data ? (
        <Skeleton className="h-64 w-full rounded-xl" />
      ) : (
        <>
          {!hasAny ? (
            <EmptyState
              icon={ArchiveIcon}
              title="No backups yet"
              description="Create a main backup or restore point to upload the current world state to Backblaze."
              action={
                <Button onClick={() => create("manual")} disabled={creating !== null}>
                  <PlusIcon /> Backup
                </Button>
              }
            />
          ) : (
            <>
              <BackupSection
                title={`${mainBackups.length} main ${mainBackups.length === 1 ? "backup" : "backups"}`}
                description="Manual and pre-update backups expire after 30 days. Daily backups keep the newest 2 archives in Backblaze."
                backups={mainBackups}
                onRestore={(b) =>
                  confirm({
                    title: `Restore “${b.name}”?`,
                    description:
                      "This replaces the current world and config files with this backup. The current server state will be overwritten.",
                    confirmLabel: "Restore backup",
                    destructive: true,
                    onConfirm: () => run("restore", b.id, "Restore scheduled"),
                  })
                }
                onDelete={(b) =>
                  confirm({
                    title: `Delete “${b.name}”?`,
                    description: "This permanently deletes the backup snapshot.",
                    confirmLabel: "Delete backup",
                    destructive: true,
                    onConfirm: () => run("delete", b.id, "Backup deleted"),
                  })
                }
              />
              <BackupSection
                title={`${restorePoints.length} restore ${restorePoints.length === 1 ? "point" : "points"}`}
                description={restorePointSummary(policy)}
                backups={restorePoints}
                emptyTitle="No restore points yet"
                onRestore={(b) =>
                  confirm({
                    title: `Restore “${b.name}”?`,
                    description:
                      "This rolls the server back to that point in time. The current world and config files will be overwritten.",
                    confirmLabel: "Restore point",
                    destructive: true,
                    onConfirm: () => run("restore", b.id, "Restore scheduled"),
                  })
                }
                onDelete={(b) =>
                  confirm({
                    title: `Delete “${b.name}”?`,
                    description: "This permanently deletes the restore point.",
                    confirmLabel: "Delete restore point",
                    destructive: true,
                    onConfirm: () => run("delete", b.id, "Restore point deleted"),
                  })
                }
              />
            </>
          )}
        </>
      )}
    </div>
  );
}

function BackupSection({
  title,
  description,
  backups,
  emptyTitle = "No backups in this section",
  onRestore,
  onDelete,
}: {
  title: string;
  description: string;
  backups: Backup[];
  emptyTitle?: string;
  onRestore: (backup: Backup) => void;
  onDelete: (backup: Backup) => void;
}) {
  return (
    <SectionCard title={title} description={description} icon={ArchiveIcon} bodyClassName="p-0">
      {backups.length === 0 ? (
        <div className="px-4 py-8 text-center text-sm text-muted-foreground">{emptyTitle}</div>
      ) : (
        <div className="divide-y divide-border">
          {backups.map((b) => (
            <BackupRow
              key={b.id}
              backup={b}
              onRestore={() => onRestore(b)}
              onDelete={() => onDelete(b)}
              onDownload={() => toast.info("Download — snapshot archive streaming is not wired yet.")}
            />
          ))}
        </div>
      )}
    </SectionCard>
  );
}

function restorePointSummary(policy?: BackupPolicyStatus): string {
  if (!policy) return "Last: never · Next: not scheduled · Stored: 0 B";
  const last = policy.lastRestorePointAt ? formatRelative(policy.lastRestorePointAt) : "never";
  const next = policy.nextRestorePointAt ? formatRelative(policy.nextRestorePointAt) : "not scheduled";
  return `Last: ${last} · Next: ${next} · Stored: ${formatBytes(policy.storedBytes)}`;
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
            {KIND_LABEL[backup.kind]}
          </span>
        </div>
        <div className="mt-0.5 flex items-center gap-3 text-xs text-muted-foreground">
          <span>{formatBytes(backup.sizeBytes)}</span>
          {backup.storedBytes !== undefined && backup.storedBytes !== backup.sizeBytes && (
            <>
              <span>·</span>
              <span>{formatBytes(backup.storedBytes)} stored</span>
            </>
          )}
          {backup.fileCount !== undefined && (
            <>
              <span>·</span>
              <span>{backup.fileCount} files</span>
            </>
          )}
          <span>·</span>
          <span>{formatRelative(backup.createdAt)}</span>
          {backup.expiresAt && (
            <>
              <span>·</span>
              <span>prunes {formatRelative(backup.expiresAt)}</span>
            </>
          )}
          {backup.note && (
            <>
              <span>·</span>
              <span className="truncate">{displayNote(backup.note)}</span>
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

function displayNote(note: string): string {
  return note === "Nightly auto backup" ? "Legacy auto backup" : note;
}
