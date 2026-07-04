import { Brand } from "./brand";
import { SidebarNav } from "./sidebar-nav";
import type { PanelRole } from "@/lib/server/panel-users";

export function Sidebar({ role }: { role: PanelRole }) {
  return (
    <aside className="hidden w-64 shrink-0 flex-col border-r border-sidebar-border bg-sidebar lg:flex">
      <div className="flex h-16 items-center px-5">
        <Brand />
      </div>
      <SidebarNav role={role} />
    </aside>
  );
}
