"use client";

import useSWR from "swr";
import { api } from "@/lib/api";
import type { InstanceWithState } from "@/lib/types";

export function useInstances(game = "vintage-story") {
  return useSWR<InstanceWithState[]>(
    ["instances", game],
    () => api.instances.list(game),
    { refreshInterval: 5000, keepPreviousData: true },
  );
}

export function useInstance(id: string | null) {
  return useSWR<InstanceWithState>(
    id ? ["instance", id] : null,
    () => api.instances.get(id as string),
    { refreshInterval: 4000, keepPreviousData: true },
  );
}
