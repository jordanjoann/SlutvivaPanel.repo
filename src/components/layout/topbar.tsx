"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  BellIcon,
  LogOutIcon,
  MessageSquareIcon,
  UserIcon,
} from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { MobileNav } from "./mobile-nav";
import { CommandMenu } from "./command-menu";

export function Topbar({ username }: { username: string }) {
  return (
    <header className="sticky top-0 z-30 flex h-16 shrink-0 items-center gap-3 border-b border-border bg-background/80 px-4 backdrop-blur-md sm:px-6">
      <MobileNav />
      <div className="flex flex-1 items-center gap-3">
        <CommandMenu />
      </div>

      {/* Notifications */}
      <DropdownMenu>
        <DropdownMenuTrigger
          render={<Button variant="ghost" size="icon" aria-label="Notifications" className="relative" />}
        >
          <BellIcon />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-80 p-0">
          <div className="flex items-center justify-between px-2 py-1.5">
            <p className="text-sm font-medium">Notifications</p>
            <span className="text-xs text-muted-foreground">0</span>
          </div>
          <DropdownMenuSeparator />
          <div className="px-2 py-6 text-center text-xs text-muted-foreground">
            No notifications
          </div>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Profile */}
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              variant="ghost"
              className="h-9 gap-2 pl-1 pr-2"
              aria-label="Account menu"
            />
          }
        >
          <Avatar className="size-7">
            <AvatarFallback className="bg-primary/15 text-xs font-semibold text-primary">
              {initials(username)}
            </AvatarFallback>
          </Avatar>
          <span className="hidden text-sm font-medium sm:inline-block">{username}</span>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuLabel className="flex flex-col gap-0.5 py-1.5">
            <span className="text-sm font-medium text-foreground">{username}</span>
            <span className="text-xs font-normal text-muted-foreground">Local administrator</span>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem render={<Link href="/account" />}>
            <UserIcon /> Account
          </DropdownMenuItem>
          <DropdownMenuItem render={<Link href="/messages" />}>
            <MessageSquareIcon /> Messages
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <LogoutItem />
        </DropdownMenuContent>
      </DropdownMenu>
    </header>
  );
}

function LogoutItem() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function logout() {
    setBusy(true);
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } finally {
      router.replace("/login");
      router.refresh();
    }
  }

  return (
    <DropdownMenuItem variant="destructive" disabled={busy} onClick={logout}>
      <LogOutIcon /> Logout
    </DropdownMenuItem>
  );
}

function initials(username: string): string {
  const letters = username
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part[0])
    .join("");
  return (letters || username.slice(0, 2) || "SV").slice(0, 2).toUpperCase();
}
