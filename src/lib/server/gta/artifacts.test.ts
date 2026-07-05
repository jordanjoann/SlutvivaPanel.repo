import { describe, expect, it } from "vitest";
import { parseRecommendedFxServerArtifact } from "./artifacts";

describe("FXServer artifacts", () => {
  it("parses the latest recommended Linux artifact URL", () => {
    const html = `
      <a href="25770-abcdef/">LATEST RECOMMENDED (25770)</a>
      <a href="31689-fedcba/fx.tar.xz">31689</a>
    `;

    expect(
      parseRecommendedFxServerArtifact(
        html,
        "https://runtime.fivem.net/artifacts/fivem/build_proot_linux/master/",
      ),
    ).toEqual({
      build: "25770",
      url: "https://runtime.fivem.net/artifacts/fivem/build_proot_linux/master/25770-abcdef/fx.tar.xz",
    });
  });

  it("parses the current FiveM artifact listing format", () => {
    const html = `
      <a href= "./25770-8ddccd4e4dfd6a760ce18651656463f961cc4761/fx.tar.xz" class="button is-link is-primary">
        LATEST RECOMMENDED (25770)
      </a>
    `;

    expect(
      parseRecommendedFxServerArtifact(
        html,
        "https://runtime.fivem.net/artifacts/fivem/build_proot_linux/master/",
      ),
    ).toEqual({
      build: "25770",
      url: "https://runtime.fivem.net/artifacts/fivem/build_proot_linux/master/25770-8ddccd4e4dfd6a760ce18651656463f961cc4761/fx.tar.xz",
    });
  });

  it("throws when the recommended artifact is missing", () => {
    expect(() =>
      parseRecommendedFxServerArtifact(
        "<html></html>",
        "https://runtime.fivem.net/artifacts/fivem/build_proot_linux/master/",
      ),
    ).toThrow("Could not find latest recommended FXServer Linux artifact");
  });
});
