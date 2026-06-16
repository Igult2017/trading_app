import { Globe } from 'lucide-react';

const C = {
  card: 'var(--admin-card)', border: 'var(--admin-border)',
  text: '#c2d8ef', muted: '#4e6a88', indigoL: 'var(--admin-accentL)',
};
const HFONT = 'var(--admin-header-font)';

// Umami was removed to free server resources. This section now shows a neutral
// empty state until an analytics provider is reconnected.
export default function TrafficSection(_props: { getAdminToken?: () => Promise<string | null> }) {
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '4px 2px 10px', flexShrink: 0 }}>
        <Globe size={18} style={{ color: C.indigoL }} />
        <h2 style={{ color: 'white', fontSize: 16, fontWeight: 700, fontFamily: HFONT, margin: 0 }}>
          Traffic Analytics
        </h2>
      </div>

      <div style={{
        flex: 1, minHeight: 360, display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center', textAlign: 'center', gap: 10,
        border: `1px dashed ${C.border}`, borderRadius: 6, background: C.card, padding: 32,
      }}>
        <Globe size={32} style={{ color: C.muted, opacity: 0.6 }} />
        <div style={{ color: C.text, fontSize: 14, fontWeight: 600 }}>Analytics not configured</div>
        <div style={{ color: C.muted, fontSize: 12, maxWidth: 360, lineHeight: 1.6 }}>
          Umami was removed to free server resources. Connect an analytics provider to show traffic here.
        </div>
      </div>
    </div>
  );
}
