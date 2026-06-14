import { useState } from 'react';
import { Globe, ExternalLink, RefreshCw } from 'lucide-react';

const UMAMI_URL = 'http://umami-y14oy8no4xefxw3l9zhzkjqa.76.13.139.253.sslip.io';

const C = {
  bg: 'var(--admin-bg)', card: 'var(--admin-card)', border: 'var(--admin-border)',
  text: '#c2d8ef', muted: '#4e6a88', indigo: 'var(--admin-accent)', indigoL: 'var(--admin-accentL)',
};
const HFONT = 'var(--admin-header-font)';
const FONT  = 'var(--admin-font)';

export default function TrafficSection(_props: { getAdminToken?: () => Promise<string | null> }) {
  const [key, setKey] = useState(0);

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 0, height: '100%' }}>
      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '4px 2px 10px', flexShrink: 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Globe size={18} style={{ color: C.indigoL }} />
          <h2 style={{ color: 'white', fontSize: 16, fontWeight: 700, fontFamily: HFONT, margin: 0 }}>
            Traffic Analytics
          </h2>
          <span style={{
            fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase',
            padding: '2px 8px', background: `${C.indigo}22`, color: C.indigoL,
            border: `1px solid ${C.indigo}44`, borderRadius: 3,
          }}>Umami</span>
        </div>

        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <button
            onClick={() => setKey(k => k + 1)}
            title="Reload dashboard"
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 5,
              padding: '5px 10px', background: 'transparent',
              border: `1px solid ${C.border}`, color: C.muted,
              fontSize: 11, fontFamily: FONT, cursor: 'pointer', borderRadius: 3,
              transition: 'color 0.15s, border-color 0.15s',
            }}
            onMouseEnter={e => { e.currentTarget.style.color = C.text; e.currentTarget.style.borderColor = C.muted; }}
            onMouseLeave={e => { e.currentTarget.style.color = C.muted; e.currentTarget.style.borderColor = C.border; }}
          >
            <RefreshCw size={12} /> Reload
          </button>

          <a
            href={UMAMI_URL}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 5,
              padding: '5px 12px', background: C.indigo, color: 'white',
              fontSize: 11, fontFamily: FONT, fontWeight: 600,
              textDecoration: 'none', borderRadius: 3,
              transition: 'opacity 0.15s',
            }}
            onMouseEnter={e => { e.currentTarget.style.opacity = '0.85'; }}
            onMouseLeave={e => { e.currentTarget.style.opacity = '1'; }}
          >
            <ExternalLink size={12} /> Open Umami
          </a>
        </div>
      </div>

      {/* Iframe */}
      <div style={{
        flex: 1, position: 'relative',
        border: `1px solid ${C.border}`,
        background: C.card,
        borderRadius: 4,
        overflow: 'hidden',
        minHeight: 500,
      }}>
        <iframe
          key={key}
          src={UMAMI_URL}
          title="Umami Analytics"
          style={{ width: '100%', height: '100%', border: 'none', display: 'block', minHeight: 500 }}
          allow="fullscreen"
        />

      </div>

      {/* Tip — shown if iframe is blocked by X-Frame-Options */}
      <div style={{
        padding: '8px 12px', marginTop: 6,
        background: `${C.indigo}0d`, border: `1px solid ${C.indigo}33`,
        borderRadius: 4, display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0,
      }}>
        <span style={{ fontSize: 11, color: C.muted, lineHeight: 1.5 }}>
          If the dashboard is blank, add <code style={{ color: C.indigoL, fontSize: 10 }}>ALLOW_IFRAME_EMBEDDING=true</code> to your Umami environment variables in Coolify, then redeploy Umami.
          &nbsp;<a href={UMAMI_URL} target="_blank" rel="noopener noreferrer" style={{ color: C.indigoL, textDecoration: 'underline' }}>Open Umami directly →</a>
        </span>
      </div>
    </div>
  );
}
