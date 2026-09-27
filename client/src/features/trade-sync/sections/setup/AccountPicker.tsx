import { Icon } from "../../components/Icon";
import type { CopySetup } from "../../hooks/useCopySetup";
import type { Overview } from "../../hooks/useOverview";

type Account = CopySetup["ownAccounts"][number];

interface AccountPickerProps {
  accounts: Account[];
  links:    NonNullable<Overview["selfCopy"]>["links"];
  masterId: string;
  targetId: string;
  onPickMaster: (a: Account) => void;
  onPickTarget: (id: string) => void;
}

/**
 * Pick the account to copy FROM, then the account to copy INTO — as cards, in that order.
 *
 * HIS INSTRUCTION: *"the accounts that users can follow should be displayed explicitly not in a
 * dropdown because that is bad user experience. User picks master account and then it is shown
 * accounts to copy to."*
 *
 * It was two `<select>` elements side by side, so choosing a pair meant opening two menus and
 * reading account names squeezed into one line each. Now every account is a card he can see and
 * compare at once, and the second step does not exist until the first is answered.
 *
 * THE MASTER IS NEVER OFFERED AS ITS OWN TARGET — nothing may copy itself. That is also refused
 * server-side, and deliberately so: the client is not the guard, it just does not ask a pointless
 * question.
 *
 * A PAIR THAT ALREADY EXISTS SAYS SO, and stays clickable. Re-submitting an existing pair is how
 * its sizing, drawdown and filters get updated (routes.ts), so blocking it would remove the only
 * way to change a live link — but submitting one blind and seeing no new row appear reads as a
 * failure. The card answers that before he presses anything.
 */
export function AccountPicker({
  accounts, links, masterId, targetId, onPickMaster, onPickTarget,
}: AccountPickerProps) {
  const targets = accounts.filter((a) => a.id !== masterId);
  const alreadyFed = new Set(
    links.filter((l) => l.masterAccountId === masterId).map((l) => l.followerAccountId),
  );

  const Card = ({ a, selected, note, onClick }: {
    a: Account; selected: boolean; note?: string; onClick: () => void;
  }) => (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={`text-left p-3 rounded-lg border transition-colors duration-200 w-full
                  ${selected
                    ? "border-primary bg-primary/10"
                    : "border-surface-container-highest hover:border-primary/60 hover:bg-surface-container-low"}`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-body-md font-bold text-[12px] leading-tight truncate">{a.name}</p>
          <p className="text-[9px] text-on-surface-variant font-dm-mono truncate">
            {a.broker} · {a.balance}
          </p>
        </div>
        {selected && <Icon name="check_circle" className="text-primary text-[15px] shrink-0" filled />}
      </div>
      {note && (
        <p className="mt-1.5 text-[9px] font-bold uppercase text-tertiary truncate">{note}</p>
      )}
    </button>
  );

  return (
    <div className="space-y-5">
      <div className="space-y-2">
        <span className="font-label-xs text-on-surface-variant uppercase block">
          Step 1 — copy from <span className="normal-case opacity-60">(master)</span>
        </span>
        <div className="grid gap-2 sm:grid-cols-2">
          {accounts.map((a) => (
            <Card key={a.id} a={a} selected={a.id === masterId} onClick={() => onPickMaster(a)} />
          ))}
        </div>
      </div>

      {/* Step two does not exist until step one is answered — his "user picks master account and
          THEN it is shown accounts to copy to". */}
      {masterId && (
        <div className="space-y-2">
          <span className="font-label-xs text-on-surface-variant uppercase block">
            Step 2 — copy into <span className="normal-case opacity-60">(mirror)</span>
          </span>
          {targets.length === 0 ? (
            <p className="border border-dashed border-surface-container-highest rounded-lg p-4
                          font-body-md text-[12px] text-on-surface-variant text-center">
              You only have one linked account — connect another to copy into.
            </p>
          ) : (
            <div className="grid gap-2 sm:grid-cols-2">
              {targets.map((a) => (
                <Card
                  key={a.id}
                  a={a}
                  selected={a.id === targetId}
                  note={alreadyFed.has(a.id) ? "already copying · Start updates it" : undefined}
                  onClick={() => onPickTarget(a.id)}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
