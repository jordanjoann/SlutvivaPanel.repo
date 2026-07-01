"use client";

import { useState } from "react";
import { useSWRConfig } from "swr";
import { toast } from "sonner";
import { api } from "@/lib/api";
import type { PowerAction } from "@/lib/types";

const VERB: Record<PowerAction, string> = {
  start: "Starting",
  stop: "Stopping",
  restart: "Restarting",
  kill: "Killing",
};

export function usePower(id: string) {
  const [busy, setBusy] = useState<PowerAction | null>(null);
  const { mutate } = useSWRConfig();

  async function run(action: PowerAction) {
    try {
      setBusy(action);
      await api.instances.power(id, action);
      toast.success(`${VERB[action]} server…`);
      // Revalidate anything referencing instances or this server.
      await mutate(
        (key) =>
          Array.isArray(key) &&
          (key[0] === "instances" || (key[0] === "instance" && key[1] === id)),
      );
    } catch (e) {
      toast.error(`Failed to ${action} server`, {
        description: e instanceof Error ? e.message : undefined,
      });
    } finally {
      setBusy(null);
    }
  }

  return { busy, run };
}
