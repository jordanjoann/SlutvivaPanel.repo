"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { SearchIcon } from "lucide-react";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { visibleNavForRole } from "@/lib/nav";
import { useInstances } from "@/hooks/use-instances";
import { StatusDot } from "@/components/panel/status-badge";
import type { PanelRole } from "@/lib/server/panel-users";

export function CommandMenu({ role }: { role: PanelRole }) {
  const [open, setOpen] = React.useState(false);
  const router = useRouter();
  const { data: instances } = useInstances(role === "owner" ? "vintage-story" : null);
  const visibleNav = visibleNavForRole(role);

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const go = (href: string) => {
    setOpen(false);
    router.push(href);
  };

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex h-9 w-full items-center gap-2 rounded-lg border border-border bg-card/60 px-3 text-sm text-muted-foreground transition-colors hover:bg-card hover:text-foreground sm:w-64"
      >
        <SearchIcon className="size-4" />
        <span className="flex-1 text-left">Search…</span>
        <kbd className="hidden rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground sm:inline-block">
          ⌘K
        </kbd>
      </button>

      <CommandDialog open={open} onOpenChange={setOpen}>
        <CommandInput placeholder="Search servers and pages…" />
        <CommandList>
          <CommandEmpty>No results found.</CommandEmpty>
          {role === "owner" && instances && instances.length > 0 && (
            <CommandGroup heading="Vintage Story servers">
              {instances.map((inst) => (
                <CommandItem
                  key={inst.id}
                  value={`server ${inst.name} ${inst.id}`}
                  onSelect={() => go(`/vintage-story/${inst.id}`)}
                >
                  <StatusDot status={inst.state.status} />
                  <span>{inst.name}</span>
                  <span className="ml-auto text-xs text-muted-foreground">
                    {inst.group}
                  </span>
                </CommandItem>
              ))}
            </CommandGroup>
          )}
          <CommandGroup heading="Navigation">
            {visibleNav.flatMap((g) => g.items).map((item) => (
              <CommandItem
                key={item.href}
                value={`page ${item.label}`}
                onSelect={() => go(item.href)}
              >
                <item.icon />
                <span>{item.label}</span>
                {item.badge && (
                  <span className="ml-auto text-xs text-muted-foreground">{item.badge}</span>
                )}
              </CommandItem>
            ))}
          </CommandGroup>
        </CommandList>
      </CommandDialog>
    </>
  );
}
