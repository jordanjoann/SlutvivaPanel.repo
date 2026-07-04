"use client";

import { SWRConfig } from "swr";
import type { PanelUser } from "@/lib/server/panel-users";

type SessionResponse = {
  authenticated: boolean;
  account: PanelUser | null;
  expiresAt: number | null;
};

export function SessionAccountProvider({
  value,
  children,
}: {
  value: SessionResponse;
  children: React.ReactNode;
}) {
  return (
    <SWRConfig value={{ fallback: { "/api/auth/session": value } }}>
      {children}
    </SWRConfig>
  );
}
