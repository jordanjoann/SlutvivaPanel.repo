import { beforeEach, describe, expect, it, vi } from "vitest";

const getSessionAccount = vi.fn();
const getInstance = vi.fn();
const listGtaPlayers = vi.fn();
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
  listGtaPlayers,
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

describe("GTA players list route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getInstance.mockResolvedValue(gtaInstance());
    listGtaPlayers.mockResolvedValue({
      players: [],
      onlineCount: 0,
      offlineCount: 0,
      punishmentCount: 0,
      bridge: { online: false },
    });
  });

  it("rejects non-owner GTA access with 403", async () => {
    getSessionAccount.mockResolvedValue({ account: { role: "admin" } });
    const { GET } = await import("./route");

    const response = await GET(
      new Request("http://panel/api/instances/los-santos/gta/players"),
      params(),
    );

    expect(response.status).toBe(403);
    expect(listGtaPlayers).not.toHaveBeenCalled();
  });

  it("rejects non-GTA instances with 400", async () => {
    getSessionAccount.mockResolvedValue({ account: { role: "owner" } });
    getInstance.mockResolvedValue({
      ...gtaInstance(),
      game: "vintage-story",
    });
    const { GET } = await import("./route");

    const response = await GET(
      new Request("http://panel/api/instances/los-santos/gta/players"),
      params(),
    );

    expect(response.status).toBe(400);
    expect(listGtaPlayers).not.toHaveBeenCalled();
  });

  it("returns owner GTA roster and calls listGtaPlayers with GTA instance", async () => {
    const inst = gtaInstance();
    const roster = {
      players: [{ id: "gta_player", name: "Bocephus", online: true }],
      onlineCount: 1,
      offlineCount: 0,
      punishmentCount: 0,
      bridge: { online: true, lastHeartbeatAt: 1 },
    };
    getSessionAccount.mockResolvedValue({ account: { role: "owner" } });
    getInstance.mockResolvedValue(inst);
    listGtaPlayers.mockResolvedValue(roster);
    const { GET } = await import("./route");

    const response = await GET(
      new Request("http://panel/api/instances/los-santos/gta/players"),
      params(),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual(roster);
    expect(listGtaPlayers).toHaveBeenCalledWith(inst);
  });
});
