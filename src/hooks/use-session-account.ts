"use client";

import useSWR from "swr";
import { fetcher } from "@/lib/api";
import type { PanelUser } from "@/lib/server/panel-users";

type SessionResponse = {
  authenticated: boolean;
  account: PanelUser | null;
  expiresAt: number | null;
};

export function useSessionAccount() {
  const session = useSWR<SessionResponse>(
    "/api/auth/session",
    () => fetcher<SessionResponse>("/api/auth/session"),
    { refreshInterval: 30_000 },
  );

  return {
    ...session,
    account: session.data?.account ?? null,
    role: session.data?.account?.role,
  };
}
