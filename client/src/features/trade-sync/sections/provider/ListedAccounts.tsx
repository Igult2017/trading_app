import { useState } from "react";
import { Icon } from "../../components/Icon";
import type { ProviderStudio } from "../../hooks/useProviderStudio";

type Acct = ProviderStudio["accounts"][number];

/**
 * EVERY ACCOUNT HE OWNS, EACH LISTABLE ON ITS OWN.
 *
 * HIS INSTRUCTION, 2026-09-29: *"list all the ctrader accounts that user has so that he can choose
 * which ones to list to public to be followed. ctrader allows more than one account... I should be
 * able to list and unlist all of them."*
 *
 * WHAT THIS REPLACES. The studio had ONE service: one name, one description, one "List my service
 * in the marketplace" checkbox, attached to whichever account happened to be first
 * (`useProviderStudio.persist` picked `ownAccounts.find(a => a.connected)`). With four accounts he
 * could publish exactly one, and not choose which.
 *
 * A NAME AND DESCRIPTION PER ACCOUNT, not one shared pair — four listings under one name would show
 * the marketplace four identical providers. `copy_masters` already stores both per row, so this is
 * the shape the data always had.
 *
 * NOTHING IS HIDDEN. An account that cannot be listed (not API-connected, so the engine could never
 * read its fills) is shown with the reason on it. Hiding it only invites "where did my account go".
 */
