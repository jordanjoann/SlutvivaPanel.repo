import type { GameVersion } from "@/lib/types";

export const VINTAGE_STORY_VERSION_FEED_URL =
  "https://www.vintagestory.at/blog.html/news/?rss=1";

export const FALLBACK_VINTAGE_STORY_VERSIONS: GameVersion[] = [
  {
    version: "1.22.3",
    channel: "stable",
    releasedAt: Date.UTC(2026, 4, 30, 9, 58),
    latest: true,
  },
  {
    version: "1.22.2",
    channel: "stable",
    releasedAt: Date.UTC(2026, 4, 3, 6, 45, 39),
    latest: false,
  },
  {
    version: "1.22.1",
    channel: "stable",
    releasedAt: Date.UTC(2026, 3, 29, 6, 54, 54),
    latest: false,
  },
  {
    version: "1.22.0",
    channel: "stable",
    releasedAt: Date.UTC(2026, 3, 21, 16, 53),
    latest: false,
  },
  {
    version: "1.21.7",
    channel: "stable",
    releasedAt: Date.UTC(2026, 3, 17, 17, 10),
    latest: false,
  },
  {
    version: "1.21.6",
    channel: "stable",
    releasedAt: Date.UTC(2025, 11, 13),
    latest: false,
  },
];

export const DEFAULT_VINTAGE_STORY_VERSION =
  FALLBACK_VINTAGE_STORY_VERSIONS[0].version;
