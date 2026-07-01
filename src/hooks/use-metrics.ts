"use client";

import { useEffect, useState } from "react";
import useSWR from "swr";
import { fetcher } from "@/lib/api";
import { useEventStream } from "./use-event-stream";
import type { HostMetrics, MetricPoint } from "@/lib/types";

function toPoint(m: HostMetrics): MetricPoint {
  return {
    t: m.t,
    cpu: m.cpuPercent,
    mem: Math.round((m.memUsedMB / m.memTotalMB) * 1000) / 10,
    netRx: m.netRxKBs,
    netTx: m.netTxKBs,
    diskRead: m.diskReadKBs,
    diskWrite: m.diskWriteKBs,
  };
}

export function useHostMetrics() {
  const { data } = useSWR<{ host: HostMetrics; history: MetricPoint[] }>(
    "/api/metrics",
    fetcher,
    { revalidateOnFocus: false },
  );
  const [host, setHost] = useState<HostMetrics | null>(null);
  const [history, setHistory] = useState<MetricPoint[]>([]);

  useEffect(() => {
    if (data) {
      setHost((h) => h ?? data.host);
      setHistory((hi) => (hi.length ? hi : data.history));
    }
  }, [data]);

  const { connected } = useEventStream("/api/metrics/stream", {
    metrics: (d) => {
      const m = d as HostMetrics;
      setHost(m);
      setHistory((prev) => [...prev, toPoint(m)].slice(-120));
    },
  });

  return { host, history, connected };
}
