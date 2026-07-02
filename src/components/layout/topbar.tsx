"use client";

import * as React from "react";
import { toast } from "sonner";
import {
  BellIcon,
  LogOutIcon,
  SettingsIcon,
  UserIcon,
  LifeBuoyIcon,
  Trash2Icon,
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
import { cn } from "@/lib/utils";

type PanelNotification = {
  id: string;
  title: string;
  detail: string;
  unread: boolean;
};

const INITIAL_NOTIFICATIONS: PanelNotification[] = [
  { id: "main-started", title: "Main server started", detail: "Aurora world loaded · just now", unread: true },
  { id: "backup-completed", title: "Backup completed", detail: "Skyblock restore point · 1h ago", unread: true },
  { id: "mod-update", title: "Mod update available", detail: "XSkills 0.8.9 · 3h ago", unread: false },
];

export function Topbar() {
  const [notifications, setNotifications] = React.useState(INITIAL_NOTIFICATIONS);
  const [newlyViewedIds, setNewlyViewedIds] = React.useState<Set<string>>(new Set());
  const unread = notifications.filter((n) => n.unread).length;

  function handleNotificationsOpenChange(open: boolean) {
    if (open) {
      const unreadIds = notifications
        .filter((notification) => notification.unread)
        .map((notification) => notification.id);
      setNewlyViewedIds(new Set(unreadIds));
      if (unreadIds.length > 0) {
        setNotifications((current) =>
          current.map((notification) => ({ ...notification, unread: false })),
        );
      }
    } else {
      setNewlyViewedIds(new Set());
    }
  }

  function clearNotifications() {
    setNotifications([]);
    setNewlyViewedIds(new Set());
    toast.success("Notifications cleared");
  }

  return (
    <header className="sticky top-0 z-30 flex h-16 shrink-0 items-center gap-3 border-b border-border bg-background/80 px-4 backdrop-blur-md sm:px-6">
      <MobileNav />
      <div className="flex flex-1 items-center gap-3">
        <CommandMenu />
      </div>

      {/* Notifications */}
      <DropdownMenu onOpenChange={handleNotificationsOpenChange}>
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
        <DropdownMenuContent align="end" className="w-80 p-0">
          <div className="flex items-center justify-between px-2 py-1.5">
            <p className="text-sm font-medium">Notifications</p>
            <span className="text-xs text-muted-foreground">{notifications.length}</span>
          </div>
          <DropdownMenuSeparator />
          {notifications.length === 0 ? (
            <div className="px-2 py-6 text-center text-xs text-muted-foreground">
              No notifications
            </div>
          ) : (
            notifications.map((n) => (
              <DropdownMenuItem key={n.id} className="flex-col items-start gap-0.5 px-2 py-2">
                <div className="flex w-full items-center gap-2">
                  <span
                    className={cn(
                      "size-1.5 shrink-0 rounded-full",
                      newlyViewedIds.has(n.id) ? "bg-primary" : "bg-transparent",
                    )}
                  />
                  <span className="text-sm font-medium">{n.title}</span>
                </div>
                <span className="pl-3.5 text-xs text-muted-foreground">{n.detail}</span>
              </DropdownMenuItem>
            ))
          )}
          <DropdownMenuSeparator />
          <div className="p-1">
            <button
              type="button"
              className="flex h-8 w-full items-center justify-center gap-1.5 rounded-md text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-50"
              disabled={notifications.length === 0}
              onClick={clearNotifications}
            >
              <Trash2Icon className="size-3.5" />
              Clear
            </button>
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
