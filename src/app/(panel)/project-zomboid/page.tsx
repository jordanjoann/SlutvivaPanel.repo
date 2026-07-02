import { SkullIcon } from "lucide-react";
import { ComingSoon } from "@/components/panel/coming-soon";

export default function ProjectZomboidPage() {
  return (
    <ComingSoon
      title="Project Zomboid"
      description="Persistent Project Zomboid server management is coming to Slutvival Panel."
      icon={SkullIcon}
      features={["SteamCMD updates", "World saves", "Workshop mods", "Player access", "Backups"]}
    />
  );
}
