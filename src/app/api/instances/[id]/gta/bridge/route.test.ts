import { beforeEach, describe, expect, it, vi } from "vitest";

const getInstance = vi.fn();
const getSessionAccount = vi.fn();
const handleGtaBridgeEvent = vi.fn();
const getState = vi.fn();

vi.mock("@/lib/server/supervisor", () => ({
  supervisor: { getState },
}));

vi.mock("@/lib/server/auth", () => ({
  getSessionAccount,
}));

vi.mock("@/lib/server/store", () => ({
  getInstance,
}));

vi.mock("@/lib/server/gta/players", () => ({
  handleGtaBridgeEvent,
}));

function params(id = "los-santos") {
  return { params: Promise.resolve({ id }) };
}

function gtaInstance() {
  return {
    id: "los-santos",
    name: "Los Santos",
    game: "gta",
  };
}

function bridgeRequest(body: unknown) {
  return new Request("http://panel/api/instances/los-santos/gta/bridge", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

describe("GTA bridge route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getInstance.mockResolvedValue(gtaInstance());
    handleGtaBridgeEvent.mockResolvedValue({ ok: true });
  });

  it("rejects non-GTA instances with 400", async () => {
    getInstance.mockResolvedValue({
      ...gtaInstance(),
      game: "vintage-story",
    });
    const { POST } = await import("./route");

    const response = await POST(
      bridgeRequest({ type: "heartbeat", serverToken: "token", players: [] }),
      params(),
    );

    expect(response.status).toBe(400);
    expect(handleGtaBridgeEvent).not.toHaveBeenCalled();
  });

  it("passes bridge events to service without browser session auth", async () => {
    const inst = gtaInstance();
    const event = {
      type: "playerDrop",
      serverToken: "token",
      serverId: 7,
      reason: "Quit",
    };
    getInstance.mockResolvedValue(inst);
    handleGtaBridgeEvent.mockResolvedValue({ allowed: true });
    const { POST } = await import("./route");

    const response = await POST(bridgeRequest(event), params());

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ allowed: true });
    expect(getSessionAccount).not.toHaveBeenCalled();
    expect(handleGtaBridgeEvent).toHaveBeenCalledWith(inst, event);
  });
});
