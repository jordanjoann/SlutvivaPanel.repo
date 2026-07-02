import { WrenchIcon } from "lucide-react";
import { ComingSoon } from "@/components/panel/coming-soon";

export default function GarrysModPage() {
  return (
    <ComingSoon
      title="Garry's Mod"
      description="Garry's Mod sandbox and community server management is coming to Slutvival Panel."
      icon={WrenchIcon}
      features={["SteamCMD updates", "Workshop collections", "Lua configs", "Live console", "Backups"]}
    />
  );
}
