import { useState } from 'react';
import { useLocation } from 'wouter';
import { useAuth } from '@/context/AuthContext';

type Mode = 'login' | 'signup';

export default function AuthPage() {
  const [mode, setMode] = useState<Mode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [busy, setBusy] = useState(false);

  const { signIn, signUp, role } = useAuth();
  const [, navigate] = useLocation();

  // If somehow already authenticated, redirect
  if (role === 'admin') { navigate('/admin'); return null; }
  if (role === 'user')  { navigate('/dashboard'); return null; }

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
        const { error: err } = await signIn(email, password);
        if (err) { setError(err.message); return; }
        // onAuthStateChange will update role → App.tsx re-renders and redirects
      } else {
        const { error: err } = await signUp(email, password, fullName);
        if (err) { setError(err.message); return; }
        setInfo('Account created! Check your email to confirm, then log in.');
        setMode('login');
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={styles.page}>
      <div style={styles.card}>
        {/* Logo / Brand */}
        <div style={styles.brand}>
          <div style={styles.logo}>TS</div>
          <span style={styles.brandName}>TradeSync</span>
        </div>

        <h2 style={styles.title}>{mode === 'login' ? 'Welcome back' : 'Create account'}</h2>
        <p style={styles.sub}>
          {mode === 'login'
            ? 'Sign in to access your trading dashboard.'
            : 'Join TradeSync and start tracking your trades.'}
        </p>

        <form onSubmit={handleSubmit} style={styles.form}>
          {mode === 'signup' && (
            <div style={styles.field}>
              <label style={styles.label}>Full Name</label>
              <input
                style={styles.input}
                type="text"
                placeholder="John Doe"
                value={fullName}
                onChange={e => setFullName(e.target.value)}
                required
                autoComplete="name"
              />
            </div>
          )}

          <div style={styles.field}>
            <label style={styles.label}>Email</label>
            <input
              style={styles.input}
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
              autoComplete="email"
            />
          </div>

          <div style={styles.field}>
            <label style={styles.label}>Password</label>
            <input
              style={styles.input}
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
            />
          </div>

          {mode === 'signup' && (
            <div style={styles.field}>
              <label style={styles.label}>Confirm Password</label>
              <input
                style={styles.input}
                type="password"
                placeholder="••••••••"
                value={confirmPassword}
                onChange={e => setConfirmPassword(e.target.value)}
                required
                autoComplete="new-password"
              />
            </div>
          )}

          {error && <div style={styles.error}>{error}</div>}
          {info  && <div style={styles.infoBox}>{info}</div>}

          <button style={{ ...styles.btn, opacity: busy ? 0.6 : 1 }} type="submit" disabled={busy}>
            {busy ? 'Please wait…' : mode === 'login' ? 'Sign In' : 'Create Account'}
          </button>
        </form>

        <div style={styles.toggle}>
          {mode === 'login' ? (
            <>Don't have an account?{' '}
              <button style={styles.link} onClick={() => { setMode('signup'); setError(''); setInfo(''); }}>
                Sign up
              </button>
            </>
          ) : (
            <>Already have an account?{' '}
              <button style={styles.link} onClick={() => { setMode('login'); setError(''); setInfo(''); }}>
                Sign in
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

const C = {
  bg:     '#0D0F14',
  card:   '#13161E',
  border: '#1E2330',
  text:   '#E2E8F0',
  dim:    '#8B9BB4',
  cyan:   '#4AE8D8',
  error:  '#F87171',
  info:   '#60A5FA',
  input:  '#1A1F2E',
};

const styles: Record<string, React.CSSProperties> = {
  page: {
    minHeight: '100vh',
    background: C.bg,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '24px',
    fontFamily: "'Inter', 'JetBrains Mono', monospace",
  },
  card: {
    background: C.card,
    border: `1px solid ${C.border}`,
    borderRadius: 12,
    padding: '40px 36px',
    width: '100%',
    maxWidth: 420,
    boxShadow: '0 20px 60px rgba(0,0,0,0.4)',
  },
  brand: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    marginBottom: 28,
  },
  logo: {
    width: 36,
    height: 36,
    borderRadius: 8,
    background: C.cyan,
    color: '#0D0F14',
    fontWeight: 700,
    fontSize: 14,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  brandName: {
    color: C.text,
    fontSize: 18,
    fontWeight: 600,
    letterSpacing: '0.02em',
  },
  title: {
    color: C.text,
    fontSize: 22,
    fontWeight: 700,
    margin: '0 0 6px',
  },
  sub: {
    color: C.dim,
    fontSize: 13,
    margin: '0 0 24px',
  },
  form: {
    display: 'flex',
    flexDirection: 'column',
    gap: 16,
  },
  field: {
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
  },
  label: {
    color: C.dim,
    fontSize: 12,
    fontWeight: 600,
    textTransform: 'uppercase',
    letterSpacing: '0.08em',
  },
  input: {
    background: C.input,
    border: `1px solid ${C.border}`,
    borderRadius: 8,
    padding: '10px 14px',
    color: C.text,
    fontSize: 14,
    outline: 'none',
  },
  error: {
    background: 'rgba(248,113,113,0.12)',
    border: '1px solid rgba(248,113,113,0.3)',
    borderRadius: 8,
    color: C.error,
    fontSize: 13,
    padding: '10px 14px',
  },
  infoBox: {
    background: 'rgba(96,165,250,0.12)',
    border: '1px solid rgba(96,165,250,0.3)',
    borderRadius: 8,
    color: C.info,
    fontSize: 13,
    padding: '10px 14px',
  },
  btn: {
    marginTop: 4,
    background: C.cyan,
    color: '#0D0F14',
    border: 'none',
    borderRadius: 8,
    padding: '12px',
    fontWeight: 700,
    fontSize: 14,
    cursor: 'pointer',
    letterSpacing: '0.02em',
    transition: 'opacity 0.2s',
  },
  toggle: {
    marginTop: 20,
    textAlign: 'center',
    color: C.dim,
    fontSize: 13,
  },
  link: {
    background: 'none',
    border: 'none',
    color: C.cyan,
    fontSize: 13,
    cursor: 'pointer',
    fontWeight: 600,
    padding: 0,
  },
};
