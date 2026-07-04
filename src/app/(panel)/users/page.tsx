import { redirect } from "next/navigation";
import { UsersIcon } from "lucide-react";
import { PageHeader } from "@/components/panel/page-header";
import { SectionCard } from "@/components/panel/section-card";
import { UsersManager } from "@/components/users/users-manager";
import { getSessionAccount, listPanelUsers } from "@/lib/server/auth";

export const dynamic = "force-dynamic";

export default async function UsersPage() {
  const session = await getSessionAccount();
  if (!session) redirect("/login");
  if (session.account.role !== "owner") redirect("/");

  const users = await listPanelUsers();
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Users & Roles" description="Create panel users and assign initial roles." icon={UsersIcon} />
      <SectionCard>
        <UsersManager users={users} currentUserId={session.account.id} />
      </SectionCard>
    </div>
  );
}
