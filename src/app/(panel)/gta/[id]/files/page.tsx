"use client";

import { useParams } from "next/navigation";
import { FolderIcon } from "lucide-react";
import { FileManager } from "@/components/vintage-story/file-manager";
import { PageHeader } from "@/components/panel/page-header";

export default function GtaFilesPage() {
  const { id } = useParams<{ id: string }>();
  return (
    <div className="flex flex-col gap-5">
      <PageHeader title="Files" description="Browse and edit FXServer data files." icon={FolderIcon} />
      <FileManager id={id} rootLabel="/GTA" />
    </div>
  );
}
