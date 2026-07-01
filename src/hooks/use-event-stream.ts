"use client";

import { useEffect, useRef, useState } from "react";

type Handlers = Record<string, (data: unknown) => void>;

/**
 * Subscribe to a Server-Sent Events endpoint. `handlers` maps event names to
 * callbacks. Automatically reconnects and reports connection state.
 */
export function useEventStream(
  url: string | null,
  handlers: Handlers,
  enabled = true,
) {
  const [connected, setConnected] = useState(false);
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;

  useEffect(() => {
    if (!url || !enabled) return;
    let es: EventSource | null = null;
    let stopped = false;

    const connect = () => {
      if (stopped) return;
      es = new EventSource(url);
      es.onopen = () => setConnected(true);
      es.onerror = () => {
        setConnected(false);
        es?.close();
        if (!stopped) setTimeout(connect, 2000);
      };
      for (const name of Object.keys(handlersRef.current)) {
        es.addEventListener(name, (e) => {
          try {
            handlersRef.current[name](JSON.parse((e as MessageEvent).data));
          } catch {
            /* ignore malformed frames */
          }
        });
      }
    };
    connect();

    return () => {
      stopped = true;
      es?.close();
      setConnected(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url, enabled]);

  return { connected };
}
