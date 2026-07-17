import { Icon } from "../components/Icon";
import { StatRow } from "../components/StatRow";
import { PROVIDER_STATS } from "../data/providerStudio";
import { BusinessSetup } from "./provider/BusinessSetup";
import { FollowRequestList } from "./provider/FollowRequestList";
import { ActiveFollowerList } from "./provider/ActiveFollowerList";
import { FeedbackList } from "./provider/FeedbackList";
import { SupportBox } from "./provider/SupportBox";
import type { TradeSync } from "../hooks/useTradeSync";

interface ProviderStudioPageProps {
  ts: TradeSync;
}

export function ProviderStudioPage({ ts }: ProviderStudioPageProps) {
  const { studio, providerAccount, setToast, setActivePage } = ts;

  return (
    <section>
      <div className="p-6 border-b border-surface-container-highest bg-surface-container-low flex items-center gap-2">
        <Icon name="business_center" className="text-on-surface-variant text-[16px]" />
        <h2 className="font-headline-md text-on-surface">Provider studio</h2>
        <button
          className="ml-auto flex items-center gap-1 font-label-xs uppercase text-primary"
          onClick={() => setActivePage("dashboard")}
        >
          <Icon name="arrow_back" className="text-[13px]" />
          Back to dashboard
        </button>
      </div>

      <StatRow stats={PROVIDER_STATS} />

      <div className="p-6 space-y-8">
        <BusinessSetup studio={studio} providerAccount={providerAccount} setToast={setToast} />
        <FollowRequestList
          requests={studio.requests}
          onAccept={studio.acceptFollowRequest}
          onDecline={studio.declineFollowRequest}
        />
        <ActiveFollowerList followers={studio.followers} />
        <FeedbackList />
        <SupportBox studio={studio} setToast={setToast} />
      </div>
    </section>
  );
}
