/**
 * readingTime.test.ts — run with:
 *     npx tsx shared/readingTime.test.ts
 *
 * "5 MIN" WAS HARDCODED IN ELEVEN PLACES AND EVERY ARTICLE CLAIMED IT.
 *
 * His question, 2026-09-09: *"the blog editor, do you see any hardcoding there that you can fix."*
 *
 * The read-time box was a free-text field with a placeholder, and every fallback around it — the
 * database column default, the create endpoint, the admin form defaults, and the display paths on
 * the blog list and the article page — filled in the literal string `'5 min'`. Measured against the
 * eight published posts on production:
 *
 *     every post said ~5 minutes; the real articles ran from 190 to 659 words (about 1 to 3 min),
 *     hand-typed in four different spellings: "5 min", "5mins", "5m", "5min".
 *
 * These checks pin the rule that replaced it. No network, no database.
 */
import { readingTime, wordCount, WORDS_PER_MINUTE } from './readingTime';

let pass = 0, fail = 0;
function check(what: string, got: unknown, want: unknown) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${what}` + (ok ? '' : `: got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`));
  ok ? pass++ : fail++;
}

console.log('\n== 1. IT COUNTS THE PROSE, NOT THE MARKUP ==');
check('plain words', wordCount('one two three four five'), 5);
check('heading and emphasis MARKS are stripped, the words they wrap are kept',
      wordCount('# Title\n\n**bold** _italic_ text'), 4);   // Title, bold, italic, text
check('a link keeps its words but not its target',
      wordCount('see [the full report](https://example.com/a/very/long/path) now'), 5);   // see the full report now
check('a fenced code block is not prose',
      wordCount('intro words here\n```\nconst a = 1; const b = 2;\n```\nafter'), 4);
check('blank content is zero', wordCount(''), 0);

console.log('\n== 2. THE ONE THAT MATTERS — AN EMBEDDED PICTURE IS NOT AN ARTICLE ==');
// The covers on this blog are base64 data URIs, and one is 430 KB. If an author drops a picture
// into the body, counting its characters as words would turn a short post into a 40-minute read.
const withCover = 'Short intro.\n\n![cover](data:image/jpeg;base64,' + 'A'.repeat(400_000) + ')\n\nEnd.';
check('a 400 KB inline picture adds no words', wordCount(withCover), 3);
check('...so it does not inflate the reading time', readingTime(withCover), '1 min');

console.log('\n== 3. THE TIME ITSELF ==');
check(`${WORDS_PER_MINUTE} words is 1 min`, readingTime('word '.repeat(WORDS_PER_MINUTE)), '1 min');
check('600 words is 3 min', readingTime('word '.repeat(600)), '3 min');
check('a very short post still rounds up to 1 min, never 0',
      readingTime('just three words'), '1 min');
check('an empty article gets NO number — not a made-up one', readingTime(''), '');
check('whitespace only gets no number', readingTime('   \n\n  '), '');

console.log('\n== 4. TEETH — THE REAL POSTS THAT WERE ALL LABELLED 5 MIN ==');
// The measured word counts of the eight published posts on 2026-09-09. Not one of them is 5 min.
const REAL_POSTS: [string, number][] = [
  ['The Dawn of the Intelligent Era', 190],
  ['Navigating the Noise', 470],
  ['Market Outlook for Monday', 536],
  ['The High-Stakes AI Gauntlet', 505],
  ['Debunking the Myths of Forex Trading', 609],
  ['The Digital Frontier', 659],
  ['The End of Energy Fragility', 593],
  ['The Global Market Tug-of-War', 548],
];
for (const [title, words] of REAL_POSTS) {
  const got = readingTime('word '.repeat(words));
  check(`${title} (${words} words) is NOT 5 min`, got !== '5 min', true);
}
check('the longest of them is 3 min', readingTime('word '.repeat(659)), '3 min');
check('the shortest of them is 1 min', readingTime('word '.repeat(190)), '1 min');

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
