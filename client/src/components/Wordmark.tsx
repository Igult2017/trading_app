/**
 * Wordmark — "Trade [candle] Journal", the brand lockup.
 *
 * The `&` is drawn as a candlestick (user, 2026-08-05: *"replace & in Trade&Journal logo with a
 * nicely done candle"*), matching the reference: a thin full-height wick with a solid body around
 * the middle, in the blue the ampersand already used.
 *
 * THIS COMPONENT EXISTS BECAUSE THE LOGO DID NOT. Before it, the lockup was hand-rolled in TEN
 * places — HomeHeader, HomeFooter, JournalHeader, AuthPage (twice), AuthCallbackPage, TradingLoader,
 * AdminPanel, LegalPage, SupportPage — at five font sizes and with three different colour
 * treatments, each repeating `<span style={{ color: '#2563eb' }}>&</span>`. Changing the glyph
 * without collecting them first would have meant ten edits now and ten more at the next change.
 *
 * SIZED IN `em`, NEVER px. Those ten sites set 14, 15, 16, 17, 20 and 21px, and the candle has to
 * work at all of them from one definition — so every dimension here is relative to the inherited
 * font-size and no call site tunes anything.
 */

/** The accent blue. Every one of the ten sites already wrote this exact value for the `&`. */
export const WORDMARK_ACCENT = '#2563eb';

/**
 * Proportions, expressed against the font-size.
 *
 * The reference has the wick running past the letters at both ends and the body sitting roughly
 * across the x-height. `GLYPH_H` slightly exceeds cap-height so the wick reads as a wick rather
 * than as a stray stroke; `BASELINE_DROP` pushes it down so the body centres optically between the
 * two words instead of floating above the baseline.
 */
// Taken off the reference image rather than guessed. Measured there against the cap height of the
// letterforms (Playfair's cap is ~0.70em):
//   candle height / cap height  = 1.27   ->  0.70 * 1.27 = 0.89em
//   body height  / candle height = 0.54
//   body width   / candle height = 0.23  (first draft 0.33 was fat, second 0.20 too thin
//                                         at 14px — settled at 0.25 so it survives small)
//   gap either side / cap height = 0.23  ->  0.16em
const GLYPH_H = 0.90;        // em — total candle height (wick tip to wick tip)
const BASELINE_DROP = 0.11;  // em — half the overshoot, so the wick clears cap-height and baseline
                             // by the same amount and the body centres between the two words
const SIDE_GAP = 0.16;       // em — breathing room either side, replacing the &'s own sidebearing

function CandleGlyph({ color }: { color: string }) {
  return (
    <svg
      viewBox="0 0 10 40"
      aria-hidden="true"
      focusable="false"
      style={{
        height: `${GLYPH_H}em`,
        width: 'auto',
        // `block` inside an inline-block wrapper: an inline <svg> sits on the text baseline and
        // carries the line-box's descender gap with it, which shifted the candle a pixel or two
        // depending on line-height. This takes it out of the line box entirely.
        display: 'block',
        overflow: 'visible',
      }}
    >
      {/* wick — full height, centred. `crispEdges` because at the smallest site (14px) this is a
          ~1px column; antialiasing turns it into a grey smear instead of a line. Not applied to the
          body, which would lose its rounded corners. */}
      <rect x="4" y="0" width="2" height="40" fill={color} shapeRendering="crispEdges" />
      {/* body — solid, centred on the wick */}
      <rect x="0" y="9" width="10" height="22" rx="0.9" fill={color} />
    </svg>
  );
}

export interface WordmarkProps {
  /** Colour of "Trade" and "Journal". Omit to inherit from the parent (`currentColor`). */
  color?: string;
  /** Colour of the candle. Defaults to the accent the `&` already used. */
  accent?: string;
  style?: React.CSSProperties;
  className?: string;
}

export default function Wordmark({ color, accent = WORDMARK_ACCENT, style, className }: WordmarkProps) {
  return (
    <span
      className={className}
      style={{ color, display: 'inline-flex', alignItems: 'baseline', whiteSpace: 'nowrap', ...style }}
    >
      Trade
      {/* The words stay REAL TEXT — selectable, indexable, and readable by a screen reader. Only
          the ampersand becomes a picture, so the accessible name is still "Trade&Journal". */}
      <span className="sr-only">&amp;</span>
      <span
        aria-hidden="true"
        style={{
          display: 'inline-block',
          margin: `0 ${SIDE_GAP}em`,
          transform: `translateY(${BASELINE_DROP}em)`,
        }}
      >
        <CandleGlyph color={accent} />
      </span>
      Journal
    </span>
  );
}
