import { describe, expect, it } from "vitest";
import { normalizeConsoleCommand } from "./commands";

describe("normalizeConsoleCommand", () => {
  it("preserves the leading slash required by Vintage Story stdin commands", () => {
    expect(normalizeConsoleCommand("/time set day")).toBe("/time set day");
  });

  it("trims whitespace around slash-prefixed commands", () => {
    expect(normalizeConsoleCommand("  /player P1nkOblivion role admin  ")).toBe(
      "/player P1nkOblivion role admin",
    );
  });

  it("preserves slashes inside command arguments", () => {
    expect(normalizeConsoleCommand("/announce Visit /spawn after restart")).toBe(
      "/announce Visit /spawn after restart",
    );
  });

  it("returns an empty string when the input only contains a slash prefix", () => {
    expect(normalizeConsoleCommand(" / ")).toBe("");
  });
});
