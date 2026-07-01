"use client";

import * as React from "react";
import useSWR from "swr";
import { toast } from "sonner";
import {
  FolderIcon,
  FileIcon,
  FileJsonIcon,
  FileCodeIcon,
  FileTextIcon,
  UploadIcon,
  FolderPlusIcon,
  FilePlusIcon,
  RefreshCwIcon,
  SearchIcon,
  DownloadIcon,
  PencilIcon,
  Trash2Icon,
  XIcon,
  SaveIcon,
  Undo2Icon,
  ChevronRightIcon,
  HomeIcon,
  MoreVerticalIcon,
  Loader2Icon,
} from "lucide-react";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import { formatBytes } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { useConfirm } from "@/components/panel/confirm-dialog";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { FileContent, FileNode } from "@/lib/types";

interface OpenFile {
  path: string;
  name: string;
  content: string;
  original: string;
  language: string;
  loading?: boolean;
  binary?: boolean;
}

function fileIcon(node: { name: string; type: "file" | "dir" }) {
  if (node.type === "dir") return FolderIcon;
  const ext = node.name.split(".").pop()?.toLowerCase();
  if (ext === "json" || ext === "json5") return FileJsonIcon;
  if (["cs", "js", "ts", "html", "css", "xml"].includes(ext ?? "")) return FileCodeIcon;
  if (["txt", "md", "log"].includes(ext ?? "")) return FileTextIcon;
  return FileIcon;
}

