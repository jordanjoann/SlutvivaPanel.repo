import { redirect } from "next/navigation";
import { KeyRoundIcon } from "lucide-react";
import { ResetPinForm } from "@/components/auth/reset-pin-form";
import { getSessionAccount } from "@/lib/server/auth";

export const dynamic = "force-dynamic";

export default async function ResetPinPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string | string[] }>;
}) {
  if (await getSessionAccount()) redirect("/");

  const params = await searchParams;
  const token = typeof params.token === "string" ? params.token : "";

  return (
    <main className="flex min-h-dvh items-center justify-center bg-background px-4 py-10">
      <div className="w-full max-w-sm rounded-xl border border-border bg-card p-5 shadow-sm">
        <div className="mb-5 flex items-center gap-3">
          <div className="flex size-10 items-center justify-center rounded-xl bg-primary/10 text-primary ring-1 ring-primary/20">
            <KeyRoundIcon className="size-5" />
          </div>
          <div>
            <h1 className="font-heading text-lg font-semibold">Reset PIN</h1>
          </div>
        </div>
        {token ? (
          <ResetPinForm token={token} />
        ) : (
          <p className="text-sm text-muted-foreground">This reset link is missing a token.</p>
        )}
      </div>
    </main>
  );
}
