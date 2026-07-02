"use client";

/* eslint-disable @next/next/no-img-element */

import * as React from "react";
import useSWR from "swr";
import { toast } from "sonner";
import {
  SearchIcon,
  PackageIcon,
  DownloadIcon,
  Trash2Icon,
  ArrowUpCircleIcon,
  Loader2Icon,
  BlocksIcon,
  UploadCloudIcon,
} from "lucide-react";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import { formatNumber } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/panel/empty-state";
import { useConfirm } from "@/components/panel/confirm-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { InstalledMod, ModDependency, ModSearchResult } from "@/lib/types";

type Mode = "installed" | "repository";

export function ModsManager({ id }: { id: string }) {
  const [mode, setMode] = React.useState<Mode>("installed");
  const [dragging, setDragging] = React.useState(false);
  const { confirm, node: confirmNode } = useConfirm();

  const installed = useSWR(["mods", id], () => api.mods.list(id));
  const installedIds = new Set((installed.data?.mods ?? []).map((m) => m.id));

  async function op(body: Record<string, unknown>, msg?: string) {
    try {
      await api.mods.op(id, body);
      if (msg) toast.success(msg, { description: "Active after the next restart." });
      installed.mutate();
    } catch (e) {
      toast.error("Action failed", { description: e instanceof Error ? e.message : undefined });
    }
  }

  async function handleZipDrop(files: FileList) {
    const zips = Array.from(files).filter((f) => f.name.toLowerCase().endsWith(".zip"));
    if (zips.length === 0) {
      toast.error("Only .zip mod archives can be dropped here");
      return;
    }
    try {
      await api.files.upload(id, "vintage/Mods", zips);
      for (const z of zips) await api.mods.op(id, { op: "installFile", fileName: z.name });
      toast.success(`Installed ${zips.length} mod archive(s)`, {
        description: "Active after the next restart.",
      });
      installed.mutate();
    } catch (e) {
      toast.error("Install failed", { description: e instanceof Error ? e.message : undefined });
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {confirmNode}

      {/* Mode switch */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex rounded-lg border border-border bg-card p-0.5">
          <button
            onClick={() => setMode("installed")}
            className={cn(
              "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
              mode === "installed"
                ? "bg-muted text-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            <PackageIcon className="size-4" /> Installed
            {installed.data && (
              <span className="rounded bg-background/60 px-1.5 text-[10px]">
                {installed.data.mods.length}
              </span>
            )}
          </button>
          <button
            onClick={() => setMode("repository")}
            className={cn(
              "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
              mode === "repository"
                ? "bg-muted text-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            <SearchIcon className="size-4" /> Browse Mod Database
          </button>
        </div>
      </div>

      {mode === "installed" ? (
        <div
          className={cn(
            "relative rounded-xl",
            dragging && "ring-2 ring-primary",
          )}
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            if (e.dataTransfer.files.length) handleZipDrop(e.dataTransfer.files);
          }}
        >
          {dragging && (
            <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center rounded-xl bg-primary/5 text-sm font-medium text-primary">
              <UploadCloudIcon className="mr-2 size-5" /> Drop .zip to install
            </div>
          )}
          <InstalledList
            mods={installed.data?.mods}
            loading={installed.isLoading}
            onToggle={(m, enabled) =>
              op({ op: enabled ? "enable" : "disable", modId: m.id }, `${m.name} ${enabled ? "enabled" : "disabled"}`)
            }
            onUpdate={(m) => op({ op: "update", modId: m.id }, `${m.name} updated`)}
            onDelete={(m) =>
              confirm({
                title: `Remove ${m.name}?`,
                description: "The mod archive will be deleted from the server.",
                confirmLabel: "Remove mod",
                destructive: true,
                onConfirm: () => op({ op: "remove", modId: m.id }, `${m.name} removed`),
              })
            }
          />
          <p className="mt-3 flex items-center gap-1.5 text-xs text-muted-foreground">
            <UploadCloudIcon className="size-3.5" /> Tip: drag a .zip mod archive anywhere here to install it.
          </p>
        </div>
      ) : (
        <Repository id={id} installedIds={installedIds} onInstalled={() => installed.mutate()} />
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Installed                                                          */
/* ------------------------------------------------------------------ */

function InstalledList({
  mods,
  loading,
  onToggle,
  onUpdate,
  onDelete,
}: {
  mods?: InstalledMod[];
  loading: boolean;
  onToggle: (m: InstalledMod, enabled: boolean) => void;
  onUpdate: (m: InstalledMod) => void;
  onDelete: (m: InstalledMod) => void;
}) {
  const [query, setQuery] = React.useState("");
  const normalizedQuery = query.trim().toLowerCase();
  const filteredMods = React.useMemo(() => {
    if (!mods || !normalizedQuery) return mods ?? [];
    return mods.filter((mod) =>
      [
        mod.name,
        mod.id,
        mod.author,
        mod.description,
        mod.fileName,
        mod.side,
        mod.installedVersion,
        mod.latestVersion,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(normalizedQuery),
    );
  }, [mods, normalizedQuery]);

  if (loading && !mods) {
    return (
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-32 rounded-xl" />
        ))}
      </div>
    );
  }
  if (!mods || mods.length === 0) {
    return (
      <EmptyState
        icon={PackageIcon}
        title="No mods installed"
        description="Browse the Mod Database or drag a .zip archive here to install mods."
      />
    );
  }
  return (
    <div className="flex flex-col gap-3">
      <div className="relative">
        <SearchIcon className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search installed mods..."
          className="h-10 pl-9"
        />
      </div>

      {filteredMods.length === 0 ? (
        <EmptyState
          icon={SearchIcon}
          title="No installed mods found"
          description="Try a different search term."
        />
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {filteredMods.map((m) => {
            const updatable = m.latestVersion && m.latestVersion !== m.installedVersion;
            return (
              <div
                key={m.id}
                className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4"
              >
                <div className="flex items-start gap-3">
                  <ModIcon name={m.name} src={m.iconUrl} />
                  <div className="min-w-0 flex-1">
                    <h3 className="truncate text-sm font-semibold">{m.name}</h3>
                    <p className="truncate text-xs text-muted-foreground">
                      {m.author ? `by ${m.author}` : m.id}
                    </p>
                  </div>
                  <Switch
                    checked={m.enabled}
                    onCheckedChange={(v) => onToggle(m, v)}
                    aria-label="Enabled"
                  />
                </div>
                <p className="line-clamp-2 text-xs text-muted-foreground">
                  {m.description || "No description available."}
                </p>
                <div className="flex items-center gap-2 text-xs">
                  <span className="rounded bg-muted px-1.5 py-0.5 font-mono">v{m.installedVersion}</span>
                  {updatable && (
                    <span className="rounded bg-warning/15 px-1.5 py-0.5 font-medium text-warning">
                      → v{m.latestVersion}
                    </span>
                  )}
                </div>
                <div className="mt-auto flex items-center gap-2">
                  {updatable ? (
                    <Button size="sm" onClick={() => onUpdate(m)}>
                      <ArrowUpCircleIcon /> Update
                    </Button>
                  ) : (
                    <Button size="sm" variant="outline" disabled>
                      Up to date
                    </Button>
                  )}
                  <Button size="sm" variant="destructive" className="ml-auto" onClick={() => onDelete(m)}>
                    <Trash2Icon /> Delete
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Repository                                                         */
/* ------------------------------------------------------------------ */

function Repository({
  id,
  installedIds,
  onInstalled,
}: {
  id: string;
  installedIds: Set<string>;
  onInstalled: () => void;
}) {
  const [query, setQuery] = React.useState("");
  const [debounced, setDebounced] = React.useState("");
  const [versions, setVersions] = React.useState<Record<string, string>>({});
  const [installing, setInstalling] = React.useState<string | null>(null);
  const [depDialog, setDepDialog] = React.useState<
    null | { result: ModSearchResult; version: string; deps: ModDependency[] }
  >(null);

  React.useEffect(() => {
    const t = setTimeout(() => setDebounced(query), 250);
    return () => clearTimeout(t);
  }, [query]);

  const { data, isLoading } = useSWR(["mod-search", debounced], () =>
    api.mods.search(debounced),
  );

  async function doInstall(result: ModSearchResult, version: string) {
    try {
      setInstalling(result.id);
      await api.mods.op(id, { op: "install", mod: result, version });
      toast.success(`Installed ${result.name} v${version}`, {
        description: "This mod will become active after the next restart.",
      });
      onInstalled();
    } catch (e) {
      toast.error("Install failed", { description: e instanceof Error ? e.message : undefined });
    } finally {
      setInstalling(null);
    }
  }

  function install(result: ModSearchResult) {
    const version = versions[result.id] ?? result.latestVersion;
    const unmet = result.dependencies?.filter((d) => !d.satisfied) ?? [];
    if (unmet.length > 0) {
      setDepDialog({ result, version, deps: unmet });
    } else {
      doInstall(result, version);
    }
  }

  async function installAllDeps() {
    if (!depDialog) return;
    try {
      setInstalling(depDialog.result.id);
      for (const dep of depDialog.deps) {
        const found = (await api.mods.search(dep.modId)).results.find((r) => r.id === dep.modId);
        if (found) await api.mods.op(id, { op: "install", mod: found, version: found.latestVersion });
      }
      await api.mods.op(id, {
        op: "install",
        mod: depDialog.result,
        version: depDialog.version,
      });
      toast.success(`Installed ${depDialog.result.name} and dependencies`, {
        description: "Active after the next restart.",
      });
      onInstalled();
      setDepDialog(null);
    } catch (e) {
      toast.error("Install failed", { description: e instanceof Error ? e.message : undefined });
    } finally {
      setInstalling(null);
    }
  }

  const results = data?.results ?? [];

  return (
    <div className="flex flex-col gap-4">
      <div className="relative">
        <SearchIcon className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search the Vintage Story mod database…"
          className="h-10 pl-9"
          autoFocus
        />
      </div>

      {isLoading && !data ? (
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-36 rounded-xl" />
          ))}
        </div>
      ) : results.length === 0 ? (
        <EmptyState icon={SearchIcon} title="No mods found" description="Try a different search term." />
      ) : (
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          {results.map((r) => {
            const isInstalled = installedIds.has(r.id);
            const version = versions[r.id] ?? r.latestVersion;
            return (
              <div key={r.id} className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4">
                <div className="flex items-start gap-3">
                  <ModIcon name={r.name} src={r.iconUrl} />
                  <div className="min-w-0 flex-1">
                    <h3 className="truncate text-sm font-semibold">{r.name}</h3>
                    <p className="truncate text-xs text-muted-foreground">by {r.author}</p>
                  </div>
                  <div className="flex items-center gap-1 text-xs text-muted-foreground">
                    <DownloadIcon className="size-3.5" /> {formatNumber(r.downloads)}
                  </div>
                </div>
                <p className="line-clamp-2 text-xs text-muted-foreground">{r.summary}</p>
                {r.dependencies && r.dependencies.length > 0 && (
                  <p className="flex items-center gap-1 text-[11px] text-warning">
                    <BlocksIcon className="size-3" /> requires {r.dependencies.map((d) => d.modId).join(", ")}
                  </p>
                )}
                <div className="mt-auto flex items-center gap-2">
                  <Select
                    value={version}
                    onValueChange={(v) => setVersions((s) => ({ ...s, [r.id]: v as string }))}
                  >
                    <SelectTrigger size="sm" className="w-28">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {r.versions.map((ver) => (
                        <SelectItem key={ver.version} value={ver.version}>
                          v{ver.version}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {isInstalled ? (
                    <Button size="sm" variant="outline" className="ml-auto" disabled>
                      Installed
                    </Button>
                  ) : (
                    <Button
                      size="sm"
                      className="ml-auto"
                      onClick={() => install(r)}
                      disabled={installing === r.id}
                    >
                      {installing === r.id ? <Loader2Icon className="animate-spin" /> : <DownloadIcon />}
                      Install
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Dependency dialog */}
      <Dialog open={depDialog !== null} onOpenChange={(o) => !o && setDepDialog(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Install dependencies?</DialogTitle>
            <DialogDescription>
              <span className="font-medium text-foreground">{depDialog?.result.name}</span> requires
              the following mods to work correctly.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-2">
            {depDialog?.deps.map((d) => (
              <div key={d.modId} className="flex items-center gap-2 rounded-lg bg-muted/50 px-3 py-2 text-sm">
                <BlocksIcon className="size-4 text-muted-foreground" />
                <span className="font-medium">{d.modId}</span>
                {d.version && <span className="text-xs text-muted-foreground">{d.version}</span>}
              </div>
            ))}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => depDialog && doInstall(depDialog.result, depDialog.version).then(() => setDepDialog(null))}
            >
              Install without deps
            </Button>
            <Button onClick={installAllDeps} disabled={installing !== null}>
              {installing !== null && <Loader2Icon className="animate-spin" />}
              Install all dependencies
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ModIcon({ name, src }: { name: string; src?: string }) {
  const [failed, setFailed] = React.useState(false);
  const initials = name.slice(0, 2).toUpperCase();

  if (src && !failed) {
    return (
      <div className="flex size-10 shrink-0 overflow-hidden rounded-lg bg-primary/10 ring-1 ring-primary/15">
        <img
          src={src}
          alt=""
          className="size-full object-cover"
          loading="lazy"
          referrerPolicy="no-referrer"
          onError={() => setFailed(true)}
        />
      </div>
    );
  }

  return (
    <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-sm font-semibold text-primary ring-1 ring-primary/15">
      {initials}
    </div>
  );
}
