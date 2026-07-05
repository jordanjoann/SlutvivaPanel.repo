import { describe, expect, it } from "vitest";
import {
  filterGtaPlayers,
  initialGtaPlayerId,
  matchesGtaPlayerQuery,
} from "./gta-players-view";
import type { GtaPlayerSummary } from "./types";

const players = [
  player({
    id: "gta_license_alpha",
    name: "Nova",
    online: true,
    serverId: 42,
    identifiers: [
      { type: "license", value: "license:alpha" },
      { type: "discord", value: "discord:1234" },
    ],
  }),
  player({
    id: "gta_license_bravo",
    name: "Wren",
    online: false,
    serverId: undefined,
    identifiers: [
      { type: "license", value: "license:bravo" },
      { type: "steam", value: "steam:abcd" },
    ],
  }),
  player({
    id: "gta_license_charlie",
    name: "Mara",
    online: true,
    serverId: 7,
    identifiers: [{ type: "license", value: "license:charlie" }],
  }),
] satisfies GtaPlayerSummary[];

describe("GTA players view helpers", () => {
  describe("matchesGtaPlayerQuery", () => {
    it("matches name, server id, stable player id, and identifier values", () => {
      expect(matchesGtaPlayerQuery(players[0], " nova ")).toBe(true);
      expect(matchesGtaPlayerQuery(players[0], "42")).toBe(true);
      expect(matchesGtaPlayerQuery(players[0], "ALPHA")).toBe(true);
      expect(matchesGtaPlayerQuery(players[0], "discord:1234")).toBe(true);
    });

    it("misses unrelated queries", () => {
      expect(matchesGtaPlayerQuery(players[0], "bravo")).toBe(false);
    });
  });

  describe("filterGtaPlayers", () => {
    it("filters by status and query", () => {
      expect(filterGtaPlayers(players, "all", "")).toEqual(players);
      expect(filterGtaPlayers(players, "online", "")).toEqual([players[0], players[2]]);
      expect(filterGtaPlayers(players, "offline", "")).toEqual([players[1]]);
      expect(filterGtaPlayers(players, "all", "steam:abcd")).toEqual([players[1]]);
      expect(filterGtaPlayers(players, "online", "license")).toEqual([players[0], players[2]]);
      expect(filterGtaPlayers(players, "offline", "nova")).toEqual([]);
    });
  });

  describe("initialGtaPlayerId", () => {
    it("keeps the selected player if present", () => {
      expect(initialGtaPlayerId(players, players[1].id)).toBe(players[1].id);
    });

    it("falls back to the first online player, then first player, then empty string", () => {
      expect(initialGtaPlayerId(players, "missing")).toBe(players[0].id);
      expect(initialGtaPlayerId([players[1]], "")).toBe(players[1].id);
      expect(initialGtaPlayerId([], "")).toBe("");
    });
  });
});

function player(patch: Partial<GtaPlayerSummary> & Pick<GtaPlayerSummary, "id" | "name" | "online">): GtaPlayerSummary {
  return {
    id: patch.id,
    name: patch.name,
    online: patch.online,
    serverId: patch.serverId,
    pingMs: patch.pingMs,
    identifiers: patch.identifiers ?? [],
    firstSeenAt: 1_700_000_000_000,
    lastSeenAt: 1_700_000_000_000,
    totalPlaytimeSeconds: 0,
    sessions: [],
    punishments: [],
  };
}
