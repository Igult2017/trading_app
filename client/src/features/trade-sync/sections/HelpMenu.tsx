import { Icon } from "../components/Icon";
import type { PageId } from "../types";
import type { SetToast } from "../hooks/useToast";

interface HelpMenuProps {
  setToast: SetToast;
  setActivePage: (page: PageId) => void;
  close: () => void;
}

export function HelpMenu({ setToast, setActivePage, close }: HelpMenuProps) {
  return (
    <div className="absolute right-0 top-8 w-56 bg-surface border border-surface-container-highest rounded-lg shadow-lg z-50 overflow-hidden">
      <button
        className="w-full text-left px-4 py-2.5 font-body-md text-[12px] text-on-surface hover:bg-surface-container-high flex items-center gap-2"
        onClick={() => {
          setToast("Opening the getting started guide.");
          close();
        }}
      >
        <Icon name="menu_book" className="text-[14px]" /> Getting started guide
      </button>
      <button
        className="w-full text-left px-4 py-2.5 font-body-md text-[12px] text-on-surface hover:bg-surface-container-high flex items-center gap-2 border-t border-surface-container-highest"
        onClick={() => {
          setActivePage("provider");
          close();
        }}
      >
        <Icon name="support_agent" className="text-[14px]" /> Contact support
      </button>
    </div>
  );
}
