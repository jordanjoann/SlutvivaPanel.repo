import fs from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import type { Instance, WorldInfo } from "@/lib/types";
import { vsPaths } from "./config";

type JsonObject = Record<string, unknown>;

function worldJsonPath(serverId: string): string {
  return path.join(vsPaths(serverId).saves, "world.json");
}

export async function getWorld(inst: Instance): Promise<WorldInfo> {
  const override = await readWorldOverride(inst.id);
  const serverConfig = await readServerConfig(inst.id);
  const worldConfig = objectValue(serverConfig.WorldConfig);
  const worldConfiguration = objectValue(worldConfig.WorldConfiguration);
  const saveFile = stringFrom(worldConfig.SaveFileLocation, "");
  const saveStats = await statSaveFile(inst.id, saveFile);

  return {
    name: stringFrom(worldConfig.WorldName, override?.name ?? inst.worldName ?? "New World"),
    seed: stringFrom(worldConfig.Seed, override?.seed ?? inst.seed ?? ""),
    playStyle: stringFrom(worldConfig.PlayStyle, override?.playStyle ?? "surviveandbuild"),
    worldType: stringFrom(worldConfig.WorldType, override?.worldType ?? "standard"),
    sizeBytes: saveStats?.size ?? override?.sizeBytes ?? 0,
    createdAt: override?.createdAt ?? inst.createdAt,
    lastPlayed: saveStats?.mtimeMs ?? override?.lastPlayed ?? inst.updatedAt,
    settings: {
      ...(override?.settings ?? {}),
      ...stringRecord(worldConfiguration),
    },
  };
}

export async function updateWorld(
  inst: Instance,
  patch: Partial<WorldInfo>,
): Promise<WorldInfo> {
  const current = await getWorld(inst);
  const next: WorldInfo = {
    ...current,
    ...patch,
    settings: { ...current.settings, ...patch.settings },
  };
  const file = worldJsonPath(inst.id);
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, JSON.stringify(next, null, 2), "utf8");
  return next;
}

async function readWorldOverride(serverId: string): Promise<WorldInfo | null> {
  const file = worldJsonPath(serverId);
  if (!existsSync(file)) return null;
  try {
    const parsed = JSON.parse(await fs.readFile(file, "utf8"));
    return isObject(parsed) ? (parsed as unknown as WorldInfo) : null;
  } catch {
    return null;
  }
}

async function readServerConfig(serverId: string): Promise<JsonObject> {
  const file = vsPaths(serverId).serverConfig;
  if (!existsSync(file)) return {};
  try {
    const parsed = JSON.parse(await fs.readFile(file, "utf8"));
    return isObject(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

async function statSaveFile(serverId: string, saveFileLocation: string) {
  if (!saveFileLocation.startsWith("/data/Saves/")) return null;
  const file = path.join(vsPaths(serverId).saves, path.basename(saveFileLocation));
  try {
    return await fs.stat(file);
  } catch {
    return null;
  }
}

function stringRecord(source: JsonObject): Record<string, string> {
  return Object.fromEntries(
    Object.entries(source).map(([key, value]) => [key, stringFrom(value, "")]),
  );
}

function stringFrom(value: unknown, fallback: string): string {
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return fallback;
}

function objectValue(value: unknown): JsonObject {
  return isObject(value) ? value : {};
}

function isObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
