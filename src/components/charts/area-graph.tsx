"use client";

import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { MetricPoint } from "@/lib/types";
import { formatClock } from "@/lib/format";

export interface Series {
  key: string;
  label: string;
  /** CSS color, typically var(--chart-N). */
  color: string;
}

export function AreaGraph({
  data,
  series,
  height = 220,
  unit = "",
  yDomain,
  yTicks,
}: {
  data: MetricPoint[];
  series: Series[];
  height?: number;
  unit?: string;
  yDomain?: [number | "auto", number | "auto"];
  yTicks?: number[];
}) {
  return (
    <div style={{ height }} className="w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -12 }}>
          <defs>
            {series.map((s) => (
              <linearGradient key={s.key} id={`grad-${s.key}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={s.color} stopOpacity={0.35} />
                <stop offset="100%" stopColor={s.color} stopOpacity={0.02} />
              </linearGradient>
            ))}
          </defs>
          <CartesianGrid
            strokeDasharray="3 3"
            stroke="var(--border)"
            vertical={false}
          />
          <XAxis
            dataKey="t"
            tickFormatter={(t) => formatClock(t).slice(0, 5)}
            tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
            tickLine={false}
            axisLine={false}
            minTickGap={40}
          />
          <YAxis
            tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
            tickLine={false}
            axisLine={false}
            width={44}
            domain={yDomain}
            ticks={yTicks}
            tickFormatter={(v) => `${v}${unit}`}
          />
          <Tooltip
            content={({ active, payload, label }) => {
              if (!active || !payload?.length) return null;
              return (
                <div className="rounded-lg border border-border bg-popover/95 px-3 py-2 text-xs shadow-panel backdrop-blur">
                  <p className="mb-1 font-medium text-muted-foreground">
                    {formatClock(label as number)}
                  </p>
                  {payload.map((p) => {
                    const key = String(p.dataKey);
                    return (
                      <div key={key} className="flex items-center gap-2">
                        <span
                          className="size-2 rounded-full"
                          style={{ background: p.color }}
                        />
                        <span className="text-foreground">
                          {series.find((s) => s.key === key)?.label ?? key}
                        </span>
                        <span className="ml-auto font-medium tabular-nums">
                          {typeof p.value === "number" ? p.value.toFixed(1) : p.value}
                          {unit}
                        </span>
                      </div>
                    );
                  })}
                </div>
              );
            }}
          />
          {series.map((s) => (
            <Area
              key={s.key}
              type="monotone"
              dataKey={s.key}
              stroke={s.color}
              strokeWidth={2}
              fill={`url(#grad-${s.key})`}
              isAnimationActive={false}
              dot={false}
            />
          ))}
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
