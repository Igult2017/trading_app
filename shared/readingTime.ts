/**
 * How long an article takes to read, worked out from the article itself.
 *
 * WHY THIS EXISTS. "5 min" was hardcoded in ELEVEN places — the database column default
 * (`db-init.ts` `read_time TEXT DEFAULT '5 min'`), the create endpoint, the admin form defaults and
 * every display fallback — so every published article claimed roughly five minutes no matter how
 * long it was. Measured on production 2026-09-09, all eight posts said ~5 minutes while their real
 * lengths ran from **190 to 659 words** (about 1 to 3 minutes), and the value had been typed by hand
 * in four different spellings: "5 min", "5mins", "5m", "5min".
 *
 * It lives in `shared/` because both sides need the SAME answer: the editor fills the field in as
 * the author writes, and the server computes it when a post is saved without one. Two copies of this
 * rule would drift, and the reader would see one number in the editor and a different one on the page.
 *
 * 200 words per minute is the conventional figure for adult silent reading of general prose. The
 * result is never below one minute, because "0 min read" is not a useful thing to tell anybody.
 */

/** Words in a piece of markdown, ignoring the markup itself. */
export function wordCount(markdown: string): number {
  if (!markdown) return 0;
  const prose = markdown
    // An embedded picture is megabytes of base64 and not a single word — drop images before
    // anything else, or one inline cover turns a 300-word post into a 40-minute read.
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/```[\s\S]*?```/g, ' ')        // fenced code blocks
    .replace(/`[^`]*`/g, ' ')               // inline code
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1') // links keep their words, drop the target
    .replace(/<[^>]+>/g, ' ')               // raw html tags
    .replace(/[#>*_~|-]+/g, ' ')            // heading, quote, list and emphasis marks
    .trim();
  if (!prose) return 0;
  return prose.split(/\s+/).filter(Boolean).length;
}

export const WORDS_PER_MINUTE = 200;

/** The phrase shown to readers, e.g. "3 min". Empty for an empty article — never a made-up number. */
export function readingTime(markdown: string): string {
  const words = wordCount(markdown);
  if (words === 0) return '';
  return `${Math.max(1, Math.round(words / WORDS_PER_MINUTE))} min`;
}
