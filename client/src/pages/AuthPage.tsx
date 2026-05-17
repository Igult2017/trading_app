import { useEffect, useState } from 'react';
import { useLocation, useSearch } from 'wouter';
import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/lib/supabase';
import faviconUrl from '/favicon.png';

type Mode = 'login' | 'signup';

export default function AuthPage() {
  const search = useSearch();
  const urlMode = new URLSearchParams(search).get('mode');

  const [mode, setMode]                     = useState<Mode>(urlMode === 'signup' ? 'signup' : 'login');
  const [email, setEmail]                   = useState('');
  const [password, setPassword]             = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [fullName, setFullName]             = useState('');
  const [showPass, setShowPass]             = useState(false);
  const [showConfirm, setShowConfirm]       = useState(false);
  const [rememberMe, setRememberMe]         = useState(true);
  const [error, setError]                   = useState('');
  const [info, setInfo]                     = useState('');
  const [busy, setBusy]                     = useState(false);

  const { signIn, signUp, role, loading } = useAuth();
  const [, navigate] = useLocation();

  useEffect(() => {
    if (!loading && role) {
      navigate(role === 'admin' ? '/admin' : '/journal', { replace: true });
    }
  }, [loading, role, navigate]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setInfo('');

    if (mode === 'signup' && password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }
    if (password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }

    setBusy(true);
    try {
      if (mode === 'login') {
        const { error: err, role: assignedRole } = await signIn(email, password);
        if (err) { setError(err.message); return; }
        navigate(assignedRole === 'admin' ? '/admin' : '/journal', { replace: true });
      } else {
        const { error: err, emailConfirmationRequired } = await signUp(email, password, fullName);
        if (err) { setError(err.message); return; }
        if (emailConfirmationRequired) {
          setInfo('Account created! Please check your email to confirm, then sign in.');
        } else {
          setInfo('Account created! Signing you in…');
        }
        setMode('login');
        setEmail('');
        setPassword('');
        setConfirmPassword('');
        setFullName('');
      }
    } finally {
      setBusy(false);
    }
  }

  const disabled = loading || busy;

  return (
    <div style={S.page}>
      <style>{`
        @keyframes auth-spin { to { transform: rotate(360deg); } }
        .auth-input { width:100%; box-sizing:border-box; background:#0e1420; border:1px solid #1a2540; border-radius:8px; padding:14px 16px; color:#e2e8f0; font-size:14px; font-family:'Poppins','Inter',sans-serif; outline:none; transition:border-color 0.2s; }
        .auth-input::placeholder { color:#3d5070; }
        .auth-input:focus { border-color:#2563eb; }
        .auth-input:disabled { opacity:0.5; }
        .auth-pass-wrap { position:relative; }
        .auth-pass-wrap .auth-input { padding-right:44px; }
        .auth-eye { position:absolute; right:14px; top:50%; transform:translateY(-50%); background:none; border:none; cursor:pointer; color:#3d5070; padding:0; display:flex; align-items:center; transition:color 0.15s; }
        .auth-eye:hover { color:#94a3b8; }
        .auth-btn { width:100%; padding:14px; background:#2563eb; color:#fff; border:none; border-radius:8px; font-size:15px; font-weight:700; font-family:'Poppins','Inter',sans-serif; cursor:pointer; letter-spacing:0.02em; transition:background 0.2s; }
        .auth-btn:hover:not(:disabled) { background:#1d4ed8; }
        .auth-btn:disabled { opacity:0.6; cursor:not-allowed; }
        .auth-link { background:none; border:none; color:#3b82f6; font-size:14px; cursor:pointer; font-family:'Poppins','Inter',sans-serif; font-weight:500; padding:0; transition:color 0.15s; }
        .auth-link:hover { color:#60a5fa; }
        .auth-footer-link { color:#3d5070; font-size:12px; text-decoration:none; font-family:'Poppins','Inter',sans-serif; transition:color 0.15s; }
        .auth-footer-link:hover { color:#94a3b8; }
        .auth-check { width:16px; height:16px; accent-color:#2563eb; cursor:pointer; }
        .auth-divider { display:flex; align-items:center; gap:12px; }
        .auth-divider-line { flex:1; height:1px; background:#1a2540; }
      `}</style>

      {/* Logo */}
      <div style={S.logoRow}>
        <img src={faviconUrl} alt="logo" style={{ width: 36, height: 36, borderRadius: 8, objectFit: 'cover' }} />
        <span style={S.logoText}>
          <span style={{ color: '#ffffff' }}>My FM</span>
          <span style={{ color: '#3b82f6' }}> | Journal</span>
        </span>
      </div>

      {/* Heading */}
      <h1 style={S.title}>
        {mode === 'login' ? 'Welcome back' : 'Create account'}
      </h1>
      <p style={S.sub}>
        {mode === 'login' ? 'Sign in to continue.' : 'Join My FM | Journal and start tracking your trades.'}
      </p>

      {/* Admin mode notice */}
      {!supabase && mode === 'login' && (
        <div style={S.notice}>
          <span style={{ color: '#3b82f6', fontWeight: 600 }}>Admin mode</span> — use your admin email and admin secret as the password.
        </div>
      )}

      {/* Loading indicator */}
      {loading && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16, justifyContent: 'center' }}>
          <div style={{ width: 14, height: 14, borderRadius: '50%', border: '2px solid rgba(59,130,246,0.25)', borderTopColor: '#3b82f6', animation: 'auth-spin 0.8s linear infinite' }} />
          <span style={{ fontSize: 11, color: '#3d5070' }}>Checking session…</span>
        </div>
      )}

      {/* Form */}
      <form onSubmit={handleSubmit} style={S.form}>
        {mode === 'signup' && (
          <input
            className="auth-input"
            type="text"
            placeholder="Full Name"
            value={fullName}
            onChange={e => setFullName(e.target.value)}
            required
            disabled={disabled}
            autoComplete="name"
          />
        )}

        <input
          className="auth-input"
          type="email"
          placeholder="Email Address"
          value={email}
          onChange={e => setEmail(e.target.value)}
          required
          disabled={disabled}
          autoComplete="email"
        />

        <div className="auth-pass-wrap">
          <input
            className="auth-input"
            type={showPass ? 'text' : 'password'}
            placeholder="Password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            required
            disabled={disabled}
            autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
          />
          <button type="button" className="auth-eye" onClick={() => setShowPass(v => !v)} tabIndex={-1}>
            {showPass ? (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
            ) : (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
            )}
          </button>
        </div>

        {mode === 'signup' && (
          <div className="auth-pass-wrap">
            <input
              className="auth-input"
              type={showConfirm ? 'text' : 'password'}
              placeholder="Confirm Password"
              value={confirmPassword}
              onChange={e => setConfirmPassword(e.target.value)}
              required
              disabled={disabled}
              autoComplete="new-password"
            />
            <button type="button" className="auth-eye" onClick={() => setShowConfirm(v => !v)} tabIndex={-1}>
              {showConfirm ? (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
              ) : (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
              )}
            </button>
          </div>
        )}

        {/* Remember me / Forgot password row — login only */}
        {mode === 'login' && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
              <input
                type="checkbox"
                className="auth-check"
                checked={rememberMe}
                onChange={e => setRememberMe(e.target.checked)}
              />
              <span style={{ color: '#94a3b8', fontSize: 13, fontFamily: "'Poppins','Inter',sans-serif" }}>Keep me logged in</span>
            </label>
            <button type="button" className="auth-link" style={{ fontSize: 13, fontWeight: 600 }}>
              Forgot Password?
            </button>
          </div>
        )}

        {error && <div style={S.error}>{error}</div>}
        {info  && <div style={S.infoBox}>{info}</div>}

        <button className="auth-btn" type="submit" disabled={disabled}>
          {busy ? 'Please wait…' : mode === 'login' ? 'Sign In' : 'Create Account'}
        </button>
      </form>

      {/* Switch mode */}
      <div style={{ marginTop: 20, textAlign: 'center' }}>
        {mode === 'login' ? (
          <button className="auth-link" onClick={() => { setMode('signup'); setError(''); setInfo(''); }}>
            Create an account
          </button>
        ) : (
          <button className="auth-link" onClick={() => { setMode('login'); setError(''); setInfo(''); }}>
            Already have an account? Sign in
          </button>
        )}
      </div>

      {/* Footer links */}
      <div style={S.footer}>
        <a href="/legal" className="auth-footer-link">Terms</a>
        <a href="/legal" className="auth-footer-link">Privacy</a>
        <a href="/support" className="auth-footer-link">Support</a>
      </div>
    </div>
  );
}

