"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useSWRConfig } from "swr";
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
import { api } from "@/lib/api";

const VERSIONS = ["1.20.7", "1.20.6", "1.20.5", "1.20.4"];
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
  const [group, setGroup] = React.useState("Servers");
  const [version, setVersion] = React.useState("1.20.7");
  const [maxPlayers, setMaxPlayers] = React.useState("16");
  const [memory, setMemory] = React.useState("4096");
  const router = useRouter();
  const { mutate } = useSWRConfig();

  React.useEffect(() => {
    if (!open) {
      setName("");
      setGroup("Servers");
      setVersion("1.20.7");
      setMaxPlayers("16");
      setMemory("4096");
      setBusy(false);
    }
  }, [open]);

  async function submit() {
    if (!name.trim()) {
      toast.error("Please enter a server name");
      return;
    }
    try {
      setBusy(true);
      const created = await api.instances.create({
        name: name.trim(),
        group: group.trim() || "Servers",
        version,
        maxPlayers: Number(maxPlayers) || 16,
        resources: { memoryLimitMB: Number(memory), cpuLimit: 2 },
      });
      await mutate((key) => Array.isArray(key) && key[0] === "instances");
      toast.success(`Server “${created.name}” created`);
      setOpen(false);
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
    <Dialog open={open} onOpenChange={setOpen}>
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
            <div className="grid gap-2">
              <Label htmlFor="sv-group">Group</Label>
              <Input
                id="sv-group"
                value={group}
                onChange={(e) => setGroup(e.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label>Version</Label>
              <Select value={version} onValueChange={(v) => setVersion(v as string)}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {VERSIONS.map((v) => (
                    <SelectItem key={v} value={v}>
                      v{v}
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
          <Button variant="outline" onClick={() => setOpen(false)} disabled={busy}>
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