export function ListedAccounts({ studio }: { studio: ProviderStudio }) {
  const { accounts, setAccountListed, saveAccountProfile, busyId } = studio;
  const [openId, setOpenId] = useState<string | null>(null);
  const [draft, setDraft] = useState<{ name: string; desc: string }>({ name: "", desc: "" });

  const open = (a: Acct) => {
    setOpenId(a.id);
    setDraft({ name: a.serviceName, desc: a.description });
  };

  const listedCount = accounts.filter((a) => a.listed).length;

  return (
    <section className="space-y-4">
      <header className="flex items-baseline justify-between gap-3">
        <h3 className="font-headline-md text-on-surface">Your accounts</h3>
        <span className="font-label-xs text-on-surface-variant uppercase">
          {listedCount === 0
            ? `${accounts.length} account${accounts.length === 1 ? "" : "s"} · none listed`
            : `${listedCount} of ${accounts.length} listed`}
        </span>
      </header>
      <p className="font-body-md text-[12px] text-on-surface-variant leading-snug max-w-2xl">
        A listed account appears in the marketplace and other people can ask to follow it. An unlisted
        one is private to you — nobody else can see it exists.
      </p>

      {accounts.length === 0 ? (
        <div className="border border-dashed border-surface-container-highest rounded-xl p-8 text-center space-y-2">
          <Icon name="account_balance" className="text-on-surface-variant text-[22px]" />
          <p className="font-body-md text-[12px] text-on-surface-variant">
            No trading accounts yet — connect one on the Accounts page and it will appear here.
          </p>
        </div>
      ) : (
        <ul className="space-y-3">
          {accounts.map((a) => {
            const busy = busyId === a.id;
            const editing = openId === a.id;
            return (
              <li
                key={a.id}
                className={`rounded-xl border transition-colors duration-200 ${
                  a.listed
                    ? "border-primary/50 bg-primary/5"
                    : "border-surface-container-highest bg-surface hover:border-surface-container-highest/80"
                }`}
              >
                <div className="flex items-center gap-4 p-4">
                  <div className="w-10 h-10 rounded-lg bg-surface-container-highest flex items-center justify-center font-bold text-on-surface shrink-0">
                    {a.name.charAt(0).toUpperCase()}
                  </div>

                  <div className="min-w-0 flex-1">
                    <p className="font-body-md font-bold text-[13px] text-on-surface leading-tight truncate">
                      {a.name}
                    </p>
                    <p className="text-[10px] text-on-surface-variant font-dm-mono truncate mt-0.5">
                      {a.platform}
                      {a.loginId ? ` · ${a.loginId}` : ""} · {a.balance}
                    </p>
                  </div>

                  {/* THE STATE IN A WORD, not only in a colour — a colour alone is unreadable for
                      anyone who cannot separate these two hues. */}
                  <span
                    className={`hidden sm:inline-block px-2.5 py-1 rounded-full text-[9px] font-bold uppercase shrink-0 ${
                      a.listed
                        ? "bg-primary/15 text-primary"
                        : "bg-surface-container-highest text-on-surface-variant"
                    }`}
                  >
                    {a.listed ? "Listed" : "Private"}
                  </span>

                  <button
                    type="button"
                    role="switch"
                    aria-checked={a.listed}
                    aria-label={`${a.listed ? "Unlist" : "List"} ${a.name}`}
                    disabled={busy || !a.apiConnected}
                    onClick={() => void setAccountListed(a, !a.listed)}
                    className={`relative w-11 h-6 rounded-full shrink-0 transition-colors duration-200
                                disabled:opacity-40 disabled:cursor-not-allowed
                                ${a.listed ? "bg-primary" : "bg-surface-container-highest"}`}
                  >
                    <span
                      className={`absolute top-1 w-4 h-4 rounded-full bg-surface transition-all duration-200
                                  ${a.listed ? "left-6" : "left-1"}`}
                    />
                  </button>
                </div>

                {!a.apiConnected && (
                  <p className="flex items-center gap-1.5 px-4 pb-3 text-[11px] text-on-surface-variant font-body-md">
                    <Icon name="info" className="text-[13px] shrink-0" />
                    This account is not API-connected, so its trades cannot be mirrored to a follower.
                    It can't be listed until it is.
                  </p>
                )}

                {a.apiConnected && (
                  <div className="px-4 pb-4">
                    {!editing ? (
                      <button
                        type="button"
                        onClick={() => open(a)}
                        className="flex items-center gap-1 text-[11px] font-body-md text-on-surface-variant
                                   hover:text-on-surface transition-colors duration-200"
                      >
                        <Icon name="edit" className="text-[13px]" />
                        {a.serviceName || a.name}
                        {a.description ? "" : " — no description yet"}
                      </button>
                    ) : (
                      <div className="space-y-3 pt-1">
                        <div>
                          <label className="font-label-xs text-on-surface-variant uppercase block mb-1.5">
                            Name shown to followers
                          </label>
                          <input
                            className="w-full bg-surface-container-low border border-surface-container-highest rounded-lg
                                       py-2 px-3 font-body-md text-[12px] text-on-surface
                                       focus:outline-none focus:ring-2 focus:ring-primary/60 transition-shadow duration-200"
                            value={draft.name}
                            placeholder={a.name}
                            onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                          />
                        </div>
                        <div>
                          <label className="font-label-xs text-on-surface-variant uppercase block mb-1.5">
                            What this account trades
                          </label>
                          <textarea
                            rows={3}
                            className="w-full bg-surface-container-low border border-surface-container-highest rounded-lg
                                       py-2 px-3 font-body-md text-[12px] text-on-surface resize-y
                                       focus:outline-none focus:ring-2 focus:ring-primary/60 transition-shadow duration-200"
                            value={draft.desc}
                            placeholder="Describe the strategy — prospective followers read this."
                            onChange={(e) => setDraft({ ...draft, desc: e.target.value })}
                          />
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            disabled={busy}
                            onClick={async () => {
                              await saveAccountProfile(a, draft.name, draft.desc);
                              setOpenId(null);
                            }}
                            className="px-4 py-2 rounded-lg bg-primary text-on-primary font-body-md font-bold text-[11px]
                                       hover:opacity-90 disabled:opacity-50 transition-opacity duration-200"
                          >
                            {busy ? "Saving…" : "Save"}
                          </button>
                          <button
                            type="button"
                            onClick={() => setOpenId(null)}
                            className="px-4 py-2 rounded-lg border border-surface-container-highest
                                       text-on-surface-variant font-body-md text-[11px]
                                       hover:text-on-surface transition-colors duration-200"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
