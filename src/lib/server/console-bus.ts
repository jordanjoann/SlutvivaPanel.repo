import type { ConsoleLine, ConsoleStream, LogLevel } from "@/lib/types";
import { singleton } from "./singleton";

const MAX_BUFFER = 1000;

type Subscriber = (line: ConsoleLine) => void;

interface Channel {
  buffer: ConsoleLine[];
  subscribers: Set<Subscriber>;
  seq: number;
}

/**
 * In-memory console fan-out. Each instance has a ring buffer of recent lines
 * and a set of live SSE subscribers. Runtimes push lines in; the console SSE
 * route replays the buffer then streams new lines.
 */
class ConsoleBus {
  private channels = new Map<string, Channel>();

  private channel(id: string): Channel {
    let ch = this.channels.get(id);
    if (!ch) {
      ch = { buffer: [], subscribers: new Set(), seq: 0 };
      this.channels.set(id, ch);
    }
    return ch;
  }

  /** Detect a log level from a raw Vintage Story log line. */
  private detectLevel(text: string, stream: ConsoleStream): LogLevel {
    if (stream === "command") return "notification";
    const m = /\]\s*(Debug|Notification|Warning|Error|Fatal|Event)/i.exec(text);
    if (m) {
      const l = m[1].toLowerCase();
      if (l === "warning") return "warning";
      if (l === "error" || l === "fatal") return "error";
      if (l === "debug") return "debug";
      return "info";
    }
    if (stream === "stderr") return "error";
    if (/\b(error|exception|fatal|failed)\b/i.test(text)) return "error";
    if (/\b(warn|warning)\b/i.test(text)) return "warning";
    return "info";
  }

  push(
    id: string,
    text: string,
    stream: ConsoleStream = "stdout",
    level?: LogLevel,
  ): ConsoleLine {
    const ch = this.channel(id);
    const line: ConsoleLine = {
      id: ch.seq++,
      t: Date.now(),
      stream,
      level: level ?? this.detectLevel(text, stream),
      text,
    };
    ch.buffer.push(line);
    if (ch.buffer.length > MAX_BUFFER) ch.buffer.shift();
    for (const sub of ch.subscribers) {
      try {
        sub(line);
      } catch {
        /* subscriber errors must not break the bus */
      }
    }
    return line;
  }

  snapshot(id: string, limit = MAX_BUFFER): ConsoleLine[] {
    const ch = this.channels.get(id);
    if (!ch) return [];
    return ch.buffer.slice(-limit);
  }

  subscribe(id: string, cb: Subscriber): () => void {
    const ch = this.channel(id);
    ch.subscribers.add(cb);
    return () => ch.subscribers.delete(cb);
  }

  clear(id: string): void {
    const ch = this.channels.get(id);
    if (ch) ch.buffer = [];
  }
}

export const consoleBus = singleton("consoleBus", () => new ConsoleBus());
