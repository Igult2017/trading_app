/**
 * Brand — the name "Trade&Journal" wherever it is set as TEXT: in running prose, and beside the
 * mark in `Wordmark`. One definition, so the logo and a sentence cannot disagree about it.
 *
 * PLAYFAIR DISPLAY, EXCEPT THE AMPERSAND — his instruction, 2026-08-30: *"write Trade & Journal in
 * playfair but not write '&' in playfair because it will look bad."* So "Trade" and "Journal" are
 * the serif and the `&` is set in Inter, slightly smaller and nudged down: a sans ampersand dropped
 * into a serif word at the same size sits optically large and rides high against the serif's cap
 * height. Those two adjustments are the reason this is a nested span rather than one font swap.
 *
 * WHAT THIS USED TO SAY, and why it changed. It was Inter at 0.96em, and the reason given was that
 * the logo had become a bold sans, so a serif name in prose "read as a different company". The logo
 * changed again on 2026-08-30 and its lettering is now this component, so the argument inverted:
 * matching the logo now MEANS being Playfair. The size compensation went with it — it existed to
 * stop a sans name looking shrunken inside serif copy, and there is no longer a mismatch to correct.
 *
 * FOR THE RECORD, since it was checked rather than assumed: Playfair's ampersand was rendered beside
 * Inter's at 64px before this change. It is a conventional form, not the ornate italic "Et" some
 * serifs use. He wants it in the sans anyway, which is his call to make about his own brand.
 */

/** The letters. Playfair Display — his instruction, 2026-08-30. */
const SERIF = "'Playfair Display', Georgia, serif";

export interface BrandProps {
  /** Render as TRADE&JOURNAL. Off by default — see the note above. */
  upper?: boolean;
  style?: React.CSSProperties;
  className?: string;
}

/** The ampersand is set apart from the letters — see the note at the top of this file. */
const AMP_FONT = "'Inter Variable', 'Inter', system-ui, sans-serif";

export default function Brand({ upper = false, style, className }: BrandProps) {
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
      {upper ? 'TRADE' : 'Trade'}
      <span
        style={{
          // THE AMPERSAND IS NOT PLAYFAIR — his instruction, 2026-08-30: *"write Trade & Journal in
          // playfair but not write '&' in playfair because it will look bad."*
          //
          // Set slightly smaller and nudged, because a sans ampersand dropped into a serif word at
          // the same size sits optically large and rides high next to the serif's cap height. These
          // two numbers are the whole reason this is a nested span rather than a font swap.
          fontFamily: AMP_FONT,
          fontWeight: 700,
          fontSize: '0.88em',
          verticalAlign: '0.02em',
          margin: '0 0.02em',
        }}
      >
        &amp;
      </span>
      {upper ? 'JOURNAL' : 'Journal'}
    </span>
  );
}
