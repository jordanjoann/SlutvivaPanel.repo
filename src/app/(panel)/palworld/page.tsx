import { Gamepad2Icon } from "lucide-react";
import { ComingSoon } from "@/components/panel/coming-soon";

export default function PalworldPage() {
  return (
    <ComingSoon
      title="Palworld"
      description="Palworld dedicated server management is coming to Slutvival Panel."
      icon={Gamepad2Icon}
      features={["SteamCMD updates", "World saves", "Server settings", "Player management", "Backups"]}
    />
  );
}
