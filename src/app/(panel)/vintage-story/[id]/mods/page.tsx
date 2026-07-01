"use client";

import { useParams } from "next/navigation";
import { PackageIcon } from "lucide-react";
import { PageHeader } from "@/components/panel/page-header";
import { ModsManager } from "@/components/vintage-story/mods-manager";

export default function ModsPage() {
  const { id } = useParams<{ id: string }>();
  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="Mods"
        description="Manage installed mods or browse the repository. Changes apply after the next restart."
        icon={PackageIcon}
      />
      <ModsManager id={id} />
    </div>
  );
}
