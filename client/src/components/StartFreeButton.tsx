/**
 * StartFreeButton — the primary CTA, defined ONCE and used at three sites
 * (HomeHeader, HomePage hero, HomeStatsSection).
 *
 * GRADIENT OUTLINE, from the artwork the user supplied (Desktop/Start Free.png — a "REGISTER >>"
 * button): transparent fill, gradient ring, gradient label, double chevron, uppercase and
 * letterspaced. His instruction, 2026-08-07: *"We borrow this design for start free cards."*
 *
 * THE GRADIENT IS PER-THEME, AND THAT IS NOT A LIBERTY — IT IS FORCED.
 * Measured off the artwork (diagonal, strongly-saturated pixels only):
 *     #0B6DF0 blue -> #07ADD2 cyan -> #02E6B5 mint
 * Those stops fail WCAG AA at one end on EACH theme, at opposite ends:
 *     on light #F8FAFC   blue 4.50 ok | cyan 2.54 FAIL | mint 1.55 FAIL
 *     on dark  #020817   blue 4.25 FAIL | cyan 7.54 ok | mint 12.37 ok
 * No single sweep clears 4.5:1 on both, so each theme gets stops shifted to stay legible while
 * keeping the same blue -> green travel. Same reason JournalHeader carries two blues.
 *
 * Measured on the WORST surface each theme actually renders on:
 *     dark   #2E86FF 5.32  ·  #07ADD2 7.54  ·  #02E6B5 12.37   (cyan + mint exactly as supplied)
 *     light  #0B5FD0 5.49  ·  #067A93 4.64  ·  #0A7A55 4.98
 */
import { ChevronsRight } from 'lucide-react';
import { openAuthModal } from '@/components/auth/AuthModal';

/** Stops as supplied, kept for the dark theme where they measure well. */
const DARK_STOPS  = ['#2E86FF', '#07ADD2', '#02E6B5'];
/** The same travel, darkened until every stop clears 4.5:1 on white. */
const LIGHT_STOPS = ['#0B5FD0', '#067A93', '#0A7A55'];

// NO BACKTICKS ANYWHERE IN THIS TEMPLATE, including comments — one inside a <style>{...} literal
// is a runtime crash that still builds clean. Learned the hard way; see the memory note.
const SFB_CSS = `
  .sfb {
    position: relative;
    display: inline-flex;
    align-items: center;
    gap: 8px;
    /* 16px vertical + the 16px chevron = a 48px natural height, which is exactly the email input
       it sits beside in the hero. Paired with align-self below, all three sites render the same
       box AND the hero pair still lines up. */
    padding: 16px 22px;
    /* The call sites are flex rows whose default align-items:stretch was pulling the button to
       whatever its sibling happened to be — 42 / 48.4 / 50.4 from identical CSS. The button's own
       size is authoritative. */
    align-self: center;
    border: none;
    border-radius: 12px;
    background: transparent;
    cursor: pointer;
    white-space: nowrap;
    font-family: 'Inter Variable', 'Inter', system-ui, sans-serif;
    font-size: 13px;
    font-weight: 700;
    letter-spacing: 0.13em;
    text-transform: uppercase;
    /* PIN THE LINE BOX. Without this the label inherits each parent's line-height and the three
       sites rendered 46.8 / 48.4 / 50.4 tall from identical padding — the same class of bug as the
       "identical buttons" that were not. Height is now padding + the chevron, nothing ambient. */
    line-height: 1;
    transition: transform 0.18s ease, filter 0.18s ease;
    -webkit-tap-highlight-color: transparent;
  }
  /* THE RING. A masked pseudo-element, not a border-image and not the padding-box/border-box
     double-background trick: both of those force the fill to a solid colour, and this button sits
     over several different surfaces. mask-composite leaves the middle genuinely transparent. */
  .sfb::before {
    content: '';
    position: absolute;
    inset: 0;
    border-radius: inherit;
    padding: 2px;
    background: linear-gradient(135deg, var(--sfb-a), var(--sfb-b), var(--sfb-c));
    -webkit-mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0);
    -webkit-mask-composite: xor;
    mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0);
    mask-composite: exclude;
    pointer-events: none;
  }
  /* The label needs background-clip:text, which the ring cannot share — that one needs
     border-box — so the text lives on its own element. */
  .sfb-label {
    background: linear-gradient(135deg, var(--sfb-a), var(--sfb-b));
    -webkit-background-clip: text;
    background-clip: text;
    color: transparent;
  }
  .sfb-chev { color: var(--sfb-c); flex-shrink: 0; }
  .sfb:hover { transform: translateY(-1px); filter: brightness(1.12); }
  .sfb:active { transform: none; }
  .sfb:focus-visible { outline: 2px solid var(--sfb-b); outline-offset: 3px; }
`;

export interface StartFreeButtonProps {
  label?: string;
  /** Use the dark-surface stops. Same explicit-flag approach as Wordmark — the landing page keeps
   *  its theme in React state and never sets html.dark, so a CSS-only rule would miss it. */
  dark?: boolean;
  /** Layout only (margins, flex). The button's shape is deliberately not overridable — collecting
   *  it in one place is the point. */
  style?: React.CSSProperties;
  className?: string;
}

export default function StartFreeButton({ label = 'Start free', dark = false, style, className }: StartFreeButtonProps) {
  const [a, b, c] = dark ? DARK_STOPS : LIGHT_STOPS;
  return (
    <>
      <style>{SFB_CSS}</style>
      <button
        type="button"
        className={['sfb', className].filter(Boolean).join(' ')}
        onClick={() => openAuthModal('signup')}
        style={{ ['--sfb-a' as string]: a, ['--sfb-b' as string]: b, ['--sfb-c' as string]: c, ...style }}
      >
        <span className="sfb-label">{label}</span>
        <ChevronsRight className="sfb-chev" size={16} strokeWidth={2.6} />
      </button>
    </>
  );
}
