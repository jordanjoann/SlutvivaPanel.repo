"use client";

import * as React from "react";
import useSWR from "swr";
import { useParams } from "next/navigation";
import { toast } from "sonner";
import {
  SettingsIcon,
  ServerCogIcon,
  NetworkIcon,
  LockIcon,
  CpuIcon,
  ContainerIcon,
  RefreshCwIcon,
  DownloadIcon,
  KeyRoundIcon,
  Loader2Icon,
  SaveIcon,
} from "lucide-react";
import { api } from "@/lib/api";
import { useInstance } from "@/hooks/use-instances";
import { PageHeader } from "@/components/panel/page-header";
import { SectionCard } from "@/components/panel/section-card";
import { useConfirm } from "@/components/panel/confirm-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { Instance, InstanceWithState } from "@/lib/types";

const MEMORY = [2048, 3072, 4096, 6144, 8192, 12288, 16384];

export default function SettingsPage() {
  const { id } = useParams<{ id: string }>();
  const { data: instance, mutate } = useInstance(id);

  if (!instance) {
    return (
      <div className="flex flex-col gap-5">
        <Skeleton className="h-8 w-56" />
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-48 rounded-xl" />
        ))}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="Admin & Settings"
        description="Configure this server. Settings marked “restart required” apply on the next restart."
        icon={SettingsIcon}
      />
      <SettingsForm instance={instance} onSaved={() => mutate()} />
      <VersionUpdate id={id} currentStatus={instance.state.status} onUpdated={() => mutate()} />
      <EnvVars instance={instance} />
    </div>
  );
}

function RestartHint() {
  return (
    <span className="ml-2 rounded bg-warning/15 px-1.5 py-0.5 text-[10px] font-medium text-warning">
      restart required
    </span>
  );
}

