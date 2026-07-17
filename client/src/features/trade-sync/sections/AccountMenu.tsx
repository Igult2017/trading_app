import { Icon } from "../components/Icon";
import type { PageId } from "../types";
import type { SetToast } from "../hooks/useToast";

interface AccountMenuProps {
  setToast: SetToast;
  setActivePage: (page: PageId) => void;
  close: () => void;
}

export function AccountMenu({ setToast, setActivePage, close }: AccountMenuProps) {
  return (
    <div className="absolute right-0 top-9 w-52 bg-surface border border-surface-container-highest rounded-lg shadow-lg z-50 overflow-hidden">
      <div className="px-4 py-3 border-b border-surface-container-highest">
        <p className="font-body-md font-bold text-on-surface text-[12px]">Alex Warren</p>
        <p className="font-label-xs text-on-surface opacity-60 uppercase mt-0.5">Prestige plan</p>
      </div>
      <button
        className="w-full text-left px-4 py-2.5 font-body-md text-[12px] text-on-surface hover:bg-surface-container-high flex items-center gap-2"
        onClick={() => {
          setActivePage("provider");
          close();
        }}
      >
        <Icon name="business_center" className="text-[14px]" /> Provider studio
      </button>
      <button
        className="w-full text-left px-4 py-2.5 font-body-md text-[12px] text-on-surface hover:bg-surface-container-high flex items-center gap-2"
        onClick={() => {
          setActivePage("history");
          close();
        }}
      >
        <Icon name="history" className="text-[14px]" /> History and risk
      </button>
      <button
        className="w-full text-left px-4 py-2.5 font-body-md text-[12px] text-error hover:bg-surface-container-high flex items-center gap-2 border-t border-surface-container-highest"
        onClick={() => {
          setToast("Signed out.");
          close();
        }}
      >
        <Icon name="logout" className="text-[14px]" /> Sign out
      </button>
    </div>
  );
}
