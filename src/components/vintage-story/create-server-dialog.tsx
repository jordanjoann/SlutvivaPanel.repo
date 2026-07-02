"use client";

import * as React from "react";
import useSWR, { useSWRConfig } from "swr";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { PlusIcon, Loader2Icon } from "lucide-react";
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
import { api } from "@/lib/api";
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
];

export function CreateServerDialog() {
  const [open, setOpen] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [name, setName] = React.useState("");
  const [development, setDevelopment] = React.useState(false);
  const [version, setVersion] = React.useState("");
  const [maxPlayers, setMaxPlayers] = React.useState("16");
  const [memory, setMemory] = React.useState("4096");
  const router = useRouter();
  const { mutate } = useSWRConfig();
  const { data: versionData } = useSWR("vintage-story-versions", api.vintageStory.versions);
  const versions = versionData?.versions ?? FALLBACK_VINTAGE_STORY_VERSIONS;
  const defaultVersion =
    versions.find((v) => v.latest)?.version ?? DEFAULT_VINTAGE_STORY_VERSION;
  const selectedVersion = version || defaultVersion;

  function resetForm() {
    setName("");
    setDevelopment(false);
    setVersion("");
    setMaxPlayers("16");
    setMemory("4096");
    setBusy(false);
  }

  function handleOpenChange(nextOpen: boolean) {
    setOpen(nextOpen);
    if (!nextOpen) resetForm();
  }

  async function submit() {
    if (!name.trim()) {
      toast.error("Please enter a server name");
      return;
    }
    try {
      setBusy(true);
      const created = await api.instances.create({
        name: name.trim(),
        group: development ? "Development" : "Servers",
        development,
        version: selectedVersion,
        maxPlayers: Number(maxPlayers) || 16,
        resources: { memoryLimitMB: Number(memory), cpuLimit: 2 },
      });
      await mutate((key) => Array.isArray(key) && key[0] === "instances");
      toast.success(`Server “${created.name}” created`);
      handleOpenChange(false);
      router.push(`/vintage-story/${created.id}`);
    } catch (e) {
      toast.error("Failed to create server", {
        description: e instanceof Error ? e.message : undefined,
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
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Create Vintage Story server</DialogTitle>
          <DialogDescription>
            A dedicated instance with its own data path, port, mods and backups.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor="sv-name">Server name</Label>
            <Input
              id="sv-name"
              placeholder="e.g. Community Survival"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="flex min-h-16 items-center justify-between gap-3 rounded-lg border border-border bg-muted/30 px-3.5 py-3">
              <div>
                <Label htmlFor="sv-development" className="text-sm">
                  For development
                </Label>
                <p className="mt-0.5 text-xs text-muted-foreground">Whitelist only</p>
              </div>
              <Switch
                id="sv-development"
                checked={development}
                onCheckedChange={setDevelopment}
              />
            </div>
            <div className="grid gap-2">
              <Label>Version</Label>
              <Select value={selectedVersion} onValueChange={(v) => setVersion(v as string)}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {versions.map((v) => (
                    <SelectItem key={v.version} value={v.version}>
                      v{v.version}
                      {v.latest ? " · latest" : v.channel !== "stable" ? ` · ${v.channel}` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-2">
              <Label htmlFor="sv-max">Max players</Label>
              <Input
                id="sv-max"
                type="number"
                min={1}
                value={maxPlayers}
                onChange={(e) => setMaxPlayers(e.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label>Memory limit</Label>
              <Select value={memory} onValueChange={(v) => setMemory(v as string)}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {MEMORY.map((m) => (
                    <SelectItem key={m.v} value={m.v}>
                      {m.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            A unique port and data path are assigned automatically.
          </p>
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
