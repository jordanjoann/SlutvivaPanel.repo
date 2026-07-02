import { redirect } from "next/navigation";
import { UserIcon } from "lucide-react";
import { AccountForm } from "@/components/auth/account-form";
import { PageHeader } from "@/components/panel/page-header";
import { SectionCard } from "@/components/panel/section-card";
import { getSessionAccount } from "@/lib/server/auth";

export const dynamic = "force-dynamic";

export default async function AccountPage() {
  const session = await getSessionAccount();
  if (!session) redirect("/login");

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Account"
        description="Update your panel username and PIN."
        icon={UserIcon}
      />
      <SectionCard title="Login details" description="Changes apply to this local panel account.">
        <AccountForm username={session.account.username} />
      </SectionCard>
    </div>
  );
}
