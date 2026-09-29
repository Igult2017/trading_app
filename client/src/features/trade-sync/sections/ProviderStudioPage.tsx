import { Icon } from "../components/Icon";
import { StatRow } from "../components/StatRow";
import { ListedAccounts } from "./provider/ListedAccounts";
import { FollowRequestList } from "./provider/FollowRequestList";
import { ActiveFollowerList } from "./provider/ActiveFollowerList";
import { FeedbackList } from "./provider/FeedbackList";
import { SupportBox } from "./provider/SupportBox";
import type { TradeSync } from "../hooks/useTradeSync";

interface ProviderStudioPageProps {
  ts: TradeSync;
}

export function ProviderStudioPage({ ts }: ProviderStudioPageProps) {
  const { studio, setActivePage } = ts;

  return (
    <section>
      {/* ONE HEADING, AND IT SAYS WHAT THE PAGE IS FOR. It read "Provider studio" with no further
          explanation, so the screen opened on a form with no stated purpose. */}
      <div className="p-6 border-b border-surface-container-highest bg-surface-container-low">
        <div className="flex items-center gap-2">
          <Icon name="business_center" className="text-on-surface-variant text-[16px]" />
          <h2 className="font-headline-md text-on-surface">Provider studio</h2>
          <button
            className="ml-auto flex items-center gap-1 font-label-xs uppercase text-primary
                       hover:opacity-80 transition-opacity duration-200"
            onClick={() => setActivePage("dashboard")}
          >
            <Icon name="arrow_back" className="text-[13px]" />
            Back to dashboard
          </button>
        </div>
        <p className="font-body-md text-[12px] text-on-surface-variant mt-1.5 max-w-2xl leading-snug">
          Choose which of your accounts other people can find and follow. Everything is private until
          you list it.
        </p>
      </div>

      <StatRow
        stats={[
          { label: "AUM COPIED", value: `$${studio.stats.aum.toLocaleString()}`, sub: "across all followers" },
          { label: "ACTIVE FOLLOWERS", value: String(studio.stats.activeFollowers), sub: "copying you now" },
          { label: "30D RETURN", value: studio.stats.ret30d, sub: "your service" },
          { label: "AVG RATING", value: studio.stats.avgRating, sub: "reviews coming soon" },
        ]}
      />

      <div className="p-6 space-y-10">
        <ListedAccounts studio={studio} />
        <FollowRequestList
          requests={studio.requests}
          onAccept={studio.acceptFollowRequest}
          onDecline={studio.declineFollowRequest}
        />
        <ActiveFollowerList followers={studio.followers} />
        <FeedbackList />
        <SupportBox studio={studio} />
      </div>
    </section>
  );
}
