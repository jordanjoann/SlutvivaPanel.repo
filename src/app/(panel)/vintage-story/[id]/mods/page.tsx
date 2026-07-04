"use client";

import { useParams } from "next/navigation";
import { PackageIcon } from "lucide-react";
import { useSessionAccount } from "@/hooks/use-session-account";
import { PageHeader } from "@/components/panel/page-header";
import { ModsManager } from "@/components/vintage-story/mods-manager";

export default function ModsPage() {
  const { id } = useParams<{ id: string }>();
  const { role } = useSessionAccount();
  const hasFullAccess = role === "owner";
  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="Mods"
        description={
          hasFullAccess
            ? "Manage installed mods or browse the Mod Database. Changes apply after the next restart."
            : "View installed mods and apply available updates. Changes apply after the next restart."
        }
        icon={PackageIcon}
      />
      <ModsManager id={id} limited={!hasFullAccess} />
    </div>
  );
}
