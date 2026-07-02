import { BlocksIcon } from "lucide-react";
import { ComingSoon } from "@/components/panel/coming-soon";

export default function MinecraftPage() {
  return (
    <ComingSoon
      title="Minecraft"
      description="Minecraft vanilla and modded server management is coming to Slutvival Panel."
      icon={BlocksIcon}
      features={["Version channels", "Mod loaders", "World saves", "Whitelist tools", "Backups"]}
    />
  );
}