function SettingsForm({
  instance,
  onSaved,
}: {
  instance: InstanceWithState;
  onSaved: () => void;
}) {
  const [form, setForm] = React.useState({
    name: instance.name,
    description: instance.description ?? "",
    motd: instance.motd ?? "",
    group: instance.group ?? "",
    port: instance.port,
    maxPlayers: instance.maxPlayers,
    passwordProtected: instance.passwordProtected,
    publicAdvertised: instance.publicAdvertised,
    memoryLimitMB: instance.resources.memoryLimitMB,
    cpuLimit: instance.resources.cpuLimit,
    containerName: instance.docker.containerName,
    image: instance.docker.image,
    autoRestart: instance.autoRestart,
    autoBackup: instance.autoBackup,
  });
  const [saving, setSaving] = React.useState(false);

  function set<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  const dirty =
    form.name !== instance.name ||
    form.description !== (instance.description ?? "") ||
    form.motd !== (instance.motd ?? "") ||
    form.group !== (instance.group ?? "") ||
    form.port !== instance.port ||
    form.maxPlayers !== instance.maxPlayers ||
    form.passwordProtected !== instance.passwordProtected ||
    form.publicAdvertised !== instance.publicAdvertised ||
    form.memoryLimitMB !== instance.resources.memoryLimitMB ||
    form.cpuLimit !== instance.resources.cpuLimit ||
    form.containerName !== instance.docker.containerName ||
    form.image !== instance.docker.image ||
    form.autoRestart !== instance.autoRestart ||
    form.autoBackup !== instance.autoBackup;

  async function save() {
    try {
      setSaving(true);
      const patch: Partial<Instance> = {
        name: form.name,
        description: form.description,
        motd: form.motd,
        group: form.group,
        port: Number(form.port),
        maxPlayers: Number(form.maxPlayers),
        passwordProtected: form.passwordProtected,
        publicAdvertised: form.publicAdvertised,
        resources: { memoryLimitMB: Number(form.memoryLimitMB), cpuLimit: Number(form.cpuLimit) },
        docker: {
          ...instance.docker,
          containerName: form.containerName,
          image: form.image,
        },
        autoRestart: form.autoRestart,
        autoBackup: form.autoBackup,
      };
      await api.instances.update(instance.id, patch);
      toast.success("Settings saved");
      onSaved();
    } catch (e) {
      toast.error("Failed to save", { description: e instanceof Error ? e.message : undefined });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <SectionCard title="General" icon={ServerCogIcon}>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Server name">
            <Input value={form.name} onChange={(e) => set("name", e.target.value)} />
          </Field>
          <Field label="Group">
            <Input value={form.group} onChange={(e) => set("group", e.target.value)} />
          </Field>
          <Field label="Description" className="sm:col-span-2">
            <Textarea
              value={form.description}
              onChange={(e) => set("description", e.target.value)}
              rows={2}
            />
          </Field>
          <Field label="Message of the day (MOTD)" className="sm:col-span-2">
            <Input value={form.motd} onChange={(e) => set("motd", e.target.value)} />
          </Field>
        </div>
      </SectionCard>

      <SectionCard title="Network & players" icon={NetworkIcon}>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={<>Port <RestartHint /></>}>
            <Input
              type="number"
              value={form.port}
              onChange={(e) => set("port", Number(e.target.value))}
            />
          </Field>
          <Field label="Max players">
            <Input
              type="number"
              value={form.maxPlayers}
              onChange={(e) => set("maxPlayers", Number(e.target.value))}
            />
          </Field>
        </div>
      </SectionCard>

      <SectionCard title="Access & advertising" icon={LockIcon}>
        <div className="flex flex-col gap-3">
          <ToggleRow
            label="Password protected"
            description="Require a password to join this server."
            checked={form.passwordProtected}
            onChange={(v) => set("passwordProtected", v)}
          />
          <ToggleRow
            label="Advertise publicly"
            description="List this server on the public master server list."
            checked={form.publicAdvertised}
            onChange={(v) => set("publicAdvertised", v)}
          />
        </div>
      </SectionCard>

      <SectionCard title="Resources" icon={CpuIcon}>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={<>Memory limit <RestartHint /></>}>
            <Select
              value={String(form.memoryLimitMB)}
              onValueChange={(v) => set("memoryLimitMB", Number(v))}
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {MEMORY.map((m) => (
                  <SelectItem key={m} value={String(m)}>
                    {(m / 1024).toFixed(m % 1024 ? 1 : 0)} GB
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label={<>CPU limit (cores) <RestartHint /></>}>
            <Input
              type="number"
              step="0.5"
              min="0"
              value={form.cpuLimit}
              onChange={(e) => set("cpuLimit", Number(e.target.value))}
            />
          </Field>
        </div>
      </SectionCard>

      <SectionCard title="Docker" icon={ContainerIcon}>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Container name">
            <Input value={form.containerName} onChange={(e) => set("containerName", e.target.value)} className="font-mono text-xs" />
          </Field>
          <Field label={<>Image <RestartHint /></>}>
            <Input value={form.image} onChange={(e) => set("image", e.target.value)} className="font-mono text-xs" />
          </Field>
        </div>
      </SectionCard>

      <SectionCard title="Automation" icon={RefreshCwIcon}>
        <div className="flex flex-col gap-3">
          <ToggleRow
            label="Automatic restart"
            description="Start this server when the panel boots and restart it if it crashes."
            checked={form.autoRestart}
            onChange={(v) => set("autoRestart", v)}
          />
          <ToggleRow
            label="Automatic backups"
            description="Take scheduled nightly backups of the world."
            checked={form.autoBackup}
            onChange={(v) => set("autoBackup", v)}
          />
        </div>
      </SectionCard>

      <div className="sticky bottom-3 z-10 flex items-center justify-end gap-3 rounded-xl border border-border bg-card/90 px-4 py-3 shadow-panel backdrop-blur">
        <span className="text-xs text-muted-foreground">
          {dirty ? "You have unsaved changes" : "All changes saved"}
        </span>
        <Button onClick={save} disabled={!dirty || saving}>
          {saving ? <Loader2Icon className="animate-spin" /> : <SaveIcon />} Save changes
        </Button>
      </div>
    </div>
  );
}

function VersionUpdate({
  id,
  currentStatus,
  onUpdated,
}: {
  id: string;
  currentStatus: string;
  onUpdated: () => void;
}) {
  const { data } = useSWR(["versions", id], () => api.versions.get(id));
  const [target, setTarget] = React.useState<string>("");
  const [busy, setBusy] = React.useState(false);
  const { confirm, node } = useConfirm();

  React.useEffect(() => {
    if (data && !target) setTarget(data.versions.find((v) => v.latest)?.version ?? data.current);
  }, [data, target]);

  async function update() {
    try {
      setBusy(true);
      await api.versions.update(id, target);
      toast.success(`Updating to Vintage Story ${target}`, {
        description: "Backing up, replacing files and restarting. Data is preserved.",
      });
      onUpdated();
    } catch (e) {
      toast.error("Update failed", { description: e instanceof Error ? e.message : undefined });
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      {node}
      <SectionCard
        title="Version & updates"
        description={data ? `Currently running v${data.current}` : "Loading versions…"}
        icon={DownloadIcon}
      >
        <div className="flex flex-col gap-4">
          <p className="rounded-lg border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
            The update workflow backs up the current server, stops it, downloads the selected
            package, replaces installation files and restarts — while{" "}
            <span className="font-medium text-foreground">preserving the data path</span>, saves,
            configs, mods and player data.
          </p>
          <div className="flex flex-wrap items-end gap-3">
            <div className="grid gap-2">
              <Label>Target version</Label>
              <Select value={target} onValueChange={(v) => setTarget(v as string)}>
                <SelectTrigger className="w-56">
                  <SelectValue placeholder="Select version" />
                </SelectTrigger>
                <SelectContent>
                  {data?.versions.map((v) => (
                    <SelectItem key={v.version} value={v.version}>
                      v{v.version}
                      {v.latest ? " · latest" : v.channel !== "stable" ? ` · ${v.channel}` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button
              disabled={busy || !target || target === data?.current}
              onClick={() =>
                confirm({
                  title: `Update to Vintage Story ${target}?`,
                  description:
                    "The server will be backed up, stopped, updated and restarted. The data path and world are never deleted.",
                  confirmLabel: "Back up & update",
                  onConfirm: update,
                })
              }
            >
              {busy ? <Loader2Icon className="animate-spin" /> : <DownloadIcon />}
              {target === data?.current ? "Up to date" : "Update server"}
            </Button>
            {currentStatus === "running" && (
              <span className="text-xs text-muted-foreground">
                Server will be stopped during the update.
              </span>
            )}
          </div>
        </div>
      </SectionCard>
    </>
  );
}

function EnvVars({ instance }: { instance: InstanceWithState }) {
  const vars = [
    { key: "VS_PORT", value: String(instance.port) },
    { key: "VS_DATA_PATH", value: instance.dataPath },
    { key: "VS_MAX_CLIENTS", value: String(instance.maxPlayers) },
    { key: "DOCKER_NETWORK", value: instance.docker.network },
    { key: "PANEL_ADMIN_PASSWORD", value: "••••••••", secret: true },
    { key: "VINTAGE_STORY_ACCOUNT_PASSWORD", value: "••••••••", secret: true },
  ];
  return (
    <SectionCard
      title="Environment variables"
      description="Secrets are stored in the instance .env and never exposed by the panel."
      icon={KeyRoundIcon}
      bodyClassName="p-0"
    >
      <div className="divide-y divide-border">
        {vars.map((v) => (
          <div key={v.key} className="flex items-center gap-3 px-4 py-2.5 font-mono text-xs">
            <span className="w-64 shrink-0 truncate text-muted-foreground">{v.key}</span>
            <span className={v.secret ? "text-muted-foreground" : "truncate text-foreground"}>
              {v.value}
            </span>
            {v.secret && (
              <span className="ml-auto rounded bg-muted px-1.5 py-0.5 text-[10px] not-italic text-muted-foreground">
                secret
              </span>
            )}
          </div>
        ))}
      </div>
    </SectionCard>
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
    <div className={`grid gap-2 ${className ?? ""}`}>
      <Label className="flex items-center">{label}</Label>
      {children}
    </div>
  );
}

function ToggleRow({
  label,
  description,
  checked,
  onChange,
}: {
  label: string;
  description: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-lg border border-border bg-muted/30 px-3.5 py-3">
      <div className="min-w-0">
        <p className="text-sm font-medium">{label}</p>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
      <Switch checked={checked} onCheckedChange={onChange} />
    </div>
  );
}
