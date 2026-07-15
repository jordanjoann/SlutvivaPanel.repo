import { describe, expect, it, vi } from "vitest";
import { nimbusPublicAddress } from "./constants";

vi.mock("./docker-proxy", () => ({
  ensureNimbusProxy: vi.fn(),
  isNimbusProxyRunning: vi.fn(async () => false),
}));

vi.mock("@/lib/server/supervisor", () => ({
  supervisor: { power: vi.fn() },
}));

import type { Instance } from "@/lib/types";
import { getVintageNetworkStatus, selectHubInstance } from "./service";

describe("vintage network service contract", () => {
  it("uses the approved public address", () => {
    expect(nimbusPublicAddress()).toBe("play.slutvival.com:42420");
  });

  it("exports a status reader for the setup API", () => {
    expect(typeof getVintageNetworkStatus).toBe("function");
  });

  it("reuses a renamed instance whose display name is Hub", () => {
    const renamedHub = { id: "hub-urjf", name: "Hub" } as Instance;
    expect(selectHubInstance([renamedHub])).toBe(renamedHub);
  });
});
