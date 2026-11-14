import { useState } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/lib/supabase';
import { readableAuthError } from '@/lib/authMessages';
import { Section, Status, CAP, FIELD, type Msg } from './settingsUi';

/**
 * Password, Plan and Your data — MOVED from the old 300px panel (profile/ProfileSettings) on
 * 2026-11-15 with their wording unchanged, when Settings became a full page of the journal.
 */

/** Said when the change failed with nothing to go on at all. */
const COULD_NOT = 'Could not change the password. Please try again.';

export function PasswordSection() {
  const [pw1, setPw1] = useState(''); const [pw2, setPw2] = useState('');
  const [msg, setMsg] = useState<Msg>({ s: null, m: '' });
  const [saving, setSaving] = useState(false);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (pw1.length < 8) return setMsg({ s: 'err', m: 'Use at least 8 characters.' });
    if (pw1 !== pw2)    return setMsg({ s: 'err', m: 'The two do not match.' });
    if (!supabase)      return setMsg({ s: 'err', m: 'Unavailable right now.' });
    setSaving(true); setMsg({ s: null, m: '' });
    // ⚠ The login library re-throws anything it does not recognise as a login error (its own lock
    // timeout included), so a THROWN failure is caught as well as a returned one, and `saving` is
    // reset in `finally` — otherwise the button reads "Changing…" for ever. (Found 2026-11-08.)
    try {
      const { error } = await supabase.auth.updateUser({ password: pw1 });
      if (error) return setMsg({ s: 'err', m: readableAuthError(error.message, COULD_NOT) });
      setPw1(''); setPw2('');
      setMsg({ s: 'ok', m: 'Password changed.' });
    } catch (err: any) {
      setMsg({ s: 'err', m: readableAuthError(err?.message, COULD_NOT) });
    } finally { setSaving(false); }
  }

  return (
    <Section id="password" title="Password">
      <form onSubmit={save} className="flex max-w-md flex-col gap-4">
        <div className="flex flex-col gap-2">
          <Label htmlFor="pw1" className={`text-xs font-medium ${CAP}`}>New password</Label>
          <Input id="pw1" type="password" autoComplete="new-password" value={pw1}
                 onChange={e => setPw1(e.target.value)} className={FIELD} />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="pw2" className={`text-xs font-medium ${CAP}`}>Repeat it</Label>
          <Input id="pw2" type="password" autoComplete="new-password" value={pw2}
                 onChange={e => setPw2(e.target.value)} className={FIELD} />
        </div>
        <div><Button type="submit" disabled={saving}>{saving ? 'Changing…' : 'Change password'}</Button></div>
        <Status msg={msg} />
      </form>
    </Section>
  );
}

export function PlanSection({ plan }: { plan: string }) {
  return (
    <Section id="plan" title="Plan">
      <div><Badge className="rounded-full px-4 py-1 text-xs font-medium capitalize">{(plan || 'Free').toLowerCase()}</Badge></div>
      <p className={`text-sm leading-relaxed ${CAP}`}>
        Plans and upgrades are on the pricing page. To cancel, email support@tradeandjournal.com —
        your rights, including the 14-day right to change your mind, are in the Terms.
      </p>
    </Section>
  );
}

export function DataSection() {
  return (
    <Section id="data" title="Your data">
      <p className={`text-sm leading-relaxed ${CAP}`}>
        Export everything you have logged from the Analytics section, in CSV or JSON.
      </p>
      <p className={`text-sm leading-relaxed ${CAP}`}>
        To close your account, email support@tradeandjournal.com with the subject "Account
        Deletion". We export your data first, then remove or anonymise it within 90 days. We do
        this by hand so an account cannot be destroyed by accident.
      </p>
    </Section>
  );
}
