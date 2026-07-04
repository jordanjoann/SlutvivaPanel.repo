import { redirect } from "next/navigation";
import { SessionAccountProvider } from "@/components/auth/session-account-provider";
import { Sidebar } from "@/components/layout/sidebar";
import { Topbar } from "@/components/layout/topbar";
import { getSessionAccount } from "@/lib/server/auth";

export default async function PanelLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSessionAccount();
  if (!session) redirect("/login");

  return (
    <SessionAccountProvider
      value={{
        authenticated: true,
        account: session.account,
        expiresAt: session.expiresAt,
      }}
    >
      <div className="flex h-dvh overflow-hidden">
        <Sidebar role={session.account.role} />
        <div className="flex min-w-0 flex-1 flex-col">
          <Topbar
            username={session.account.username}
            email={session.account.email}
            role={session.account.role}
          />
          <main className="flex-1 overflow-y-auto">
            <div className="mx-auto w-full max-w-[1600px] px-4 py-6 sm:px-6 lg:px-8">
              {children}
            </div>
          </main>
        </div>
      </div>
    </SessionAccountProvider>
  );
}
