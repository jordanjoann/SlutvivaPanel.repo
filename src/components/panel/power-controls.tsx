"use client";

import { PlayIcon, SquareIcon, RotateCwIcon, Loader2Icon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { usePower } from "@/hooks/use-power";
import { isPoweredOn } from "@/lib/status";
import type { ServerStatus } from "@/lib/types";

export function PowerControls({
  id,
  status,
  size = "default",
  showRestart = true,
  className,
}: {
  id: string;
  status: ServerStatus;
  size?: "sm" | "default";
  showRestart?: boolean;
  className?: string;
}) {
  const { busy, run } = usePower(id);
  const on = isPoweredOn(status);
  const transitioning =
    status === "starting" || status === "stopping" || status === "restarting";
  const disabled = busy !== null || transitioning;

  return (
    <div className={className ? className : "flex items-center gap-2"}>
      {on ? (
        <Button
          variant="outline"
          size={size}
          disabled={disabled}
          onClick={() => run("stop")}
        >
          {busy === "stop" || status === "stopping" ? (
            <Loader2Icon className="animate-spin" />
          ) : (
            <SquareIcon className="fill-current" />
          )}
          Stop
        </Button>
      ) : (
        <Button size={size} disabled={disabled} onClick={() => run("start")}>
          {busy === "start" || status === "starting" ? (
            <Loader2Icon className="animate-spin" />
          ) : (
            <PlayIcon className="fill-current" />
          )}
          Start
        </Button>
      )}
      {showRestart && (
        <Button
          variant="outline"
          size={size}
          disabled={disabled || !on}
          onClick={() => run("restart")}
        >
          {busy === "restart" || status === "restarting" ? (
            <Loader2Icon className="animate-spin" />
          ) : (
            <RotateCwIcon />
          )}
          Restart
        </Button>
      )}
    </div>
  );
}
