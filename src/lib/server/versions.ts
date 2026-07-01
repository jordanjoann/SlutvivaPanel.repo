import type { GameVersion } from "@/lib/types";

const day = 86400000;
const now = Date.now();

/** Recent Vintage Story server versions offered by the update workflow. */
export const VS_VERSIONS: GameVersion[] = [
  { version: "1.20.7", channel: "stable", releasedAt: now - 6 * day, latest: true },
  { version: "1.20.6", channel: "stable", releasedAt: now - 27 * day, latest: false },
  { version: "1.20.5", channel: "stable", releasedAt: now - 48 * day, latest: false },
  { version: "1.20.4", channel: "stable", releasedAt: now - 70 * day, latest: false },
  { version: "1.20.3", channel: "stable", releasedAt: now - 96 * day, latest: false },
  { version: "1.21.0-rc.1", channel: "rc", releasedAt: now - 3 * day, latest: false },
  { version: "1.20.0-pre.9", channel: "unstable", releasedAt: now - 120 * day, latest: false },
];

export function listVersions(): GameVersion[] {
  return VS_VERSIONS;
}

/** The CDN URL the panel would download a server package from. */
export function packageUrl(version: string, os: "linux" | "windows" = "linux") {
  const suffix = os === "windows" ? "win-x64.zip" : "linux-x64.tar.gz";
  const channel = /-(rc|pre)/.test(version) ? "unstable" : "stable";
  return `https://cdn.vintagestory.at/gamefiles/${channel}/vs_server_${suffix.replace(
    /(\.tar\.gz|\.zip)$/,
    `_${version}$1`,
  )}`;
}
