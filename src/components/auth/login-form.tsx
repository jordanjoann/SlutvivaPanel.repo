"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2Icon, LogInIcon, MailIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function LoginForm() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);
  const [recoveryOpen, setRecoveryOpen] = useState(false);
  const [recoveryIdentifier, setRecoveryIdentifier] = useState("");
  const [recoveryBusy, setRecoveryBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, pin }),
      });
      const data = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) throw new Error(data.error ?? "Login failed.");

      router.replace("/");
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Login failed.");
    } finally {
      setBusy(false);
    }
  }

  async function requestRecovery(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const identifier = recoveryIdentifier.trim();
    if (!identifier) {
      toast.error("Username or email is required.");
      return;
    }

    setRecoveryBusy(true);
    try {
      const response = await fetch("/api/auth/recovery/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ identifier }),
      });
      const data = (await response.json().catch(() => ({}))) as {
        message?: string;
        error?: string;
      };
      if (!response.ok) throw new Error(data.error ?? "PIN recovery failed.");

      toast.success(data.message ?? "Recovery email requested.");
      setRecoveryOpen(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "PIN recovery failed.");
    } finally {
      setRecoveryBusy(false);
    }
  }

  return (
    <>
      <form className="grid gap-4" onSubmit={submit}>
        <div className="grid gap-1.5">
          <Label htmlFor="username">Username</Label>
          <Input
            id="username"
            autoComplete="username"
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            autoFocus
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="pin">PIN</Label>
          <Input
            id="pin"
            type="password"
            inputMode="numeric"
            autoComplete="current-password"
            value={pin}
            onChange={(event) => setPin(event.target.value)}
          />
        </div>
        <Button type="submit" size="lg" disabled={busy || !username.trim() || !pin.trim()}>
          {busy ? <Loader2Icon className="animate-spin" /> : <LogInIcon />}
          Sign in
        </Button>
        <Button
          type="button"
          variant="ghost"
          onClick={() => {
            setRecoveryIdentifier(username);
            setRecoveryOpen(true);
          }}
        >
          Forgot PIN
        </Button>
      </form>
      <Dialog open={recoveryOpen} onOpenChange={setRecoveryOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reset PIN</DialogTitle>
            <DialogDescription>Send a reset link to the email stored on your account.</DialogDescription>
          </DialogHeader>
          <form className="grid gap-4" onSubmit={requestRecovery}>
            <div className="grid gap-1.5">
              <Label htmlFor="recovery-identifier">Username or email</Label>
              <Input
                id="recovery-identifier"
                autoComplete="username"
                value={recoveryIdentifier}
                onChange={(event) => setRecoveryIdentifier(event.target.value)}
              />
            </div>
            <DialogFooter className="mx-0 mb-0 rounded-none border-0 bg-transparent p-0">
              <Button type="submit" disabled={recoveryBusy || !recoveryIdentifier.trim()}>
                {recoveryBusy ? <Loader2Icon className="animate-spin" /> : <MailIcon />}
                Send reset link
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
