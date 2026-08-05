/**
 * StartFreeButton — the primary call to action, defined ONCE.
 *
 * The user, pointing at the header and the hero: *"They should look identical. They should look like
 * one in the bottom not the one in the header."*
 *
 * There were THREE, all different, which is why this is a component rather than three edits:
 *
 *   header  (HomeHeader)       radius 999 pill · 10/22 · 13px · sparkle BEFORE the label
 *   hero    (HomePage)         radius 10       · 13/22 · 14px · arrow AFTER    <- the target
 *   stats   (HomeStatsSection) radius 4        · 13/28 · 14px · arrow AFTER
 *
 * The user named the first two; the third is changed as well, because "identical" fails just as
 * loudly with a third shape still on the page.
 *
 * ONE THING IS KEPT FROM THE HEADER rather than the hero: the hover (darken + a 1px lift). The hero
 * button had no hover at all, and dropping a working interaction to match a screenshot would be
 * losing polish in the name of consistency. Everything visible at rest matches the hero exactly.
 */
import { ArrowRight } from 'lucide-react';
import { openAuthModal } from '@/components/auth/AuthModal';

const BLUE = '#2563eb';
const BLUE_HOVER = '#1d4ed8';

export interface StartFreeButtonProps {
  label?: string;
  /** Layout only — margins, flex behaviour. The button's own shape is not overridable on purpose;
   *  that is the whole point of collecting it here. */
  style?: React.CSSProperties;
  className?: string;
}

export default function StartFreeButton({ label = 'Start free', style, className }: StartFreeButtonProps) {
  return (
    <button
      type="button"
      className={className}
      onClick={() => openAuthModal('signup')}
      style={{
        // — the hero's resting shape, verbatim —
        fontFamily: "'Playfair Display', serif",
        padding: '13px 22px',
        borderRadius: 10,
        background: BLUE,
        color: '#fff',
        fontSize: 14,
        fontWeight: 700,
        border: 'none',
        cursor: 'pointer',
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        whiteSpace: 'nowrap',
        transition: 'background 0.18s, transform 0.18s',
        ...style,
      }}
      onMouseEnter={e => {
        const s = (e.currentTarget as HTMLElement).style;
        s.background = BLUE_HOVER;
        s.transform = 'translateY(-1px)';
      }}
      onMouseLeave={e => {
        const s = (e.currentTarget as HTMLElement).style;
        s.background = BLUE;
        s.transform = 'none';
      }}
    >
      {label} <ArrowRight size={15} />
    </button>
  );
}
