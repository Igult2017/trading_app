import { useEffect, useState } from 'react';
import { UserCircle2 } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { authFetch } from '@/lib/queryClient';
import type { MyProfile } from '@/components/profile/useMyProfile';
import { Section, Status, CAP, INK, FIELD, type Msg } from './settingsUi';

/**
 * Profile — photo (change / remove), display name, email. The name save is the old panel's
 * (PATCH /api/me/profile); the photo goes through the same framing editor as the profile menu.
 */
export function ProfileSection({ profile, onPickPhoto, refresh }: {
  profile: MyProfile; onPickPhoto: () => void; refresh: () => Promise<unknown> | void;
}) {
  const [name, setName] = useState(profile.fullName);
  useEffect(() => { setName(profile.fullName); }, [profile.fullName]);
  const [msg, setMsg] = useState<Msg>({ s: null, m: '' });
  const [saving, setSaving] = useState(false);
  const [photoMsg, setPhotoMsg] = useState<Msg>({ s: null, m: '' });
  const [removing, setRemoving] = useState(false);

  async function saveName(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return setMsg({ s: 'err', m: 'Your name cannot be empty.' });
    setSaving(true); setMsg({ s: null, m: '' });
    try {
      const r = await authFetch('/api/me/profile', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fullName: name }),
      });
      if (!r.ok) throw new Error('Could not save.');
      setMsg({ s: 'ok', m: 'Saved.' });
      await refresh();
    } catch (err) {
      setMsg({ s: 'err', m: err instanceof Error ? err.message : 'Could not save.' });
    } finally { setSaving(false); }
  }

  async function removePhoto() {
    setRemoving(true); setPhotoMsg({ s: null, m: '' });
    try {
      const r = await authFetch('/api/me/avatar', { method: 'DELETE' });
      if (!r.ok) throw new Error('Could not remove the photo.');
      await refresh();
      setPhotoMsg({ s: 'ok', m: 'Photo removed.' });
    } catch (err) {
      setPhotoMsg({ s: 'err', m: err instanceof Error ? err.message : 'Could not remove the photo.' });
    } finally { setRemoving(false); }
  }

  return (
    <Section id="profile" title="Profile" description="How you appear across the journal.">
      <div className="flex flex-wrap items-center gap-6">
        <div className="flex h-24 w-24 shrink-0 items-center justify-center overflow-hidden rounded-full bg-white ring-1 ring-[var(--jr-border,rgba(255,255,255,0.12))]">
          {profile.avatarUrl
            ? <img src={profile.avatarUrl} alt="Your profile photo" className="h-full w-full object-contain" />
            : <UserCircle2 aria-hidden className="h-12 w-12 text-slate-400" />}
        </div>
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap gap-2">
            <Button type="button" onClick={onPickPhoto}>{profile.avatarUrl ? 'Change photo' : 'Add a photo'}</Button>
            {profile.avatarUrl && (
              <Button type="button" variant="outline" disabled={removing} onClick={removePhoto}
                      className={`bg-transparent ${INK} border-[var(--jr-border,rgba(255,255,255,0.12))] hover:bg-[var(--jr-divider,rgba(255,255,255,0.04))]`}>
                {removing ? 'Removing…' : 'Remove'}
              </Button>
            )}
          </div>
          <p className={`text-xs ${CAP}`}>PNG, JPEG or WebP. You can position it before it is saved.</p>
          <Status msg={photoMsg} />
        </div>
      </div>

      <form onSubmit={saveName} className="flex max-w-md flex-col gap-4">
        <div className="flex flex-col gap-2">
          <Label htmlFor="displayName" className={`text-xs font-medium ${CAP}`}>Display name</Label>
          <Input id="displayName" value={name} maxLength={100} onChange={e => setName(e.target.value)} className={FIELD} />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="email" className={`text-xs font-medium ${CAP}`}>Email</Label>
          <Input id="email" value={profile.email ?? ''} disabled readOnly className={FIELD} />
          <p className={`text-xs ${CAP}`}>To change your sign-in email, contact support — we verify it by hand.</p>
        </div>
        <div><Button type="submit" disabled={saving}>{saving ? 'Saving…' : 'Save'}</Button></div>
        <Status msg={msg} />
      </form>
    </Section>
  );
}
