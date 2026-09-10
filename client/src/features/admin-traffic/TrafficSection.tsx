import { Globe } from 'lucide-react';
import { C, cs, FONT, panelText } from '@/components/admin-ui/tokens';

/**
 * Traffic Analytics — an empty state, until an analytics provider is reconnected.
 *
 * Umami was removed to free server resources. `CountryTable`, `PagesTable` and `SourceChart` went
 * with it on 2026-09-10: they were still sitting in this folder with nothing importing them.
 *
 * IT USED TO CARRY ITS OWN PALETTE — `text: '#c2d8ef'`, plus a heading hardcoded to `white`. Both
 * were written when every admin card was near-black. On the white card the panel uses now, that
 * heading measured **1.07:1** against its background and the body text 1.46:1, which is invisible
 * rather than merely faint. A private colour table is how a screen misses a theme change, so this
 * one reads the shared palette like everything else.
 *
 * It also drew its own "Traffic Analytics" title, which the shell already renders above it from
 * `PAGE_TITLES` — two headings, one of them unreadable. The shell's is the one that stays.
 */
export default function TrafficSection(_props: { getAdminToken?: () => Promise<string | null> }) {
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{
        ...cs,
        flex: 1, minHeight: 360, display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center', textAlign: 'center', gap: 12,
        padding: 32,
      }}>
        <div style={{
          width: 52, height: 52, borderRadius: 14, background: C.accentSoft, color: C.indigo,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <Globe size={24} />
        </div>
        <div style={{ ...panelText(15, 700), color: C.text }}>Analytics not configured</div>
        <div style={{ ...panelText(13), color: C.muted, maxWidth: 380, lineHeight: 1.6, fontFamily: FONT }}>
          Umami was removed to free server resources. Connect an analytics provider to show traffic
          here.
        </div>
      </div>
    </div>
  );
}
