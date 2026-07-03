import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

function readSource(relativePath: string): string {
  return fs.readFileSync(path.join(process.cwd(), relativePath), "utf8");
}

describe("Vintage Story network panel placement", () => {
  it("does not render the network setup panel on the Vintage Story index page", () => {
    const source = readSource("src/app/(panel)/vintage-story/page.tsx");

    expect(source).not.toContain("VintageNetworkPanel");
  });

  it("renders the network setup panel on the Platform settings page", () => {
    const source = readSource("src/app/(panel)/settings/page.tsx");

    expect(source).toContain("VintageNetworkPanel");
    expect(source).toContain("<VintageNetworkPanel />");
  });
});
