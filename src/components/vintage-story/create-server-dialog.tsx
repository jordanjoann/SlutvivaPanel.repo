"use client";

import * as React from "react";
import { Loader2Icon, PlusIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import useSWR, { useSWRConfig } from "swr";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { WorldCreationSettings } from "@/components/vintage-story/world-creation-settings";
import { api } from "@/lib/api";
import {
  DEFAULT_WORLD_GENERATION_CONFIG,
  playStyleMeta,
  type VintageStoryPlayStyle,
  type VintageStoryWorldGenerationConfig,
} from "@/lib/vintage-story-world";
import {
  DEFAULT_VINTAGE_STORY_VERSION,
  FALLBACK_VINTAGE_STORY_VERSIONS,
} from "@/lib/vintage-story-versions";

const MEMORY = [
  { v: "2048", label: "2 GB" },
  { v: "3072", label: "3 GB" },
  { v: "4096", label: "4 GB" },
  { v: "6144", label: "6 GB" },
  { v: "8192", label: "8 GB" },
  { v: "12288", label: "12 GB" },
  { v: "16384", label: "16 GB" },
];

const CPU = [
  { v: "1", label: "1 core" },
  { v: "2", label: "2 cores" },
  { v: "3", label: "3 cores" },
  { v: "4", label: "4 cores" },
  { v: "6", label: "6 cores" },
  { v: "8", label: "8 cores" },
  { v: "0", label: "Unlimited" },
];

type ConfigPatch = Partial<VintageStoryWorldGenerationConfig>;

export function CreateServerDialog() {
  const [open, setOpen] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [name, setName] = React.useState("");
  const [worldName, setWorldName] = React.useState("New World");
  const [seed, setSeed] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [welcomeMessage, setWelcomeMessage] = React.useState("Welcome to the server!");
  const [serverPassword, setServerPassword] = React.useState("");
  const [development, setDevelopment] = React.useState(false);
  const [advertiseServer, setAdvertiseServer] = React.useState(false);
  const [version, setVersion] = React.useState("");
  const [maxPlayers, setMaxPlayers] = React.useState("16");
  const [memory, setMemory] = React.useState("4096");
  const [cpu, setCpu] = React.useState("2");
  const [worldConfig, setWorldConfig] = React.useState<VintageStoryWorldGenerationConfig>(
    DEFAULT_WORLD_GENERATION_CONFIG,
  );
  const router = useRouter();
  const { mutate } = useSWRConfig();
  const { data: versionData } = useSWR("vintage-story-versions", api.vintageStory.versions);
  const versions = versionData?.versions ?? FALLBACK_VINTAGE_STORY_VERSIONS;
  const defaultVersion =
    versions.find((candidate) => candidate.latest)?.version ?? DEFAULT_VINTAGE_STORY_VERSION;
  const selectedVersion = version || defaultVersion;

  function resetForm() {
    setName("");
    setWorldName("New World");
    setSeed("");
    setDescription("");
    setWelcomeMessage("Welcome to the server!");
    setServerPassword("");
    setDevelopment(false);
    setAdvertiseServer(false);
    setVersion("");
    setMaxPlayers("16");
    setMemory("4096");
    setCpu("2");
    setWorldConfig(DEFAULT_WORLD_GENERATION_CONFIG);
    setBusy(false);
  }

  function handleOpenChange(nextOpen: boolean) {
    setOpen(nextOpen);
    if (!nextOpen) resetForm();
  }

  function updateConfig(patch: ConfigPatch) {
    setWorldConfig((current) => ({ ...current, ...patch }));
  }

  function setPlayStyle(value: VintageStoryPlayStyle) {
    const style = playStyleMeta(value);
    updateConfig({
      playStyle: value,
      gameMode: style.defaultGameMode,
      allowCreativeMode: style.allowCreativeMode,
    });
  }

  function setDevelopmentMode(next: boolean) {
    setDevelopment(next);
    if (next) updateConfig({ whitelistMode: true });
  }

  async function submit() {
    if (!name.trim()) {
      toast.error("Please enter a server name");
      return;
    }

    const finalWorldName = worldName.trim() || name.trim();

    try {
      setBusy(true);
      const created = await api.instances.create({
        name: name.trim(),
        group: development ? "Development" : "Servers",
        development,
        version: selectedVersion,
        description: description.trim(),
        motd: welcomeMessage.trim(),
        worldName: finalWorldName,
        seed: seed.trim(),
        maxPlayers: numberInput(maxPlayers, 16),
        passwordProtected: serverPassword.trim().length > 0,
        publicAdvertised: advertiseServer,
        autoRestart: false,
        resources: {
          memoryLimitMB: numberInput(memory, 4096),
          cpuLimit: Number(cpu),
        },
        serverPassword: serverPassword.trim(),
        initialWorldConfig: {
          ...worldConfig,
          whitelistMode: development || worldConfig.whitelistMode,
        },
      });
      await mutate((key) => Array.isArray(key) && key[0] === "instances");
      toast.success(`Server "${created.name}" created`);
      handleOpenChange(false);
      router.push(`/vintage-story/${created.id}`);
    } catch (error) {
      toast.error("Failed to create server", {
        description: error instanceof Error ? error.message : undefined,
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger render={<Button />}>
        <PlusIcon /> New Server
      </DialogTrigger>
      <DialogContent className="max-h-[92vh] overflow-hidden sm:max-w-6xl">
        <DialogHeader>
          <DialogTitle>Create Vintage Story server</DialogTitle>
          <DialogDescription>
            Configure the instance and first world before the server starts.
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[calc(92vh-10rem)] overflow-y-auto pr-1">
          <div className="grid gap-4">
            <CreateSection title="Instance">
              <div className="grid gap-4 lg:grid-cols-4">
                <Field label="Server name" className="lg:col-span-2">
                  <Input value={name} onChange={(event) => setName(event.target.value)} autoFocus />
                </Field>
                <Field label="Version">
                  <Select value={selectedVersion} onValueChange={(next) => setVersion(next as string)}>
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {versions.map((candidate) => (
                        <SelectItem key={candidate.version} value={candidate.version}>
                          v{candidate.version}
                          {candidate.latest
                            ? " · latest"
                            : candidate.channel !== "stable"
                              ? ` · ${candidate.channel}`
                              : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
                <Field label="Max players">
                  <Input
                    type="number"
                    min={1}
                    value={maxPlayers}
                    onChange={(event) => setMaxPlayers(event.target.value)}
                  />
                </Field>
                <Field label="Memory">
                  <Select value={memory} onValueChange={(next) => setMemory(next as string)}>
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {MEMORY.map((option) => (
                        <SelectItem key={option.v} value={option.v}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
                <Field label="CPU">
                  <Select value={cpu} onValueChange={(next) => setCpu(next as string)}>
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {CPU.map((option) => (
                        <SelectItem key={option.v} value={option.v}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
                <Field label="World name" className="lg:col-span-2">
                  <Input
                    value={worldName}
                    onChange={(event) => setWorldName(event.target.value)}
                  />
                </Field>
              </div>
            </CreateSection>

            <CreateSection title="World setup">
              <WorldCreationSettings
                config={worldConfig}
                development={development}
                seed={seed}
                onConfigChange={updateConfig}
                onPlayStyleChange={setPlayStyle}
                onSeedChange={setSeed}
              />
            </CreateSection>

            <CreateSection title="Server access">
              <div className="grid gap-4 lg:grid-cols-4">
                <Field label="Password" className="lg:col-span-2">
                  <Input
                    type="password"
                    value={serverPassword}
                    onChange={(event) => setServerPassword(event.target.value)}
                  />
                </Field>
                <ToggleField
                  label="Development"
                  checked={development}
                  onChange={setDevelopmentMode}
                />
                <ToggleField
                  label="Advertise"
                  checked={advertiseServer}
                  onChange={setAdvertiseServer}
                />
                <Field label="Server description" className="lg:col-span-2">
                  <Textarea
                    value={description}
                    rows={3}
                    onChange={(event) => setDescription(event.target.value)}
                  />
                </Field>
                <Field label="Welcome message" className="lg:col-span-2">
                  <Textarea
                    value={welcomeMessage}
                    rows={3}
                    onChange={(event) => setWelcomeMessage(event.target.value)}
                  />
                </Field>
              </div>
            </CreateSection>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => handleOpenChange(false)} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={busy}>
            {busy && <Loader2Icon className="animate-spin" />}
            Create server
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CreateSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-lg border border-border bg-muted/20 p-3.5">
      <h3 className="mb-3 font-heading text-sm font-semibold">{title}</h3>
      {children}
    </section>
  );
}

function Field({
  label,
  className,
  children,
}: {
  label: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={`grid gap-2 ${className ?? ""}`}>
      <Label className="text-xs">{label}</Label>
      {children}
    </div>
  );
}

function ToggleField({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <div className="flex min-h-16 items-center justify-between gap-3 rounded-lg border border-border bg-background px-3 py-2">
      <Label className="text-sm">{label}</Label>
      <Switch checked={checked} onCheckedChange={onChange} />
    </div>
  );
}

function numberInput(value: string, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}
