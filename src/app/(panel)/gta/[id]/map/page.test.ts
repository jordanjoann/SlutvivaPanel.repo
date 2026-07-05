import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const pagePath = path.join(
  process.cwd(),
  "src/app/(panel)/gta/[id]/map/page.tsx",
);
const layoutPath = path.join(
  process.cwd(),
  "src/app/(panel)/gta/[id]/layout.tsx",
);

describe("GTA map page source", () => {
  it("defines a map page with live telemetry affordances", () => {
    const source = fs.readFileSync(pagePath, "utf8");

    expect(source).toContain("api.gta.players.list");
    expect(source).toContain("mappedGtaPlayers");
    expect(source).toContain("projectGtaPosition");
    expect(source).toContain("Health");
    expect(source).toContain("Armour");
    expect(source).toContain("Vehicle");
  });

  it("adds Map between Players and Files in the GTA tabs", () => {
    const source = fs.readFileSync(layoutPath, "utf8");
    const playersIndex = source.indexOf('label: "Players"');
    const mapIndex = source.indexOf('label: "Map"');
    const filesIndex = source.indexOf('label: "Files"');

    expect(playersIndex).toBeGreaterThan(-1);
    expect(mapIndex).toBeGreaterThan(playersIndex);
    expect(filesIndex).toBeGreaterThan(mapIndex);
  });
});
