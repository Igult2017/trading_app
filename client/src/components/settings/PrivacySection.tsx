import { useEffect, useState } from 'react';
import { Link } from 'wouter';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { authFetch } from '@/lib/queryClient';
import type { MyProfile } from '@/components/profile/useMyProfile';
import { useOverview } from '@/features/trade-sync/hooks/useOverview';
import { useAccountListing } from '@/features/trade-sync/hooks/useAccountListing';
import { Section, Status, CAP, INK, SWITCH, type Msg } from './settingsUi';

/**
 * Privacy & sharing — his ask, 2026-11-15: "turn on or off certain activities such as listing in the
 * leaderboard or listing of their live accounts in the copier."
 *
 * LEADERBOARD: off until the trader turns it on (his ruling, B). PATCH /api/me/privacy writes ONLY
 * the trader's own switch; an admin removal (leaderboard_hidden) is separate and wins, and the page
 * says so instead of showing a switch that silently does nothing.
 *
 * COPIER: one switch per live account, through useAccountListing — the SAME call Provider Studio
 * uses, so there is one way to list an account. Accounts start private (his 2026-09-29 ruling).
 */
export function PrivacySection({ profile, refresh }: { profile: MyProfile; refresh: () => Promise<unknown> | void }) {
  return (
    <Section id="privacy" title="Privacy & sharing"
             description="Nothing here is public until you switch it on.">
      <LeaderboardSwitch profile={profile} refresh={refresh} />
      <div className="h-px bg-[var(--jr-divider,rgba(255,255,255,0.06))]" />
      <CopierAccounts />
    </Section>
  );
}

function LeaderboardSwitch({ profile, refresh }: { profile: MyProfile; refresh: () => Promise<unknown> | void }) {
  const [on, setOn] = useState(profile.leaderboardOptIn);
  useEffect(() => { setOn(profile.leaderboardOptIn); }, [profile.leaderboardOptIn]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<Msg>({ s: null, m: '' });

  async function change(next: boolean) {
    setOn(next); setBusy(true); setMsg({ s: null, m: '' });          // show it at once…
    try {
      const r = await authFetch('/api/me/privacy', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ leaderboardOptIn: next }),
      });
      if (!r.ok) throw new Error('Could not save. Your setting was not changed.');
      await refresh();
      setMsg({ s: 'ok', m: next ? 'You are on the leaderboard.' : 'You are off the leaderboard.' });
    } catch (err) {
      setOn(!next);                                                     // …and put it back if it failed
      setMsg({ s: 'err', m: err instanceof Error ? err.message : 'Could not save.' });
    } finally { setBusy(false); }
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-start justify-between gap-6">
        <div className="flex flex-col gap-1">
          <Label htmlFor="lb-switch" className={`text-base font-semibold ${INK}`}>Show me on the leaderboard</Label>
          <p className={`text-sm leading-relaxed ${CAP}`}>
            Other traders see your name, country, profit and loss, win rate and number of trades. Your
            trades themselves are never shown.
          </p>
        </div>
        <Switch id="lb-switch" checked={on} disabled={busy || profile.leaderboardRemovedByAdmin}
                onCheckedChange={change} className={SWITCH} />
      </div>
      {profile.leaderboardRemovedByAdmin && (
        <p role="note" className="rounded-lg bg-rose-500/10 px-4 py-2 text-sm text-rose-400">
          An administrator has removed you from the leaderboard, so this switch has no effect. Contact
          support if you think that is a mistake.
        </p>
      )}
      <Status msg={msg} />
    </div>
  );
}

function CopierAccounts() {
  const { data, isLoading, isError, refetch, invalidate } = useOverview();
  const [msg, setMsg] = useState<Msg>({ s: null, m: '' });
  const say = (m: string) => setMsg({ s: /^Could not|is not API-connected/.test(m) ? 'err' : 'ok', m });
  const { setAccountListed, busyId } = useAccountListing(say, invalidate);
  const accounts = data?.studio.accounts ?? [];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <span className={`text-base font-semibold ${INK}`}>My live accounts in FX Copier</span>
        <p className={`text-sm leading-relaxed ${CAP}`}>
          A listed account can be found and followed by other users of the copier. Unlisted accounts are
          visible only to you.
        </p>
      </div>

      {isLoading ? (
        <div className="flex flex-col gap-2">{[0, 1].map(i => <Skeleton key={i} className="h-14 rounded-lg" />)}</div>
      ) : isError ? (
        <div role="alert" className="flex flex-wrap items-center gap-4 rounded-lg bg-rose-500/10 px-4 py-2 text-sm text-rose-400">
          Your accounts could not be loaded.
          <Button size="sm" variant="outline" onClick={() => refetch()} className="bg-transparent">Try again</Button>
        </div>
      ) : accounts.length === 0 ? (
        <div className="flex flex-col items-start gap-2 rounded-lg bg-[var(--jr-bg,#0b0f17)] p-4">
          <p className={`text-sm font-medium ${INK}`}>No live accounts yet</p>
          <p className={`text-sm ${CAP}`}>Connect a cTrader account and it will appear here, private until you list it.</p>
          <Button asChild size="sm" variant="outline" className={`bg-transparent ${INK}`}>
            <Link href="/journal?tab=accounts">Go to Accounts</Link>
          </Button>
        </div>
      ) : (
        <ul className="flex flex-col divide-y divide-[var(--jr-divider,rgba(255,255,255,0.06))] rounded-lg ring-1 ring-[var(--jr-border,rgba(255,255,255,0.08))]">
          {accounts.map(a => {
            const id = `list-${a.id}`;
            return (
              <li key={a.id} className="flex items-center justify-between gap-4 px-4 py-4 transition-colors duration-200 hover:bg-[var(--jr-divider,rgba(255,255,255,0.04))]">
                <div className="flex min-w-0 flex-col gap-1">
                  <Label htmlFor={id} className={`truncate text-sm font-semibold ${INK}`}>
                    {a.name}{a.loginId ? ` · ${a.loginId}` : ''}
                  </Label>
                  <span className={`text-xs ${CAP}`}>
                    {a.apiConnected
                      ? (a.listed ? 'Listed — other users can follow it' : 'Private')
                      : 'Cannot be listed: it is not connected through the cTrader API, so followers could not be copied from it.'}
                  </span>
                </div>
                <Switch id={id} checked={a.listed} disabled={!a.apiConnected || busyId === a.id}
                        onCheckedChange={next => void setAccountListed(a, next)} className={SWITCH} />
              </li>
            );
          })}
        </ul>
      )}
      <Status msg={msg} />
    </div>
  );
}
