import { UsersIcon } from "lucide-react";
import { ComingSoon } from "@/components/panel/coming-soon";

export default function UsersPage() {
  return (
    <ComingSoon
      title="Users & Roles"
      description="Team access with granular roles is on the way. The login system is built to expand into full RBAC."
      icon={UsersIcon}
      features={["Owner", "Admin", "Moderator", "Developer", "Viewer"]}
    />
  );
}
