"use client";

/* eslint-disable @next/next/no-img-element */

import * as React from "react";
import useSWR from "swr";
import { useParams } from "next/navigation";
import { toast } from "sonner";
import {
  BanIcon,
  DownloadIcon,
  GlobeIcon,
  Loader2Icon,
  NetworkIcon,
  PackageSearchIcon,
  PlusIcon,
  SaveIcon,
  ServerCogIcon,
  SettingsIcon,
  ShieldIcon,
  Trash2Icon,
  WaypointsIcon,
} from "lucide-react";
import { api } from "@/lib/api";
import { useInstance } from "@/hooks/use-instances";
import { PageHeader } from "@/components/panel/page-header";
import { SectionCard } from "@/components/panel/section-card";
import { EmptyState } from "@/components/panel/empty-state";
import { useConfirm } from "@/components/panel/confirm-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { formatNumber } from "@/lib/format";
import type {
  GameVersion,
  InstanceWithState,
  ModBlacklistEntry,
  ModSearchResult,
  ServerSettings,
} from "@/lib/types";

const EMPTY_SETTINGS: ServerSettings = {
  general: {
    serverName: "",
    serverDescription: "",
    welcomeMessage: "",
    advertiseServer: false,
    maxPlayers: 16,
    passTimeWhenEmpty: false,
    password: "",
    whitelistMode: false,
    allowPvp: true,
    allowFireSpread: true,
    allowFallingBlocks: true,
  },
  admin: {
    entityDebugMode: false,
    masterServerUrl: "",
    modDbUrl: "",
    antiAbuseLevel: 0,
    maxOwnedGroupChannelsPerUser: 1,
    numberOfLandClaims: 1,
    landClaimMinSize: 1,
    landClaimMaxSize: 256,
    chatRateLimitMs: 1000,
    dieBelowDiskSpaceMb: 1000,
  },
  world: {
    maxChunkRadius: 12,
  },
  network: {
    port: 42420,
    upnp: false,
    compressPackets: true,
    clientConnectionTimeoutSeconds: 360,
  },
  mods: {
    modPaths: [],
    modBlacklist: [],
  },
};

export default function SettingsPage() {
  const { id } = useParams<{ id: string }>();
  const { data: instance, mutate: mutateInstance } = useInstance(id);
  const settings = useSWR(["server-settings", id], () => api.settings.get(id));

  if (!instance || (settings.isLoading && !settings.data)) {
    return (
      <div className="flex flex-col gap-5">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-12 rounded-lg" />
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-48 rounded-xl" />
        ))}
      </div>
    );
  }

  return (
    <SettingsWorkspace
      id={id}
      instance={instance}
      initial={settings.data?.settings ?? EMPTY_SETTINGS}
      mutateInstance={mutateInstance}
      mutateSettings={settings.mutate}
    />
  );
}

