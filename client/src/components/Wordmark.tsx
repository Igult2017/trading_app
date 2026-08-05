/**
 * Wordmark — the Trade&Journal brand lockup.
 *
 * The user supplied the artwork (`Logo2.png`) and said: *"Just use the logo I provided as it is, no
 * need to modify."* So it ships as an IMAGE, untouched — same mark, lettering, colours and
 * proportions as delivered. Nothing here re-draws or re-typesets it.
 *
 * The only processing applied was lifting the artwork off its mockup: the supplied file was a photo
 * of the logo on textured grey paper, with a drop shadow and a generator watermark in the corner.
 * `client/public/logo.png` is that file cropped to the artwork with the paper made transparent —
 * the paper was cleared by flood-filling inward from the borders, so the white panel enclosed inside
 * the book shape (which is just as pale as the paper) survived rather than being punched out.
 *
 * THIS REPLACED A CANDLESTICK WORDMARK shipped earlier the same day. The ten call sites that
 * refactor collected — HomeHeader, HomeFooter, JournalHeader, AuthPage (twice), AuthCallbackPage,
 * TradingLoader, AdminPanel, LegalPage, SupportPage — are why this is one component swap instead of
 * ten edits.
 *
 * NOTE ON SIZE: the supplied lockup is VERTICAL (mark above the words) at roughly 2.3:1. Every site
 * is a single row, and the landing header is 68px tall, so at any height that fits, the lettering
 * lands under ~10px. That is a property of the artwork, not of this component, and fixing it would
 * mean restructuring the logo — which is the thing that was ruled out. `height` is exposed so a
 * caller can give it more room where there is room to give.
 */

export interface WordmarkProps {
  /** Height of the lockup, in `em` so it tracks the site's own font-size. Width follows the
   *  artwork's aspect ratio. */
  height?: string;
  style?: React.CSSProperties;
  className?: string;
}

export default function Wordmark({ height = '2.4em', style, className }: WordmarkProps) {
  return (
    <img
      src="/logo.png"
      // The accessible name the ten sites had before, preserved exactly.
      alt="Trade&Journal"
      className={className}
      style={{ height, width: 'auto', display: 'block', flexShrink: 0, ...style }}
    />
  );
}
