import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import {
  CLOTHING_RENDER_MANIFEST_PATH,
  CLOTHING_RENDER_ROOT,
} from "@/lib/server/gta/clothing-assets";
import { gameRoot } from "@/lib/server/config";

const ACTIVE_RENDER_MAX_AGE_MS = 12 * 60 * 60 * 1000;
const QUEUED_RENDER_MAX_AGE_MS = 5 * 60 * 1000;

export async function startClothingCatalogRender(options?: { force?: boolean }) {
  await fs.mkdir(CLOTHING_RENDER_ROOT, { recursive: true });
  const previous = await readManifest();
  const now = Date.now();
  const startedAt = Number(previous.startedAt) || 0;
  const age = startedAt ? now - startedAt : Number.POSITIVE_INFINITY;

  if (
    (previous.state === "running" && age < ACTIVE_RENDER_MAX_AGE_MS) ||
    (previous.state === "queued" && age < QUEUED_RENDER_MAX_AGE_MS)
  ) {
    return { started: false, state: previous.state };
  }

  const queued = {
    version: 1,
    state: "queued",
    startedAt: now,
    completedAt: null,
    currentAssetId: null,
    error: null,
    totals: previous.totals ?? {
      assets: 0,
      ready: 0,
      failed: 0,
      variants: 0,
      renderedVariants: 0,
    },
    assets: previous.assets ?? {},
  };
  await writeManifest(queued);

  const script = path.join(
    gameRoot("gta"),
    "los-santos",
    "scripts",
    "render-clothing-catalog.sh",
  );
  const child = spawn("bash", [script, ...(options?.force ? ["--force"] : [])], {
    detached: true,
    stdio: "ignore",
    env: process.env,
  });
  child.once("error", (error) => {
    void writeManifest({
      ...queued,
      state: "failed",
      completedAt: Date.now(),
      error: `Unable to start clothing renderer: ${error.message}`,
    });
  });
  child.unref();
  return { started: true, state: "queued" as const };
}

async function readManifest(): Promise<Record<string, unknown>> {
  try {
    const parsed = JSON.parse(await fs.readFile(CLOTHING_RENDER_MANIFEST_PATH, "utf8"));
    return parsed && typeof parsed === "object" ? parsed as Record<string, unknown> : {};
  } catch {
    return {};
  }
}

async function writeManifest(manifest: Record<string, unknown>): Promise<void> {
  const temporaryPath = `${CLOTHING_RENDER_MANIFEST_PATH}.tmp`;
  await fs.writeFile(temporaryPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  await fs.rename(temporaryPath, CLOTHING_RENDER_MANIFEST_PATH);
}
