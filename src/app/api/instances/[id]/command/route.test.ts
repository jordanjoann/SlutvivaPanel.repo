import { beforeEach, describe, expect, it, vi } from "vitest";

const command = vi.fn();
const getSessionAccount = vi.fn();
const getInstance = vi.fn();

vi.mock("@/lib/server/supervisor", () => ({
  supervisor: { command },
}));

vi.mock("@/lib/server/auth", () => ({
  getSessionAccount,
}));

vi.mock("@/lib/server/store", () => ({
  getInstance,
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

describe("command route access", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getInstance.mockResolvedValue(gtaInstance());
  });

  it("rejects non-owner GTA commands", async () => {
    getSessionAccount.mockResolvedValue({ account: { role: "admin" } });
    const { POST } = await import("./route");

    const response = await POST(
      new Request("http://panel/api/instances/los-santos/command", {
        method: "POST",
        body: JSON.stringify({ command: "status" }),
      }),
      params(),
    );

    expect(response!.status).toBe(403);
    expect(command).not.toHaveBeenCalled();
  });

  it("allows owner GTA commands", async () => {
    getSessionAccount.mockResolvedValue({ account: { role: "owner" } });
    const { POST } = await import("./route");

    const response = await POST(
      new Request("http://panel/api/instances/los-santos/command", {
        method: "POST",
        body: JSON.stringify({ command: "status" }),
      }),
      params(),
    );

    expect(response!.status).toBe(200);
    expect(command).toHaveBeenCalledWith(expect.objectContaining({ game: "gta" }), "status");
  });
});
