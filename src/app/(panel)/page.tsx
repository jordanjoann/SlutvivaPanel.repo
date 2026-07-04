import { redirect } from "next/navigation";
import { LimitedDashboard } from "@/components/panel/limited-dashboard";
import { OwnerDashboard } from "@/components/panel/owner-dashboard";
import { getSessionAccount } from "@/lib/server/auth";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const session = await getSessionAccount();
  if (!session) redirect("/login");
  return session.account.role === "owner" ? <OwnerDashboard /> : <LimitedDashboard />;
}
