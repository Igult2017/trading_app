import type { ProviderStudio } from "../../hooks/useProviderStudio";
import type { SetToast } from "../../hooks/useToast";

interface SupportBoxProps {
  studio: ProviderStudio;
  setToast: SetToast;
}

export function SupportBox({ studio, setToast }: SupportBoxProps) {
  return (
    <div className="space-y-3 border-t border-surface-container-highest pt-8">
      <span className="font-label-xs text-on-surface opacity-70 uppercase">Talk to support</span>
      <div className="border border-surface-container-highest rounded-lg p-4 space-y-3">
        <p className="text-on-surface opacity-70 font-body-md text-[12px]">
          Questions about payouts, verification, or your marketplace listing? Send a message and the support team will
          reply within one business day.
        </p>
        <textarea
          className="w-full bg-surface border border-surface-container-highest rounded py-2 px-3 font-body-md text-[12px]"
          rows={3}
          placeholder="Describe your question..."
          value={studio.supportMessage}
          onChange={(e) => studio.setSupportMessage(e.target.value)}
        />
        <div className="flex flex-wrap gap-2">
          <button
            className="px-4 py-2 rounded bg-primary text-on-primary font-body-md font-bold text-[12px]"
            onClick={studio.sendSupportMessage}
          >
            Send message
          </button>
          <button
            className="px-4 py-2 rounded border border-surface-container-highest text-on-surface font-body-md font-bold text-[12px]"
            onClick={() => setToast("support@tradesync.app")}
          >
            Email support
          </button>
        </div>
      </div>
    </div>
  );
}