function SettingsWorkspace({
  id,
  instance,
  initial,
  mutateInstance,
  mutateSettings,
}: {
  id: string;
  instance: InstanceWithState;
  initial: ServerSettings;
  mutateInstance: () => void;
  mutateSettings: (data?: { settings: ServerSettings }, shouldRevalidate?: boolean) => void;
}) {
  const [form, setForm] = React.useState(initial);
  const [saving, setSaving] = React.useState(false);

  const dirty = React.useMemo(() => settingsKey(form) !== settingsKey(initial), [form, initial]);

  function setGeneral(patch: Partial<ServerSettings["general"]>) {
    setForm((current) => ({ ...current, general: { ...current.general, ...patch } }));
  }

  function setAdmin(patch: Partial<ServerSettings["admin"]>) {
    setForm((current) => ({ ...current, admin: { ...current.admin, ...patch } }));
  }

  function setWorld(patch: Partial<ServerSettings["world"]>) {
    setForm((current) => ({ ...current, world: { ...current.world, ...patch } }));
  }

  function setNetwork(patch: Partial<ServerSettings["network"]>) {
    setForm((current) => ({ ...current, network: { ...current.network, ...patch } }));
  }

  function setMods(patch: Partial<ServerSettings["mods"]>) {
    setForm((current) => ({ ...current, mods: { ...current.mods, ...patch } }));
  }

  function applyImmediateSettings(settings: ServerSettings) {
    mutateSettings({ settings }, false);
    setForm((current) => ({
      ...current,
      mods: {
        ...current.mods,
        modBlacklist: settings.mods.modBlacklist,
      },
    }));
  }

  async function save() {
    try {
      setSaving(true);
      const response = await api.settings.update(id, form);
      setForm(response.settings);
      mutateSettings({ settings: response.settings }, false);
      mutateInstance();
      toast.success("Settings saved");
    } catch (e) {
      toast.error("Failed to save settings", {
        description: e instanceof Error ? e.message : undefined,
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="Settings"
        description="Edit the Vintage Story server config for this instance."
        icon={SettingsIcon}
      />

      <Tabs defaultValue="general" className="flex flex-col gap-4">
        <TabsList className="flex h-auto flex-wrap justify-start gap-1">
          <TabsTrigger value="general">General</TabsTrigger>
          <TabsTrigger value="admin">Admin</TabsTrigger>
          <TabsTrigger value="world">World</TabsTrigger>
          <TabsTrigger value="mods">Mods</TabsTrigger>
          <TabsTrigger value="network">Network</TabsTrigger>
          <TabsTrigger value="versions">Versions</TabsTrigger>
        </TabsList>

        <TabsContent value="general" className="mt-0">
          <GeneralTab settings={form.general} onChange={setGeneral} />
        </TabsContent>
        <TabsContent value="admin" className="mt-0">
          <AdminTab settings={form.admin} onChange={setAdmin} />
        </TabsContent>
        <TabsContent value="world" className="mt-0">
          <WorldTab settings={form.world} onChange={setWorld} />
        </TabsContent>
        <TabsContent value="mods" className="mt-0">
          <ModsTab
            id={id}
            settings={form.mods}
            onChange={setMods}
            onImmediateSettings={applyImmediateSettings}
          />
        </TabsContent>
        <TabsContent value="network" className="mt-0">
          <NetworkTab settings={form.network} onChange={setNetwork} />
        </TabsContent>
        <TabsContent value="versions" className="mt-0">
          <VersionsTab id={id} instance={instance} onUpdated={mutateInstance} />
        </TabsContent>
      </Tabs>

      <div className="sticky bottom-3 z-10 flex items-center justify-end gap-3 rounded-xl border border-border bg-card/90 px-4 py-3 shadow-panel backdrop-blur">
        <span className="text-xs text-muted-foreground">
          {dirty ? "You have unsaved config changes" : "All config changes saved"}
        </span>
        <Button onClick={save} disabled={!dirty || saving}>
          {saving ? <Loader2Icon className="animate-spin" /> : <SaveIcon />} Save
        </Button>
      </div>
    </div>
  );
}

function GeneralTab({
  settings,
  onChange,
}: {
  settings: ServerSettings["general"];
  onChange: (patch: Partial<ServerSettings["general"]>) => void;
}) {
  return (
    <SectionCard title="General" icon={ServerCogIcon}>
      <div className="grid gap-4 lg:grid-cols-2">
        <Field label="Server Name">
          <Input
            value={settings.serverName}
            onChange={(e) => onChange({ serverName: e.target.value })}
          />
        </Field>
        <Field label="Max Players">
          <Input
            type="number"
            min="1"
            value={settings.maxPlayers}
            onChange={(e) => onChange({ maxPlayers: numberInput(e.target.value, 1) })}
          />
        </Field>
        <Field label="Server Description" className="lg:col-span-2">
          <Textarea
            value={settings.serverDescription}
            onChange={(e) => onChange({ serverDescription: e.target.value })}
            rows={3}
            placeholder="VTML is accepted here."
          />
        </Field>
        <Field label="Welcome Message" className="lg:col-span-2">
          <Textarea
            value={settings.welcomeMessage}
            onChange={(e) => onChange({ welcomeMessage: e.target.value })}
            rows={2}
          />
        </Field>
        <Field label="Password">
          <Input
            value={settings.password}
            onChange={(e) => onChange({ password: e.target.value })}
            placeholder="Leave empty for no password"
          />
        </Field>
      </div>

      <div className="mt-5 grid gap-3 lg:grid-cols-2">
        <ToggleRow
          label="Advertise server"
          checked={settings.advertiseServer}
          onChange={(advertiseServer) => onChange({ advertiseServer })}
        />
        <ToggleRow
          label="Pass time when empty"
          checked={settings.passTimeWhenEmpty}
          onChange={(passTimeWhenEmpty) => onChange({ passTimeWhenEmpty })}
        />
        <ToggleRow
          label="Whitelist Mode"
          checked={settings.whitelistMode}
          onChange={(whitelistMode) => onChange({ whitelistMode })}
        />
        <ToggleRow
          label="Allow PVP"
          checked={settings.allowPvp}
          onChange={(allowPvp) => onChange({ allowPvp })}
        />
        <ToggleRow
          label="Allow Fire Spread"
          checked={settings.allowFireSpread}
          onChange={(allowFireSpread) => onChange({ allowFireSpread })}
        />
        <ToggleRow
          label="Allow Falling Blocks"
          checked={settings.allowFallingBlocks}
          onChange={(allowFallingBlocks) => onChange({ allowFallingBlocks })}
        />
      </div>
    </SectionCard>
  );
}

function AdminTab({
  settings,
  onChange,
}: {
  settings: ServerSettings["admin"];
  onChange: (patch: Partial<ServerSettings["admin"]>) => void;
}) {
  return (
    <SectionCard title="Admin" icon={ShieldIcon}>
      <div className="grid gap-4 lg:grid-cols-2">
        <Field label="Master Server URL">
          <Input
            value={settings.masterServerUrl}
            onChange={(e) => onChange({ masterServerUrl: e.target.value })}
          />
        </Field>
        <Field label="Mod DB URL">
          <Input value={settings.modDbUrl} onChange={(e) => onChange({ modDbUrl: e.target.value })} />
        </Field>
        <Field label="AntiAbuse level">
          <Input
            type="number"
            min="0"
            value={settings.antiAbuseLevel}
            onChange={(e) => onChange({ antiAbuseLevel: numberInput(e.target.value, 0) })}
          />
        </Field>
        <Field label="Max owned group channels per user">
          <Input
            type="number"
            min="0"
            value={settings.maxOwnedGroupChannelsPerUser}
            onChange={(e) =>
              onChange({ maxOwnedGroupChannelsPerUser: numberInput(e.target.value, 1) })
            }
          />
        </Field>
        <Field label="Number of Land Claims">
          <Input
            type="number"
            min="0"
            value={settings.numberOfLandClaims}
            onChange={(e) => onChange({ numberOfLandClaims: numberInput(e.target.value, 1) })}
          />
        </Field>
        <Field label="Chat rate limit ms">
          <Input
            type="number"
            min="0"
            value={settings.chatRateLimitMs}
            onChange={(e) => onChange({ chatRateLimitMs: numberInput(e.target.value, 1000) })}
          />
        </Field>
        <Field label="Land Claim Size">
          <div className="grid grid-cols-2 gap-2">
            <Input
              type="number"
              min="0"
              value={settings.landClaimMinSize}
              onChange={(e) => onChange({ landClaimMinSize: numberInput(e.target.value, 1) })}
              aria-label="Minimum land claim size"
            />
            <Input
              type="number"
              min="0"
              value={settings.landClaimMaxSize}
              onChange={(e) => onChange({ landClaimMaxSize: numberInput(e.target.value, 256) })}
              aria-label="Maximum land claim size"
            />
          </div>
        </Field>
        <Field label="Die Below Disk Space MB">
          <Input
            type="number"
            min="0"
            value={settings.dieBelowDiskSpaceMb}
            onChange={(e) => onChange({ dieBelowDiskSpaceMb: numberInput(e.target.value, 1000) })}
          />
        </Field>
      </div>

      <div className="mt-5 grid gap-3 lg:grid-cols-2">
        <ToggleRow
          label="Entity Debug Mode"
          checked={settings.entityDebugMode}
          onChange={(entityDebugMode) => onChange({ entityDebugMode })}
        />
      </div>
    </SectionCard>
  );
}

function WorldTab({
  settings,
  onChange,
}: {
  settings: ServerSettings["world"];
  onChange: (patch: Partial<ServerSettings["world"]>) => void;
}) {
  return (
    <SectionCard title="World" icon={GlobeIcon}>
      <div className="grid gap-4 lg:grid-cols-2">
        <Field label="Max Chunk Radius">
          <Input
            type="number"
            min="1"
            value={settings.maxChunkRadius}
            onChange={(e) => onChange({ maxChunkRadius: numberInput(e.target.value, 12) })}
          />
        </Field>
      </div>
    </SectionCard>
  );
}

function NetworkTab({
  settings,
  onChange,
}: {
  settings: ServerSettings["network"];
  onChange: (patch: Partial<ServerSettings["network"]>) => void;
}) {
  return (
    <SectionCard title="Network" icon={NetworkIcon}>
      <div className="grid gap-4 lg:grid-cols-2">
        <Field label="Port">
          <Input
            type="number"
            min="1"
            value={settings.port}
            onChange={(e) => onChange({ port: numberInput(e.target.value, 42420) })}
          />
        </Field>
        <Field label="Client Connection Timeout">
          <Input
            type="number"
            min="1"
            value={settings.clientConnectionTimeoutSeconds}
            onChange={(e) =>
              onChange({ clientConnectionTimeoutSeconds: numberInput(e.target.value, 360) })
            }
          />
        </Field>
      </div>
      <div className="mt-5 grid gap-3 lg:grid-cols-2">
        <ToggleRow label="UPNP" checked={settings.upnp} onChange={(upnp) => onChange({ upnp })} />
        <ToggleRow
          label="Compress Packets"
          checked={settings.compressPackets}
          onChange={(compressPackets) => onChange({ compressPackets })}
        />
      </div>
    </SectionCard>
  );
}

function ModsTab({
  id,
  settings,
  onChange,
  onImmediateSettings,
}: {
  id: string;
  settings: ServerSettings["mods"];
  onChange: (patch: Partial<ServerSettings["mods"]>) => void;
  onImmediateSettings: (settings: ServerSettings) => void;
}) {
  function updatePath(index: number, value: string) {
    onChange({
      modPaths: settings.modPaths.map((path, i) => (i === index ? value : path)),
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <SectionCard title="Mod Paths" icon={WaypointsIcon}>
        <div className="flex flex-col gap-3">
          {settings.modPaths.length === 0 ? (
            <p className="text-sm text-muted-foreground">No extra mod paths configured.</p>
          ) : (
            settings.modPaths.map((modPath, index) => (
              <div key={`${index}-${modPath}`} className="flex gap-2">
                <Input
                  value={modPath}
                  onChange={(e) => updatePath(index, e.target.value)}
                  className="font-mono text-xs"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  aria-label="Remove mod path"
                  onClick={() =>
                    onChange({ modPaths: settings.modPaths.filter((_, i) => i !== index) })
                  }
                >
                  <Trash2Icon />
                </Button>
              </div>
            ))
          )}
          <Button
            type="button"
            variant="outline"
            className="w-fit"
            onClick={() => onChange({ modPaths: [...settings.modPaths, ""] })}
          >
            <PlusIcon /> Add
          </Button>
        </div>
      </SectionCard>

      <ModBlacklistPanel
        id={id}
        entries={settings.modBlacklist}
        onImmediateSettings={onImmediateSettings}
      />
    </div>
  );
}

function ModBlacklistPanel({
  id,
  entries,
  onImmediateSettings,
}: {
  id: string;
  entries: ModBlacklistEntry[];
  onImmediateSettings: (settings: ServerSettings) => void;
}) {
  const [query, setQuery] = React.useState("");
  const [debounced, setDebounced] = React.useState("");
  const [busy, setBusy] = React.useState<string | null>(null);

  React.useEffect(() => {
    const timer = setTimeout(() => setDebounced(query.trim()), 250);
    return () => clearTimeout(timer);
  }, [query]);

  const search = useSWR(debounced ? ["settings-mod-search", debounced] : null, () =>
    api.mods.search(debounced),
  );
  const blacklistIds = new Set(entries.map((entry) => entry.id));

  async function blacklist(mod: ModSearchResult) {
    try {
      setBusy(mod.id);
      const response = await api.settings.blacklist(id, { op: "blacklist", mod });
      onImmediateSettings(response.settings);
      toast.success(`${mod.name} blacklisted`);
    } catch (e) {
      toast.error("Failed to blacklist mod", {
        description: e instanceof Error ? e.message : undefined,
      });
    } finally {
      setBusy(null);
    }
  }

  async function remove(modId: string, name: string) {
    try {
      setBusy(modId);
      const response = await api.settings.blacklist(id, { op: "removeBlacklist", modId });
      onImmediateSettings(response.settings);
      toast.success(`${name} removed from blacklist`);
    } catch (e) {
      toast.error("Failed to remove mod", {
        description: e instanceof Error ? e.message : undefined,
      });
    } finally {
      setBusy(null);
    }
  }

  const results = search.data?.results ?? [];

  return (
    <SectionCard title="Mod Blacklist" icon={BanIcon}>
      <div className="flex flex-col gap-4">
        <Field label="Browse Mod Database">
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search mods to blacklist..."
          />
        </Field>

        {!debounced ? (
          <BlacklistedMods entries={entries} busy={busy} onRemove={remove} />
        ) : search.isLoading && !search.data ? (
          <div className="grid gap-3 lg:grid-cols-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-32 rounded-xl" />
            ))}
          </div>
        ) : results.length === 0 ? (
          <EmptyState icon={PackageSearchIcon} title="No mods found" description="Try another search term." />
        ) : (
          <div className="grid gap-3 lg:grid-cols-2">
            {results.map((result) => {
              const blacklisted = blacklistIds.has(result.id);
              return (
                <ModResultCard
                  key={result.id}
                  mod={result}
                  busy={busy === result.id}
                  blacklisted={blacklisted}
                  onBlacklist={() => blacklist(result)}
                />
              );
            })}
          </div>
        )}
      </div>
    </SectionCard>
  );
}

function BlacklistedMods({
  entries,
  busy,
  onRemove,
}: {
  entries: ModBlacklistEntry[];
  busy: string | null;
  onRemove: (id: string, name: string) => void;
}) {
  if (entries.length === 0) {
    return (
      <EmptyState
        icon={BanIcon}
        title="No blacklisted mods"
        description="Search the Mod Database to add client-side mods that should block joins."
      />
    );
  }

  return (
    <div className="grid gap-3 lg:grid-cols-2">
      {entries.map((entry) => (
        <div key={entry.id} className="flex items-start gap-3 rounded-xl border border-border bg-card p-4">
          <ModIcon name={entry.name} src={entry.iconUrl} />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="truncate text-sm font-semibold">{entry.name}</h3>
              {entry.side && <Badge variant="outline">{entry.side}</Badge>}
            </div>
            <p className="truncate text-xs text-muted-foreground">
              {entry.author ? `by ${entry.author}` : entry.id}
            </p>
            {entry.latestVersion && (
              <p className="mt-1 text-xs text-muted-foreground">Latest v{entry.latestVersion}</p>
            )}
          </div>
          <Button
            size="sm"
            variant="outline"
            onClick={() => onRemove(entry.id, entry.name)}
            disabled={busy === entry.id}
          >
            {busy === entry.id ? <Loader2Icon className="animate-spin" /> : <Trash2Icon />}
            Remove
          </Button>
        </div>
      ))}
    </div>
  );
}

function ModResultCard({
  mod,
  busy,
  blacklisted,
  onBlacklist,
}: {
  mod: ModSearchResult;
  busy: boolean;
  blacklisted: boolean;
  onBlacklist: () => void;
}) {
  return (
    <div className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4">
      <div className="flex items-start gap-3">
        <ModIcon name={mod.name} src={mod.iconUrl} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="truncate text-sm font-semibold">{mod.name}</h3>
            {mod.side && <Badge variant="outline">{mod.side}</Badge>}
          </div>
          <p className="truncate text-xs text-muted-foreground">by {mod.author ?? mod.id}</p>
        </div>
        <div className="flex items-center gap-1 text-xs text-muted-foreground">
          <DownloadIcon className="size-3.5" /> {formatNumber(mod.downloads)}
        </div>
      </div>
      <p className="line-clamp-2 text-xs text-muted-foreground">{mod.summary}</p>
      <div className="mt-auto flex items-center justify-between gap-2">
        <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">
          v{mod.latestVersion}
        </span>
        <Button size="sm" onClick={onBlacklist} disabled={blacklisted || busy}>
          {busy ? <Loader2Icon className="animate-spin" /> : <BanIcon />}
          {blacklisted ? "Blacklisted" : "Blacklist"}
        </Button>
      </div>
    </div>
  );
}

function VersionsTab({
  id,
  instance,
  onUpdated,
}: {
  id: string;
  instance: InstanceWithState;
  onUpdated: () => void;
}) {
  const { data, isLoading } = useSWR(["versions", id], () => api.versions.get(id));
  const stable = (data?.versions ?? []).filter((version) => version.channel === "stable");
  const unstable = (data?.versions ?? []).filter((version) => version.channel !== "stable");
  const [stableTarget, setStableTarget] = React.useState("");
  const [unstableTarget, setUnstableTarget] = React.useState("");
  const [busy, setBusy] = React.useState<string | null>(null);
  const { confirm, node } = useConfirm();

  const selectedStable = stableTarget || stable.find((version) => version.latest)?.version || stable[0]?.version || "";
  const selectedUnstable = unstableTarget || unstable.find((version) => version.latest)?.version || unstable[0]?.version || "";

  async function install(version: string) {
    try {
      setBusy(version);
      await api.versions.update(id, version);
      toast.success(`Installing Vintage Story ${version}`, {
        description: "The update workflow backs up, stops, updates and restarts the server.",
      });
      onUpdated();
    } catch (e) {
      toast.error("Install failed", { description: e instanceof Error ? e.message : undefined });
    } finally {
      setBusy(null);
    }
  }

  return (
    <>
      {node}
      <SectionCard
        title="Versions"
        description={data ? `Currently running v${data.current}` : "Loading versions..."}
        icon={DownloadIcon}
      >
        {isLoading && !data ? (
          <div className="grid gap-3 lg:grid-cols-2">
            <Skeleton className="h-32 rounded-xl" />
            <Skeleton className="h-32 rounded-xl" />
          </div>
        ) : (
          <div className="grid gap-3 lg:grid-cols-2">
            <VersionInstaller
              title="Stable"
              versions={stable}
              current={data?.current ?? instance.version}
              selected={selectedStable}
              busy={busy}
              onSelect={setStableTarget}
              onInstall={(version) =>
                confirm({
                  title: `Install Vintage Story ${version}?`,
                  description:
                    "The server will be backed up, stopped, updated and restarted. Saves and data are preserved.",
                  confirmLabel: "Install",
                  onConfirm: () => install(version),
                })
              }
            />
            <VersionInstaller
              title="Unstable"
              versions={unstable}
              current={data?.current ?? instance.version}
              selected={selectedUnstable}
              busy={busy}
              onSelect={setUnstableTarget}
              onInstall={(version) =>
                confirm({
                  title: `Install Vintage Story ${version}?`,
                  description:
                    "Unstable releases may break worlds or mods. A backup will be created before files are replaced.",
                  confirmLabel: "Install",
                  onConfirm: () => install(version),
                })
              }
            />
          </div>
        )}
      </SectionCard>
    </>
  );
}

function VersionInstaller({
  title,
  versions,
  current,
  selected,
  busy,
  onSelect,
  onInstall,
}: {
  title: string;
  versions: GameVersion[];
  current: string;
  selected: string;
  busy: string | null;
  onSelect: (version: string) => void;
  onInstall: (version: string) => void;
}) {
  const disabled = versions.length === 0 || !selected || selected === current || busy !== null;

  return (
    <div className="flex flex-col gap-4 rounded-xl border border-border bg-muted/20 p-4">
      <div>
        <h3 className="text-sm font-semibold">{title}</h3>
        <p className="text-xs text-muted-foreground">
          {versions.length > 0 ? `${versions.length} available` : "No versions available"}
        </p>
      </div>
      <div className="flex flex-wrap items-end gap-3">
        <Field label={`${title} version`} className="min-w-56 flex-1">
          <Select
            value={selected}
            onValueChange={(value) => value && onSelect(value)}
            disabled={versions.length === 0}
          >
            <SelectTrigger>
              <SelectValue placeholder="Select version" />
            </SelectTrigger>
            <SelectContent>
              {versions.map((version) => (
                <SelectItem key={version.version} value={version.version}>
                  v{version.version}
                  {version.latest ? " · latest" : ""}
                  {version.channel !== "stable" ? ` · ${version.channel}` : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Button disabled={disabled} onClick={() => onInstall(selected)}>
          {busy === selected ? <Loader2Icon className="animate-spin" /> : <DownloadIcon />}
          {selected === current ? "Installed" : "Install"}
        </Button>
      </div>
    </div>
  );
}

function ModIcon({ name, src }: { name: string; src?: string }) {
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");

  return (
    <div className="flex size-11 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-border bg-muted text-xs font-semibold text-muted-foreground">
      {src ? (
        <img
          src={src}
          alt=""
          className="size-full object-cover"
          onError={(event) => {
            event.currentTarget.style.display = "none";
          }}
        />
      ) : (
        initials || "MOD"
      )}
    </div>
  );
}

function Field({
  label,
  children,
  className,
}: {
  label: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("grid gap-2", className)}>
      <Label>{label}</Label>
      {children}
    </div>
  );
}

function ToggleRow({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <div className="flex min-h-14 items-center justify-between gap-4 rounded-lg border border-border bg-muted/30 px-3.5 py-3">
      <p className="text-sm font-medium">{label}</p>
      <Switch checked={checked} onCheckedChange={onChange} />
    </div>
  );
}

function numberInput(value: string, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function settingsKey(settings: ServerSettings): string {
  return JSON.stringify(settings);
}
