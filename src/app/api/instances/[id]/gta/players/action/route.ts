import type { GtaPlayerActionInput } from "@/lib/types";
import { recordGtaPlayerAction } from "@/lib/server/gta/players";
import {
  badRequest,
  forbidden,
  json,
  loadInstance,
  serverError,
  unauthorized,
} from "@/lib/server/http";
import { getSessionAccount } from "@/lib/server/auth";
import { supervisor } from "@/lib/server/supervisor";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(req: Request, { params }: Ctx) {
  try {
    const session = await getSessionAccount();
    if (!session) return unauthorized();
    if (session.account.role !== "owner") return forbidden();

    const { id } = await params;
    const res = await loadInstance(id);
    if ("response" in res) return res.response;
    if (res.instance.game !== "gta") {
      return badRequest("GTA player routes require a GTA instance");
    }

    const input = parseActionInput(await readJsonBody(req));
    if ("response" in input) return input.response;

    try {
      const result = await recordGtaPlayerAction(
        res.instance,
        input.value,
        {
          id: session.account.id,
          username: session.account.username,
        },
      );

      if (!result.liveCommand) return json(result);

      try {
        await supervisor.command(res.instance, result.liveCommand);
        return json({ ...result, liveAction: { ok: true } });
      } catch (error) {
        return json({
          ...result,
          liveAction: { ok: false, error: errorMessage(error) },
        });
      }
    } catch (error) {
      if (isActionValidationError(error)) {
        return badRequest(errorMessage(error));
      }
      throw error;
    }
  } catch (e) {
    return serverError(e);
  }
}

async function readJsonBody(req: Request): Promise<unknown> {
  try {
    return await req.json();
  } catch {
    return undefined;
  }
}

function parseActionInput(
  body: unknown,
): { value: GtaPlayerActionInput } | { response: Response } {
  if (!isRecord(body)) return { response: badRequest("JSON body is required") };

  const { action, playerId, reason } = body;
  if (action !== "kick" && action !== "warn" && action !== "ban") {
    return { response: badRequest("action must be kick, warn, or ban") };
  }
  if (typeof playerId !== "string" || !playerId.trim()) {
    return { response: badRequest("playerId is required") };
  }
  if (reason !== undefined && typeof reason !== "string") {
    return { response: badRequest("reason must be a string") };
  }

  return { value: { action, playerId, reason } };
}

function isActionValidationError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  return (
    error.message === "Invalid action" ||
    error.message === "GTA player was not found" ||
    error.message.endsWith("reason is required") ||
    error.message === "Kick requires an online player with a server id"
  );
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
