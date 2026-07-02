import fs from "node:fs/promises";
import path from "node:path";
import { instanceDataPath } from "./config";
import type { FileContent, FileNode } from "@/lib/types";

const MAX_TEXT_BYTES = 2 * 1024 * 1024;
const EXCLUDED_SEGMENTS = new Set(["assets", "notes", "readme.md", "server.yml"]);

/** Root of the file manager for an instance (the Vintage Story data path). */
function baseDir(serverId: string): string {
  return instanceDataPath(serverId);
}

function normalizeRel(rel: string): string {
  const parts = rel
    .replace(/\\/g, "/")
    .replace(/^\/+/, "")
    .split("/")
    .filter(Boolean);
  if (parts[0]?.toLowerCase() === "vintage") parts.shift();
  return parts.join("/");
}

function isExcludedPath(rel: string): boolean {
  return normalizeRel(rel)
    .split("/")
    .filter(Boolean)
    .some((part) => EXCLUDED_SEGMENTS.has(part.toLowerCase()));
}

/** Resolve a client-supplied relative path safely inside the Vintage data dir. */
function resolveSafe(serverId: string, rel: string): string {
  const base = baseDir(serverId);
  const clean = normalizeRel(rel);
  if (isExcludedPath(clean)) {
    throw new Error("Path is hidden from the file manager");
  }
  const abs = path.resolve(base, clean);
  const rl = path.relative(base, abs);
  if (rl.startsWith("..") || path.isAbsolute(rl)) {
    throw new Error("Path escapes Vintage Story data directory");
  }
  return abs;
}

function toRel(serverId: string, abs: string): string {
  return path.relative(baseDir(serverId), abs).split(path.sep).join("/");
}

function modeString(mode: number): string {
  const map = ["---", "--x", "-w-", "-wx", "r--", "r-x", "rw-", "rwx"];
  return (
    map[(mode >> 6) & 7] + map[(mode >> 3) & 7] + map[mode & 7]
  );
}

export const LANGUAGE_BY_EXT: Record<string, string> = {
  json: "json",
  json5: "json",
  yaml: "yaml",
  yml: "yaml",
  xml: "xml",
  txt: "text",
  log: "log",
  md: "markdown",
  markdown: "markdown",
  cs: "csharp",
  js: "javascript",
  mjs: "javascript",
  cjs: "javascript",
  ts: "typescript",
  html: "html",
  htm: "html",
  css: "css",
  sh: "bash",
  env: "bash",
  ini: "ini",
  conf: "ini",
  toml: "toml",
};

export function languageFor(name: string): string {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  return LANGUAGE_BY_EXT[ext] ?? "text";
}

export async function listDir(serverId: string, rel = ""): Promise<FileNode[]> {
  const abs = resolveSafe(serverId, rel);
  const entries = await fs.readdir(abs, { withFileTypes: true });
  const nodes: FileNode[] = [];
  for (const e of entries) {
    if (EXCLUDED_SEGMENTS.has(e.name.toLowerCase())) continue;
    const childAbs = path.join(abs, e.name);
    try {
      const st = await fs.stat(childAbs);
      nodes.push({
        name: e.name,
        path: toRel(serverId, childAbs),
        type: e.isDirectory() ? "dir" : "file",
        size: st.size,
        modified: st.mtimeMs,
        mode: modeString(st.mode),
      });
    } catch {
      /* skip unreadable entries */
    }
  }
  // dirs first, then alphabetical
  nodes.sort((a, b) =>
    a.type === b.type ? a.name.localeCompare(b.name) : a.type === "dir" ? -1 : 1,
  );
  return nodes;
}

export async function readFile(
  serverId: string,
  rel: string,
): Promise<FileContent> {
  const abs = resolveSafe(serverId, rel);
  const st = await fs.stat(abs);
  const base = {
    path: toRel(serverId, abs),
    language: languageFor(rel),
    size: st.size,
    modified: st.mtimeMs,
  };
  if (st.size > MAX_TEXT_BYTES) {
    return { ...base, content: "", truncated: true };
  }
  const buf = await fs.readFile(abs);
  if (buf.includes(0)) {
    return { ...base, content: "", binary: true };
  }
  return { ...base, content: buf.toString("utf8") };
}

export async function writeFile(
  serverId: string,
  rel: string,
  content: string,
): Promise<FileContent> {
  const abs = resolveSafe(serverId, rel);
  await fs.mkdir(path.dirname(abs), { recursive: true });
  await fs.writeFile(abs, content, "utf8");
  return readFile(serverId, rel);
}

export async function writeBuffer(
  serverId: string,
  rel: string,
  data: Buffer,
): Promise<void> {
  const abs = resolveSafe(serverId, rel);
  await fs.mkdir(path.dirname(abs), { recursive: true });
  await fs.writeFile(abs, data);
}

export async function mkdirp(serverId: string, rel: string): Promise<void> {
  const abs = resolveSafe(serverId, rel);
  await fs.mkdir(abs, { recursive: true });
}

export async function createFile(serverId: string, rel: string): Promise<void> {
  const abs = resolveSafe(serverId, rel);
  await fs.mkdir(path.dirname(abs), { recursive: true });
  await fs.writeFile(abs, "", { flag: "wx" }).catch((e) => {
    if ((e as NodeJS.ErrnoException).code !== "EEXIST") throw e;
  });
}

export async function rename(
  serverId: string,
  from: string,
  to: string,
): Promise<void> {
  const absFrom = resolveSafe(serverId, from);
  const absTo = resolveSafe(serverId, to);
  await fs.mkdir(path.dirname(absTo), { recursive: true });
  await fs.rename(absFrom, absTo);
}

export async function remove(serverId: string, rel: string): Promise<void> {
  const abs = resolveSafe(serverId, rel);
  if (abs === baseDir(serverId)) throw new Error("Refusing to delete root");
  await fs.rm(abs, { recursive: true, force: true });
}

export async function statFile(serverId: string, rel: string) {
  const abs = resolveSafe(serverId, rel);
  return { abs, stat: await fs.stat(abs) };
}
