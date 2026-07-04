"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { KeyRoundIcon, Loader2Icon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function ResetPinForm({ token }: { token: string }) {
  const router = useRouter();
  const [pin, setPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pin !== confirmPin) {
      toast.error("PIN confirmation does not match.");
      return;
    }

    setBusy(true);
    try {
      const response = await fetch("/api/auth/recovery/reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, pin }),
      });
      const data = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) throw new Error(data.error ?? "PIN reset failed.");

      toast.success("PIN reset. Sign in with the new PIN.");
      router.replace("/login");
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "PIN reset failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="grid gap-4" onSubmit={submit}>
      <div className="grid gap-1.5">
        <Label htmlFor="new-pin">New PIN</Label>
        <Input
          id="new-pin"
          type="password"
          inputMode="numeric"
          autoComplete="new-password"
          value={pin}
          onChange={(event) => setPin(event.target.value)}
          autoFocus
        />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="confirm-new-pin">Confirm PIN</Label>
        <Input
          id="confirm-new-pin"
          type="password"
          inputMode="numeric"
          autoComplete="new-password"
          value={confirmPin}
          onChange={(event) => setConfirmPin(event.target.value)}
        />
      </div>
      <Button type="submit" size="lg" disabled={busy || !token || !pin.trim() || !confirmPin.trim()}>
        {busy ? <Loader2Icon className="animate-spin" /> : <KeyRoundIcon />}
        Reset PIN
      </Button>
    </form>
  );
}
