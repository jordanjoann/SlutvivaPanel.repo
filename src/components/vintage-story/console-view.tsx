"use client";

import * as React from "react";
import { toast } from "sonner";
import {
  SearchIcon,
  ArrowDownIcon,
  Trash2Icon,
  SendHorizonalIcon,
  PauseIcon,
  PlayIcon,
  FilterIcon,
} from "lucide-react";
import { api } from "@/lib/api";
import { useEventStream } from "@/hooks/use-event-stream";
import { cn } from "@/lib/utils";
import { QuickCommands } from "@/components/vintage-story/quick-commands";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { ConsoleLine, LogLevel } from "@/lib/types";

const LEVEL_STYLE: Record<LogLevel, string> = {
  debug: "text-muted-foreground",
  info: "text-foreground/85",
  notification: "text-primary",
  warning: "text-warning",
  error: "text-destructive",
};

const LEVELS: LogLevel[] = ["debug", "info", "notification", "warning", "error"];
const MAX_LINES = 2000;

function displayLineText(line: ConsoleLine): string {
  if (line.stream !== "command") return line.text;
  return line.text.replace(/^>\s*/, "");
}

export function ConsoleView({ id }: { id: string }) {
  const [lines, setLines] = React.useState<ConsoleLine[]>([]);
  const [search, setSearch] = React.useState("");
  const [levels, setLevels] = React.useState<Set<LogLevel>>(new Set(LEVELS));
  const [autoscroll, setAutoscroll] = React.useState(true);
  const [input, setInput] = React.useState("");
  const [sending, setSending] = React.useState(false);

  const lastId = React.useRef(-1);
  const scrollRef = React.useRef<HTMLDivElement>(null);
  const history = React.useRef<string[]>([]);
  const histIndex = React.useRef(-1);

  const { connected } = useEventStream(`/api/instances/${id}/console/stream`, {
    line: (d) => {
      const line = d as ConsoleLine;
      if (line.id <= lastId.current) return;
      lastId.current = line.id;
      setLines((prev) => {
        const next = prev.length >= MAX_LINES ? prev.slice(-MAX_LINES + 200) : prev;
        return [...next, line];
      });
    },
  });

  // Auto-scroll to bottom on new lines unless paused.
  React.useEffect(() => {
    if (autoscroll && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [lines, autoscroll]);

  function onScroll() {
    const el = scrollRef.current;
    if (!el) return;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
    if (atBottom !== autoscroll) setAutoscroll(atBottom);
  }

  const filtered = React.useMemo(() => {
    const q = search.toLowerCase();
    return lines.filter(
      (l) => levels.has(l.level) && (!q || displayLineText(l).toLowerCase().includes(q)),
    );
  }, [lines, search, levels]);

  async function send() {
    const cmd = input.trim();
    if (!cmd) return;
    try {
      setSending(true);
      await api.instances.command(id, cmd);
      history.current = [cmd, ...history.current.filter((c) => c !== cmd)].slice(0, 50);
      histIndex.current = -1;
      setInput("");
    } catch (e) {
      toast.error("Command failed", {
        description: e instanceof Error ? e.message : undefined,
      });
    } finally {
      setSending(false);
    }
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      e.preventDefault();
      send();
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      if (histIndex.current < history.current.length - 1) {
        histIndex.current++;
        setInput(history.current[histIndex.current] ?? "");
      }
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      if (histIndex.current > 0) {
        histIndex.current--;
        setInput(history.current[histIndex.current] ?? "");
      } else {
        histIndex.current = -1;
        setInput("");
      }
    }
  }

  function toggleLevel(l: LogLevel) {
    setLevels((prev) => {
      const next = new Set(prev);
      if (next.has(l)) next.delete(l);
      else next.add(l);
      return next;
    });
  }

  return (
    <div className="flex flex-col overflow-hidden rounded-xl border border-border bg-card">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2 border-b border-border p-2.5">
        <div className="relative w-full min-w-36 sm:w-56 sm:flex-none lg:w-64">
          <SearchIcon className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search output…"
            className="h-8 pl-8"
          />
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger render={<Button variant="outline" size="sm" />}>
            <FilterIcon /> Levels
            <span className="ml-1 rounded bg-muted px-1 text-[10px]">{levels.size}</span>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuLabel>Log levels</DropdownMenuLabel>
            <DropdownMenuSeparator />
            {LEVELS.map((l) => (
              <DropdownMenuCheckboxItem
                key={l}
                checked={levels.has(l)}
                onClick={(e) => {
                  e.preventDefault();
                  toggleLevel(l);
                }}
                className="capitalize"
              >
                {l}
              </DropdownMenuCheckboxItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setAutoscroll((a) => !a)}
          aria-pressed={autoscroll}
        >
          {autoscroll ? <PauseIcon /> : <PlayIcon />}
          {autoscroll ? "Pause" : "Resume"}
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            setLines([]);
            toast.success("Console cleared");
          }}
        >
          <Trash2Icon /> Clear
        </Button>
        <QuickCommands id={id} />
        <span
          className={cn(
            "flex items-center gap-1.5 rounded-full px-2 py-1 text-xs",
            connected ? "text-success" : "text-muted-foreground",
          )}
        >
          <span className={cn("size-1.5 rounded-full", connected ? "bg-success pulse-dot" : "bg-muted-foreground")} />
          {connected ? "Streaming" : "Offline"}
        </span>
      </div>

      {/* Output */}
      <div className="relative">
        <div
          ref={scrollRef}
          onScroll={onScroll}
          className="h-[46vh] min-h-72 overflow-y-auto bg-[oklch(0.14_0.006_300)] p-3 font-mono text-xs leading-relaxed"
        >
          {filtered.length === 0 ? (
            <p className="py-10 text-center text-muted-foreground">
              No console output{search ? " matching your search" : " yet"}.
            </p>
          ) : (
            filtered.map((l) => (
              <div key={l.id} className="flex gap-2 whitespace-pre-wrap break-words px-1 hover:bg-white/[0.03]">
                <span className="shrink-0 select-none text-muted-foreground/60">
                  {new Date(l.t).toLocaleTimeString(undefined, { hour12: false })}
                </span>
                <span className={cn("min-w-0 flex-1", LEVEL_STYLE[l.level])}>
                  {displayLineText(l)}
                </span>
              </div>
            ))
          )}
        </div>
        {!autoscroll && (
          <Button
            size="sm"
            className="absolute bottom-3 right-3 shadow-panel"
            onClick={() => setAutoscroll(true)}
          >
            <ArrowDownIcon /> Jump to latest
          </Button>
        )}
      </div>

      {/* Input */}
      <div className="flex items-center gap-2 border-t border-border p-2.5">
        <span className="pl-1 font-mono text-sm text-primary">›</span>
        <Input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder="Type a command or message and press Enter"
          className="h-9 flex-1 border-0 bg-transparent font-mono shadow-none focus-visible:ring-0"
          autoComplete="off"
          spellCheck={false}
        />
        <Button size="sm" onClick={send} disabled={sending || !input.trim()}>
          <SendHorizonalIcon /> Send
        </Button>
      </div>
    </div>
  );
}
