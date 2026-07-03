import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  assertNimbusInstall,
  assertStratumInstall,
  selectReleaseAsset,
  writeArtifactMarker,
} from "./artifacts";

let dir = "";

beforeEach(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), "slutvival-artifacts-"));
});

afterEach(async () => {
  await fs.rm(dir, { recursive: true, force: true });
});

describe("vintage network artifacts", () => {
  it("selects an exact release asset by name", () => {
    const asset = selectReleaseAsset(
      {
        tag_name: "v1.22.3-stratum.13",
        assets: [
          { name: "stratum-1.22.3-stratum.13-win-x64.zip", browser_download_url: "win" },
          { name: "stratum-1.22.3-stratum.13-linux-x64.zip", browser_download_url: "linux" },
        ],
      },
      "stratum-1.22.3-stratum.13-linux-x64.zip",
    );

    expect(asset.browser_download_url).toBe("linux");
  });

  it("throws when a release asset is absent", () => {
    expect(() =>
      selectReleaseAsset({ tag_name: "0.1.0-dev", assets: [] }, "Nimbus-v0.1.0.zip"),
    ).toThrow("Release 0.1.0-dev did not contain asset Nimbus-v0.1.0.zip");
  });

  it("validates the current Stratum Linux zip layout", async () => {
    await fs.writeFile(path.join(dir, "StratumServer"), "");
    await assertStratumInstall(dir);
  });

  it("validates the current Nimbus zip layout", async () => {
    await fs.mkdir(path.join(dir, "release_full", "Nimbus"), { recursive: true });
    await fs.mkdir(path.join(dir, "release_full", "Nimbus.ServerMod"), { recursive: true });
    await fs.writeFile(path.join(dir, "release_full", "Nimbus", "Nimbus.Proxy.dll"), "");
    await fs.writeFile(path.join(dir, "release_full", "Nimbus.ServerMod", "modinfo.json"), "{}");
    await assertNimbusInstall(dir);
  });

  it("writes an install marker without leaking secrets", async () => {
    await writeArtifactMarker(dir, {
      name: "stratum",
      tag: "v1.22.3-stratum.13",
      asset: "stratum-1.22.3-stratum.13-linux-x64.zip",
    });
    const marker = JSON.parse(await fs.readFile(path.join(dir, ".slutvival-artifact.json"), "utf8"));
    expect(marker).toMatchObject({
      name: "stratum",
      tag: "v1.22.3-stratum.13",
      asset: "stratum-1.22.3-stratum.13-linux-x64.zip",
    });
  });
});
