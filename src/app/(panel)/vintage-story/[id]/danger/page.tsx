"use client";

import { useParams, useRouter } from "next/navigation";
import { useSWRConfig } from "swr";
import { toast } from "sonner";
import { TriangleAlertIcon, Trash2Icon, PackageXIcon, GlobeIcon } from "lucide-react";
import { api } from "@/lib/api";
import { useInstance } from "@/hooks/use-instances";
import { PageHeader } from "@/components/panel/page-header";
import { useConfirm } from "@/components/panel/confirm-dialog";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

export default function DangerZonePage() {
  const { id } = useParams<{ id: string }>();
  const { data: instance } = useInstance(id);
  const { confirm, node } = useConfirm();
  const router = useRouter();
  const { mutate } = useSWRConfig();

  async function deleteServer() {
    await api.instances.remove(id);
    await mutate((key) => Array.isArray(key) && key[0] === "instances");
    toast.success(`Server “${instance?.name}” deleted`);
    router.push("/vintage-story");
  }

  async function removeAllMods() {
    const { mods } = await api.mods.list(id);
    await Promise.all(mods.map((m) => api.mods.op(id, { op: "remove", modId: m.id })));
    toast.success("All mods removed");
  }

  if (!instance) {
    return <Skeleton className="h-64 w-full rounded-xl" />;
  }

  return (
    <div className="flex flex-col gap-5">
      {node}
      <PageHeader
        title="Danger Zone"
        description="Irreversible and destructive actions. Proceed with caution."
        icon={TriangleAlertIcon}
      />

      <div className="overflow-hidden rounded-xl border border-destructive/30">
        <DangerRow
          icon={PackageXIcon}
          title="Remove all mods"
          description="Uninstall every mod from this server. Takes effect after the next restart."
          buttonLabel="Remove all mods"
          onClick={() =>
            confirm({
              title: "Remove all mods?",
              description: "Every installed mod will be uninstalled from this server.",
              confirmLabel: "Remove all mods",
              destructive: true,
              onConfirm: removeAllMods,
            })
          }
        />
        <DangerRow
          icon={GlobeIcon}
          title="Delete world"
          description="Permanently delete the world save. Export or back up first."
          buttonLabel="Delete world"
          onClick={() =>
            confirm({
              title: "Delete world?",
              description:
                "This permanently deletes the world save for this server. This cannot be undone.",
              confirmLabel: "Delete world",
              destructive: true,
              confirmPhrase: instance.worldName,
              onConfirm: async () => {
                toast.info("Delete world — wired to the world deletion workflow.");
              },
            })
          }
        />
        <DangerRow
          icon={Trash2Icon}
          title="Delete this server"
          description="Permanently delete this instance, its configuration, mods and backups. The data path is removed."
          buttonLabel="Delete server"
          emphasize
          onClick={() =>
            confirm({
              title: `Delete “${instance.name}”?`,
              description:
                "This permanently deletes the entire server instance and all of its data. This action cannot be undone.",
              confirmLabel: "Delete server permanently",
              destructive: true,
              confirmPhrase: instance.name,
              onConfirm: deleteServer,
            })
          }
        />
      </div>
    </div>
  );
}

function DangerRow({
  icon: Icon,
  title,
  description,
  buttonLabel,
  onClick,
  emphasize,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description: string;
  buttonLabel: string;
  onClick: () => void;
  emphasize?: boolean;
}) {
  return (
    <div
      className={`flex flex-col gap-3 border-b border-destructive/20 p-4 last:border-b-0 sm:flex-row sm:items-center sm:justify-between ${
        emphasize ? "bg-destructive/5" : ""
      }`}
    >
      <div className="flex items-start gap-3">
        <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-destructive/10 text-destructive">
          <Icon className="size-4.5" />
        </div>
        <div>
          <p className="text-sm font-semibold text-foreground">{title}</p>
          <p className="mt-0.5 max-w-xl text-xs text-muted-foreground">{description}</p>
        </div>
      </div>
      <Button variant="destructive" onClick={onClick} className="shrink-0">
        <Icon /> {buttonLabel}
      </Button>
    </div>
  );
}
