import { ShieldAlertIcon } from "lucide-react";
import { ComingSoon } from "@/components/panel/coming-soon";

export default function SevenDaysToDiePage() {
  return (
    <ComingSoon
      title="7 Days to Die"
      description="7 Days to Die dedicated server management is coming to Slutvival Panel."
      icon={ShieldAlertIcon}
      features={["SteamCMD updates", "World saves", "Server config", "Live console", "Backups"]}
    />
  );
}
