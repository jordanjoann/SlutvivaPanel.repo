import { getSessionAccount, createPanelUser, listPanelUsers, rollbackCreatedPanelUser } from "@/lib/server/auth";
import { requireEmailConfig, sendWelcomeEmail } from "@/lib/server/email";
import { PanelUserStore, type PanelRole } from "@/lib/server/panel-users";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Session = Awaited<ReturnType<typeof getSessionAccount>>;

function isOwner(session: Session): boolean {
  return session?.account.role === "owner";
}

export async function GET() {
  const session = await getSessionAccount();
  if (!isOwner(session)) return Response.json({ error: "Forbidden" }, { status: 403 });

  return Response.json({ users: await listPanelUsers() });
}

export async function POST(req: Request) {
  const session = await getSessionAccount();
  if (!isOwner(session)) return Response.json({ error: "Forbidden" }, { status: 403 });

  const body = (await req.json().catch(() => ({}))) as {
    username?: string;
    email?: string;
    role?: string;
    pin?: string;
  };
  const role = body.role;
  if (!role || !PanelUserStore.isRole(role) || role === "owner") {
    return Response.json({ error: "Role must be admin, moderator, or viewer." }, { status: 400 });
  }

  let emailConfig;
  try {
    emailConfig = requireEmailConfig();
  } catch (error) {
    const message = error instanceof Error ? error.message : "Panel email is not configured.";
    return Response.json({ error: message }, { status: 503 });
  }

  let user;
  try {
    user = await createPanelUser({
      username: body.username ?? "",
      email: body.email ?? "",
      role: role as PanelRole,
      pin: body.pin ?? "",
    });
    await sendWelcomeEmail(
      {
        to: user.email,
        loginUrl: `${emailConfig.publicUrl}/login`,
        username: user.username,
        role: user.role,
        pin: body.pin ?? "",
      },
      emailConfig,
    );
  } catch (error) {
    if (user) await rollbackCreatedPanelUser(user.id);
    const message = error instanceof Error ? error.message : "User creation failed.";
    return Response.json({ error: message }, { status: 400 });
  }

  return Response.json({ ok: true, user });
}
