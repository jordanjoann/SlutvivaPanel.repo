"use client";

import { toast } from "sonner";
import {
  BellIcon,
  LogOutIcon,
  SettingsIcon,
  UserIcon,
  LifeBuoyIcon,
  CheckCheckIcon,
} from "lucide-react";
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

const NOTIFICATIONS = [
  { title: "Main server started", detail: "Aurora world loaded · just now", unread: true },
  { title: "Backup completed", detail: "Skyblock nightly backup · 1h ago", unread: true },
  { title: "Mod update available", detail: "XSkills 0.8.9 · 3h ago", unread: false },
];

export function Topbar() {
  const unread = NOTIFICATIONS.filter((n) => n.unread).length;

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
          {unread > 0 && (
            <span className="absolute right-1.5 top-1.5 flex size-2">
              <span className="size-2 rounded-full bg-primary ring-2 ring-background" />
            </span>
          )}
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-80">
          <div className="flex items-center justify-between px-2 py-1.5">
            <p className="text-sm font-medium">Notifications</p>
            <button
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
              onClick={() => toast.success("Marked all as read")}
            >
              <CheckCheckIcon className="size-3.5" /> Mark all read
            </button>
          </div>
          <DropdownMenuSeparator />
          {NOTIFICATIONS.map((n, i) => (
            <DropdownMenuItem key={i} className="flex-col items-start gap-0.5 py-2">
              <div className="flex w-full items-center gap-2">
                {n.unread && <span className="size-1.5 rounded-full bg-primary" />}
                <span className="text-sm font-medium">{n.title}</span>
              </div>
              <span className="pl-0 text-xs text-muted-foreground">{n.detail}</span>
            </DropdownMenuItem>
          ))}
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
              SV
            </AvatarFallback>
          </Avatar>
          <span className="hidden text-sm font-medium sm:inline-block">Owner</span>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuLabel className="flex flex-col gap-0.5 py-1.5">
            <span className="text-sm font-medium text-foreground">Owner</span>
            <span className="text-xs font-normal text-muted-foreground">
              admin@panel.slutvival.com
            </span>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => toast.info("Profile — coming soon")}>
            <UserIcon /> Profile
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => toast.info("Settings — coming soon")}>
            <SettingsIcon /> Settings
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => toast.info("Support — coming soon")}>
            <LifeBuoyIcon /> Support
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            variant="destructive"
            onClick={() => toast.success("Signed out (auth coming in a future release)")}
          >
            <LogOutIcon /> Log out
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </header>
  );
}
