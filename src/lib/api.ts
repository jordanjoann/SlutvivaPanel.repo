import type {
  Backup,
  BackupPolicyStatus,
  CreateInstanceInput,
  FileContent,
  FileNode,
  GameVersion,
  GtaPlayerActionInput,
  GtaPlayerActionResult,
  GtaPlayersPayload,
  InstalledMod,
  Instance,
  InstanceWithState,
  ModSearchResult,
  Player,
  PowerAction,
  ServerSettings,
  VintageStoryNetworkSetupResult,
  VintageStoryNetworkStatus,
  WorldDeploymentResult,
  WorldInfo,
} from "./types";
import type {
  ClothingAuditPayload,
  ClothingAuditTag,
  ClothingLibraryPayload,
  ClothingTarget,
} from "./gta-clothing";

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

  gta: {
    clothing: {
      list: (id: string) =>
        fetcher<ClothingLibraryPayload>(`/api/instances/${id}/gta/clothing`),
      audit: {
        list: (id: string) =>
          fetcher<ClothingAuditPayload>(`/api/instances/${id}/gta/clothing/audit`),
        decide: (id: string, itemId: string, tag: ClothingAuditTag) =>
          send<ClothingAuditPayload>(`/api/instances/${id}/gta/clothing/audit`, "POST", {
            itemId,
            tag,
          }),
      },
      decide: (id: string, assetId: string, target: ClothingTarget, notes?: string) =>
        send<ClothingLibraryPayload>(`/api/instances/${id}/gta/clothing`, "POST", {
          assetId,
          target,
          notes,
        }),
      clear: (id: string, assetId: string) =>
        send<ClothingLibraryPayload>(
          `/api/instances/${id}/gta/clothing?assetId=${encodeURIComponent(assetId)}`,
          "DELETE",
        ),
      render: (id: string, force = false) =>
        send<ClothingLibraryPayload>(
          `/api/instances/${id}/gta/clothing/render`,
          "POST",
          { force },
        ),
      upload: async (id: string, files: FileList | File[]) => {
        const form = new FormData();
        for (const file of Array.from(files)) form.append("files", file);
        const res = await fetch(`/api/instances/${id}/gta/clothing/upload`, {
          method: "POST",
          body: form,
        });
        if (!res.ok) {
          const b = await res.json().catch(() => ({}));
          throw new ApiError(b.error ?? "Upload failed", res.status, b.detail);
        }
        return res.json() as Promise<{
          uploaded: { fileName: string; relativePath: string; size: number }[];
          library: ClothingLibraryPayload;
        }>;
      },
    },
    players: {
      list: (id: string) =>
        fetcher<GtaPlayersPayload>(`/api/instances/${id}/gta/players`),
      action: (id: string, body: GtaPlayerActionInput) =>
        send<GtaPlayerActionResult>(
          `/api/instances/${id}/gta/players/action`,
          "POST",
          body,
        ),
    },
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
    deploy: (
      id: string,
      file: File,
      onProgress?: (percent: number) => void,
    ) =>
      new Promise<WorldDeploymentResult>((resolve, reject) => {
        const request = new XMLHttpRequest();
        request.open(
          "PUT",
          `/api/instances/${id}/world?filename=${encodeURIComponent(file.name)}`,
        );
        request.setRequestHeader("Content-Type", "application/octet-stream");
        request.upload.addEventListener("progress", (event) => {
          if (event.lengthComputable) {
            onProgress?.(Math.round((event.loaded / event.total) * 100));
          }
        });
        request.addEventListener("load", () => {
          const body = parseJsonResponse(request.responseText);
          if (request.status < 200 || request.status >= 300) {
            reject(
              new ApiError(
                stringProperty(body, "error") ?? "World deployment failed",
                request.status,
                stringProperty(body, "detail"),
              ),
            );
            return;
          }
          resolve(body as unknown as WorldDeploymentResult);
        });
        request.addEventListener("error", () => {
          reject(new ApiError("World upload failed", request.status || 0));
        });
        request.addEventListener("abort", () => {
          reject(new ApiError("World upload cancelled", 0));
        });
        request.send(file);
      }),
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

function parseJsonResponse(raw: string): Record<string, unknown> {
  try {
    const value: unknown = JSON.parse(raw);
    return typeof value === "object" && value !== null
      ? (value as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

function stringProperty(value: Record<string, unknown>, key: string) {
  return typeof value[key] === "string" ? value[key] : undefined;
}
