"use client";

import { useParams } from "next/navigation";
import { FolderIcon } from "lucide-react";
import { PageHeader } from "@/components/panel/page-header";
import { FileManager } from "@/components/vintage-story/file-manager";

export default function FilesPage() {
  const { id } = useParams<{ id: string }>();
  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="Files"
        description="Browse, edit and manage this server's files. Drag & drop to upload."
        icon={FolderIcon}
      />
      <FileManager id={id} />
    </div>
  );
}
