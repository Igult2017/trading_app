import React from 'react';

interface NoSessionPromptProps {
  onCreateSession?: () => void;
  onViewSessions?: () => void;
  darkMode?: boolean;
}

const GlobeIcon = ({ darkMode = true }: { darkMode?: boolean }) => (
  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke={darkMode ? 'rgba(148,163,184,0.7)' : 'rgba(71,85,105,0.8)'} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10"/>
    <line x1="2" y1="12" x2="22" y2="12"/>
    <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>
  </svg>
);

export default function NoSessionPrompt({ onCreateSession, onViewSessions, darkMode = true }: NoSessionPromptProps) {
  const headingColor  = darkMode ? '#e2e8f0' : '#0f172a';
  const mutedColor    = darkMode ? 'rgba(148,163,184,0.6)' : 'rgba(71,85,105,0.7)';
  const secondaryColor = darkMode ? 'rgba(148,163,184,0.7)' : 'rgba(71,85,105,0.8)';
  const secondaryBorder = darkMode ? 'rgba(255,255,255,0.08)' : 'rgba(15,23,42,0.15)';
  const secondaryBorderHover = darkMode ? 'rgba(255,255,255,0.2)' : 'rgba(15,23,42,0.3)';

  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', minHeight: 400, fontFamily: "'Montserrat', sans-serif" }}>
      <div style={{ textAlign: 'center', maxWidth: 400 }}>
        <div style={{ width: 64, height: 64, borderRadius: 16, background: 'rgba(99,102,241,0.1)', border: '1px solid rgba(99,102,241,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px' }}>
          <GlobeIcon darkMode={darkMode} />
        </div>
        <h2 style={{ fontSize: 14, fontWeight: 900, color: headingColor, marginBottom: 8, letterSpacing: '0.01em' }}>
          Create or Select a Session
        </h2>
        <p style={{ fontSize: 11, color: mutedColor, marginBottom: 24, lineHeight: 1.6 }}>
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
              style={{ background: 'transparent', color: secondaryColor, border: `1px solid ${secondaryBorder}`, padding: '12px 28px', borderRadius: 8, fontSize: 11, fontWeight: 900, letterSpacing: '0.15em', textTransform: 'uppercase', cursor: 'pointer', transition: 'all 0.15s' }}
              onMouseEnter={e => (e.currentTarget.style.borderColor = secondaryBorderHover)}
              onMouseLeave={e => (e.currentTarget.style.borderColor = secondaryBorder)}
            >
              View Sessions
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
