/** Account settings, INSIDE the profile dropdown.
 *
 * It was briefly a full page at /settings. That was wrong and the user said so plainly: opening it
 * threw you out of the journal onto the public site, where the header still shows "Sign in" and
 * "START FREE" — it read as being logged out. "Account setting cannot breach the login and get user
 * out like this. It must be within the login... just a feature that can be collapsed just here and
 * same size as image 2."
 *
 * So: same 300px panel, same place, collapsible sections. You never leave the page you were on.
 *
 * Every control is backed by something real — display name PATCHes /api/me/profile, password goes
 * through Supabase. Nothing renders that cannot save; that is what made the old menu item feel dead.
 */
import { useState } from 'react';
import { authFetch } from '@/lib/queryClient';
import { supabase } from '@/lib/supabase';
import { CSS } from './profileSettingsCss';


type Msg = { s: 'ok' | 'err' | null; m: string };

export default function ProfileSettings({ email, plan, displayName, onBack, onNameSaved }: {
  email: string | null; plan: string; displayName: string;
  onBack: () => void; onNameSaved: (n: string) => void;
}) {
  const [open, setOpen] = useState<string | null>('profile');
  const [name, setName] = useState(displayName);
  const [nameMsg, setNameMsg] = useState<Msg>({ s: null, m: '' });
  const [savingName, setSavingName] = useState(false);
  const [pw1, setPw1] = useState(''); const [pw2, setPw2] = useState('');
  const [pwMsg, setPwMsg] = useState<Msg>({ s: null, m: '' });
  const [savingPw, setSavingPw] = useState(false);

  const toggle = (id: string) => setOpen(o => (o === id ? null : id));

  async function saveName(e: React.FormEvent) {
    e.preventDefault();
    setSavingName(true); setNameMsg({ s: null, m: '' });
    try {
      const r = await authFetch('/api/me/profile', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fullName: name }),
      });
      if (!r.ok) throw new Error('Could not save.');
      setNameMsg({ s: 'ok', m: 'Saved.' });
      onNameSaved(name.trim());
    } catch (err) {
      setNameMsg({ s: 'err', m: err instanceof Error ? err.message : 'Could not save.' });
    } finally { setSavingName(false); }
  }

  async function savePw(e: React.FormEvent) {
    e.preventDefault();
    if (pw1.length < 8) return setPwMsg({ s: 'err', m: 'Use at least 8 characters.' });
    if (pw1 !== pw2)    return setPwMsg({ s: 'err', m: 'The two do not match.' });
    if (!supabase)      return setPwMsg({ s: 'err', m: 'Unavailable right now.' });
    setSavingPw(true); setPwMsg({ s: null, m: '' });
    const { error } = await supabase.auth.updateUser({ password: pw1 });
    setSavingPw(false);
    if (error) return setPwMsg({ s: 'err', m: error.message });
    setPw1(''); setPw2('');
    setPwMsg({ s: 'ok', m: 'Password changed.' });
  }

  const Section = ({ id, label, children }: { id: string; label: string; children: React.ReactNode }) => (
    <div className="ps-sec">
      <button className="ps-sec-btn" data-open={open === id ? '1' : '0'} onClick={() => toggle(id)}
              type="button" aria-expanded={open === id}>
        {label}<span className="ps-sign" aria-hidden>+</span>
      </button>
      {open === id && <div className="ps-body">{children}</div>}
    </div>
  );

  return (
    <>
      <style>{CSS}</style>
      <div className="ps-head">
        <button className="ps-back" onClick={onBack} type="button" aria-label="Back to profile">‹</button>
        <span className="ps-title">account settings</span>
      </div>

      <Section id="profile" label="Your details">
        <form onSubmit={saveName} style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
          <span className="ps-lab">display name</span>
          <input className="ps-in" value={name} maxLength={100} onChange={e => setName(e.target.value)} />
          <span className="ps-lab">email</span>
          <input className="ps-in" value={email ?? ''} disabled readOnly />
          <span className="ps-note">To change your sign-in email, contact support — we verify it by hand.</span>
          <button className="ps-btn" type="submit" disabled={savingName}>{savingName ? 'Saving…' : 'Save'}</button>
          {nameMsg.s && <span className={nameMsg.s === 'ok' ? 'ps-ok' : 'ps-err'}>{nameMsg.m}</span>}
        </form>
      </Section>

      <Section id="password" label="Password">
        <form onSubmit={savePw} style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
          <span className="ps-lab">new password</span>
          <input className="ps-in" type="password" value={pw1} autoComplete="new-password"
                 onChange={e => setPw1(e.target.value)} />
          <span className="ps-lab">repeat it</span>
          <input className="ps-in" type="password" value={pw2} autoComplete="new-password"
                 onChange={e => setPw2(e.target.value)} />
          <button className="ps-btn" type="submit" disabled={savingPw}>{savingPw ? 'Changing…' : 'Change password'}</button>
          {pwMsg.s && <span className={pwMsg.s === 'ok' ? 'ps-ok' : 'ps-err'}>{pwMsg.m}</span>}
        </form>
      </Section>

      <Section id="plan" label="Plan">
        <div className="ps-plan">
          <span className="ps-pill">{(plan || 'Free').toLowerCase()}</span>
        </div>
        <span className="ps-note">
          Plans and upgrades are on the pricing page. To cancel, email support@tradeandjournal.com —
          your rights, including the 14-day right to change your mind, are in the Terms.
        </span>
      </Section>

      <Section id="data" label="Your data">
        <span className="ps-note">
          Export everything you have logged from the Analytics section, in CSV or JSON.
          <br /><br />
          To close your account, email support@tradeandjournal.com with the subject "Account
          Deletion". We export your data first, then remove or anonymise it within 90 days. We do
          this by hand so an account cannot be destroyed by accident.
        </span>
      </Section>
    </>
  );
}
