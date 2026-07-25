import { Icon } from "../components/Icon";
import { AddAccountCard } from "../components/AddAccountCard";
import { SourceCards } from "./setup/SourceCards";
import { ProviderDirectory } from "./setup/ProviderDirectory";
import { OwnAccountsList } from "./setup/OwnAccountsList";
import { FilterTags } from "./setup/FilterTags";
import { RiskParameters } from "./setup/RiskParameters";
import { AgreementAndStart } from "./setup/AgreementAndStart";
import type { TradeSync } from "../hooks/useTradeSync";

const TITLES: Record<string, string> = {
  copy: "Copy trading setup",
  self: "Self-copy setup",
  telegram: "Telegram signal setup",
  dashboard: "Engine setup and risk rules",
};

const INSTANT_NOTE: Record<string, string> = {
  "self-copy": "Self-copy mirrors trades across accounts you own — it connects instantly, no follow request needed.",
  telegram: "Telegram signals parse a channel or bot you control — it connects instantly, no follow request needed.",
};

interface EngineSetupProps {
  ts: TradeSync;
}

export function EngineSetup({ ts }: EngineSetupProps) {
  const { setup, account, search, follow, activePage, setActivePage } = ts;
  const { source } = setup;

  return (
    <div className="flex-1 border-r border-surface-container-highest">
      <div className="p-6 border-b border-surface-container-highest bg-surface-container-low flex items-center gap-2">
        <Icon name="settings" className="text-on-surface-variant text-[16px]" />
        <h2 className="font-headline-md text-on-surface">{TITLES[activePage]}</h2>
        {activePage !== "dashboard" && (
          <button
            className="ml-auto flex items-center gap-1 font-label-xs uppercase text-primary"
            onClick={() => setActivePage("dashboard")}
          >
            <Icon name="arrow_back" className="text-[13px]" />
            Back to dashboard
          </button>
        )}
      </div>

      <div className="p-6 space-y-8">
        <SourceCards setup={setup} />

        {(source === "provider" || source === "self-copy") && (
          <section>
            <p className="font-label-xs text-on-surface opacity-70 mb-4 uppercase">Step 2 — Add account</p>
            <AddAccountCard
              platform={account.platform}
              onPlatformChange={account.setPlatform}
              status={account.status}
              accountId={account.accountId}
              onConnect={account.connect}
              onDisconnect={account.disconnect}
            />
          </section>
        )}

        <section>
          <div className="relative mb-6">
            <Icon name="search" className="absolute left-3 top-1/2 -translate-y-1/2 text-on-surface opacity-50" />
            <input
              className="w-full bg-surface border border-surface-container-highest rounded py-3 pl-10 pr-4 font-body-md focus:ring-1 focus:ring-primary focus:border-primary placeholder:opacity-40"
              placeholder="Search verified providers by name or ID"
              type="text"
              value={search.providerQuery}
              onChange={(e) => search.setProviderQuery(e.target.value)}
            />
          </div>

          {(source === "self-copy" || source === "telegram") && (
            <div className="mb-8 flex items-start gap-2 p-3 rounded border border-surface-container-highest bg-surface-container-low">
              <Icon name="bolt" className="text-tertiary text-[14px] mt-0.5" />
              <p className="font-body-md text-on-surface opacity-80 text-[12px] leading-snug">{INSTANT_NOTE[source]}</p>
            </div>
          )}

          {source === "self-copy" && <OwnAccountsList setup={setup} />}

          {source === "telegram" && (
            <div className="mb-8 space-y-2">
              <label className="font-label-xs text-on-surface opacity-70 uppercase block">Telegram channel</label>
              <input
                className="w-full bg-surface border border-surface-container-highest rounded py-3 px-4 font-body-md focus:ring-1 focus:ring-primary focus:border-primary placeholder:opacity-40"
                placeholder="@channel, t.me/channel or a -100… chat id"
                type="text"
                value={setup.telegramChannel}
                onChange={(e) => setup.setTelegramChannel(e.target.value)}
              />
              <p className="font-body-md text-on-surface opacity-60 text-[11px] leading-snug">
                Add the platform copy-bot as an admin to the channel so it can read the signals.
              </p>
            </div>
          )}

          {source === "provider" && (
            <ProviderDirectory
              providers={search.filteredProviders}
              query={search.providerQuery}
              followStatus={follow.followStatus}
              onToggleFollow={follow.toggleFollow}
            />
          )}

          <FilterTags setup={setup} />
        </section>

        <RiskParameters setup={setup} />
        <AgreementAndStart setup={setup} />
      </div>
    </div>
  );
}
