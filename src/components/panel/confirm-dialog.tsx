"use client";

import * as React from "react";
import { AlertTriangleIcon, Loader2Icon } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogMedia,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export interface ConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: React.ReactNode;
  description?: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  /** If set, the user must type this exact phrase to enable confirm. */
  confirmPhrase?: string;
  onConfirm: () => void | Promise<void>;
}

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  destructive,
  confirmPhrase,
  onConfirm,
}: ConfirmDialogProps) {
  const [busy, setBusy] = React.useState(false);
  const [phrase, setPhrase] = React.useState("");

  function handleOpenChange(nextOpen: boolean) {
    if (!nextOpen) {
      setPhrase("");
      setBusy(false);
    }
    onOpenChange(nextOpen);
  }

  const phraseOk = !confirmPhrase || phrase.trim() === confirmPhrase;

  async function handleConfirm() {
    if (!phraseOk) return;
    try {
      setBusy(true);
      await onConfirm();
      handleOpenChange(false);
    } finally {
      setBusy(false);
    }
  }

  return (
    <AlertDialog open={open} onOpenChange={handleOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          {destructive && (
            <AlertDialogMedia className="bg-destructive/10 text-destructive">
              <AlertTriangleIcon />
            </AlertDialogMedia>
          )}
          <AlertDialogTitle>{title}</AlertDialogTitle>
          {description && <AlertDialogDescription>{description}</AlertDialogDescription>}
        </AlertDialogHeader>

        {confirmPhrase && (
          <div className="grid gap-2">
            <Label htmlFor="confirm-phrase" className="text-xs text-muted-foreground">
              Type <span className="font-mono font-semibold text-foreground">{confirmPhrase}</span> to confirm
            </Label>
            <Input
              id="confirm-phrase"
              value={phrase}
              autoComplete="off"
              onChange={(e) => setPhrase(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleConfirm()}
            />
          </div>
        )}

        <AlertDialogFooter>
          <AlertDialogCancel disabled={busy}>{cancelLabel}</AlertDialogCancel>
          <AlertDialogAction
            variant={destructive ? "destructive" : "default"}
            disabled={busy || !phraseOk}
            onClick={(e) => {
              e.preventDefault();
              handleConfirm();
            }}
          >
            {busy && <Loader2Icon className="animate-spin" />}
            {confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

/** Small hook to drive a single confirm dialog imperatively. */
export function useConfirm() {
  const [state, setState] = React.useState<
    (Omit<ConfirmDialogProps, "open" | "onOpenChange"> & { open: boolean }) | null
  >(null);

  const confirm = React.useCallback(
    (opts: Omit<ConfirmDialogProps, "open" | "onOpenChange">) => {
      setState({ ...opts, open: true });
    },
    [],
  );

  const node = state ? (
    <ConfirmDialog
      {...state}
      open={state.open}
      onOpenChange={(o) => setState((s) => (s ? { ...s, open: o } : s))}
    />
  ) : null;

  return { confirm, node };
}
