import { useEffect, useState } from 'react';
import { useLocation } from 'wouter';
import { supabase } from '@/lib/supabase';

export default function AuthCallbackPage() {
  const [, navigate] = useLocation();
  const [status, setStatus] = useState<'processing' | 'error'>('processing');
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    if (!supabase) {
      setStatus('error');
      setErrorMsg('Auth is not configured.');
      return;
    }

    async function handleCallback() {
      if (!supabase) return;

      const hashParams = new URLSearchParams(window.location.hash.replace('#', '?'));
      const errorCode = hashParams.get('error_code');
      const errorDesc = hashParams.get('error_description');

      if (errorCode || errorDesc) {
        setStatus('error');
        setErrorMsg(errorDesc?.replace(/\+/g, ' ') ?? 'Confirmation failed. The link may have expired.');
        return;
      }

      const { data, error } = await supabase.auth.getSession();

      if (error || !data.session) {
        setStatus('error');
        setErrorMsg('Could not confirm your account. The link may have expired — please try signing up again.');
        return;
      }

      try {
        await fetch('/api/auth/setup', {
          method: 'POST',
          headers: { Authorization: `Bearer ${data.session.access_token}` },
        });
        await supabase.auth.refreshSession();
      } catch {
      }

      const { data: refreshed } = await supabase.auth.getSession();
      const role = refreshed.session?.user?.app_metadata?.role ?? refreshed.session?.user?.user_metadata?.role;

      if (role === 'admin') {
        navigate('/admin');
      } else {
        navigate('/dashboard');
      }
    }

    handleCallback();
  }, [navigate]);

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

        {status === 'processing' ? (
          <>
            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
            <div style={styles.spinner} />
            <h2 style={styles.title}>Confirming your account…</h2>
            <p style={styles.sub}>Please wait while we verify your email.</p>
          </>
        ) : (
          <>
            <div style={styles.errorIcon}>✕</div>
            <h2 style={{ ...styles.title, color: '#f87171' }}>Confirmation Failed</h2>
            <p style={styles.sub}>{errorMsg}</p>
            <button style={styles.btn} onClick={() => navigate('/auth')}>
              Back to Sign In
            </button>
          </>
        )}
      </div>
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
    padding: '48px 36px',
    width: '100%',
    maxWidth: 420,
    textAlign: 'center',
    boxShadow: '0 25px 50px rgba(0,0,0,0.5), 0 0 60px rgba(59,130,246,0.06)',
  },
  brand: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    marginBottom: 32,
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
  spinner: {
    width: 44,
    height: 44,
    border: '3px solid #1e293b',
    borderTop: `3px solid ${C.blue}`,
    borderRadius: '50%',
    animation: 'spin 0.8s linear infinite',
    margin: '0 auto 24px',
  },
  errorIcon: {
    width: 44,
    height: 44,
    borderRadius: '50%',
    background: 'rgba(248,113,113,0.15)',
    color: '#f87171',
    fontSize: 20,
    fontWeight: 700,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    margin: '0 auto 24px',
  },
  title: {
    color: C.text,
    fontSize: 20,
    fontWeight: 700,
    margin: '0 0 8px',
  },
  sub: {
    color: C.dim,
    fontSize: 13,
    margin: '0 0 24px',
    lineHeight: 1.6,
  },
  btn: {
    background: 'linear-gradient(to right, #2563eb, #3b82f6)',
    color: '#ffffff',
    border: 'none',
    borderRadius: 8,
    padding: '12px 24px',
    fontWeight: 700,
    fontSize: 14,
    cursor: 'pointer',
    fontFamily: "'Montserrat', sans-serif",
  },
};
