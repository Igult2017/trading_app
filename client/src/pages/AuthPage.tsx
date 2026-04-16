import { useState } from 'react';
import { useLocation } from 'wouter';
import { useAuth } from '@/context/AuthContext';

type Mode = 'login' | 'signup';

export default function AuthPage() {
  const [mode, setMode]             = useState<Mode>('login');
  const [email, setEmail]           = useState('');
  const [password, setPassword]     = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [fullName, setFullName]     = useState('');
  const [error, setError]           = useState('');
  const [info, setInfo]             = useState('');
  const [busy, setBusy]             = useState(false);

  const { signIn, signUp, role, loading } = useAuth();
  const [, navigate] = useLocation();

  // Show loading screen while auth state is being resolved
  if (loading) return <LoadingScreen />;

  // Already authenticated — redirect immediately
  if (role === 'admin') { navigate('/admin');   return null; }
  if (role === 'user')  { navigate('/journal'); return null; }

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
        // Navigate immediately using the role returned by signIn
        if (assignedRole === 'admin') {
          navigate('/admin');
        } else {
          navigate('/journal');
        }
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

  return (
    <div style={styles.page}>
      <div style={styles.card}>
        <div style={styles.brand}>
          <div style={styles.logo}>
            <span style={{ color: '#ffffff' }}>FSD</span>
          </div>
          <span style={styles.brandName}>
            <span style={{ color: '#ffffff' }}>FSD </span>
            <span style={{ color: '#3b82f6' }}>Journal</span>
          </span>
        </div>

        <h2 style={styles.title}>{mode === 'login' ? 'Welcome back' : 'Create account'}</h2>
        <p style={styles.sub}>
          {mode === 'login'
            ? 'Sign in to access your trading dashboard.'
            : 'Join FSD Journal and start tracking your trades.'}
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

          <button
            style={{ ...styles.btn, opacity: busy ? 0.6 : 1, cursor: busy ? 'not-allowed' : 'pointer' }}
            type="submit"
            disabled={busy}
          >
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

function LoadingScreen() {
  return (
    <div style={{ minHeight: '100vh', background: '#020817', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ color: '#3b82f6', fontSize: 14, fontFamily: 'monospace' }}>Loading…</div>
    </div>
  );
}

const C = {
  bg:     '#020817',
  card:   '#0f172a',
  border: '#1e293b',
  text:   '#ffffff',
  dim:    '#94a3b8',
  blue:   '#3b82f6',
  blueDark: '#2563eb',
  error:  '#f87171',
  info:   '#60a5fa',
  input:  '#0c1528',
};

const styles: Record<string, React.CSSProperties> = {
  page: {
    minHeight: '100vh',
    background: C.bg,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '24px',
    fontFamily: "'Poppins', 'Inter', sans-serif",
  },
  card: {
    background: C.card,
    border: `1px solid ${C.border}`,
    borderRadius: 16,
    padding: '40px 36px',
    width: '100%',
    maxWidth: 420,
    boxShadow: '0 25px 50px rgba(0,0,0,0.5), 0 0 60px rgba(59,130,246,0.06)',
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
    background: 'linear-gradient(135deg, #2563eb, #3b82f6)',
    fontWeight: 900,
    fontSize: 11,
    letterSpacing: '0.04em',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontFamily: "'Montserrat', sans-serif",
  },
  brandName: {
    fontSize: 18,
    fontWeight: 900,
    letterSpacing: '-0.01em',
    fontFamily: "'Montserrat', sans-serif",
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
    background: 'rgba(59,130,246,0.1)',
    border: '1px solid rgba(59,130,246,0.3)',
    borderRadius: 8,
    color: C.info,
    fontSize: 13,
    padding: '10px 14px',
  },
  btn: {
    marginTop: 4,
    background: 'linear-gradient(to right, #2563eb, #3b82f6)',
    color: '#ffffff',
    border: 'none',
    borderRadius: 8,
    padding: '12px',
    fontWeight: 700,
    fontSize: 14,
    letterSpacing: '0.02em',
    transition: 'opacity 0.2s',
    fontFamily: "'Montserrat', sans-serif",
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
    color: C.blue,
    fontSize: 13,
    cursor: 'pointer',
    fontWeight: 600,
    padding: 0,
  },
};
