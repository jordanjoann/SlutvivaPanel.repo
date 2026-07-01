/**
 * Persist a value across Next.js dev HMR reloads and across route-handler
 * module instances by stashing it on globalThis. In production this is a
 * plain module-scoped singleton; in dev it survives fast-refresh so the
 * supervisor / console buffers / metrics history don't reset every edit.
 */
const KEY = "__slutvival_singletons__";

type Registry = Map<string, unknown>;

function registry(): Registry {
  const g = globalThis as unknown as Record<string, Registry | undefined>;
  if (!g[KEY]) g[KEY] = new Map();
  return g[KEY]!;
}

export function singleton<T>(name: string, create: () => T): T {
  const reg = registry();
  if (!reg.has(name)) reg.set(name, create());
  return reg.get(name) as T;
}
