"use client";

import useSWR from "swr";
import {
  SettingsIcon,
  FolderTreeIcon,
  ContainerIcon,
  GlobeIcon,
  HardDriveIcon,
  ShieldCheckIcon,
  RefreshCwIcon,
} from "lucide-react";
import { fetcher } from "@/lib/api";
import { PageHeader } from "@/components/panel/page-header";
import { SectionCard } from "@/components/panel/section-card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { formatMB } from "@/lib/format";

interface SystemInfo {
  paths: { root: string; games: string; vintageStory: string };
  docker: { network: string; socket: string; image: string; available: boolean };
  domains: Record<string, string>;
  runtime: string;
  platform: string;
  hostname: string;
  storage: { diskUsedMB: number; diskTotalMB: number; memUsedMB: number; memTotalMB: number };
  live: boolean;
}

export default function SettingsPage() {
  const { data } = useSWR<SystemInfo>("/api/system", fetcher, { refreshInterval: 5000 });

  if (!data) {
    return (
      <div className="flex flex-col gap-5">
        <Skeleton className="h-8 w-48" />
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-40 rounded-xl" />
        ))}
      </div>
    );
  }

  const diskPct = (data.storage.diskUsedMB / data.storage.diskTotalMB) * 100;
  const memPct = (data.storage.memUsedMB / data.storage.memTotalMB) * 100;

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="Settings"
        description="Infrastructure configuration for the Slutvival platform."
        icon={SettingsIcon}
      />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <SectionCard title="Directories" description="On-disk layout" icon={FolderTreeIcon} bodyClassName="p-0">
          <Rows
            rows={[
              ["Root", data.paths.root],
              ["Games", data.paths.games],
              ["Vintage Story", data.paths.vintageStory],
              ["Host", `${data.hostname} (${data.platform})`],
            ]}
          />
        </SectionCard>

        <SectionCard
          title="Docker"
          description="Container runtime"
          icon={ContainerIcon}
          action={
            <span
              className={cn(
                "rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset",
                data.docker.available
                  ? "bg-success/10 text-success ring-success/25"
                  : "bg-muted text-muted-foreground ring-border",
              )}
            >
              {data.docker.available ? "Connected" : "Unavailable"}
            </span>
          }
          bodyClassName="p-0"
        >
          <Rows
            rows={[
              ["Network", data.docker.network],
              ["Socket", data.docker.socket],
              ["Image", data.docker.image],
              ["Runtime mode", data.runtime],
            ]}
          />
        </SectionCard>

        <SectionCard title="Domains" description="Caddy-routed services" icon={GlobeIcon} bodyClassName="p-0">
          <Rows rows={Object.entries(data.domains).map(([k, v]) => [k, v])} link />
        </SectionCard>

        <SectionCard title="Storage" description="Host capacity" icon={HardDriveIcon}>
          <div className="flex flex-col gap-4">
            <Meter
              label="Disk"
              used={formatMB(data.storage.diskUsedMB, 0)}
              total={formatMB(data.storage.diskTotalMB, 0)}
              percent={diskPct}
            />
            <Meter
              label="Memory"
              used={formatMB(data.storage.memUsedMB, 0)}
              total={formatMB(data.storage.memTotalMB, 0)}
              percent={memPct}
            />
          </div>
        </SectionCard>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <SectionCard title="Secrets" description="Managed via environment" icon={ShieldCheckIcon}>
          <p className="text-sm text-muted-foreground">
            API tokens and passwords are read from the environment (
            <span className="font-mono text-xs">.env</span>) and are{" "}
            <span className="font-medium text-foreground">never exposed</span> to the browser or
            written to logs. See{" "}
            <span className="font-mono text-xs">.env.example</span> for the full list.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {["PANEL_SESSION_SECRET", "DISCORD_TOKEN", "CLOUDFLARE_API_TOKEN", "GITHUB_TOKEN"].map(
              (s) => (
                <span
                  key={s}
                  className="rounded-lg border border-border bg-muted/40 px-2.5 py-1 font-mono text-[11px] text-muted-foreground"
                >
                  {s}
                </span>
              ),
            )}
          </div>
        </SectionCard>

        <SectionCard title="Updates" description="Panel version" icon={RefreshCwIcon}>
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-sm font-medium">Slutvival Panel</p>
              <p className="text-xs text-muted-foreground">v0.1.0 · up to date</p>
            </div>
            <Button variant="outline" size="sm">
              <RefreshCwIcon /> Check for updates
            </Button>
          </div>
        </SectionCard>
      </div>
    </div>
  );
}

function Rows({ rows, link }: { rows: [string, string][]; link?: boolean }) {
  return (
    <div className="divide-y divide-border">
      {rows.map(([k, v]) => (
        <div key={k} className="flex items-center gap-3 px-4 py-2.5 text-sm">
          <span className="w-32 shrink-0 capitalize text-muted-foreground">{k}</span>
          {link ? (
            <a
              href={`https://${v}`}
              target="_blank"
              rel="noreferrer"
              className="truncate font-mono text-xs text-primary hover:underline"
            >
              {v}
            </a>
          ) : (
            <span className="truncate font-mono text-xs text-foreground">{v}</span>
          )}
        </div>
      ))}
    </div>
  );
}

function Meter({
  label,
  used,
  total,
  percent,
}: {
  label: string;
  used: string;
  total: string;
  percent: number;
}) {
  return (
    <div>
      <div className="flex items-center justify-between text-sm">
        <span className="text-muted-foreground">{label}</span>
        <span className="tabular-nums">
          {used} / {total}
        </span>
      </div>
      <div className="mt-2 h-2 overflow-hidden rounded-full bg-muted">
        <div
          className={cn(
            "h-full rounded-full",
            percent >= 90 ? "bg-destructive" : percent >= 75 ? "bg-warning" : "bg-primary",
          )}
          style={{ width: `${Math.max(2, Math.min(100, percent))}%` }}
        />
      </div>
    </div>
  );
}
