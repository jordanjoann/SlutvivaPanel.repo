import type { GameVersion } from "@/lib/types";
import {
  FALLBACK_VINTAGE_STORY_VERSIONS,
  VINTAGE_STORY_VERSION_FEED_URL,
} from "@/lib/vintage-story-versions";

const VERSION_LIMIT = 6;
const CACHE_TTL_MS = 60 * 60 * 1000;
const RSS_TIMEOUT_MS = 5000;

let cached:
  | {
      expiresAt: number;
      versions: GameVersion[];
    }
  | undefined;

/** Recent Vintage Story server versions offered by the update workflow. */
export async function listVersions(): Promise<GameVersion[]> {
  if (cached && cached.expiresAt > Date.now()) return cached.versions;

  const versions = await fetchVersionsFromNewsFeed().catch(
    () => FALLBACK_VINTAGE_STORY_VERSIONS,
  );

  cached = {
    expiresAt: Date.now() + CACHE_TTL_MS,
    versions,
  };

  return versions;
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

async function fetchVersionsFromNewsFeed(): Promise<GameVersion[]> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), RSS_TIMEOUT_MS);

  try {
    const response = await fetch(VINTAGE_STORY_VERSION_FEED_URL, {
      cache: "no-store",
      headers: {
        Accept: "application/rss+xml, application/xml;q=0.9, text/xml;q=0.8",
      },
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`Version feed returned ${response.status}`);

    const xml = await response.text();
    const versions = parseVersions(xml);
    return versions.length ? versions : FALLBACK_VINTAGE_STORY_VERSIONS;
  } finally {
    clearTimeout(timeout);
  }
}

function parseVersions(xml: string): GameVersion[] {
  const versions = new Map<string, GameVersion>();
  const items = xml.match(/<item\b[\s\S]*?<\/item>/gi) ?? [];
  let stableCount = 0;
  let unstableCount = 0;

  for (const item of items) {
    const title = readXmlTag(item, "title");
    if (!title) continue;

    const releasedAt = Date.parse(readXmlTag(item, "pubDate") ?? "");
    const found = title.match(/\b\d+\.\d+\.\d+(?:-(?:rc|pre)\.\d+)?\b/g) ?? [];

    for (const version of found) {
      const channel = channelFor(version);
      if (versions.has(version)) continue;
      if (channel === "stable" && stableCount >= VERSION_LIMIT) continue;
      if (channel !== "stable" && unstableCount >= VERSION_LIMIT) continue;

      versions.set(version, {
        version,
        channel,
        releasedAt: Number.isFinite(releasedAt) ? releasedAt : Date.now(),
        latest: false,
      });

      if (channel === "stable") stableCount += 1;
      else unstableCount += 1;

      if (stableCount >= VERSION_LIMIT && unstableCount >= VERSION_LIMIT) {
        return markLatest([...versions.values()]);
      }
    }
  }

  return markLatest([...versions.values()]);
}

function readXmlTag(xml: string, tag: string): string | undefined {
  const match = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i").exec(xml);
  if (!match) return undefined;
  return decodeXml(match[1].replace(/^<!\[CDATA\[([\s\S]*)\]\]>$/u, "$1").trim());
}

function decodeXml(value: string): string {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function channelFor(version: string): GameVersion["channel"] {
  if (version.includes("-pre.")) return "unstable";
  if (version.includes("-rc.")) return "rc";
  return "stable";
}

function markLatest(versions: GameVersion[]): GameVersion[] {
  const seen = new Set<"stable" | "unstable">();
  return versions.map((version) => {
    const group = version.channel === "stable" ? "stable" : "unstable";
    const latest = !seen.has(group);
    seen.add(group);
    return {
      ...version,
      latest,
    };
  });
}
