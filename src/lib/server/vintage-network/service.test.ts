import { describe, expect, it, vi } from "vitest";
import { nimbusPublicAddress } from "./constants";

vi.mock("./docker-proxy", () => ({
  ensureNimbusProxy: vi.fn(),
  isNimbusProxyRunning: vi.fn(async () => false),
}));

vi.mock("@/lib/server/supervisor", () => ({
  supervisor: { power: vi.fn() },
}));

import { getVintageNetworkStatus } from "./service";

describe("vintage network service contract", () => {
  it("uses the approved public address", () => {
    expect(nimbusPublicAddress()).toBe("play.slutvival.com:42420");
  });

  it("exports a status reader for the setup API", () => {
    expect(typeof getVintageNetworkStatus).toBe("function");
  });
});
