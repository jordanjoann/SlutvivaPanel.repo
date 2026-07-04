"use client";

import { PlayIcon, SquareIcon, RotateCwIcon, Loader2Icon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { usePower } from "@/hooks/use-power";
import { isPoweredOn } from "@/lib/status";
import type { PowerAction, ServerStatus } from "@/lib/types";

export function PowerControls({
  id,
  status,
  size = "default",
  showRestart = true,
  allowedActions,
  className,
}: {
  id: string;
  status: ServerStatus;
  size?: "sm" | "default";
  showRestart?: boolean;
  allowedActions?: PowerAction[];
  className?: string;
}) {
  const { busy, run } = usePower(id);
  const on = isPoweredOn(status);
  const transitioning =
    status === "starting" || status === "stopping" || status === "restarting";
  const disabled = busy !== null || transitioning;
  const canStart = !allowedActions || allowedActions.includes("start");
  const canStop = !allowedActions || allowedActions.includes("stop");
  const canRestart = !allowedActions || allowedActions.includes("restart");

  return (
    <div className={className ? className : "flex items-center gap-2"}>
      {on ? (
        canStop && (
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
        )
      ) : (
        canStart && (
        <Button size={size} disabled={disabled} onClick={() => run("start")}>
          {busy === "start" || status === "starting" ? (
            <Loader2Icon className="animate-spin" />
          ) : (
            <PlayIcon className="fill-current" />
          )}
          Start
        </Button>
        )
      )}
      {showRestart && canRestart && (
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
