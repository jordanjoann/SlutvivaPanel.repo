import { redirect } from "next/navigation";
import { LockKeyholeIcon } from "lucide-react";
import { LoginForm } from "@/components/auth/login-form";
import { getSessionAccount } from "@/lib/server/auth";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  if (await getSessionAccount()) redirect("/");

  return (
    <main className="flex min-h-dvh items-center justify-center bg-background px-4 py-10">
      <div className="w-full max-w-sm rounded-xl border border-border bg-card p-5 shadow-sm">
        <div className="mb-5 flex items-center gap-3">
          <div className="flex size-10 items-center justify-center rounded-xl bg-primary/10 text-primary ring-1 ring-primary/20">
            <LockKeyholeIcon className="size-5" />
          </div>
          <div>
            <h1 className="font-heading text-lg font-semibold">Slutvival Panel</h1>
          </div>
        </div>
        <LoginForm />
      </div>
    </main>
  );
}
