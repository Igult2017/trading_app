import { Icon } from "../components/Icon";
import { TelegramIcon } from "../components/TelegramIcon";
import { NAV_ITEMS, RECENT_ACTIVITY } from "../data/navigation";
import type { PageId } from "../types";

interface SidebarProps {
  collapsed: boolean;
  setCollapsed: (collapsed: boolean) => void;
  activePage: PageId;
  setActivePage: (page: PageId) => void;
}

export function Sidebar({ collapsed, setCollapsed, activePage, setActivePage }: SidebarProps) {
  return (
    <aside
      className={`ct-sidebar ${collapsed ? "collapsed" : ""} hidden md:flex flex-col border-r border-surface-container-highest bg-surface shrink-0`}
      style={{ height: "calc(100vh - 3.5rem)", position: "sticky", top: "3.5rem" }}
    >
      <div className={`flex ${collapsed ? "justify-center" : "justify-end"} p-2 border-b border-surface-container-highest`}>
        <button
          className="text-on-surface hover:text-primary p-1 rounded"
          onClick={() => setCollapsed(!collapsed)}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          <Icon name={collapsed ? "chevron_right" : "chevron_left"} />
        </button>
      </div>

      <div className="flex-1 flex flex-col overflow-hidden">
        <nav className="shrink-0 py-4 border-b border-surface-container-highest">
          <div className="px-6 mb-4 ct-sidebar-label">
            <span className="font-label-xs text-on-surface opacity-50 uppercase">Main menu</span>
          </div>
          <ul className="space-y-1">
            {NAV_ITEMS.map((item) => (
              <li
                key={item.id}
                className={`ct-nav-item ${collapsed ? "justify-center px-0" : "px-6"} py-3 flex items-center gap-3 ${
                  activePage === item.id ? "active" : ""
                }`}
                title={item.label}
                onClick={() => setActivePage(item.id)}
              >
                {item.telegram ? (
                  <TelegramIcon className="w-5 h-5 shrink-0" />
                ) : (
                  <Icon
                    name={item.icon ?? ""}
                    className={`shrink-0 ${activePage === item.id ? "text-primary" : "text-on-surface"}`}
                  />
                )}
                <span
                  className={`font-body-md ct-sidebar-text truncate ${
                    activePage === item.id ? "text-primary" : "text-on-surface"
                  }`}
                >
                  {item.label}
                </span>
              </li>
            ))}
          </ul>
        </nav>

        <div className="flex-1 overflow-y-auto ct-hide-scrollbar py-4">
          <div className="px-6 mb-4 ct-sidebar-label">
            <span className="font-label-xs text-on-surface opacity-50 uppercase">Recent activity</span>
          </div>
          <div className="px-6 space-y-4 ct-sidebar-text">
            {RECENT_ACTIVITY.map((a, i) => (
              <div key={i} className="text-[10px] leading-tight border-l border-surface-container-highest pl-3">
                <p className="text-on-surface font-body-md">{a.text}</p>
                <p className="opacity-50 mt-1 font-dm-mono text-[9px]">{a.time}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </aside>
  );
}
