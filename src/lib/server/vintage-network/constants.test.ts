import { describe, expect, it } from "vitest";
import {
  HUB_INSTANCE_ID,
  NIMBUS_RELEASE_TAG,
  STRATUM_RELEASE_TAG,
  creativeSuperflatHubWorld,
  nimbusPublicAddress,
} from "./constants";

describe("vintage network constants", () => {
  it("pins the approved release tags", () => {
    expect(STRATUM_RELEASE_TAG).toBe("v1.22.3-stratum.15");
    expect(NIMBUS_RELEASE_TAG).toBe("0.1.0-dev");
  });

  it("returns the public Nimbus address", () => {
    expect(nimbusPublicAddress()).toBe("play.slutvival.com:42420");
  });

  it("describes the approved hub default world", () => {
    expect(HUB_INSTANCE_ID).toBe("hub");
    expect(creativeSuperflatHubWorld()).toMatchObject({
      playStyle: "creativebuilding",
      gameMode: "creative",
      worldType: "superflat",
      allowCreativeMode: true,
      temporalStability: false,
      temporalStorms: "off",
      temporalRifts: "off",
      whitelistMode: false,
    });
  });
});
