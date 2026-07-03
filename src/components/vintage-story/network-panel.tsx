"use client";

import useSWR, { useSWRConfig } from "swr";
import { Loader2Icon, NetworkIcon, PlayIcon, RefreshCwIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { api } from "@/lib/api";

export function VintageNetworkPanel() {
  const { mutate } = useSWRConfig();
  const { data, isLoading } = useSWR("vintage-story-network", api.vintageStory.network.status, {
    refreshInterval: 5000,
  });

  async function setup() {
    try {
      await api.vintageStory.network.setup();
      await mutate("vintage-story-network");
      await mutate((key) => Array.isArray(key) && key[0] === "instances");
      toast.success("Vintage Story network setup complete");
    } catch (error) {
      toast.error("Network setup failed", {
        description: error instanceof Error ? error.message : undefined,
      });
    }
  }

  const ready =
    data?.hubExists &&
    data.stratumInstalled &&
    data.nimbusInstalled &&
    data.nimbusConfigured &&
    data.nimbusProxyRunning;

  return (
    <Card className="p-4">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <NetworkIcon className="size-4 text-primary" />
            <h2 className="font-heading text-sm font-semibold text-foreground">
              Vintage Story Network
            </h2>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            {data?.publicAddress ?? "play.slutvival.com:42420"}
          </p>
        </div>
        <Button onClick={setup} disabled={isLoading}>
          {isLoading ? <Loader2Icon className="animate-spin" /> : ready ? <RefreshCwIcon /> : <PlayIcon />}
          {ready ? "Repair Setup" : "Set Up Network"}
        </Button>
      </div>
      <div className="mt-4 grid gap-2 text-xs text-muted-foreground sm:grid-cols-2 lg:grid-cols-5">
        <Status label="Hub" value={Boolean(data?.hubExists)} />
        <Status label="Stratum" value={Boolean(data?.stratumInstalled)} />
        <Status label="Nimbus" value={Boolean(data?.nimbusInstalled)} />
        <Status label="Config" value={Boolean(data?.nimbusConfigured)} />
        <Status label="Proxy" value={Boolean(data?.nimbusProxyRunning)} />
      </div>
    </Card>
  );
}

function Status({ label, value }: { label: string; value: boolean }) {
  return (
    <div className="flex items-center justify-between rounded-md bg-muted/40 px-3 py-2">
      <span>{label}</span>
      <span className={value ? "text-emerald-500" : "text-muted-foreground"}>
        {value ? "Ready" : "Missing"}
      </span>
    </div>
  );
}
