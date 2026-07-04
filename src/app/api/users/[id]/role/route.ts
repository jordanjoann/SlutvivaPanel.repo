import { getSessionAccount, updatePanelUserRole } from "@/lib/server/auth";
import { PanelUserStore } from "@/lib/server/panel-users";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSessionAccount();
  if (session?.account.role !== "owner") {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  if (id === session.account.id) {
    return Response.json({ error: "You cannot change your own owner role." }, { status: 400 });
  }

  const body = (await req.json().catch(() => ({}))) as { role?: string };
  if (!body.role || !PanelUserStore.isRole(body.role) || body.role === "owner") {
    return Response.json({ error: "Role must be admin, moderator, or viewer." }, { status: 400 });
  }

  try {
    const user = await updatePanelUserRole(id, body.role);
    return Response.json({ ok: true, user });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Role update failed.";
    return Response.json({ error: message }, { status: 400 });
  }
}
