"use client";

import Link from "next/link";
import { useParams, usePathname } from "next/navigation";
import {
  ChevronLeftIcon,
  MoreVerticalIcon,
  ZapOffIcon,
  CopyIcon,
  PlugIcon,
  ClockIcon,
} from "lucide-react";
import { useInstance } from "@/hooks/use-instances";
import { usePower } from "@/hooks/use-power";
import { useSessionAccount } from "@/hooks/use-session-account";
import { serverTabsForRole } from "@/lib/access";
import { cn } from "@/lib/utils";
import { StatusBadge } from "@/components/panel/status-badge";
import { PowerControls } from "@/components/panel/power-controls";
import { useConfirm } from "@/components/panel/confirm-dialog";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { formatDuration } from "@/lib/format";
import type { PowerAction } from "@/lib/types";
import { toast } from "sonner";

const LIMITED_POWER_ACTIONS: PowerAction[] = ["start", "restart"];

export default function ServerLayout({ children }: { children: React.ReactNode }) {
  const { id } = useParams<{ id: string }>();
  const pathname = usePathname();
  const { role } = useSessionAccount();
  const { data: instance } = useInstance(id);
  const { run } = usePower(id);
  const { confirm, node } = useConfirm();

  const base = `/vintage-story/${id}`;
  const status = instance?.state.status ?? "unknown";
  const isOwner = role === "owner";
  const tabs = serverTabsForRole(role);

  return (
    <div className="flex flex-col gap-5">
      {node}
      {/* Breadcrumb + header */}
      <div className="flex flex-col gap-4">
        <Link
          href="/vintage-story"
          className="inline-flex w-fit items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ChevronLeftIcon className="size-4" /> Vintage Story
        </Link>

        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-3 min-w-0">
            {instance ? (
              <>
                <div className="min-w-0">
                  <div className="flex items-center gap-3">
                    <h1 className="truncate font-heading text-xl font-semibold tracking-tight">
                      {instance.name}
                    </h1>
                    <StatusBadge status={status} />
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                    <span className="inline-flex items-center gap-1.5">
                      Vintage Story <span className="font-mono">v{instance.version}</span>
                    </span>
                    <span className="inline-flex items-center gap-1.5">
                      <PlugIcon className="size-3.5" /> Port {instance.port}
                    </span>
                    <span className="inline-flex items-center gap-1.5">
                      <ClockIcon className="size-3.5" />
                      {instance.state.status === "running"
                        ? `Up ${formatDuration(instance.state.uptimeSeconds)}`
                        : "Offline"}
                    </span>
                  </div>
                </div>
              </>
            ) : (
              <div className="flex flex-col gap-2">
                <Skeleton className="h-6 w-48" />
                <Skeleton className="h-3 w-64" />
              </div>
            )}
          </div>

          <div className="flex items-center gap-2">
            <PowerControls
              id={id}
              status={status}
              allowedActions={isOwner ? undefined : LIMITED_POWER_ACTIONS}
            />
            {isOwner && (
              <DropdownMenu>
                <DropdownMenuTrigger
                  render={<Button variant="outline" size="icon" aria-label="More actions" />}
                >
                  <MoreVerticalIcon />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-52">
                  <DropdownMenuItem
                    onClick={() => {
                      navigator.clipboard?.writeText(instance?.dataPath ?? "");
                      toast.success("Data path copied");
                    }}
                  >
                    <CopyIcon /> Copy data path
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    variant="destructive"
                    onClick={() =>
                      confirm({
                        title: "Force kill server?",
                        description:
                          "This immediately terminates the process without saving. Unsaved world changes may be lost.",
                        confirmLabel: "Force kill",
                        destructive: true,
                        onConfirm: () => run("kill"),
                      })
                    }
                  >
                    <ZapOffIcon /> Force kill
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
        </div>
      </div>

      {/* Tab navigation */}
      <div className="no-scrollbar -mx-1 overflow-x-auto border-b border-border">
        <nav className="flex min-w-max items-center gap-1 px-1">
          {tabs.map((tab) => {
            const href = tab.segment ? `${base}/${tab.segment}` : base;
            const active = pathname === href;
            const danger = "danger" in tab && tab.danger;
            return (
              <Link
                key={tab.key}
                href={href}
                className={cn(
                  "relative whitespace-nowrap px-3 py-2.5 text-sm font-medium transition-colors",
                  active
                    ? danger
                      ? "text-destructive"
                      : "text-foreground"
                    : danger
                      ? "text-destructive/70 hover:text-destructive"
                      : "text-muted-foreground hover:text-foreground",
                )}
              >
                {tab.label}
                {active && (
                  <span
                    className={cn(
                      "absolute inset-x-2 -bottom-px h-0.5 rounded-full",
                      danger ? "bg-destructive" : "bg-primary",
                    )}
                  />
                )}
              </Link>
            );
          })}
        </nav>
      </div>

      <div className="animate-in-fade">{children}</div>
    </div>
  );
}
