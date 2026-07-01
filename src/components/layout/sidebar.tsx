import { Brand } from "./brand";
import { SidebarNav } from "./sidebar-nav";

export function Sidebar() {
  return (
    <aside className="hidden w-64 shrink-0 flex-col border-r border-sidebar-border bg-sidebar lg:flex">
      <div className="flex h-16 items-center px-5">
        <Brand />
      </div>
      <SidebarNav />
      <div className="border-t border-sidebar-border p-3">
        <div className="flex items-center gap-2 rounded-lg bg-sidebar-accent/40 px-3 py-2.5">
          <span className="size-2 rounded-full bg-success pulse-dot" />
          <div className="min-w-0 leading-tight">
            <p className="truncate text-xs font-medium text-sidebar-foreground">
              All systems operational
            </p>
            <p className="truncate text-[10px] text-muted-foreground">
              panel.slutvival.com
            </p>
          </div>
        </div>
      </div>
    </aside>
  );
}
