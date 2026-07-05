import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import type { Instance } from "@/lib/types";

const execFileAsync = promisify(execFile);
const CFX_SERVER_DATA_REPO = "https://github.com/citizenfx/cfx-server-data.git";
const PLACEHOLDER_LICENSE = "replace-with-cfx-license-key";

export async function ensureGtaServerData(
  inst: Instance,
  options: { cloneBaseResources?: boolean } = {},
): Promise<void> {
  await fs.mkdir(inst.dataPath, { recursive: true });
  await fs.mkdir(path.join(inst.dataPath, "resources"), { recursive: true });
  await fs.mkdir(path.join(inst.dataPath, "cache"), { recursive: true });
  await fs.mkdir(path.join(inst.dataPath, "txData"), { recursive: true });

  await fs.writeFile(path.join(inst.dataPath, "server.cfg"), gtaServerConfig(inst), "utf8");
  await writeIfMissing(path.join(inst.dataPath, "server.secret.cfg"), gtaSecretTemplate());

  if (options.cloneBaseResources !== false) {
    await ensureBaseResources(inst.dataPath);
  }
}

export async function hasUsableGtaSecret(inst: Instance): Promise<boolean> {
  try {
    const raw = await fs.readFile(path.join(inst.dataPath, "server.secret.cfg"), "utf8");
    const match = /^\s*sv_licenseKey\s+"?([^"\s]+)"?/mu.exec(raw);
    return Boolean(match?.[1] && match[1] !== PLACEHOLDER_LICENSE);
  } catch {
    return false;
  }
}

export function gtaServerConfig(inst: Instance): string {
  const description = inst.description?.trim() || "Slutvival FiveM server";
  return [
    `endpoint_add_tcp "0.0.0.0:${inst.port}"`,
    `endpoint_add_udp "0.0.0.0:${inst.port}"`,
    "",
    "ensure mapmanager",
    "ensure chat",
    "ensure spawnmanager",
    "ensure sessionmanager",
    "ensure basic-gamemode",
    "ensure hardcap",
    "ensure rconlog",
    "",
    "sv_scriptHookAllowed 0",
    'sets tags "slutvival,default"',
    'sets locale "en-US"',
    `sv_hostname "${escapeCfg(inst.name)}"`,
    `sets sv_projectName "${escapeCfg(inst.name)}"`,
    `sets sv_projectDesc "${escapeCfg(description)}"`,
    "set onesync on",
    `sv_maxclients ${inst.maxPlayers}`,
    "exec server.secret.cfg",
    "",
  ].join("\n");
}

export function gtaSecretTemplate(): string {
  return [
    "# Local FiveM secrets. This file must stay out of Git.",
    `sv_licenseKey "${PLACEHOLDER_LICENSE}"`,
    'set steam_webApiKey ""',
    "",
  ].join("\n");
}

async function writeIfMissing(file: string, content: string): Promise<void> {
  if (existsSync(file)) return;
  await fs.writeFile(file, content, "utf8");
}

async function ensureBaseResources(dataPath: string): Promise<void> {
  const marker = path.join(dataPath, "resources", "[managers]", "mapmanager");
  if (existsSync(marker)) return;
  const tmp = path.join(dataPath, `.cfx-server-data-${Date.now()}`);
  await fs.rm(tmp, { recursive: true, force: true });
  try {
    await execFileAsync("git", ["clone", "--depth=1", CFX_SERVER_DATA_REPO, tmp]);
    await fs.cp(path.join(tmp, "resources"), path.join(dataPath, "resources"), {
      recursive: true,
      force: true,
    });
  } finally {
    await fs.rm(tmp, { recursive: true, force: true });
  }
}

function escapeCfg(value: string): string {
  return value.replace(/["\\]/g, "");
}
