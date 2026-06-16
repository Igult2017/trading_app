import { useEffect, useState } from 'react';
import { useLocation } from 'wouter';
import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/lib/supabase';

export type AuthModalMode = 'login' | 'signup' | 'forgot';

/** Open the auth modal from anywhere (e.g. header / CTA buttons). */
export function openAuthModal(mode: AuthModalMode = 'login') {
  window.dispatchEvent(new CustomEvent('open-auth-modal', { detail: mode }));
}

export default function AuthModal() {
  const { signIn, signUp } = useAuth();
  const [, navigate] = useLocation();

  const [open, setOpen]     = useState(false);
  const [mode, setMode]     = useState<AuthModalMode>('login');
  const [first, setFirst]   = useState('');
  const [last, setLast]     = useState('');
  const [email, setEmail]   = useState('');
  const [password, setPwd]  = useState('');
  const [showPass, setShow] = useState(false);
  const [busy, setBusy]     = useState(false);
  const [gbusy, setGbusy]   = useState(false);
  const [error, setError]   = useState('');
  const [info, setInfo]     = useState('');

  const [isReturning] = useState(() => {
    try { return localStorage.getItem('fmj_returning') === '1'; } catch { return false; }
  });

  const go = (m: AuthModalMode) => { setMode(m); setError(''); setInfo(''); };

  useEffect(() => {
    const onOpen = (e: Event) => {
      const m = (e as CustomEvent).detail as AuthModalMode;
      setMode(m === 'signup' ? 'signup' : m === 'forgot' ? 'forgot' : 'login');
      setError(''); setInfo('');
      setOpen(true);
    };
    window.addEventListener('open-auth-modal', onOpen);
    return () => window.removeEventListener('open-auth-modal', onOpen);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    window.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { window.removeEventListener('keydown', onKey); document.body.style.overflow = prev; };
  }, [open]);

  if (!open) return null;
  const close = () => setOpen(false);
  const busyAll = busy || gbusy;

  async function google() {
    if (!supabase) { setError('Google sign-in is not configured.'); return; }
    setGbusy(true); setError('');
    const { error: err } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    });
    if (err) { setError('Google sign-in failed. Please try again.'); setGbusy(false); }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(''); setInfo('');

    if (mode === 'forgot') {
      if (!supabase) { setError('Password reset is not configured.'); return; }
      setBusy(true);
      try {
        const { error: err } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: `${window.location.origin}/auth/reset-password`,
        });
        if (err) setError(err.message);
        else setInfo('Reset link sent! Check your inbox and follow the link to set a new password.');
      } finally { setBusy(false); }
      return;
    }

    if (mode === 'signup' && password.length < 8) { setError('Password must be at least 8 characters.'); return; }
    setBusy(true);
    try {
      if (mode === 'login') {
        const { error: err, role } = await signIn(email, password);
        if (err) { setError(err.message); return; }
        try { localStorage.setItem('fmj_returning', '1'); } catch {}
        close();
        navigate(role === 'admin' ? '/admin' : '/journal', { replace: true });
      } else {
        const { error: err, emailConfirmationRequired } = await signUp(email, password, `${first} ${last}`.trim());
        if (err) { setError(err.message); return; }
        if (emailConfirmationRequired) {
          setInfo('Account created! Check your email to confirm, then sign in.');
          setMode('login');
        } else {
          close();
          navigate('/journal', { replace: true });
        }
      }
    } finally { setBusy(false); }
  }

  const title = mode === 'forgot' ? 'Reset your password'
    : mode === 'login' ? 'Sign in to trade&journal' : 'Create your account';
  const sub = mode === 'forgot' ? "Enter your email and we'll send you a reset link."
    : mode === 'login' ? 'Welcome back! Please sign in to continue'
    : 'Welcome! Please fill in the details to get started.';

  return (
    <div className="am-backdrop" onMouseDown={close}>
      <style>{AM_CSS}</style>
      <div className="am-card" role="dialog" aria-modal="true" onMouseDown={e => e.stopPropagation()}>
        <button className="am-close" onClick={close} aria-label="Close">✕</button>
        <h2 className="am-title">{title}</h2>
        <p className="am-sub">{sub}</p>

        {mode !== 'forgot' && (
          <>
            <button className="am-google" type="button" onClick={google} disabled={busyAll}>
              {gbusy ? <span className="am-spin" /> : <GoogleIcon />}
              {mode === 'login' ? 'Continue with Google' : 'Sign up with Google'}
              {isReturning && mode === 'login' && <span className="am-badge">Last used</span>}
            </button>
            <div className="am-divider"><span>or</span></div>
          </>
        )}

        <form onSubmit={submit} className="am-form">
          {mode === 'signup' && (
            <div className="am-row">
              <div className="am-field">
                <label className="am-label">First name</label>
                <input className="am-input" value={first} onChange={e => setFirst(e.target.value)} placeholder="First name" autoComplete="given-name" disabled={busyAll} />
              </div>
              <div className="am-field">
                <label className="am-label">Last name</label>
                <input className="am-input" value={last} onChange={e => setLast(e.target.value)} placeholder="Last name" autoComplete="family-name" disabled={busyAll} />
              </div>
            </div>
          )}
          <div className="am-field">
            <label className="am-label">Email address</label>
            <input className="am-input" type="email" required value={email} onChange={e => setEmail(e.target.value)} placeholder="Enter your email address" autoComplete="email" disabled={busyAll} />
          </div>
          {mode !== 'forgot' && (
            <div className="am-field">
              <label className="am-label">Password</label>
              <div className="am-passwrap">
                <input className="am-input" type={showPass ? 'text' : 'password'} required value={password} onChange={e => setPwd(e.target.value)} placeholder={mode === 'login' ? 'Enter your password' : 'Create a password'} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} disabled={busyAll} />
                <button type="button" className="am-eye" tabIndex={-1} onClick={() => setShow(v => !v)} aria-label="Toggle password"><EyeIcon open={showPass} /></button>
              </div>
            </div>
          )}

          {mode === 'login' && (
            <div className="am-forgot"><button type="button" className="am-link" onClick={() => go('forgot')}>Forgot password?</button></div>
          )}

          {error && <div className="am-error">{error}</div>}
          {info  && <div className="am-info">{info}</div>}

          <button className="am-submit" type="submit" disabled={busyAll}>
            {busy ? 'Please wait…' : mode === 'forgot' ? 'Send reset link' : 'Continue ›'}
          </button>
        </form>

        <div className="am-switch">
          {mode === 'login' && (
            <>Don’t have an account? <button className="am-link" onClick={() => go('signup')}>Sign up</button></>
          )}
          {mode === 'signup' && (
            <>Already have an account? <button className="am-link" onClick={() => go('login')}>Sign in</button></>
          )}
          {mode === 'forgot' && (
            <button className="am-link" onClick={() => go('login')}>← Back to sign in</button>
          )}
        </div>
      </div>
    </div>
  );
}

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
    </svg>
  );
}

