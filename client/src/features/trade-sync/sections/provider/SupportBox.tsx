import type { ProviderStudio } from "../../hooks/useProviderStudio";

interface SupportBoxProps {
  studio: ProviderStudio;
}

export function SupportBox({ studio }: SupportBoxProps) {
  return (
    <div className="space-y-3 border-t border-surface-container-highest pt-8">
      <span className="font-label-xs text-on-surface-variant uppercase">Talk to support</span>
      <div className="border border-surface-container-highest rounded-lg p-4 space-y-3">
        <p className="text-on-surface-variant font-body-md text-[12px]">
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
        {/* The "Email support" button that sat here showed `support@tradesync.app` — a string that
            appeared exactly once in the codebase, in that button, on an app that runs at
            fsdzones.cloud. It was mockup text, so it is gone rather than shown to a real provider.
            Put it back the moment there is an address that receives mail. */}
        <button
          className="px-4 py-2 rounded bg-primary text-on-primary font-body-md font-bold text-[12px] disabled:opacity-50"
          disabled={studio.sending || !studio.supportMessage.trim()}
          onClick={() => void studio.sendSupportMessage()}
        >
          {studio.sending ? "Sending…" : "Send message"}
        </button>
      </div>
    </div>
  );
}
