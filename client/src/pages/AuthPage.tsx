import { useEffect, useState } from 'react';
import { useLocation, useSearch } from 'wouter';
import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/lib/supabase';

type Mode = 'login' | 'signup' | 'forgot';

const COUNTRIES = [
  'Afghanistan','Albania','Algeria','Andorra','Angola','Argentina','Armenia','Australia','Austria',
  'Azerbaijan','Bahamas','Bahrain','Bangladesh','Belarus','Belgium','Belize','Benin','Bhutan',
  'Bolivia','Bosnia and Herzegovina','Botswana','Brazil','Brunei','Bulgaria','Burkina Faso',
  'Burundi','Cambodia','Cameroon','Canada','Cape Verde','Central African Republic','Chad','Chile',
  'China','Colombia','Comoros','Congo','Costa Rica','Croatia','Cuba','Cyprus','Czech Republic',
  'Denmark','Djibouti','Dominican Republic','DR Congo','Ecuador','Egypt','El Salvador','Estonia',
  'Eswatini','Ethiopia','Fiji','Finland','France','Gabon','Gambia','Georgia','Germany','Ghana',
  'Greece','Guatemala','Guinea','Haiti','Honduras','Hungary','Iceland','India','Indonesia','Iran',
  'Iraq','Ireland','Israel','Italy','Jamaica','Japan','Jordan','Kazakhstan','Kenya','Kuwait',
  'Kyrgyzstan','Laos','Latvia','Lebanon','Lesotho','Liberia','Libya','Liechtenstein','Lithuania',
  'Luxembourg','Madagascar','Malawi','Malaysia','Maldives','Mali','Malta','Mauritania','Mauritius',
  'Mexico','Moldova','Monaco','Mongolia','Montenegro','Morocco','Mozambique','Myanmar','Namibia',
  'Nepal','Netherlands','New Zealand','Nicaragua','Niger','Nigeria','North Korea','North Macedonia',
  'Norway','Oman','Pakistan','Palestine','Panama','Papua New Guinea','Paraguay','Peru','Philippines',
  'Poland','Portugal','Qatar','Romania','Russia','Rwanda','Saudi Arabia','Senegal','Serbia',
  'Sierra Leone','Singapore','Slovakia','Slovenia','Somalia','South Africa','South Korea',
  'South Sudan','Spain','Sri Lanka','Sudan','Sweden','Switzerland','Syria','Taiwan','Tajikistan',
  'Tanzania','Thailand','Togo','Trinidad and Tobago','Tunisia','Turkey','Turkmenistan','Uganda',
  'Ukraine','United Arab Emirates','United Kingdom','United States','Uruguay','Uzbekistan',
  'Venezuela','Vietnam','Yemen','Zambia','Zimbabwe',
];

async function handleGoogleSignIn() {
  if (!supabase) return false;
  const { error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: `${window.location.origin}/auth/callback` },
  });
  return !error;
}

