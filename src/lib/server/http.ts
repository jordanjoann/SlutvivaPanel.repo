import type { Instance, InstanceWithState } from "@/lib/types";
import { getInstance } from "./store";
import { supervisor } from "./supervisor";

export function json(data: unknown, init?: ResponseInit): Response {
  return Response.json(data, init);
}

export function ok(): Response {
  return Response.json({ ok: true });
}

export function badRequest(error: string, detail?: string): Response {
  return Response.json({ error, detail }, { status: 400 });
}

export function notFound(error = "Not found"): Response {
  return Response.json({ error }, { status: 404 });
}

export function serverError(error: unknown): Response {
  const message = error instanceof Error ? error.message : String(error);
  return Response.json({ error: "Internal error", detail: message }, { status: 500 });
}

/** Load an instance or return a 404 response. */
export async function loadInstance(
  id: string,
): Promise<{ instance: Instance } | { response: Response }> {
  const instance = await getInstance(id);
  if (!instance) return { response: notFound(`Server '${id}' not found`) };
  return { instance };
}

export async function toInstanceWithState(
  inst: Instance,
): Promise<InstanceWithState> {
  const state = await supervisor.getState(inst);
  return { ...inst, state };
}
