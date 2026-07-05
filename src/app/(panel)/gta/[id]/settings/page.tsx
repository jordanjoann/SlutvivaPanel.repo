"use client";

import * as React from "react";
import { useParams } from "next/navigation";
import { toast } from "sonner";
import { SaveIcon, SettingsIcon } from "lucide-react";
import { api } from "@/lib/api";
import type { Instance } from "@/lib/types";
import { useInstance } from "@/hooks/use-instances";
import { PageHeader } from "@/components/panel/page-header";
import { SectionCard } from "@/components/panel/section-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";

type SettingsDraft = {
  instanceId: string;
  name: string;
  description: string;
  maxPlayers: string;
};

function draftFromInstance(instance: Instance): SettingsDraft {
  return {
    instanceId: instance.id,
    name: instance.name,
    description: instance.description ?? "",
    maxPlayers: String(instance.maxPlayers),
  };
}

export default function GtaSettingsPage() {
  const { id } = useParams<{ id: string }>();
  const { data: instance, mutate } = useInstance(id);
  const [busy, setBusy] = React.useState(false);
  const [draft, setDraft] = React.useState<SettingsDraft | null>(null);
  const form = instance
    ? draft?.instanceId === instance.id
      ? draft
      : draftFromInstance(instance)
    : null;

  async function save() {
    if (!instance || !form) return;
    try {
      setBusy(true);
      await api.instances.update(id, {
        name: form.name.trim() || instance.name,
        description: form.description.trim(),
        maxPlayers: Number.parseInt(form.maxPlayers, 10) || instance.maxPlayers,
      });
      await mutate();
      setDraft(null);
      toast.success("GTA 5 settings saved");
    } catch (error) {
      toast.error("Failed to save settings", {
        description: error instanceof Error ? error.message : undefined,
      });
    } finally {
      setBusy(false);
    }
  }

  if (!instance || !form) return <Skeleton className="h-64 rounded-lg" />;

  return (
    <div className="flex flex-col gap-5">
      <PageHeader title="Settings" description="Basic FXServer metadata surfaced in server.cfg." icon={SettingsIcon} />
      <SectionCard title="General" icon={SettingsIcon}>
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="gta-settings-name">Name</Label>
            <Input
              id="gta-settings-name"
              value={form.name}
              onChange={(event) => setDraft({ ...form, name: event.target.value })}
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="gta-settings-description">Description</Label>
            <Textarea
              id="gta-settings-description"
              value={form.description}
              onChange={(event) => setDraft({ ...form, description: event.target.value })}
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="gta-settings-max-players">Max players</Label>
            <Input
              id="gta-settings-max-players"
              inputMode="numeric"
              value={form.maxPlayers}
              onChange={(event) => setDraft({ ...form, maxPlayers: event.target.value })}
            />
          </div>
          <Button onClick={save} disabled={busy} className="w-fit">
            <SaveIcon /> Save changes
          </Button>
        </div>
      </SectionCard>
    </div>
  );
}
