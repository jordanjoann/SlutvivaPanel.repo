"use client";

import * as React from "react";
import useSWR, { useSWRConfig } from "swr";
import { useParams } from "next/navigation";
import {
  FileArchiveIcon,
  FileUpIcon,
  GlobeIcon,
  Loader2Icon,
  ShieldCheckIcon,
  SlidersHorizontalIcon,
} from "lucide-react";
import { ApiError, api } from "@/lib/api";
import { PageHeader } from "@/components/panel/page-header";
import { useConfirm } from "@/components/panel/confirm-dialog";
import { SectionCard } from "@/components/panel/section-card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { formatBytes, formatDateTime } from "@/lib/format";
import { toast } from "sonner";

export default function WorldPage() {
  const { id } = useParams<{ id: string }>();
  const { mutate: mutateCache } = useSWRConfig();
  const { data: world, mutate: mutateWorld } = useSWR(["world", id], () => api.world.get(id));
  const { confirm, node: confirmNode } = useConfirm();
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [selected, setSelected] = React.useState<File | null>(null);
  const [progress, setProgress] = React.useState(0);
  const [deploying, setDeploying] = React.useState(false);

  function chooseWorld(file: File | undefined) {
    if (!file) return;
    if (!file.name.toLowerCase().endsWith(".vcdbs")) {
      toast.error("Choose a Vintage Story .vcdbs world save");
      if (inputRef.current) inputRef.current.value = "";
      return;
    }
    setSelected(file);
    setProgress(0);
  }

  async function deploySelectedWorld() {
    if (!selected) return;
    setDeploying(true);
    setProgress(0);
    try {
      const result = await api.world.deploy(id, selected, setProgress);
      await mutateWorld(result.world, { revalidate: false });
      await mutateCache(["instance", id]);
      setSelected(null);
      if (inputRef.current) inputRef.current.value = "";
      if (result.warning) {
        toast.warning("World is live, but the server stayed offline", {
          description: result.warning,
        });
      } else {
        toast.success(`${result.world.name} is now the live world`, {
          description: result.previousSaveFileName
            ? `Previous save kept as ${result.previousSaveFileName}.`
            : "The server is now pointed at the uploaded save.",
        });
      }
    } catch (error) {
      toast.error("World deployment failed", {
        description:
          error instanceof ApiError
            ? error.detail ?? error.message
            : error instanceof Error
              ? error.message
              : undefined,
      });
    } finally {
      setDeploying(false);
    }
  }

  function confirmDeployment() {
    if (!selected || deploying) return;
    confirm({
      title: `Make “${selected.name}” the live world?`,
      description:
        "The panel will upload and validate the save first. It will then stop the server if needed, keep the current save, switch the live world, and return the server to its current running or offline state.",
      confirmLabel: "Upload and make live",
      onConfirm: deploySelectedWorld,
    });
  }

  return (
    <div className="flex flex-col gap-5">
      {confirmNode}
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

          <SectionCard
            title="Push a world live"
            description="Upload the .vcdbs save from your solo world"
            icon={FileUpIcon}
            className="lg:col-span-2"
          >
            <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
              <div className="min-w-0">
                <input
                  ref={inputRef}
                  type="file"
                  accept=".vcdbs"
                  className="sr-only"
                  disabled={deploying}
                  onChange={(event) => chooseWorld(event.currentTarget.files?.[0])}
                />
                <button
                  type="button"
                  disabled={deploying}
                  onClick={() => inputRef.current?.click()}
                  className="flex w-full items-center gap-3 rounded-lg border border-dashed border-border bg-muted/25 px-4 py-3 text-left transition-colors hover:bg-muted/45 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50"
                >
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                    <FileArchiveIcon className="size-4" />
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium">
                      {selected?.name ?? "Choose your world save"}
                    </span>
                    <span className="mt-0.5 block text-xs text-muted-foreground">
                      {selected
                        ? `${formatBytes(selected.size)} · click to choose another file`
                        : "Vintage Story local saves end in .vcdbs"}
                    </span>
                  </span>
                </button>
              </div>

              <Button
                size="lg"
                disabled={!selected || deploying}
                onClick={confirmDeployment}
              >
                {deploying ? (
                  <>
                    <Loader2Icon className="animate-spin" />
                    {progress < 100 ? `Uploading ${progress}%` : "Making live"}
                  </>
                ) : (
                  <>
                    <FileUpIcon /> Upload and make live
                  </>
                )}
              </Button>
            </div>

            {deploying && <Progress value={progress} className="mt-4" />}

            <div className="mt-4 flex items-start gap-2 text-xs text-muted-foreground">
              <ShieldCheckIcon className="mt-0.5 size-3.5 shrink-0 text-success" />
              <p>
                The current save is not overwritten. The panel also stores a copy of the
                previous server configuration in BackupSaves before switching worlds. If
                this world uses mods, install the same mods on the server first.
              </p>
            </div>
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
