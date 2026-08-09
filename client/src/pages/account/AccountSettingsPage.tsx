/** /settings — the real Account Settings page.
 *
 * Created 2026-08-08. The profile dropdown's "account settings" item used to set
 * localStorage.admin_active_tab = 'journal-settings' and navigate to /admin — which is (a) journal
 * settings, not account settings, and (b) behind the admin guard, so an ordinary user was bounced
 * straight back to /journal and nothing appeared to happen. User: "Nothing is working here... that
 * was not for account setting but journal setting. I moved it to admin panel. So create account
 * setting."
 *
 * EVERY CONTROL HERE IS BACKED BY SOMETHING THAT EXISTS. Display name -> PATCH /api/me/profile.
 * Avatar -> POST /api/me/avatar. Password -> Supabase. Nothing is rendered that cannot save, which
 * is the whole reason the old item felt broken.
 */
import { useEffect, useState } from 'react';
import SEOHead from '@/components/SEOHead';
import { useAuth } from '@/context/AuthContext';
import { authFetch } from '@/lib/queryClient';
import { supabase } from '@/lib/supabase';
import { usePublicTheme } from '@/context/PublicThemeContext';
import { aTokens, SERIF, SANS, Card, Label, inputStyle, btnStyle, Result } from './accountUI';
import AccountPlan from './AccountPlan';

type Profile = { email: string | null; fullName: string; plan: string; country: string;
                 subscriptionStatus: string; subscriptionEndsAt: string | null; avatarUrl: string | null };

export default function AccountSettingsPage() {
  const { darkMode: dm } = usePublicTheme();
  const { user } = useAuth();
  const t = aTokens(dm);

  const [p, setP] = useState<Profile | null>(null);
  const [name, setName] = useState('');
  const [nameState, setNameState] = useState<{ s: 'ok' | 'err' | null; m: string }>({ s: null, m: '' });
  const [savingName, setSavingName] = useState(false);

  const [pw1, setPw1] = useState(''); const [pw2, setPw2] = useState('');
  const [pwState, setPwState] = useState<{ s: 'ok' | 'err' | null; m: string }>({ s: null, m: '' });
  const [savingPw, setSavingPw] = useState(false);

  useEffect(() => {
    if (!user) return;
    let dead = false;
    authFetch('/api/me/profile')
      .then(r => (r.ok ? r.json() : null))
      .then(d => { if (!dead && d) { setP(d); setName(d.fullName || ''); } })
      .catch(() => {});
    return () => { dead = true; };
  }, [user?.id]);

  async function saveName(e: React.FormEvent) {
    e.preventDefault();
    setSavingName(true); setNameState({ s: null, m: '' });
    try {
      const r = await authFetch('/api/me/profile', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fullName: name }),
      });
      if (!r.ok) throw new Error('Could not save your name.');
      setNameState({ s: 'ok', m: 'Saved.' });
    } catch (err) {
      setNameState({ s: 'err', m: err instanceof Error ? err.message : 'Could not save your name.' });
    } finally { setSavingName(false); }
  }

  async function savePassword(e: React.FormEvent) {
    e.preventDefault();
    if (pw1.length < 8)  return setPwState({ s: 'err', m: 'Use at least 8 characters.' });
    if (pw1 !== pw2)     return setPwState({ s: 'err', m: 'The two passwords do not match.' });
    if (!supabase)       return setPwState({ s: 'err', m: 'Password changes are unavailable right now.' });
    setSavingPw(true); setPwState({ s: null, m: '' });
    const { error } = await supabase.auth.updateUser({ password: pw1 });
    setSavingPw(false);
    if (error) return setPwState({ s: 'err', m: error.message });
    setPw1(''); setPw2('');
    setPwState({ s: 'ok', m: 'Password changed. It applies the next time you sign in.' });
  }

  return (
    <>
      <SEOHead title="Account settings" description="Manage your Trade & Journal account." canonical="/settings" noindex />
      <div style={{ minHeight: '100vh', background: t.bg, transition: 'background .3s' }}>
        <div style={{ maxWidth: 720, margin: '0 auto', padding: 'clamp(32px,5vw,60px) 24px 96px' }}>
          <h1 style={{ fontFamily: SERIF, fontSize: 'clamp(1.8rem,3.6vw,2.4rem)', fontWeight: 700,
                       color: t.ink, margin: '0 0 6px', letterSpacing: '-0.015em' }}>
            Account settings
          </h1>
          <p style={{ fontFamily: SERIF, fontSize: 15, color: t.body, margin: '0 0 30px' }}>
            Your sign-in details and plan. Journal preferences — theme, fonts and panels — live in the
            journal itself.
          </p>

          <Card dm={dm} title="Your details" note="How your name appears in the app.">
            <form onSubmit={saveName}>
              <Label dm={dm}>Display name</Label>
              <input style={inputStyle(dm)} value={name} onChange={e => setName(e.target.value)}
                     maxLength={100} placeholder="Your name" />
              <div style={{ marginTop: 12 }}>
                <Label dm={dm}>Email</Label>
                <input style={inputStyle(dm, true)} value={p?.email ?? ''} disabled readOnly />
                <p style={{ fontFamily: SERIF, fontSize: 12.5, color: t.dim, margin: '7px 0 0' }}>
                  To change the email you sign in with, contact support — we verify it by hand so an
                  account cannot be moved to someone else's address.
                </p>
                <p style={{ fontFamily: SERIF, fontSize: 12.5, color: t.dim, margin: '7px 0 0' }}>
                  To change your photo, click your avatar in the profile menu, top right.
                </p>
              </div>
              <div style={{ marginTop: 18 }}>
                <button type="submit" disabled={savingName} style={btnStyle(dm, savingName)}>
                  {savingName ? 'Saving…' : 'Save changes'}
                </button>
              </div>
              <Result dm={dm} state={nameState.s} msg={nameState.m} />
            </form>
          </Card>

          <Card dm={dm} title="Password" note="Use at least 8 characters. You stay signed in on this device.">
            <form onSubmit={savePassword}>
              <Label dm={dm}>New password</Label>
              <input style={inputStyle(dm)} type="password" value={pw1} autoComplete="new-password"
                     onChange={e => setPw1(e.target.value)} placeholder="New password" />
              <div style={{ marginTop: 12 }}>
                <Label dm={dm}>Confirm new password</Label>
                <input style={inputStyle(dm)} type="password" value={pw2} autoComplete="new-password"
                       onChange={e => setPw2(e.target.value)} placeholder="Repeat it" />
              </div>
              <div style={{ marginTop: 18 }}>
                <button type="submit" disabled={savingPw} style={btnStyle(dm, savingPw)}>
                  {savingPw ? 'Changing…' : 'Change password'}
                </button>
              </div>
              <Result dm={dm} state={pwState.s} msg={pwState.m} />
            </form>
          </Card>

          <AccountPlan dm={dm} plan={p?.plan ?? 'Free'} status={p?.subscriptionStatus ?? 'free'}
                       endsAt={p?.subscriptionEndsAt ?? null} />

          <p style={{ fontFamily: SANS, fontSize: 12, lineHeight: 1.7, color: t.dim, margin: '4px 0 0' }}>
            Signed in as {p?.email ?? user?.email ?? '—'}.
          </p>
        </div>
      </div>
    </>
  );
}