export default function AuthPage() {
  const search   = useSearch();
  const urlMode  = new URLSearchParams(search).get('mode');

  const [mode, setMode]                       = useState<Mode>(urlMode === 'signup' ? 'signup' : 'login');
  const [email, setEmail]                     = useState('');
  const [password, setPassword]               = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [fullName, setFullName]               = useState('');
  const [country, setCountry]                 = useState('');
  const [showPass, setShowPass]               = useState(false);
  const [showConfirm, setShowConfirm]         = useState(false);
  const [rememberMe, setRememberMe]           = useState(true);
  const [error, setError]                     = useState('');
  const [info, setInfo]                       = useState('');
  const [busy, setBusy]                       = useState(false);
  const [googleBusy, setGoogleBusy]           = useState(false);

  // True only if this browser has successfully signed in before
  const [isReturning] = useState(() => {
    try { return localStorage.getItem('fmj_returning') === '1'; } catch { return false; }
  });

  const { signIn, signUp, role, loading } = useAuth();
  const [, navigate] = useLocation();

  useEffect(() => {
    if (!loading && role) {
      navigate(role === 'admin' ? '/admin' : '/journal', { replace: true });
    }
  }, [loading, role, navigate]);

  async function handleGoogleClick() {
    if (!supabase) {
      setError('Google sign-in requires Supabase to be configured. Please use email and password.');
      return;
    }
    setGoogleBusy(true);
    setError('');
    const ok = await handleGoogleSignIn();
    if (!ok) {
      setError('Google sign-in failed. Please try again.');
      setGoogleBusy(false);
    }
    // on success the page redirects — no need to reset
  }

  async function handleForgotPassword(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setInfo('');
    if (!supabase) {
      setError('Password reset requires Supabase to be configured on this instance.');
      return;
    }
    if (!email) {
      setError('Please enter your email address.');
      return;
    }
    setBusy(true);
    try {
      const { error: err } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/auth/reset-password`,
      });
      if (err) { setError(err.message); return; }
      setInfo('Reset link sent! Check your inbox and follow the link to set a new password.');
    } finally {
      setBusy(false);
    }
  }

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
        try { localStorage.setItem('fmj_returning', '1'); } catch {}
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
        setEmail(''); setPassword(''); setConfirmPassword('');
        setFullName(''); setCountry('');
      }
    } finally {
      setBusy(false);
    }
  }

  const disabled = loading || busy || googleBusy;

  function switchMode(m: Mode) {
    setMode(m);
    setError('');
    setInfo('');
  }

  if (mode === 'forgot') {
    return (
      <div style={S.page}>
        <div style={S.logoRow}>
          <span style={S.logoText}>
            <span style={{ color: '#ffffff' }}>Myfm</span><span style={{ color: '#3b82f6' }}>journal</span>
            <span style={{ color: 'rgba(255,255,255,0.2)', margin: '0 5px' }}>.</span>
            <span style={{ color: '#94a3b8', fontFamily: "'Poppins','Inter',sans-serif", fontWeight: 500, fontSize: 15 }}>Reset password</span>
          </span>
        </div>

        <div style={S.form}>
          <style>{`
            .auth-input { width:100%; box-sizing:border-box; background:#0e1420; border:1px solid #1a2540; border-radius:8px; padding:14px 16px; color:#e2e8f0; font-size:14px; font-family:'Poppins','Inter',sans-serif; outline:none; transition:border-color 0.2s; }
            .auth-input::placeholder { color:#3d5070; }
            .auth-input:focus { border-color:#2563eb; }
            .auth-btn { width:100%; padding:14px; background:#2563eb; color:#fff; border:none; border-radius:8px; font-size:15px; font-weight:700; font-family:'Poppins','Inter',sans-serif; cursor:pointer; letter-spacing:0.02em; transition:background 0.2s; }
            .auth-btn:hover:not(:disabled) { background:#1d4ed8; }
            .auth-btn:disabled { opacity:0.6; cursor:not-allowed; }
            .auth-link { background:none; border:none; color:#3b82f6; font-size:14px; cursor:pointer; font-family:'Poppins','Inter',sans-serif; font-weight:500; padding:0; transition:color 0.15s; }
            .auth-link:hover { color:#60a5fa; }
          `}</style>
          <form onSubmit={handleForgotPassword} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <input
              className="auth-input"
              type="email"
              placeholder="Email Address"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
              disabled={busy}
              autoComplete="email"
            />
            {error && <div style={S.error}>{error}</div>}
            {info  && <div style={S.infoBox}>{info}</div>}
            <button className="auth-btn" type="submit" disabled={busy}>
              {busy ? 'Sending…' : 'Send Reset Link'}
            </button>
          </form>
          <div style={{ textAlign: 'center', marginTop: 4 }}>
            <button className="auth-link" onClick={() => switchMode('login')}>← Back to Sign In</button>
          </div>
        </div>

        <div style={S.footer}>
          <a href="/legal" style={{ color: '#3d5070', fontSize: 12, textDecoration: 'none', fontFamily: "'Poppins','Inter',sans-serif" }}>Terms</a>
          <a href="/legal" style={{ color: '#3d5070', fontSize: 12, textDecoration: 'none', fontFamily: "'Poppins','Inter',sans-serif" }}>Privacy</a>
          <a href="/support" style={{ color: '#3d5070', fontSize: 12, textDecoration: 'none', fontFamily: "'Poppins','Inter',sans-serif" }}>Support</a>
        </div>
      </div>
    );
  }

  return (
    <div style={S.page}>
      <style>{`
        @keyframes auth-spin { to { transform: rotate(360deg); } }
        .auth-input {
          width: 100%; box-sizing: border-box;
          background: #0e1420; border: 1px solid #1a2540; border-radius: 8px;
          padding: 14px 16px; color: #e2e8f0; font-size: 14px;
          font-family: 'Poppins','Inter',sans-serif; outline: none;
          transition: border-color 0.2s;
        }
        .auth-input::placeholder { color: #3d5070; }
        .auth-input:focus { border-color: #2563eb; }
        .auth-input:disabled { opacity: 0.5; }
        select.auth-input option { background: #0e1420; color: #e2e8f0; }
        .auth-pass-wrap { position: relative; }
        .auth-pass-wrap .auth-input { padding-right: 44px; }
        .auth-eye {
          position: absolute; right: 14px; top: 50%; transform: translateY(-50%);
          background: none; border: none; cursor: pointer; color: #3d5070;
          padding: 0; display: flex; align-items: center; transition: color 0.15s;
        }
        .auth-eye:hover { color: #94a3b8; }
        .auth-btn {
          width: 100%; padding: 14px; background: #2563eb; color: #fff;
          border: none; border-radius: 8px; font-size: 15px; font-weight: 700;
          font-family: 'Poppins','Inter',sans-serif; cursor: pointer;
          letter-spacing: 0.02em; transition: background 0.2s;
        }
        .auth-btn:hover:not(:disabled) { background: #1d4ed8; }
        .auth-btn:disabled { opacity: 0.6; cursor: not-allowed; }
        .auth-google-btn {
          width: 100%; padding: 13px 16px;
          background: transparent; border: 1px solid #1e3a5f;
          border-radius: 8px; color: #e2e8f0; font-size: 14px; font-weight: 600;
          font-family: 'Poppins','Inter',sans-serif; cursor: pointer;
          display: flex; align-items: center; justify-content: center; gap: 10px;
          transition: border-color 0.2s, background 0.2s;
        }
        .auth-google-btn:hover:not(:disabled) { border-color: #3b82f6; background: rgba(59,130,246,0.06); }
        .auth-google-btn:disabled { opacity: 0.5; cursor: not-allowed; }
        .auth-link {
          background: none; border: none; color: #3b82f6; font-size: 14px;
          cursor: pointer; font-family: 'Poppins','Inter',sans-serif;
          font-weight: 500; padding: 0; transition: color 0.15s;
        }
        .auth-link:hover { color: #60a5fa; }
        .auth-footer-link {
          color: #3d5070; font-size: 12px; text-decoration: none;
          font-family: 'Poppins','Inter',sans-serif; transition: color 0.15s;
        }
        .auth-footer-link:hover { color: #94a3b8; }
        .auth-check { width: 16px; height: 16px; accent-color: #2563eb; cursor: pointer; }
      `}</style>

      {/* One-line header */}
      <div style={S.logoRow}>
        <span style={S.logoText}>
          <span style={{ color: '#ffffff' }}>Myfm</span><span style={{ color: '#3b82f6' }}>journal</span>
          {mode === 'login' && isReturning ? (
            <>
              <span style={{ color: 'rgba(255,255,255,0.2)', margin: '0 5px' }}>.</span>
              <span style={{ color: '#3b82f6', fontFamily: "'Poppins','Inter',sans-serif", fontWeight: 600, fontSize: 15 }}>Welcome back</span>
            </>
          ) : mode === 'signup' ? (
            <>
              <span style={{ color: 'rgba(255,255,255,0.2)', margin: '0 5px' }}>.</span>
              <span style={{ color: '#94a3b8', fontFamily: "'Poppins','Inter',sans-serif", fontWeight: 500, fontSize: 15 }}>Create account</span>
            </>
          ) : null}
        </span>
      </div>

      <div style={S.form}>

        {/* Google button */}
        <button className="auth-google-btn" type="button" onClick={handleGoogleClick} disabled={disabled}>
          {googleBusy ? (
            <div style={{ width: 18, height: 18, borderRadius: '50%', border: '2px solid rgba(255,255,255,0.2)', borderTopColor: '#fff', animation: 'auth-spin 0.7s linear infinite' }} />
          ) : (
            <svg width="18" height="18" viewBox="0 0 48 48">
              <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
              <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
              <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
              <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
              <path fill="none" d="M0 0h48v48H0z"/>
            </svg>
          )}
          {mode === 'login' ? 'Continue with Google' : 'Sign up with Google'}
        </button>

        {/* Divider */}
        <div className="auth-divider" style={{ margin: '2px 0' }}>
          <div className="auth-divider-line" />
          <span style={{ color: '#3d5070', fontSize: 12, whiteSpace: 'nowrap', fontFamily: "'Poppins','Inter',sans-serif" }}>
            or sign in with email
          </span>
          <div className="auth-divider-line" />
        </div>

        {/* Email form */}
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

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
              <EyeIcon open={showPass} />
            </button>
          </div>

          {mode === 'signup' && (
            <>
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
                  <EyeIcon open={showConfirm} />
                </button>
              </div>

              <select
                className="auth-input"
                value={country}
                onChange={e => setCountry(e.target.value)}
                required
                disabled={disabled}
                style={{ appearance: 'none', cursor: 'pointer', color: country ? '#e2e8f0' : '#3d5070' }}
              >
                <option value="" disabled>Country</option>
                {COUNTRIES.map(c => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </>
          )}

          {/* Remember me / Forgot password — login only */}
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
              <button type="button" className="auth-link" style={{ fontSize: 13, fontWeight: 600 }} onClick={() => switchMode('forgot')}>
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
        <div style={{ textAlign: 'center', marginTop: 4 }}>
          {mode === 'login' ? (
            <button className="auth-link" onClick={() => switchMode('signup')}>
              Create an account
            </button>
          ) : (
            <button className="auth-link" onClick={() => switchMode('login')}>
              Already have an account? Sign in
            </button>
          )}
        </div>

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
    marginBottom: 32,
  },
  logoText: {
    fontSize: 17,
    fontWeight: 400,
    fontFamily: "'DM Serif Display', serif",
    letterSpacing: '0.01em',
    display: 'flex',
    alignItems: 'baseline',
    gap: 0,
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
