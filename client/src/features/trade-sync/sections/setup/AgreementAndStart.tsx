import { Icon } from "../../components/Icon";
import type { CopySetup } from "../../hooks/useCopySetup";

interface AgreementAndStartProps {
  setup: CopySetup;
}

/** The commit step. Start stays disabled until the terms are accepted AND every blocker clears. */
export function AgreementAndStart({ setup }: AgreementAndStartProps) {
  const { agreed, setAgreed, startBlockers, handleStart, mirroring, busy } = setup;
  // `busy` blocks a double-click from firing the start mutations twice (each one creates real
  // follower rows / self-copy links server-side).
  const canStart = agreed && startBlockers.length === 0 && !busy;

  return (
    <div className="pt-4">
      <div className="mb-6 p-6 bg-surface-container rounded space-y-4">
        <div className="flex items-start gap-3">
          <input
            className="w-4 h-4 rounded border-surface-container-highest text-primary mt-1 cursor-pointer"
            id="terms-agreement"
            type="checkbox"
            checked={agreed}
            onChange={(e) => setAgreed(e.target.checked)}
          />
          <label className="font-body-md text-on-surface cursor-pointer" htmlFor="terms-agreement">
            I have read and agree to the <span className="text-primary font-bold">Terms and Conditions</span>.
          </label>
        </div>
        <div className="pl-7 space-y-2 border-l-2 border-surface-container-highest">
          <p className="text-[10px] leading-tight text-on-surface opacity-70 font-body-md italic">
            Disclaimer: This service is provided for educational purposes only and does not constitute financial advice.
          </p>
          <p className="text-[10px] leading-tight text-on-surface opacity-70 font-body-md">
            The trader is solely responsible for their actions, risk management, and all trading decisions made using
            this platform.
          </p>
        </div>
      </div>

      {startBlockers.map((msg) => (
        <p key={msg} className="mb-3 flex items-center gap-1.5 text-[11px] text-error font-body-md">
          <Icon name="info" className="text-[13px]" />
          {msg}
        </p>
      ))}
      <button
        className={`ct-start-btn w-full md:w-auto px-8 py-3 font-body-md font-bold rounded flex items-center justify-center gap-3 border ${
          canStart
            ? "bg-primary text-on-primary border-primary cursor-pointer"
            : "bg-surface-container-highest text-on-surface border-surface-container-highest opacity-50 cursor-not-allowed"
        }`}
        disabled={!canStart}
        onClick={handleStart}
      >
        <Icon name={busy ? "hourglass_top" : mirroring ? "stop" : "play_arrow"} filled />
        {busy ? "Working…" : mirroring ? "Stop mirroring" : "Start mirroring"}
      </button>
    </div>
  );
}
