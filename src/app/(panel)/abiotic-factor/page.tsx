import { FlaskConicalIcon } from "lucide-react";
import { ComingSoon } from "@/components/panel/coming-soon";

export default function AbioticFactorPage() {
  return (
    <ComingSoon
      title="Abiotic Factor"
      description="Co-op science-facility survival horror server management is coming to Slutvival Panel."
      icon={FlaskConicalIcon}
      features={["SteamCMD updates", "Save management", "Player management", "Live console", "Backups"]}
    />
  );
}
