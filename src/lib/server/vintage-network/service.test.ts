import { describe, expect, it } from "vitest";
import { nimbusPublicAddress } from "./constants";
import { getVintageNetworkStatus } from "./service";

describe("vintage network service contract", () => {
  it("uses the approved public address", () => {
    expect(nimbusPublicAddress()).toBe("play.slutvival.com:42420");
  });

  it("exports a status reader for the setup API", () => {
    expect(typeof getVintageNetworkStatus).toBe("function");
  });
});