export function FileManager({ id }: { id: string }) {
  const [cwd, setCwd] = React.useState("");
  const [search, setSearch] = React.useState("");
  const [open, setOpen] = React.useState<OpenFile[]>([]);
  const [active, setActive] = React.useState<string | null>(null);
  const [dragging, setDragging] = React.useState(false);
  const [prompt, setPrompt] = React.useState<null | { kind: "file" | "folder" | "rename"; target?: string }>(null);
  const [promptValue, setPromptValue] = React.useState("");
  const [saving, setSaving] = React.useState(false);
  const { confirm, node: confirmNode } = useConfirm();
  const fileInput = React.useRef<HTMLInputElement>(null);

  const { data, isLoading, mutate } = useSWR(
    ["files", id, cwd],
    () => api.files.list(id, cwd),
    { keepPreviousData: true },
  );

  const entries = (data?.entries ?? []).filter((e) =>
    e.name.toLowerCase().includes(search.toLowerCase()),
  );
  const segments = cwd ? cwd.split("/") : [];

  async function openFile(node: FileNode) {
    if (open.some((f) => f.path === node.path)) {
      setActive(node.path);
      return;
    }
    const stub: OpenFile = {
      path: node.path,
      name: node.name,
      content: "",
      original: "",
      language: "text",
      loading: true,
    };
    setOpen((o) => [...o, stub]);
    setActive(node.path);
    try {
      const content: FileContent = await api.files.read(id, node.path);
      setOpen((o) =>
        o.map((f) =>
          f.path === node.path
            ? {
                ...f,
                content: content.content,
                original: content.content,
                language: content.language,
                binary: content.binary,
                loading: false,
              }
            : f,
        ),
      );
    } catch (e) {
      toast.error("Failed to open file", {
        description: e instanceof Error ? e.message : undefined,
      });
      setOpen((o) => o.filter((f) => f.path !== node.path));
    }
  }

  function closeTab(path: string) {
    const f = open.find((x) => x.path === path);
    if (f && f.content !== f.original) {
      confirm({
        title: `Discard changes to ${f.name}?`,
        description: "You have unsaved edits in this file.",
        confirmLabel: "Discard",
        destructive: true,
        onConfirm: () => reallyClose(path),
      });
      return;
    }
    reallyClose(path);
  }
  function reallyClose(path: string) {
    setOpen((o) => o.filter((f) => f.path !== path));
    setActive((a) => (a === path ? (open.find((f) => f.path !== path)?.path ?? null) : a));
  }

  const activeFile = open.find((f) => f.path === active) ?? null;

  async function save() {
    if (!activeFile) return;
    try {
      setSaving(true);
      await api.files.write(id, activeFile.path, activeFile.content);
      setOpen((o) =>
        o.map((f) => (f.path === activeFile.path ? { ...f, original: f.content } : f)),
      );
      toast.success(`Saved ${activeFile.name}`);
    } catch (e) {
      toast.error("Save failed", { description: e instanceof Error ? e.message : undefined });
    } finally {
      setSaving(false);
    }
  }

  async function doPrompt() {
    if (!prompt || !promptValue.trim()) return;
    const name = promptValue.trim();
    try {
      if (prompt.kind === "folder") {
        await api.files.op(id, { op: "mkdir", path: join(cwd, name) });
      } else if (prompt.kind === "file") {
        await api.files.op(id, { op: "createFile", path: join(cwd, name) });
      } else if (prompt.kind === "rename" && prompt.target) {
        const dir = prompt.target.split("/").slice(0, -1).join("/");
        await api.files.op(id, { op: "rename", from: prompt.target, to: join(dir, name) });
      }
      setPrompt(null);
      setPromptValue("");
      mutate();
      toast.success("Done");
    } catch (e) {
      toast.error("Operation failed", { description: e instanceof Error ? e.message : undefined });
    }
  }

  async function upload(files: FileList | File[]) {
    try {
      const res = await api.files.upload(id, cwd, files);
      toast.success(`Uploaded ${(res as { count: number }).count} file(s)`);
      mutate();
    } catch (e) {
      toast.error("Upload failed", { description: e instanceof Error ? e.message : undefined });
    }
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(280px,340px)_1fr]">
      {confirmNode}

      {/* Browser */}
      <div className="flex flex-col overflow-hidden rounded-xl border border-border bg-card">
        <div className="flex items-center gap-1 border-b border-border p-2">
          <Button variant="ghost" size="icon-sm" onClick={() => setPrompt({ kind: "file" })} aria-label="New file">
            <FilePlusIcon />
          </Button>
          <Button variant="ghost" size="icon-sm" onClick={() => setPrompt({ kind: "folder" })} aria-label="New folder">
            <FolderPlusIcon />
          </Button>
          <Button variant="ghost" size="icon-sm" onClick={() => fileInput.current?.click()} aria-label="Upload">
            <UploadIcon />
          </Button>
          <input
            ref={fileInput}
            type="file"
            multiple
            className="hidden"
            onChange={(e) => e.target.files && upload(e.target.files)}
          />
          <Button variant="ghost" size="icon-sm" onClick={() => mutate()} aria-label="Refresh" className="ml-auto">
            <RefreshCwIcon />
          </Button>
        </div>

        <div className="border-b border-border p-2">
          <div className="relative">
            <SearchIcon className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Filter…"
              className="h-8 pl-8"
            />
          </div>
        </div>

        {/* Breadcrumb */}
        <div className="flex flex-wrap items-center gap-0.5 border-b border-border px-2.5 py-2 text-xs">
          <button
            onClick={() => setCwd("")}
            className="flex items-center gap-1 rounded px-1 py-0.5 text-muted-foreground hover:text-foreground"
          >
            <HomeIcon className="size-3.5" />
          </button>
          {segments.map((seg, i) => (
            <span key={i} className="flex items-center">
              <ChevronRightIcon className="size-3 text-muted-foreground/50" />
              <button
                onClick={() => setCwd(segments.slice(0, i + 1).join("/"))}
                className="rounded px-1 py-0.5 text-muted-foreground hover:text-foreground"
              >
                {seg}
              </button>
            </span>
          ))}
        </div>

        {/* Listing with drag & drop */}
        <div
          className={cn(
            "relative max-h-[52vh] min-h-64 flex-1 overflow-y-auto p-1.5",
            dragging && "ring-2 ring-inset ring-primary",
          )}
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            if (e.dataTransfer.files.length) upload(e.dataTransfer.files);
          }}
        >
          {dragging && (
            <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center bg-primary/5 text-sm font-medium text-primary">
              Drop to upload
            </div>
          )}
          {isLoading && !data ? (
            <div className="space-y-1 p-1">
              {Array.from({ length: 8 }).map((_, i) => (
                <Skeleton key={i} className="h-8 w-full" />
              ))}
            </div>
          ) : entries.length === 0 ? (
            <p className="py-10 text-center text-xs text-muted-foreground">Empty folder</p>
          ) : (
            entries.map((entry) => {
              const Icon = fileIcon(entry);
              return (
                <div
                  key={entry.path}
                  className="group flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted/60"
                >
                  <button
                    className="flex min-w-0 flex-1 items-center gap-2 text-left"
                    onClick={() =>
                      entry.type === "dir" ? setCwd(entry.path) : openFile(entry)
                    }
                  >
                    <Icon
                      className={cn(
                        "size-4 shrink-0",
                        entry.type === "dir" ? "text-primary" : "text-muted-foreground",
                      )}
                    />
                    <span className="truncate">{entry.name}</span>
                  </button>
                  <span className="hidden shrink-0 font-mono text-[10px] text-muted-foreground/70 sm:inline">
                    {entry.mode}
                  </span>
                  {entry.type === "file" && (
                    <span className="shrink-0 text-[10px] tabular-nums text-muted-foreground">
                      {formatBytes(entry.size)}
                    </span>
                  )}
                  <FileRowMenu
                    id={id}
                    entry={entry}
                    onRename={() => {
                      setPromptValue(entry.name);
                      setPrompt({ kind: "rename", target: entry.path });
                    }}
                    onDelete={() =>
                      confirm({
                        title: `Delete ${entry.name}?`,
                        description:
                          entry.type === "dir"
                            ? "This deletes the folder and everything inside it."
                            : "This permanently deletes the file.",
                        confirmLabel: "Delete",
                        destructive: true,
                        onConfirm: async () => {
                          await api.files.op(id, { op: "delete", path: entry.path });
                          reallyClose(entry.path);
                          mutate();
                          toast.success(`Deleted ${entry.name}`);
                        },
                      })
                    }
                  />
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Editor */}
      <div className="flex min-h-[60vh] flex-col overflow-hidden rounded-xl border border-border bg-card">
        {open.length > 0 && (
          <div className="no-scrollbar flex items-center gap-1 overflow-x-auto border-b border-border p-1.5">
            {open.map((f) => {
              const dirty = f.content !== f.original;
              return (
                <div
                  key={f.path}
                  className={cn(
                    "group flex shrink-0 items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs",
                    active === f.path
                      ? "bg-muted text-foreground"
                      : "text-muted-foreground hover:bg-muted/50",
                  )}
                >
                  <button onClick={() => setActive(f.path)} className="flex items-center gap-1.5">
                    {dirty && <span className="size-1.5 rounded-full bg-primary" />}
                    {f.name}
                  </button>
                  <button onClick={() => closeTab(f.path)} className="rounded hover:text-foreground">
                    <XIcon className="size-3.5" />
                  </button>
                </div>
              );
            })}
          </div>
        )}

        {activeFile ? (
          <FileEditor
            file={activeFile}
            saving={saving}
            onChange={(content) =>
              setOpen((o) =>
                o.map((f) => (f.path === activeFile.path ? { ...f, content } : f)),
              )
            }
            onSave={save}
            onRevert={() =>
              setOpen((o) =>
                o.map((f) =>
                  f.path === activeFile.path ? { ...f, content: f.original } : f,
                ),
              )
            }
            downloadUrl={api.files.downloadUrl(id, activeFile.path)}
          />
        ) : (
          <div className="flex flex-1 flex-col items-center justify-center gap-2 p-10 text-center">
            <FileTextIcon className="size-8 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              Select a file to view and edit it here.
            </p>
          </div>
        )}
      </div>

      {/* New / rename prompt */}
      <Dialog open={prompt !== null} onOpenChange={(o) => !o && setPrompt(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>
              {prompt?.kind === "folder"
                ? "New folder"
                : prompt?.kind === "file"
                  ? "New file"
                  : "Rename"}
            </DialogTitle>
          </DialogHeader>
          <div className="grid gap-2">
            <Label htmlFor="fm-name">Name</Label>
            <Input
              id="fm-name"
              value={promptValue}
              onChange={(e) => setPromptValue(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && doPrompt()}
              autoFocus
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPrompt(null)}>
              Cancel
            </Button>
            <Button onClick={doPrompt} disabled={!promptValue.trim()}>
              {prompt?.kind === "rename" ? "Rename" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function FileRowMenu({
  id,
  entry,
  onRename,
  onDelete,
}: {
  id: string;
  entry: FileNode;
  onRename: () => void;
  onDelete: () => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            variant="ghost"
            size="icon-xs"
            className="opacity-0 group-hover:opacity-100 data-[popup-open]:opacity-100"
            aria-label="File actions"
          />
        }
      >
        <MoreVerticalIcon />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {entry.type === "file" && (
          <DropdownMenuItem
            render={<a href={api.files.downloadUrl(id, entry.path)} download />}
          >
            <DownloadIcon /> Download
          </DropdownMenuItem>
        )}
        <DropdownMenuItem onClick={onRename}>
          <PencilIcon /> Rename
        </DropdownMenuItem>
        <DropdownMenuItem variant="destructive" onClick={onDelete}>
          <Trash2Icon /> Delete
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function FileEditor({
  file,
  saving,
  onChange,
  onSave,
  onRevert,
  downloadUrl,
}: {
  file: OpenFile;
  saving: boolean;
  onChange: (content: string) => void;
  onSave: () => void;
  onRevert: () => void;
  downloadUrl: string;
}) {
  const gutter = React.useRef<HTMLDivElement>(null);
  const dirty = file.content !== file.original;
  const lineCount = file.content.split("\n").length;

  if (file.loading) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <Loader2Icon className="size-5 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (file.binary) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 p-10 text-center">
        <FileIcon className="size-8 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">
          This file is binary and cannot be edited as text.
        </p>
        <Button variant="outline" size="sm" render={<a href={downloadUrl} download />}>
          <DownloadIcon /> Download file
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col">
      <div className="flex items-center gap-2 border-b border-border px-3 py-2">
        <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] uppercase text-muted-foreground">
          {file.language}
        </span>
        <span className="truncate font-mono text-xs text-muted-foreground">{file.path}</span>
        {dirty && <span className="text-[10px] font-medium text-primary">● unsaved</span>}
        <div className="ml-auto flex items-center gap-1.5">
          <Button variant="ghost" size="sm" onClick={onRevert} disabled={!dirty}>
            <Undo2Icon /> Revert
          </Button>
          <Button variant="outline" size="sm" render={<a href={downloadUrl} download />}>
            <DownloadIcon /> Download
          </Button>
          <Button size="sm" onClick={onSave} disabled={!dirty || saving}>
            {saving ? <Loader2Icon className="animate-spin" /> : <SaveIcon />} Save
          </Button>
        </div>
      </div>
      <div className="flex flex-1 overflow-hidden bg-[oklch(0.15_0.006_300)]">
        <div
          ref={gutter}
          className="select-none overflow-hidden py-3 pl-3 pr-2 text-right font-mono text-xs leading-[1.6] text-muted-foreground/40"
          aria-hidden
        >
          {Array.from({ length: lineCount }).map((_, i) => (
            <div key={i}>{i + 1}</div>
          ))}
        </div>
        <textarea
          value={file.content}
          spellCheck={false}
          onChange={(e) => onChange(e.target.value)}
          onScroll={(e) => {
            if (gutter.current) gutter.current.scrollTop = e.currentTarget.scrollTop;
          }}
          onKeyDown={(e) => {
            if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") {
              e.preventDefault();
              onSave();
            }
          }}
          className="min-h-[50vh] flex-1 resize-none bg-transparent py-3 pr-3 font-mono text-xs leading-[1.6] text-foreground outline-none"
        />
      </div>
    </div>
  );
}

function join(dir: string, name: string): string {
  return dir ? `${dir}/${name}` : name;
}
