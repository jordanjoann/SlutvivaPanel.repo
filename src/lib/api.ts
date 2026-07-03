import type {
  Backup,
  BackupPolicyStatus,
  CreateInstanceInput,
  FileContent,
  FileNode,
  GameVersion,
  InstalledMod,
  Instance,
  InstanceWithState,
  ModSearchResult,
  Player,
  PowerAction,
  ServerSettings,
  VintageStoryNetworkSetupResult,
  VintageStoryNetworkStatus,
  WorldInfo,
} from "./types";

/* ------------------------------------------------------------------ */
/* Low-level helpers                                                  */
/* ------------------------------------------------------------------ */

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly detail?: string,
  ) {
    super(message);
  }
}

export async function fetcher<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new ApiError(body.error ?? res.statusText, res.status, body.detail);
  }
  return res.json() as Promise<T>;
}

async function send<T>(
  url: string,
  method: string,
  body?: unknown,
): Promise<T> {
  const res = await fetch(url, {
    method,
    headers: body !== undefined ? { "Content-Type": "application/json" } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const b = await res.json().catch(() => ({}));
    throw new ApiError(b.error ?? res.statusText, res.status, b.detail);
  }
  return res.json().catch(() => ({})) as Promise<T>;
}

/* ------------------------------------------------------------------ */
/* Typed API surface                                                  */
/* ------------------------------------------------------------------ */

export const api = {
  instances: {
    list: (game?: string) =>
      fetcher<InstanceWithState[]>(`/api/instances${game ? `?game=${game}` : ""}`),
    get: (id: string) => fetcher<InstanceWithState>(`/api/instances/${id}`),
    create: (body: CreateInstanceInput) =>
      send<InstanceWithState>("/api/instances", "POST", body),
    update: (id: string, patch: Partial<Instance>) =>
      send<InstanceWithState>(`/api/instances/${id}`, "PATCH", patch),
    remove: (id: string) => send<{ ok: true }>(`/api/instances/${id}`, "DELETE"),
    power: (id: string, action: PowerAction) =>
      send<{ ok: true }>(`/api/instances/${id}/power`, "POST", { action }),
    command: (id: string, command: string) =>
      send<{ ok: true }>(`/api/instances/${id}/command`, "POST", { command }),
  },

  players: {
    list: (id: string) =>
      fetcher<{
        players: Player[];
        offline: Player[];
        whitelist: Player[];
        assignedRoles: Player[];
        roles: string[];
        defaultRole: string;
      }>(`/api/instances/${id}/players`),
    action: (
      id: string,
      action: string,
      name: string,
      extra?: Record<string, unknown>,
    ) =>
      send<{ ok: true }>(`/api/instances/${id}/players`, "POST", {
        action,
        name,
        ...extra,
      }),
  },

  files: {
    list: (id: string, path = "") =>
      fetcher<{ path: string; entries: FileNode[] }>(
        `/api/instances/${id}/files?path=${encodeURIComponent(path)}`,
      ),
    read: (id: string, path: string) =>
      fetcher<FileContent>(
        `/api/instances/${id}/files/content?path=${encodeURIComponent(path)}`,
      ),
    write: (id: string, path: string, content: string) =>
      send<FileContent>(`/api/instances/${id}/files/content`, "PUT", { path, content }),
    op: (id: string, body: Record<string, unknown>) =>
      send<{ ok: true }>(`/api/instances/${id}/files`, "POST", body),
    downloadUrl: (id: string, path: string) =>
      `/api/instances/${id}/files/content?download=1&path=${encodeURIComponent(path)}`,
    upload: async (id: string, dir: string, files: FileList | File[]) => {
      const form = new FormData();
      form.append("path", dir);
      for (const f of Array.from(files)) form.append("files", f);
      const res = await fetch(`/api/instances/${id}/files`, { method: "PUT", body: form });
      if (!res.ok) throw new ApiError("Upload failed", res.status);
      return res.json();
    },
  },

  mods: {
    list: (id: string) =>
      fetcher<{ mods: InstalledMod[] }>(`/api/instances/${id}/mods`),
    search: (q: string) =>
      fetcher<{ results: ModSearchResult[] }>(`/api/mods/search?q=${encodeURIComponent(q)}`),
    op: (id: string, body: Record<string, unknown>) =>
      send<unknown>(`/api/instances/${id}/mods`, "POST", body),
  },

  backups: {
    list: (id: string) =>
      fetcher<{ backups: Backup[]; policy: BackupPolicyStatus }>(
        `/api/instances/${id}/backups`,
      ),
    op: (id: string, body: Record<string, unknown>) =>
      send<unknown>(`/api/instances/${id}/backups`, "POST", body),
  },

  settings: {
    get: (id: string) =>
      fetcher<{ settings: ServerSettings }>(`/api/instances/${id}/settings`),
    update: (id: string, settings: ServerSettings) =>
      send<{ instance: Instance; settings: ServerSettings }>(
        `/api/instances/${id}/settings`,
        "PATCH",
        { settings },
      ),
    blacklist: (id: string, body: Record<string, unknown>) =>
      send<{ settings: ServerSettings }>(`/api/instances/${id}/settings`, "POST", body),
  },

  world: {
    get: (id: string) => fetcher<WorldInfo>(`/api/instances/${id}/world`),
    update: (id: string, patch: Partial<WorldInfo>) =>
      send<WorldInfo>(`/api/instances/${id}/world`, "PATCH", patch),
  },

  vintageStory: {
    versions: () =>
      fetcher<{ versions: GameVersion[] }>("/api/vintage-story/versions"),
    network: {
      status: () =>
        fetcher<VintageStoryNetworkStatus>("/api/vintage-story/network"),
      setup: () =>
        send<VintageStoryNetworkSetupResult>("/api/vintage-story/network", "POST"),
    },
  },

  versions: {
    get: (id: string) =>
      fetcher<{ current: string; versions: GameVersion[] }>(
        `/api/instances/${id}/versions`,
      ),
    update: (id: string, version: string) =>
      send<{ ok: true; version: string }>(
        `/api/instances/${id}/versions`,
        "POST",
        { version },
      ),
  },
};
