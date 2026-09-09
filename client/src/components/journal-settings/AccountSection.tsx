import { useState, useEffect, useRef } from 'react';
import { useLocation } from 'wouter';
import type { ThemeDef } from '@/hooks/useJournalSettings';
import { useAuth } from '@/context/AuthContext';
import { authFetch } from '@/lib/queryClient';
import { Card, SectionHead, GroupLabel } from './ui';

/** Your display name and signing out. Behaviour is unchanged — only the layout and sizes moved. */
export default function AccountSection({ T, face }: { T: ThemeDef; face: string }) {
  const { user, signOut } = useAuth();
  const [, navigate] = useLocation();
  const [signingOut, setSigningOut] = useState(false);

  const [displayName, setDisplayName] = useState('');
  const [nameEdit, setNameEdit] = useState(false);
  const [nameSaving, setNameSaving] = useState(false);
  const [nameSaved, setNameSaved] = useState(false);
  const nameInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!user) return;
    authFetch('/api/me/profile').then(r => r.ok ? r.json() : null).then(d => {
      if (d?.fullName) setDisplayName(d.fullName);
    }).catch(() => {});
  }, [user?.id]);

  useEffect(() => { if (nameEdit) nameInputRef.current?.focus(); }, [nameEdit]);

  async function saveName() {
    const trimmed = displayName.trim();
    if (!trimmed) return;
    setNameSaving(true);
    try {
      await authFetch('/api/me/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fullName: trimmed }),
      });
      setNameEdit(false);
      setNameSaved(true);
      setTimeout(() => setNameSaved(false), 2500);
    } catch (_) {}
    setNameSaving(false);
  }

  async function handleLogout() {
    if (signingOut) return;
    setSigningOut(true);
    try {
      await signOut();
      navigate('/');
    } finally {
      setSigningOut(false);
    }
  }

  const btn = (bg: string, fg: string): React.CSSProperties => ({
    padding: '9px 16px', borderRadius: 8, border: 'none', background: bg, color: fg,
    fontSize: 12, fontWeight: 600, letterSpacing: '0.03em', cursor: 'pointer',
    fontFamily: 'inherit', transition: 'opacity 0.15s',
  });

  if (!user) return null;

  return (
    <div>
      <SectionHead T={T} font={face} title="Account"
        hint="Your name as it appears in the journal, and the way out." />

      <Card T={T} style={{ marginBottom: 16 }}>
        <GroupLabel T={T}>Display name</GroupLabel>
        {nameEdit ? (
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <input
              ref={nameInputRef}
              value={displayName}
              onChange={e => setDisplayName(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') saveName(); if (e.key === 'Escape') setNameEdit(false); }}
              maxLength={100}
              aria-label="Display name"
              style={{
                flex: '1 1 220px', background: T.bg, border: `1px solid ${T.accent}`,
                borderRadius: 8, padding: '9px 12px', color: T.text, fontSize: 13,
                fontFamily: 'inherit', outline: 'none',
              }}
            />
            <button type="button" onClick={saveName} disabled={nameSaving}
              style={{ ...btn(T.accent, '#fff'), opacity: nameSaving ? 0.6 : 1,
                       cursor: nameSaving ? 'wait' : 'pointer' }}>
              {nameSaving ? 'Saving…' : 'Save'}
            </button>
            <button type="button" onClick={() => setNameEdit(false)}
              style={{ ...btn('transparent', T.textMuted), border: `1px solid ${T.border}` }}>
              Cancel
            </button>
          </div>
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 15, color: displayName ? T.text : T.textMuted, fontWeight: 600 }}>
              {displayName || 'Not set'}
            </span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              {nameSaved && (
                <span style={{ fontSize: 11, color: '#22d3a5', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
                  Saved ✓
                </span>
              )}
              <button type="button" onClick={() => setNameEdit(true)}
                style={{ ...btn('transparent', T.textMuted), border: `1px solid ${T.border}`, fontSize: 11 }}
                onMouseEnter={e => { e.currentTarget.style.color = T.text; e.currentTarget.style.borderColor = T.textMuted; }}
                onMouseLeave={e => { e.currentTarget.style.color = T.textMuted; e.currentTarget.style.borderColor = T.border; }}
              >Edit</button>
            </div>
          </div>
        )}
      </Card>

      <Card T={T} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
        <div style={{ minWidth: 0, flex: '1 1 220px' }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: T.text, marginBottom: 4, letterSpacing: '0.01em' }}>
            Sign out
          </div>
          <div style={{ fontSize: 13, color: T.textMuted, lineHeight: 1.6, wordBreak: 'break-word' }}>
            You will be returned to the homepage. Your session data stays safe.
          </div>
        </div>
        <button type="button" onClick={handleLogout} disabled={signingOut}
          style={{ ...btn('#ef4444', '#fff'), padding: '10px 20px',
                   opacity: signingOut ? 0.6 : 1, cursor: signingOut ? 'wait' : 'pointer',
                   boxShadow: '0 2px 8px rgba(239,68,68,0.25)' }}>
          {signingOut ? 'Signing out…' : 'Sign out'}
        </button>
      </Card>
    </div>
  );
}
