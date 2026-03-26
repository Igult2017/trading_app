import React from 'react';

interface NoSessionPromptProps {
  onCreateSession?: () => void;
  onViewSessions?: () => void;
}

const GlobeIcon = () => (
  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="rgba(148,163,184,0.7)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10"/>
    <line x1="2" y1="12" x2="22" y2="12"/>
    <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>
  </svg>
);

export default function NoSessionPrompt({ onCreateSession, onViewSessions }: NoSessionPromptProps) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', minHeight: 400, fontFamily: "'Montserrat', sans-serif" }}>
      <div style={{ textAlign: 'center', maxWidth: 400 }}>
        <div style={{ width: 64, height: 64, borderRadius: 16, background: 'rgba(99,102,241,0.1)', border: '1px solid rgba(99,102,241,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px' }}>
          <GlobeIcon />
        </div>
        <h2 style={{ fontSize: 14, fontWeight: 900, color: '#e2e8f0', marginBottom: 8, letterSpacing: '0.01em' }}>
          Create or Select a Session
        </h2>
        <p style={{ fontSize: 11, color: 'rgba(148,163,184,0.6)', marginBottom: 24, lineHeight: 1.6 }}>
          You need an active trading session to view your dashboard, enter trades, and track performance.
        </p>
        <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
          {onCreateSession && (
            <button
              onClick={onCreateSession}
              style={{ background: '#4f46e5', color: '#fff', border: 'none', padding: '12px 28px', borderRadius: 8, fontSize: 11, fontWeight: 900, letterSpacing: '0.15em', textTransform: 'uppercase', cursor: 'pointer', transition: 'all 0.15s' }}
              onMouseEnter={e => (e.currentTarget.style.background = '#6366f1')}
              onMouseLeave={e => (e.currentTarget.style.background = '#4f46e5')}
            >
              Create Session
            </button>
          )}
          {onViewSessions && (
            <button
              onClick={onViewSessions}
              style={{ background: 'transparent', color: 'rgba(148,163,184,0.7)', border: '1px solid rgba(255,255,255,0.08)', padding: '12px 28px', borderRadius: 8, fontSize: 11, fontWeight: 900, letterSpacing: '0.15em', textTransform: 'uppercase', cursor: 'pointer', transition: 'all 0.15s' }}
              onMouseEnter={e => (e.currentTarget.style.borderColor = 'rgba(255,255,255,0.2)')}
              onMouseLeave={e => (e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)')}
            >
              View Sessions
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