function EyeIcon({ open }: { open: boolean }) {
  return open ? (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/>
      <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/>
      <line x1="1" y1="1" x2="23" y2="23"/>
    </svg>
  ) : (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>
    </svg>
  );
}

const AM_CSS = `
.am-backdrop { position:fixed; inset:0; z-index:1000; display:flex; align-items:center; justify-content:center; padding:20px; background:rgba(15,23,42,0.55); backdrop-filter:blur(4px); -webkit-backdrop-filter:blur(4px); animation:am-fade .15s ease; }
@keyframes am-fade { from{opacity:0} to{opacity:1} }
@keyframes am-pop { from{opacity:0;transform:translateY(8px) scale(.98)} to{opacity:1;transform:none} }
@keyframes am-spin { to{transform:rotate(360deg)} }
.am-card { position:relative; width:100%; max-width:400px; background:#fff; border-radius:16px; box-shadow:0 20px 60px rgba(0,0,0,.25); padding:32px 28px 24px; font-family:'Inter',sans-serif; animation:am-pop .2s ease; max-height:calc(100vh - 40px); overflow-y:auto; }
.am-close { position:absolute; top:16px; right:16px; background:none; border:none; cursor:pointer; color:#9ca3af; font-size:15px; line-height:1; padding:5px; border-radius:6px; transition:background .15s,color .15s; }
.am-close:hover { background:#f3f4f6; color:#374151; }
.am-title { text-align:center; font-size:17px; font-weight:700; color:#111827; margin:0 0 6px; }
.am-sub { text-align:center; font-size:13px; color:#6b7280; margin:0 0 22px; }
.am-google { width:100%; display:flex; align-items:center; justify-content:center; gap:10px; padding:11px 14px; background:#fff; border:1px solid #e5e7eb; border-radius:8px; font-size:14px; font-weight:500; color:#374151; cursor:pointer; position:relative; transition:background .15s,border-color .15s; }
.am-google:hover:not(:disabled) { background:#f9fafb; }
.am-google:disabled { opacity:.6; cursor:not-allowed; }
.am-badge { position:absolute; right:12px; top:50%; transform:translateY(-50%); font-size:10px; font-weight:600; color:#9ca3af; background:#f3f4f6; border:1px solid #e5e7eb; border-radius:5px; padding:2px 6px; }
.am-divider { display:flex; align-items:center; gap:12px; margin:18px 0; color:#9ca3af; font-size:12px; }
.am-divider::before, .am-divider::after { content:''; flex:1; height:1px; background:#e5e7eb; }
.am-form { display:flex; flex-direction:column; gap:14px; }
.am-row { display:flex; gap:12px; }
.am-field { flex:1; display:flex; flex-direction:column; gap:6px; }
.am-label { font-size:13px; font-weight:600; color:#374151; }
.am-input { width:100%; box-sizing:border-box; background:#fff; border:1px solid #e5e7eb; border-radius:8px; padding:10px 12px; font-size:14px; color:#111827; outline:none; transition:border-color .15s, box-shadow .15s; }
.am-input::placeholder { color:#9ca3af; }
.am-input:focus { border-color:#2563eb; box-shadow:0 0 0 3px rgba(37,99,235,.12); }
.am-input:disabled { opacity:.6; }
.am-passwrap { position:relative; }
.am-passwrap .am-input { padding-right:40px; }
.am-eye { position:absolute; right:10px; top:50%; transform:translateY(-50%); background:none; border:none; cursor:pointer; color:#9ca3af; padding:2px; display:flex; }
.am-eye:hover { color:#4b5563; }
.am-forgot { text-align:right; margin-top:-4px; }
.am-link { background:none; border:none; padding:0; color:#2563eb; font-size:13px; font-weight:600; cursor:pointer; text-decoration:none; font-family:inherit; }
.am-link:hover { text-decoration:underline; }
.am-submit { margin-top:4px; width:100%; padding:11px; background:#111827; color:#fff; border:none; border-radius:8px; font-size:14px; font-weight:600; cursor:pointer; transition:background .15s; }
.am-submit:hover:not(:disabled) { background:#1f2937; }
.am-submit:disabled { opacity:.6; cursor:not-allowed; }
.am-error { background:#fef2f2; border:1px solid #fecaca; color:#dc2626; font-size:13px; border-radius:8px; padding:9px 12px; }
.am-info { background:#eff6ff; border:1px solid #bfdbfe; color:#2563eb; font-size:13px; border-radius:8px; padding:9px 12px; }
.am-switch { text-align:center; margin-top:18px; font-size:13px; color:#6b7280; }
.am-spin { width:18px; height:18px; border-radius:50%; border:2px solid #d1d5db; border-top-color:#374151; animation:am-spin .7s linear infinite; }
`;
