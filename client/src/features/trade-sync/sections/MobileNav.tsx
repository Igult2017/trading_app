import { Icon } from "../components/Icon";
import { MOBILE_TABS } from "../data/navigation";
import type { PageId } from "../types";

interface MobileNavProps {
  activePage: PageId;
  setActivePage: (page: PageId) => void;
}

export function MobileNav({ activePage, setActivePage }: MobileNavProps) {
  return (
    <nav
      className="fixed bottom-0 left-0 w-full z-40 flex justify-around items-stretch h-16 md:hidden bg-surface border-t border-surface-container-highest"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      {MOBILE_TABS.map((t) => (
        <button
          key={t.id}
          className={`ct-mobile-tab flex flex-col items-center justify-center gap-1 flex-1 ${
            activePage === t.id ? "active text-primary" : "text-on-surface-variant"
          }`}
          onClick={() => setActivePage(t.id)}
        >
          <Icon name={t.icon ?? ""} className="text-[19px]" />
          <span className="font-label-xs uppercase leading-none">{t.label}</span>
        </button>
      ))}
    </nav>
  );
}
