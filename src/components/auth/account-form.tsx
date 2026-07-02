"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2Icon, SaveIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function AccountForm({ username: initialUsername }: { username: string }) {
  const router = useRouter();
  const [username, setUsername] = useState(initialUsername);
  const [pin, setPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pin || confirmPin) {
      if (pin !== confirmPin) {
        toast.error("PIN confirmation does not match.");
        return;
      }
    }

    setBusy(true);
    try {
      const response = await fetch("/api/auth/account", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, pin: pin || undefined }),
      });
      const data = (await response.json().catch(() => ({}))) as {
        account?: { username: string };
        error?: string;
      };
      if (!response.ok) throw new Error(data.error ?? "Account update failed.");

      setUsername(data.account?.username ?? username);
      setPin("");
      setConfirmPin("");
      toast.success("Account updated");
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Account update failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="grid max-w-md gap-4" onSubmit={submit}>
      <div className="grid gap-1.5">
        <Label htmlFor="account-username">Username</Label>
        <Input
          id="account-username"
          autoComplete="username"
          value={username}
          onChange={(event) => setUsername(event.target.value)}
        />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="account-pin">New PIN</Label>
        <Input
          id="account-pin"
          type="password"
          inputMode="numeric"
          autoComplete="new-password"
          value={pin}
          onChange={(event) => setPin(event.target.value)}
        />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="account-pin-confirm">Confirm PIN</Label>
        <Input
          id="account-pin-confirm"
          type="password"
          inputMode="numeric"
          autoComplete="new-password"
          value={confirmPin}
          onChange={(event) => setConfirmPin(event.target.value)}
        />
      </div>
      <Button type="submit" className="w-fit" disabled={busy || !username.trim()}>
        {busy ? <Loader2Icon className="animate-spin" /> : <SaveIcon />}
        Save changes
      </Button>
    </form>
  );
}
