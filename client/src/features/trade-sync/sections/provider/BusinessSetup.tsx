import { Icon } from "../../components/Icon";
import { AddAccountCard } from "../../components/AddAccountCard";
import type { BrokerAccount } from "../../hooks/useBrokerAccount";
import type { ProviderStudio } from "../../hooks/useProviderStudio";
import type { SetToast } from "../../hooks/useToast";

interface BusinessSetupProps {
  studio: ProviderStudio;
  providerAccount: BrokerAccount;
  setToast: SetToast;
}

export function BusinessSetup({ studio, providerAccount, setToast }: BusinessSetupProps) {
  return (
    <div className="space-y-4">
      <p className="font-label-xs text-on-surface opacity-70 uppercase">Business setup</p>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="font-label-xs text-on-surface opacity-70 uppercase block mb-1">Service name</label>
          <input
            className="w-full bg-surface border border-surface-container-highest rounded py-2 px-3 font-body-md"
            value={studio.serviceName}
            onChange={(e) => studio.setServiceName(e.target.value)}
          />
        </div>
        <div>
          <label className="font-label-xs text-on-surface opacity-70 uppercase block mb-1">Fee model</label>
          <select
            className="w-full bg-surface border border-surface-container-highest rounded py-2 px-3 font-body-md"
            value={studio.feeModel}
            onChange={(e) => studio.setFeeModel(e.target.value)}
          >
            <option>Performance fee</option>
            <option>Flat subscription</option>
            <option>Free</option>
          </select>
        </div>
      </div>
      <div className="space-y-2">
        <label className="font-label-xs text-on-surface opacity-70 uppercase block">Add account</label>
        <AddAccountCard
          platform={providerAccount.platform}
          onPlatformChange={providerAccount.setPlatform}
          status={providerAccount.status}
          accountId={providerAccount.accountId}
          onConnect={providerAccount.connect}
          onDisconnect={providerAccount.disconnect}
        />
        {providerAccount.status !== "connected" && (
          <p className="flex items-center gap-1.5 text-[11px] text-error font-body-md">
            <Icon name="info" className="text-[13px]" />
            Followers can't be mirrored from this service until your account is connected.
          </p>
        )}
      </div>
      <div>
        <label className="font-label-xs text-on-surface opacity-70 uppercase block mb-1">
          Strategy description (shown to prospective followers)
        </label>
        <textarea
          className="w-full bg-surface border border-surface-container-highest rounded py-2 px-3 font-body-md"
          rows={3}
          value={studio.strategyDesc}
          onChange={(e) => studio.setStrategyDesc(e.target.value)}
        />
      </div>
      <label className="flex items-center gap-2 cursor-pointer">
        <input
          type="checkbox"
          className="w-4 h-4 rounded border-surface-container-highest text-primary cursor-pointer"
          checked={studio.listed}
          onChange={(e) => studio.setListed(e.target.checked)}
        />
        <span className="font-body-md text-on-surface">List my service in the marketplace</span>
      </label>
      <button
        className="px-5 py-2 rounded bg-primary text-on-primary font-body-md font-bold text-[12px]"
        onClick={() => setToast("Business setup saved.")}
      >
        Save changes
      </button>
    </div>
  );
}
