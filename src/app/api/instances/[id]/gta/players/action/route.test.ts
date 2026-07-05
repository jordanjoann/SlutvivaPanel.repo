import { beforeEach, describe, expect, it, vi } from "vitest";

const command = vi.fn();
const getSessionAccount = vi.fn();
const getInstance = vi.fn();
const recordGtaPlayerAction = vi.fn();

vi.mock("@/lib/server/supervisor", () => ({
  supervisor: { command },
}));

vi.mock("@/lib/server/auth", () => ({
  getSessionAccount,
}));

vi.mock("@/lib/server/store", () => ({
  getInstance,
}));

vi.mock("@/lib/server/gta/players", () => ({
  recordGtaPlayerAction,
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

function actionRequest(body: unknown) {
  return new Request("http://panel/api/instances/los-santos/gta/players/action", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

describe("GTA players action route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getInstance.mockResolvedValue(gtaInstance());
    recordGtaPlayerAction.mockResolvedValue({
      ok: true,
      punishment: { id: "punishment_1", type: "warn" },
    });
  });

  it("requires owner access", async () => {
    getSessionAccount.mockResolvedValue({ account: { role: "admin" } });
    const { POST } = await import("./route");

    const response = await POST(
      actionRequest({
        action: "warn",
        playerId: "gta_player",
        reason: "Mind the rules",
      }),
      params(),
    );

    expect(response.status).toBe(403);
    expect(recordGtaPlayerAction).not.toHaveBeenCalled();
    expect(command).not.toHaveBeenCalled();
  });

  it("records owner actor details", async () => {
    const inst = gtaInstance();
    getSessionAccount.mockResolvedValue({
      account: { id: "u_owner", username: "Owner", role: "owner" },
    });
    getInstance.mockResolvedValue(inst);
    const { POST } = await import("./route");

    const response = await POST(
      actionRequest({
        action: "warn",
        playerId: "gta_player",
        reason: "Mind the rules",
      }),
      params(),
    );

    expect(response.status).toBe(200);
    expect(recordGtaPlayerAction).toHaveBeenCalledWith(
      inst,
      {
        action: "warn",
        playerId: "gta_player",
        reason: "Mind the rules",
      },
      { id: "u_owner", username: "Owner" },
    );
  });

  it("runs liveCommand through supervisor.command and reports failure as liveAction", async () => {
    const inst = gtaInstance();
    const result = {
      ok: true,
      punishment: { id: "punishment_1", type: "ban" },
      liveCommand: "slutvival_kick 7 Banned: RDM",
    };
    getSessionAccount.mockResolvedValue({
      account: { id: "u_owner", username: "Owner", role: "owner" },
    });
    getInstance.mockResolvedValue(inst);
    recordGtaPlayerAction.mockResolvedValue(result);
    command.mockRejectedValue(new Error("container offline"));
    const { POST } = await import("./route");

    const response = await POST(
      actionRequest({
        action: "ban",
        playerId: "gta_player",
        reason: "RDM",
      }),
      params(),
    );

    expect(response.status).toBe(200);
    expect(command).toHaveBeenCalledWith(inst, result.liveCommand);
    await expect(response.json()).resolves.toEqual({
      ...result,
      liveAction: { ok: false, error: "container offline" },
    });
  });
});
