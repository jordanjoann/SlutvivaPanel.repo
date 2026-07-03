# Vintage Player Identity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the Vintage Story Players panel display canonical usernames and UIDs from server player data while preserving panel-managed role and whitelist overrides.

**Architecture:** Keep the behavior inside `src/lib/server/player-roster.ts`, which already feeds the Players API. The module reads Vintage Story server records and panel records, merges aliases into canonical identities, and resolves unknown manual entries through Vintage Story auth before falling back to generated IDs.

**Tech Stack:** Next.js 16 API route, TypeScript, Node `fs/promises`, Vitest.

---

## File Structure

- Modify: `src/lib/server/player-roster.ts`
  - Owns role parsing, server playerdata parsing, panel record parsing, identity resolution, and roster grouping.
- Test: `src/lib/server/player-roster.test.ts`
  - Covers canonical identity merge behavior, online identity normalization, role parsing, auth fallback, and stale record rewriting.

### Task 1: Canonical Player Identity Merge

**Files:**
- Modify: `src/lib/server/player-roster.ts`
- Test: `src/lib/server/player-roster.test.ts`

- [x] **Step 1: Confirm failing test coverage exists**

`src/lib/server/player-roster.test.ts` must include this behavior:

```ts
it("uses Vintage Story playerdata as the player identity source", async () => {
  const { getPlayerRoster } = await setupRoster({
    playerdata: [
      {
        PlayerUID: REAL_UID,
        RoleCode: "admin",
        LastKnownPlayername: "P1nkOblivion",
        LastJoinDate: "07/03/2026 02:22",
      },
    ],
    panelPlayers: [
      {
        uid: "known-p1nkoblivion",
        name: "p1nkoblivion",
        role: "admin",
        isWhitelisted: true,
        playtimeSeconds: 0,
        lastSeen: 1783043645032,
      },
      {
        uid: "known-blrzer65nyp-9c7tz7fgeqqs",
        name: REAL_UID,
        role: "member",
        isWhitelisted: false,
        playtimeSeconds: 0,
        lastSeen: 1783046234569,
      },
    ],
  });

  const roster = await getPlayerRoster(instance(), []);

  expect(roster.offline).toHaveLength(1);
  expect(roster.offline[0]).toMatchObject({
    uid: REAL_UID,
    name: "P1nkOblivion",
    role: "admin",
  });
  expect(roster.offline.map((player) => player.name)).not.toContain(REAL_UID);
});
```

- [x] **Step 2: Run the focused test**

Run:

```bash
npm test -- src/lib/server/player-roster.test.ts
```

Expected before the fix is either a roster assertion failure or a local runtime blocker. If the runtime blocks because host Node is older than the installed Vitest stack, use a Node 22 runtime and rerun the same command.

- [x] **Step 3: Implement server-data-first merge**

In `src/lib/server/player-roster.ts`, ensure `getPlayerRoster` reads `Playerdata/playerdata.json` and `playerswhitelisted.json`, merges those server records before panel records, and matches aliases by canonical UID, canonical name, generated `known-*` IDs, and UID-as-name records.

- [x] **Step 4: Implement update resolution**

In `src/lib/server/player-roster.ts`, ensure `updateKnownPlayer` resolves a target from merged local roster records first, then tries `https://auth3.vintagestory.at/resolveplayername`, then `https://auth3.vintagestory.at/resolveplayeruid`, then falls back to generated IDs.

- [x] **Step 5: Verify**

Run:

```bash
npm test -- src/lib/server/player-roster.test.ts
npm run typecheck
```

Expected: all focused roster tests pass and TypeScript reports no errors.
