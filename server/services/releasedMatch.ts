/**
 * Deciding whether two differently-worded titles mean the SAME economic release.
 *
 * ⚠ THIS LIVES APART FROM `calendarDb` ON PURPOSE: it is pure string work with no database, so it
 * can be tested without one. It was inside calendarDb first and the test could not even import it.
 */
/**
 * The significant words in an event title, for comparing names across two sources.
 *
 * ⚠ THE TWO SOURCES NAME THE SAME EVENT COMPLETELY DIFFERENTLY, which is why exact matching filled
 * ZERO of 32 released values on the first production run:
 *
 *     ForexFactory (stored)                 Trading Economics (released)
 *     Flash Manufacturing PMI               S&P Global Manufacturing PMI Flash
 *     Revised UoM Consumer Sentiment        Michigan Consumer Sentiment Final
 *
 * So: drop the vendor's own branding, drop the words that only say WHICH CUT of a release it is
 * (the two sites disagree on those by convention — "Revised" vs "Final", "Flash" vs "Flash"), and
 * treat UoM and Michigan as the one institution they are.
 */
export const MIN_SCORE = 0.6;

/** Different names for the same thing. ForexFactory writes "UoM", Trading Economics writes
 *  "Michigan" — both mean the University of Michigan survey. */
const SYNONYM: Record<string, string> = { uom: "michigan" };

const NOISE = new Set([
  "s", "p", "global", "the", "of", "and", "a", "an", "de",
  // The release stage. ForexFactory says "Revised", Trading Economics says "Final" for the same
  // print, so scoring on these would punish a correct match and reward a wrong one.
  "flash", "final", "revised", "prelim", "preliminary", "advance", "second", "third", "est", "estimate",
]);

export function titleTokens(t: string): Set<string> {
  // The period suffixes first, as LITERAL replacements. `split().join()` is used rather than a
  // regular expression on purpose: an earlier version wrote these with word boundaries and the
  // escape was mangled on the way into the file, leaving a literal control character in the
  // pattern. It matched nothing, silently, and the terminal did not render the bad byte - so the
  // code read as correct while "m/m" and "y/y" both collapsed to the same meaningless token.
  const flat = String(t || "")
    .toLowerCase()
    .split("m/m").join(" mom ")
    .split("y/y").join(" yoy ")
    .split("q/q").join(" qoq ")
    .replace(/[^a-z0-9]+/g, " ");

  const out = new Set<string>();
  for (const w of flat.split(" ")) {
    if (!w) continue;
    const word = SYNONYM[w] ?? w;          // UoM and Michigan are one institution
    if (!NOISE.has(word)) out.add(word);
  }
  return out;
}

/** How alike two titles are: shared significant words over the SHORTER title's word count, so a
 *  vendor adding extra words ("S&P Global …") cannot drag a correct match below the threshold. */
export function similarity(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let shared = 0;
  a.forEach(w => { if (b.has(w)) shared += 1; });
  return shared / Math.min(a.size, b.size);
}


/** Which of `candidates` a released title lands on, or null when it refuses to choose.
 *
 *  THE REFUSAL IS THE IMPORTANT HALF. Trading Economics publishes both "Michigan Inflation
 *  Expectations Final" and "Michigan 5 Year Inflation Expectations Final"; they score identically
 *  against one stored row. Picking either would put a real number beside the wrong event, so a tie
 *  returns null and the value is simply not stored.
 */
export function pickMatch<T extends { title: string }>(released: string, candidates: T[]): T | null {
  const want = titleTokens(released);
  const scored = candidates
    .map(c => ({ c, score: similarity(want, titleTokens(c.title)) }))
    .sort((x, y) => y.score - x.score);
  const best = scored[0], runnerUp = scored[1];
  if (!best || best.score < MIN_SCORE) return null;
  if (runnerUp && runnerUp.score >= best.score) return null;
  return best.c;
}

/**
 * Assign released values to stored rows, keeping only the assignments that are unambiguous BOTH
 * WAYS. Returns a map of stored-row index -> the released value that belongs to it.
 *
 * ⚠ ONE-TO-ONE IS CHECKED IN BOTH DIRECTIONS, and the second direction is the one that bites.
 * `pickMatch` already refuses when one released value fits two stored rows equally. But the
 * reverse also happens, and silently: Trading Economics publishes BOTH "Michigan Inflation
 * Expectations Final" AND "Michigan 5 Year Inflation Expectations Final", while ForexFactory stores
 * a single "Revised UoM Inflation Expectations". Both released rows match that one stored row, and
 * whichever happened to be processed first would win — so the FIVE-YEAR number could be filed as
 * the headline figure, with nothing anywhere saying it had happened.
 *
 * When two released values claim the same row, NEITHER is stored.
 */
export function resolveClaims<R extends { event: string }, C extends { title: string }>(
  released: R[], candidates: C[],
): Map<number, R> {
  const claims = new Map<number, R[]>();
  for (const r of released) {
    const hit = pickMatch(r.event, candidates);
    if (!hit) continue;
    const idx = candidates.indexOf(hit);
    const list = claims.get(idx) ?? [];
    list.push(r);
    claims.set(idx, list);
  }
  const out = new Map<number, R>();
  claims.forEach((rs, idx) => { if (rs.length === 1) out.set(idx, rs[0]); });
  return out;
}
