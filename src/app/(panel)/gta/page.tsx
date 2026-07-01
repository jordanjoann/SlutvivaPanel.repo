import { CarIcon } from "lucide-react";
import { ComingSoon } from "@/components/panel/coming-soon";

export default function GtaPage() {
  return (
    <ComingSoon
      title="GTA / FiveM"
      description="Manage FiveM roleplay and racing servers with the same premium tooling as Vintage Story."
      icon={CarIcon}
      features={["Resource manager", "txAdmin bridge", "Player management", "Live console", "Backups"]}
    />
  );
}
