import { beforeEach, describe, expect, it, vi } from "vitest";

const deployWorld = vi.fn();
const getInstance = vi.fn();
const getSessionAccount = vi.fn();

vi.mock("@/lib/server/world-deployment", () => ({
  deployWorld,
  WorldDeploymentError: class WorldDeploymentError extends Error {},
}));

vi.mock("@/lib/server/store", () => ({
  getInstance,
}));

vi.mock("@/lib/server/auth", () => ({
  getSessionAccount,
}));

function params() {
  return { params: Promise.resolve({ id: "hub-test" }) };
}

describe("streaming world upload route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getInstance.mockResolvedValue({
      id: "hub-test",
      name: "Hub",
      game: "vintage-story",
    });
  });

  it("authenticates without the global proxy and streams bodies larger than 10 MB", async () => {
    getSessionAccount.mockResolvedValue({ account: { role: "owner" } });
    let received = 0;
    deployWorld.mockImplementation(async (_instance, input) => {
      const reader = input.body.getReader();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        received += value.byteLength;
      }
      return { ok: true };
    });
    const body = new Uint8Array(12 * 1024 * 1024);
    const { PUT } = await import("./route");

    const response = await PUT(
      new Request("http://panel/api/world-upload/hub-test?filename=Hub.vcdbs", {
        method: "PUT",
        body,
      }),
      params(),
    );

    expect(response.status).toBe(200);
    expect(received).toBe(body.byteLength);
  });

  it("rejects non-owner accounts before accepting a world", async () => {
    getSessionAccount.mockResolvedValue({ account: { role: "admin" } });
    const { PUT } = await import("./route");

    const response = await PUT(
      new Request("http://panel/api/world-upload/hub-test?filename=Hub.vcdbs", {
        method: "PUT",
        body: new Uint8Array(16),
      }),
      params(),
    );

    expect(response.status).toBe(403);
    expect(deployWorld).not.toHaveBeenCalled();
  });
});
