import fs from "node:fs/promises";
import path from "node:path";
import { instanceDataPath } from "./config";
import { getInstance } from "./store";
import type { FileContent, FileNode } from "@/lib/types";

const MAX_TEXT_BYTES = 2 * 1024 * 1024;
const EXCLUDED_SEGMENTS = new Set(["assets", "notes", "readme.md", "server.yml"]);

/** Root of the file manager for an instance (the Vintage Story data path). */
async function baseDir(serverId: string): Promise<string> {
  const instance = await getInstance(serverId);
  return instance?.dataPath ?? instanceDataPath(serverId);
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
async function resolveSafe(serverId: string, rel: string): Promise<{ abs: string; base: string }> {
  const base = await baseDir(serverId);
  const clean = normalizeRel(rel);
  if (isExcludedPath(clean)) {
    throw new Error("Path is hidden from the file manager");
  }
  const abs = path.resolve(base, clean);
  const rl = path.relative(base, abs);
  if (rl.startsWith("..") || path.isAbsolute(rl)) {
    throw new Error("Path escapes Vintage Story data directory");
  }
  return { abs, base };
}

function toRel(base: string, abs: string): string {
  return path.relative(base, abs).split(path.sep).join("/");
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
  const { abs, base } = await resolveSafe(serverId, rel);
  const entries = await fs.readdir(abs, { withFileTypes: true });
  const nodes: FileNode[] = [];
  for (const e of entries) {
    if (EXCLUDED_SEGMENTS.has(e.name.toLowerCase())) continue;
    const childAbs = path.join(abs, e.name);
    try {
      const st = await fs.stat(childAbs);
      nodes.push({
        name: e.name,
        path: toRel(base, childAbs),
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
  const { abs, base } = await resolveSafe(serverId, rel);
  const st = await fs.stat(abs);
  const metadata = {
    path: toRel(base, abs),
    language: languageFor(rel),
    size: st.size,
    modified: st.mtimeMs,
  };
  if (st.size > MAX_TEXT_BYTES) {
    return { ...metadata, content: "", truncated: true };
  }
  const buf = await fs.readFile(abs);
  if (buf.includes(0)) {
    return { ...metadata, content: "", binary: true };
  }
  return { ...metadata, content: buf.toString("utf8") };
}

export async function writeFile(
  serverId: string,
  rel: string,
  content: string,
): Promise<FileContent> {
  const { abs } = await resolveSafe(serverId, rel);
  await fs.mkdir(path.dirname(abs), { recursive: true });
  await fs.writeFile(abs, content, "utf8");
  return readFile(serverId, rel);
}

export async function writeBuffer(
  serverId: string,
  rel: string,
  data: Buffer,
): Promise<void> {
  const { abs } = await resolveSafe(serverId, rel);
  await fs.mkdir(path.dirname(abs), { recursive: true });
  await fs.writeFile(abs, data);
}

export async function mkdirp(serverId: string, rel: string): Promise<void> {
  const { abs } = await resolveSafe(serverId, rel);
  await fs.mkdir(abs, { recursive: true });
}

export async function createFile(serverId: string, rel: string): Promise<void> {
  const { abs } = await resolveSafe(serverId, rel);
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
  const { abs: absFrom } = await resolveSafe(serverId, from);
  const { abs: absTo } = await resolveSafe(serverId, to);
  await fs.mkdir(path.dirname(absTo), { recursive: true });
  await fs.rename(absFrom, absTo);
}

export async function remove(serverId: string, rel: string): Promise<void> {
  const { abs, base } = await resolveSafe(serverId, rel);
  if (abs === base) throw new Error("Refusing to delete root");
  await fs.rm(abs, { recursive: true, force: true });
}

export async function statFile(serverId: string, rel: string) {
  const { abs } = await resolveSafe(serverId, rel);
  return { abs, stat: await fs.stat(abs) };
}
