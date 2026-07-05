import { describe, expect, it } from "vitest";
import { displayFilePath } from "./file-manager-path";

describe("displayFilePath", () => {
  it("shows the virtual root for the current game", () => {
    expect(displayFilePath("/GTA", "")).toBe("/GTA");
    expect(displayFilePath("/GTA", "resources/server.cfg")).toBe(
      "/GTA/resources/server.cfg",
    );
  });

  it("normalizes slashes around the root and relative path", () => {
    expect(displayFilePath("GTA/", "/resources/server.cfg")).toBe(
      "/GTA/resources/server.cfg",
    );
  });
});
