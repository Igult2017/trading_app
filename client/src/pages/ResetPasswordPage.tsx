import { useEffect, useState } from 'react';
import { useLocation } from 'wouter';
import { supabase } from '@/lib/supabase';

function EyeIcon({ open }: { open: boolean }) {
  return open ? (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/>
      <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/>
      <line x1="1" y1="1" x2="23" y2="23"/>
    </svg>
  ) : (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
      <circle cx="12" cy="12" r="3"/>
    </svg>
  );
}

export default function ResetPasswordPage() {
  const [password, setPassword]       = useState('');
  const [confirm, setConfirm]         = useState('');
  const [showPass, setShowPass]       = useState(false);
  const [showConf, setShowConf]       = useState(false);
  const [busy, setBusy]               = useState(false);
  const [error, setError]             = useState('');
  const [done, setDone]               = useState(false);
  const [sessionReady, setSessionReady] = useState(false);
  const [, navigate] = useLocation();

  useEffect(() => {
    if (!supabase) return;
    supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') {
        setSessionReady(true);
      }
    });
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }
    if (password !== confirm) {
      setError('Passwords do not match.');
      return;
    }
    if (!supabase) {
      setError('Supabase is not configured on this instance.');
      return;
    }
    setBusy(true);
    try {
      const { error: err } = await supabase.auth.updateUser({ password });
      if (err) { setError(err.message); return; }
      setDone(true);
      setTimeout(() => navigate('/auth'), 3000);
    } finally {
      setBusy(false);
    }
  }

  const S: Record<string, React.CSSProperties> = {
    page: { minHeight: '100vh', background: '#07090f', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '40px 24px', fontFamily: "'Poppins','Inter',sans-serif" },
    form: { display: 'flex', flexDirection: 'column', gap: 14, width: '100%', maxWidth: 420 },
    error: { background: 'rgba(248,113,113,0.1)', border: '1px solid rgba(248,113,113,0.25)', borderRadius: 8, color: '#f87171', fontSize: 13, padding: '10px 14px' },
    info: { background: 'rgba(59,130,246,0.1)', border: '1px solid rgba(59,130,246,0.25)', borderRadius: 8, color: '#60a5fa', fontSize: 13, padding: '10px 14px' },
  };

  return (
    <div style={S.page}>
      <style>{`
        @keyframes auth-spin { to { transform: rotate(360deg); } }
        .rp-input { width:100%; box-sizing:border-box; background:#0e1420; border:1px solid #1a2540; border-radius:8px; padding:14px 16px; color:#e2e8f0; font-size:14px; font-family:'Poppins','Inter',sans-serif; outline:none; transition:border-color 0.2s; }
        .rp-input::placeholder { color:#3d5070; }
        .rp-input:focus { border-color:#2563eb; }
        .rp-input:disabled { opacity:0.5; }
        .rp-pass-wrap { position:relative; }
        .rp-pass-wrap .rp-input { padding-right:44px; }
        .rp-eye { position:absolute; right:14px; top:50%; transform:translateY(-50%); background:none; border:none; cursor:pointer; color:#3d5070; padding:0; display:flex; align-items:center; transition:color 0.15s; }
        .rp-eye:hover { color:#94a3b8; }
        .rp-btn { width:100%; padding:14px; background:#2563eb; color:#fff; border:none; border-radius:8px; font-size:15px; font-weight:700; font-family:'Poppins','Inter',sans-serif; cursor:pointer; letter-spacing:0.02em; transition:background 0.2s; }
        .rp-btn:hover:not(:disabled) { background:#1d4ed8; }
        .rp-btn:disabled { opacity:0.6; cursor:not-allowed; }
        .rp-link { background:none; border:none; color:#3b82f6; font-size:14px; cursor:pointer; font-family:'Poppins','Inter',sans-serif; font-weight:500; padding:0; transition:color 0.15s; }
        .rp-link:hover { color:#60a5fa; }
      `}</style>

      {/* Logo */}
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 28 }}>
        <span style={{ fontSize: 20, fontWeight: 800, fontFamily: "'Montserrat',sans-serif", letterSpacing: '-0.01em' }}>
          <span style={{ color: '#ffffff' }}>My FM</span>
          <span style={{ color: '#3b82f6' }}> | Journal</span>
        </span>
      </div>

      <h1 style={{ color: '#3b82f6', fontSize: 28, fontWeight: 800, margin: '0 0 8px', textAlign: 'center', fontFamily: "'Poppins','Inter',sans-serif" }}>
        Set New Password
      </h1>
      <p style={{ color: '#94a3b8', fontSize: 14, margin: '0 0 28px', textAlign: 'center' }}>
        Choose a strong password for your account.
      </p>

      <div style={S.form}>
        {done ? (
          <div style={S.info}>
            Password updated! Redirecting you to sign in…
          </div>
        ) : !sessionReady ? (
          <div style={S.info}>
            Verifying reset link… If nothing happens, please request a new reset link from the{' '}
            <button className="rp-link" onClick={() => navigate('/auth')}>sign-in page</button>.
          </div>
        ) : (
          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div className="rp-pass-wrap">
              <input
                className="rp-input"
                type={showPass ? 'text' : 'password'}
                placeholder="New Password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
                disabled={busy}
                autoComplete="new-password"
              />
              <button type="button" className="rp-eye" onClick={() => setShowPass(v => !v)} tabIndex={-1}>
                <EyeIcon open={showPass} />
              </button>
            </div>
            <div className="rp-pass-wrap">
              <input
                className="rp-input"
                type={showConf ? 'text' : 'password'}
                placeholder="Confirm New Password"
                value={confirm}
                onChange={e => setConfirm(e.target.value)}
                required
                disabled={busy}
                autoComplete="new-password"
              />
              <button type="button" className="rp-eye" onClick={() => setShowConf(v => !v)} tabIndex={-1}>
                <EyeIcon open={showConf} />
              </button>
            </div>
            {error && <div style={S.error}>{error}</div>}
            <button className="rp-btn" type="submit" disabled={busy}>
              {busy ? 'Updating…' : 'Update Password'}
            </button>
          </form>
        )}
        <div style={{ textAlign: 'center', marginTop: 4 }}>
          <button className="rp-link" onClick={() => navigate('/auth')}>← Back to Sign In</button>
        </div>
      </div>
    </div>
  );
}
