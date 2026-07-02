import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";

const SNAPSHOT_ENTRIES = ["Saves", "ModConfig", "Mods", "Managed-Mods", "serverconfig.json"] as const;

export interface ArchiveResult {
  sizeBytes: number;
  fileCount: number;
  checksumSha256: string;
}

export async function createGameBackupArchive(input: {
  dataRoot: string;
  archivePath: string;
}): Promise<ArchiveResult> {
  await fs.mkdir(path.dirname(input.archivePath), { recursive: true });
  const entries = await existingEntries(input.dataRoot);
  if (entries.length === 0) throw new Error(`No backup entries found in ${input.dataRoot}`);
  const fileCount = await countFiles(input.dataRoot, entries);
  const sizeBytes = await totalSize(input.dataRoot, entries);
  await run("tar", ["--zstd", "-cf", input.archivePath, "-C", input.dataRoot, ...entries]);
  const checksumSha256 = await sha256File(input.archivePath);
  return { sizeBytes, fileCount, checksumSha256 };
}

export async function extractGameBackupArchive(input: {
  archivePath: string;
  targetRoot: string;
  expectedSha256: string;
}): Promise<void> {
  const actual = await sha256File(input.archivePath);
  if (actual !== input.expectedSha256) {
    throw new Error("Backup archive checksum verification failed.");
  }
  await fs.mkdir(input.targetRoot, { recursive: true });
  await run("tar", ["--zstd", "-xf", input.archivePath, "-C", input.targetRoot]);
}

async function existingEntries(root: string): Promise<string[]> {
  const entries: string[] = [];
  for (const entry of SNAPSHOT_ENTRIES) {
    try {
      await fs.stat(path.join(root, entry));
      entries.push(entry);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
  }
  return entries;
}

async function countFiles(root: string, entries: string[]): Promise<number> {
  let count = 0;
  for (const entry of entries) count += await countPath(path.join(root, entry));
  return count;
}

async function countPath(target: string): Promise<number> {
  const stat = await fs.stat(target);
  if (stat.isFile()) return 1;
  if (!stat.isDirectory()) return 0;
  const children = await fs.readdir(target);
  let count = 0;
  for (const child of children) count += await countPath(path.join(target, child));
  return count;
}

async function totalSize(root: string, entries: string[]): Promise<number> {
  let size = 0;
  for (const entry of entries) size += await sizePath(path.join(root, entry));
  return size;
}

async function sizePath(target: string): Promise<number> {
  const stat = await fs.stat(target);
  if (stat.isFile()) return stat.size;
  if (!stat.isDirectory()) return 0;
  const children = await fs.readdir(target);
  let size = 0;
  for (const child of children) size += await sizePath(path.join(target, child));
  return size;
}

async function sha256File(file: string): Promise<string> {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(file)) hash.update(chunk);
  return hash.digest("hex");
}

async function run(command: string, args: string[]): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const child = spawn(command, args, { stdio: ["ignore", "ignore", "pipe"] });
    let stderr = "";
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${command} exited with code ${code}: ${stderr}`));
    });
  });
}