const S: Record<string, React.CSSProperties> = {
  page: {
    minHeight: '100vh',
    background: '#07090f',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '40px 24px',
    fontFamily: "'Poppins','Inter',sans-serif",
  },
  logoRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    marginBottom: 28,
  },
  logoText: {
    fontSize: 20,
    fontWeight: 800,
    fontFamily: "'Montserrat',sans-serif",
    letterSpacing: '-0.01em',
  },
  title: {
    color: '#3b82f6',
    fontSize: 28,
    fontWeight: 800,
    margin: '0 0 8px',
    textAlign: 'center',
    fontFamily: "'Poppins','Inter',sans-serif",
  },
  sub: {
    color: '#94a3b8',
    fontSize: 14,
    margin: '0 0 28px',
    textAlign: 'center',
  },
  notice: {
    background: 'rgba(59,130,246,0.08)',
    border: '1px solid rgba(59,130,246,0.2)',
    borderRadius: 8,
    padding: '10px 16px',
    marginBottom: 20,
    fontSize: 12,
    color: 'rgba(255,255,255,0.5)',
    lineHeight: 1.6,
    width: '100%',
    maxWidth: 460,
    boxSizing: 'border-box' as const,
  },
  form: {
    display: 'flex',
    flexDirection: 'column',
    gap: 14,
    width: '100%',
    maxWidth: 460,
  },
  error: {
    background: 'rgba(248,113,113,0.1)',
    border: '1px solid rgba(248,113,113,0.25)',
    borderRadius: 8,
    color: '#f87171',
    fontSize: 13,
    padding: '10px 14px',
  },
  infoBox: {
    background: 'rgba(59,130,246,0.1)',
    border: '1px solid rgba(59,130,246,0.25)',
    borderRadius: 8,
    color: '#60a5fa',
    fontSize: 13,
    padding: '10px 14px',
  },
  footer: {
    marginTop: 32,
    display: 'flex',
    gap: 24,
    justifyContent: 'center',
  },
};
