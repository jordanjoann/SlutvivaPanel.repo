import { Brand } from "./brand";
import { SidebarNav } from "./sidebar-nav";

export function Sidebar() {
  return (
    <aside className="hidden w-64 shrink-0 flex-col border-r border-sidebar-border bg-sidebar lg:flex">
      <div className="flex h-16 items-center px-5">
        <Brand />
      </div>
      <SidebarNav />
    </aside>
  );
}
