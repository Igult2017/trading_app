import { Icon } from "../components/Icon";
import { TelegramIcon } from "../components/TelegramIcon";
import { NAV_ITEMS } from "../data/navigation";
import type { PageId } from "../types";
import type { Overview } from "../hooks/useOverview";

interface SidebarProps {
  collapsed: boolean;
  setCollapsed: (collapsed: boolean) => void;
  activePage: PageId;
  setActivePage: (page: PageId) => void;
  /** Panel mode: nested in a host scroll container, so drop the viewport-anchored sizing. */
  panel?: boolean;
  overview: Overview | undefined;
  /** Leaves the copier and returns to the Trade Sync landing page. Optional so the standalone
   *  mount (which has nothing to go back to) simply omits it. */
  onExit?: () => void;
}

export function Sidebar({ collapsed, setCollapsed, activePage, setActivePage, panel, overview, onExit }: SidebarProps) {
  // Recent activity is DERIVED from the real mirror feed — never invented copy.
  const activity = (overview?.feed ?? []).slice(0, 4).map((f) => ({
    text: `Copied ${f.side} ${f.symbol} ${f.lot} lot`,
    time: f.time,
  }));
  return (
    <aside
      // RIGHT-HAND RAIL. `md:order-last` paints it on the right while the markup keeps it first,
      // so tab and screen-reader order still reach navigation before content (see TradeSyncApp).
      // border-L, not border-R: the divider belongs against the CONTENT, not the viewport edge.
      className={`ct-sidebar ${collapsed ? "collapsed" : ""} hidden md:flex md:order-last flex-col border-l border-surface-container-highest bg-surface shrink-0`}
      // Standalone: pin to the viewport under the 3.5rem header. Panel: the host's <main> is the
      // scroll container, so calc(100vh…) would overshoot it — stretch to the panel instead.
      style={panel ? undefined : { height: "calc(100vh - 3.5rem)", position: "sticky", top: "3.5rem" }}
    >
      {/* Collapse control, mirrored for the right edge: the button sits at the rail's INNER edge
          and the arrow always points the way the rail will travel. On a left rail that was
          justify-end + chevron_left; here it is justify-start + chevron_right. An arrow pointing
          the wrong way is the first thing anyone notices about a moved panel. */}
      <div className={`flex ${collapsed ? "justify-center" : "justify-start"} p-2 border-b border-surface-container-highest`}>
        <button
          className="text-on-surface hover:text-primary p-1 rounded"
          onClick={() => setCollapsed(!collapsed)}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          <Icon name={collapsed ? "chevron_left" : "chevron_right"} />
        </button>
      </div>

      <div className="flex-1 flex flex-col overflow-hidden">
        {/* THE WAY OUT. Until 2026-08-08 the copier had no exit of any kind: once "Start Now" set
            showCopier, nothing could unset it, and the flag was persisted, so the landing page was
            unreachable for good. */}
        {onExit && (
          <div className="shrink-0 border-b border-surface-container-highest py-2">
            <button
              type="button"
              onClick={onExit}
              title="Back to Trade Sync overview"
              className={`ct-nav-item w-full ${collapsed ? "justify-center px-0" : "px-6"} py-3 flex items-center gap-3`}
            >
              <Icon name="arrow_back" className="shrink-0 text-on-surface" />
              <span className="font-body-md ct-sidebar-text truncate text-on-surface">Back to overview</span>
            </button>
          </div>
        )}

        <nav className="shrink-0 py-4 border-b border-surface-container-highest">
          <div className="px-6 mb-4 ct-sidebar-label">
            <span className="font-label-xs text-on-surface-variant uppercase">Main menu</span>
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
            <span className="font-label-xs text-on-surface-variant uppercase">Recent activity</span>
          </div>
          <div className="px-6 space-y-4 ct-sidebar-text">
            {activity.map((a, i) => (
              <div key={i} className="text-[10px] leading-tight border-l border-surface-container-highest pl-3">
                <p className="text-on-surface font-body-md">{a.text}</p>
                <p className="opacity-50 mt-1 font-dm-mono text-[9px]">{a.time}</p>
              </div>
            ))}
            {activity.length === 0 && (
              <p className="text-[10px] text-on-surface-variant font-body-md">No copied trades yet.</p>
            )}
          </div>
        </div>
      </div>
    </aside>
  );
}
