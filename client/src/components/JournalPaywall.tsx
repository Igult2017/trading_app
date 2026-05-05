import { Lock } from 'lucide-react';

interface Props {
  stripeConfigured: boolean;
  onUpgrade?: () => void;
}

export default function JournalPaywall({ stripeConfigured, onUpgrade }: Props) {
  return (
    <div style={{
      height: '100dvh',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      background: '#020817',
      padding: '24px',
      textAlign: 'center',
      gap: '24px',
    }}>
      {/* Icon */}
      <div style={{
        width: 72,
        height: 72,
        borderRadius: '50%',
        background: 'rgba(59,130,246,0.1)',
        border: '1px solid rgba(59,130,246,0.25)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}>
        <Lock size={32} color="#3b82f6" />
      </div>

      {/* Heading */}
      <div style={{ maxWidth: 420 }}>
        <h1 style={{
          color: '#ffffff',
          fontSize: 26,
          fontWeight: 800,
          margin: '0 0 10px',
          letterSpacing: '-0.01em',
        }}>
          Journal Access Required
        </h1>
        <p style={{
          color: '#64748b',
          fontSize: 14,
          lineHeight: 1.65,
          margin: 0,
        }}>
          {stripeConfigured
            ? 'Your journal is part of a paid plan. Upgrade to unlock your full trading dashboard, analytics, AI insights, and more.'
            : 'Access to the journal is granted by an administrator. Please contact support to request access.'}
        </p>
      </div>

      {/* Actions */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, alignItems: 'center', width: '100%', maxWidth: 320 }}>
        {stripeConfigured && (
          <button
            onClick={onUpgrade}
            style={{
              width: '100%',
              padding: '13px 24px',
              background: '#3b82f6',
              color: '#fff',
              border: 'none',
              borderRadius: 8,
              fontSize: 14,
              fontWeight: 700,
              cursor: 'pointer',
              letterSpacing: '0.03em',
            }}
          >
            Upgrade to Pro
          </button>
        )}
        <a
          href="/support"
          style={{
            color: '#3b82f6',
            fontSize: 13,
            textDecoration: 'none',
            opacity: 0.8,
          }}
        >
          Contact support
        </a>
      </div>

      {/* Footer brand */}
      <p style={{ color: '#1e293b', fontSize: 11, marginTop: 8 }}>
        myfm | journal · Your Trading Edge
      </p>
    </div>
  );
}
