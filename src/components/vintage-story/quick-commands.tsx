"use client";

import * as React from "react";
import { toast } from "sonner";
import {
  DatabaseBackupIcon,
  MegaphoneIcon,
} from "lucide-react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface Prompt {
  title: string;
  label: string;
  placeholder: string;
  build: (value: string) => string;
}

export function QuickCommands({ id }: { id: string }) {
  const [prompt, setPrompt] = React.useState<Prompt | null>(null);
  const [value, setValue] = React.useState("");

  async function run(command: string) {
    try {
      await api.instances.command(id, command);
    } catch (e) {
      toast.error("Command failed", {
        description: e instanceof Error ? e.message : undefined,
      });
    }
  }

  async function submitPrompt() {
    if (!prompt || !value.trim()) return;
    await run(prompt.build(value.trim()));
    setPrompt(null);
    setValue("");
  }

  const direct = [
    { label: "Backup", icon: DatabaseBackupIcon, cmd: "/saveworld" },
  ];

  const prompts: (Prompt & { icon: React.ComponentType<{ className?: string }> })[] = [
    {
      label: "Announce",
      icon: MegaphoneIcon,
      title: "Broadcast announcement",
      placeholder: "Server restarting in 5 minutes…",
      build: (v) => `/announce ${v}`,
    },
  ];

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        {direct.map((a) => (
          <Button key={a.label} variant="outline" size="sm" onClick={() => run(a.cmd)}>
            <a.icon /> {a.label}
          </Button>
        ))}
        {prompts.map((p) => (
          <Button
            key={p.label}
            variant="outline"
            size="sm"
            onClick={() => {
              setValue("");
              setPrompt({
                title: p.title,
                label: p.label,
                placeholder: p.placeholder,
                build: p.build,
              });
            }}
          >
            <p.icon /> {p.label}
          </Button>
        ))}
      </div>

      <Dialog open={prompt !== null} onOpenChange={(o) => !o && setPrompt(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{prompt?.title}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-2">
            <Label htmlFor="quick-cmd-value">{prompt?.label}</Label>
            <Input
              id="quick-cmd-value"
              value={value}
              placeholder={prompt?.placeholder}
              onChange={(e) => setValue(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && submitPrompt()}
              autoFocus
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPrompt(null)}>
              Cancel
            </Button>
            <Button onClick={submitPrompt} disabled={!value.trim()}>
              Send command
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
