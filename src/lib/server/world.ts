import fs from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import type { Instance, WorldInfo } from "@/lib/types";
import { vsPaths } from "./config";

function worldJsonPath(serverId: string): string {
  return path.join(vsPaths(serverId).saves, "world.json");
}

export async function getWorld(inst: Instance): Promise<WorldInfo> {
  const file = worldJsonPath(inst.id);
  if (existsSync(file)) {
    try {
      return JSON.parse(await fs.readFile(file, "utf8")) as WorldInfo;
    } catch {
      /* fall through to defaults */
    }
  }
  return {
    name: inst.worldName ?? "New World",
    seed: inst.seed ?? "",
    playStyle: "Survive and Build",
    worldType: "Standard",
    sizeBytes: 0,
    createdAt: inst.createdAt,
    lastPlayed: inst.updatedAt,
    settings: {},
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
