/**
 * Brand — the name "DailyTradeBook" wherever it is set as TEXT: in running prose, and beside the
 * mark in `Wordmark`. One definition, so the logo and a sentence cannot disagree about it.
 *
 * RENAMED 2026-10-11, his instruction: *"Change the app name to DailyTradeBook everywhere."*
 *
 * ⚠ THE LOGO STILL SAYS THE OLD NAME, AND THAT IS DELIBERATE. He asked for the name changed
 * everywhere EXCEPT the logo — *"Only leave the logo we can fix it later because i am about to
 * create a new logo."* So `Wordmark` and the artwork it points at are untouched, and the header
 * reads Trade&Journal until the new artwork arrives. The comment above about the logo and a
 * sentence agreeing is the goal, not today's state.
 *
 * PLAYFAIR DISPLAY, and it is not the logo's doing — it is the app's display face, used for every
 * heading. It stays when the artwork changes.
 *
 * WHAT THIS FILE USED TO DO, and why almost all of it is gone. The name was "Trade&Journal", and
 * his instruction on 2026-08-30 was *"write Trade & Journal in playfair but not write '&' in
 * playfair because it will look bad."* So the component wrapped the ampersand in a nested span
 * with its own font, a 0.88em size and a baseline nudge — a sans ampersand dropped into a serif
 * word at full size sits optically large and rides high against the serif's cap height. Those
 * three adjustments WERE this component.
 *
 * DailyTradeBook has no ampersand, so all of it went: the nested span, the AMP_FONT constant, and
 * the `upper` prop whose only job was to split the name into TRADE + & + JOURNAL — and which no
 * caller passed even before the rename.
 */

/** The letters. Playfair Display — the app's display face. */
const SERIF = "'Playfair Display', Georgia, serif";

export interface BrandProps {
  style?: React.CSSProperties;
  className?: string;
}

export default function Brand({ style, className }: BrandProps) {
  return (
    <span
      className={className}
      style={{
        fontFamily: SERIF,
        fontWeight: 700,
        letterSpacing: '-0.005em',
        ...style,
      }}
    >
      DailyTradeBook
    </span>
  );
}
