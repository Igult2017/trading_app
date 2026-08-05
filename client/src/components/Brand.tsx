/**
 * Brand — the name "Trade&Journal" as it appears INSIDE a sentence.
 *
 * Not the logo. The logo is `Wordmark` and it is an image; this is running text. It exists so the
 * brand name in prose is set in the same typeface as the logo's lettering instead of the page's
 * serif, which — once the logo changed to a bold sans — made "© 2026 Trade&Journal" read as a
 * different company (user, 2026-08-05: *"make its font type to be that of the logo"*).
 *
 * THE TYPEFACE IS INTER, AND THAT WAS MEASURED, NOT GUESSED. My first read of the artwork was
 * Montserrat; rendered against the logo's own lettering at matched cap height it is visibly wider
 * with a rounder `O` and a different `&`. Every bold sans already installed was compared —
 * Montserrat, Manrope, Plus Jakarta, Onest — and Inter matches: same `R` leg, same `&`, same
 * proportions, and it is a neo-grotesque like the artwork rather than a geometric.
 *
 * `@fontsource-variable/inter` is already imported in index.css, so 700 costs no new font file.
 *
 * CASING STAYS SENTENCE-CASE by default. The ask was the font, and setting the name in caps inside
 * a customer quote or a copyright line shouts. `upper` is there if a specific site wants it.
 */

export interface BrandProps {
  /** Render as TRADE&JOURNAL. Off by default — see the note above. */
  upper?: boolean;
  style?: React.CSSProperties;
  className?: string;
}

export default function Brand({ upper = false, style, className }: BrandProps) {
  return (
    <span
      className={className}
      style={{
        // 'Inter Variable' is the family fontsource-variable declares; plain 'Inter' is the fallback
        // for anyone who has it installed locally.
        fontFamily: "'Inter Variable', 'Inter', system-ui, sans-serif",
        fontWeight: 700,
        // The surrounding copy is Playfair, which runs optically larger at the same px. Without this
        // the brand name looks shrunken mid-sentence.
        fontSize: '0.96em',
        letterSpacing: '-0.005em',
        ...style,
      }}
    >
      {upper ? 'TRADE&JOURNAL' : 'Trade&Journal'}
    </span>
  );
}
