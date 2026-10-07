/**
 * build-showcase.mjs — turn his raw screenshots into the landing page's slideshow images.
 *
 *     node scripts/build-showcase.mjs
 *     node scripts/build-showcase.mjs "C:/some/other/folder"
 *
 * HIS ASK, 2026-10-06: *"do plumbing for them so that they are not heavy and they dont take alot of
 * time to load... enhance their quality to look 3D and clear and lighter for lesser load time"*.
 *
 * THREE THINGS THIS DOES, AND ONE IT DELIBERATELY DOES NOT.
 *
 *   1. RESIZE to the width the page can actually use. The source is 1365px wide and the slide is at
 *      most 1200px on screen, so the extra pixels are bytes nobody sees. `MAX_W` is set to 2x the
 *      widest the box ever gets, which keeps it sharp on a high-density screen and throws away the
 *      rest.
 *   2. PAD every image to ONE shape. The sources run from 2.35:1 to 3.02:1, and a slideshow whose
 *      box changes height as it advances looks broken. Padding is done on the screenshots' OWN
 *      near-black (sampled: RGB 4-17), so the added strip cannot be seen against the app's own
 *      background. Cropping was the alternative and would cut rows off a dashboard.
 *   3. CONVERT TO WEBP, which is what makes the set small. These are UI screenshots — large flat
 *      areas, hard edges, few gradients — which is the case WebP handles best.
 *
 *   IT DOES NOT bake the "3D" look into the pixels. That is a tilt, a shadow and a glow, and it is
 *   done in CSS on the page (`ShowcaseSlider.tsx`). Baked in, it would make every file bigger, lock
 *   the shadow to one background colour, and go soft when the browser scales the image. In CSS it
 *   costs nothing, stays sharp, and follows his light/dark toggle.
 *
 * RE-RUNNABLE. Drop more screenshots in the folder and run it again; it rewrites the output folder
 * and prints the new manifest to paste into the component.
 */
import sharp from 'sharp';
import { readdir, mkdir, writeFile, stat } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';

// ⚠ A DEDICATED FOLDER, NOT THE WINDOWS SCREENSHOTS DUMP — changed 2026-10-06 after it bit.
//
// This pointed at C:/Users/FSD/Pictures/Screenshots, which is where Windows puts EVERY screenshot he
// takes. On the second run it silently picked up four new files that were pictures of our own
// conversation — the old landing page, and the feature cards he had screenshotted to show me a
// problem — and put them in the slideshow. Two were 581x308 and 372x435, one of them portrait.
//
// THE REAL RISK IS NOT THE JUNK, IT IS THE PRIVACY. Any screenshot he ever takes — a bank page, a
// private message, an account number — would have been published to his public landing page at the
// next build, with nothing asking him. A build script must never read a folder whose contents it
// does not control.
//
// So: an explicit folder that holds the slideshow and nothing else. Adding a screen is now a
// deliberate act (drop the file in, re-run), which is what it should always have been.
const SRC   = process.argv[2] || 'C:/Users/FSD/Pictures/DailyTradeBook-showcase';
const OUT   = path.resolve('client/public/showcase');
// 2x the widest the slide is ever drawn (1200px), so it stays sharp on a high-density screen.
// ⚠ THIS IS AN UPSCALE, AND THAT IS DELIBERATE — the reasoning matters, 2026-10-06.
//
// He said the hero looked blurred. Measured in the browser: his captures are 1365x525 and the hero
// box is 1434x654, so the browser was ENLARGING them 1.25x to cover it — and on a laptop running at
// 125% or 150% display scaling (most of them) that compounds to 1.5x-1.9x. That stretch was the blur.
//
// UPSCALING CANNOT ADD DETAIL THAT WAS NEVER CAPTURED, and nothing here pretends otherwise. What it
// CAN do is replace the browser's naive stretch with a proper Lanczos resample plus an unsharp mask,
// done once at build time. On UI screenshots — hard edges, thin borders, small text — that is a
// visible win: compared side by side at the same display size, the card borders and the serif
// numerals come back noticeably cleaner.
//
// WHY 2560 AND NOT MORE. Measured, per image: 1365 native = 30 KB but the browser stretches it;
// 2048 = 52 KB, sharp to a 1.2x screen; 2560 = 67 KB, sharp to 1.5x; 2730 (true 2x) = 89 KB. 2560
// covers essentially every Windows laptop including 125% and 150% scaling, for 37 KB less than full
// 2x. Only ONE image is fetched on first paint, so that 67 KB is the whole hero cost.
//
// THE REAL FIX IS STILL BETTER SOURCES. Re-capture at 2x (browser devtools -> device toolbar ->
// device pixel ratio 2) and drop them in this folder; this script needs no change and the upscale
// becomes a downscale, which is always sharp.
const MAX_W = 2560;
// The one shape every slide is padded to. 2.6 is the median of his 15 sources, so most need almost
// nothing added and the few outliers get a thin invisible strip.
const RATIO = 2.6;
// Sampled from the screenshots' own corners (RGB 4-17 across the set) — the padding has to be the
// app's background, not black, or it shows as a band against the dark UI.
const PAD   = { r: 8, g: 12, b: 16 };
const QUALITY = 85;          // WebP: visually indistinguishable on UI screenshots, ~1/3 the bytes

const kb = n => `${(n / 1024).toFixed(0)} KB`;

let files = (await readdir(SRC))
  .filter(f => /\.(png|jpe?g)$/i.test(f))
  .sort();                                   // chronological, because his names are timestamps

// A SECOND LINE OF DEFENCE, for the day someone points this at a mixed folder anyway. A capture of
// an app screen is WIDE and reasonably large; a crop of a chat, a phone screenshot or an icon is
// not. Anything rejected is NAMED, so a real screen that trips the rule is obvious rather than
// silently missing from the slideshow.
const MIN_W = 900, MIN_RATIO = 1.5;
const kept = [];
for (const f of files) {
  const m = await sharp(path.join(SRC, f)).metadata();
  const ratio = m.width / m.height;
  if (m.width < MIN_W || ratio < MIN_RATIO) {
    console.log(`  SKIPPED ${f} — ${m.width}x${m.height} (ratio ${ratio.toFixed(2)}): too small or `
                + `too tall to be an app screen. Move it out of this folder, or widen the rule.`);
    continue;
  }
  kept.push(f);
}
files = kept;

if (!files.length) {
  console.error(`No images found in ${SRC}`);
  process.exit(1);
}
if (!existsSync(OUT)) await mkdir(OUT, { recursive: true });

console.log(`\nbuilding ${files.length} showcase images\n  from ${SRC}\n  to   ${OUT}\n`);

let before = 0, after = 0;
const manifest = [];

for (const [i, f] of files.entries()) {
  const srcPath = path.join(SRC, f);
  before += (await stat(srcPath)).size;

  const img  = sharp(srcPath);
  const meta = await img.metadata();

  // Width first, then however tall 2.6:1 makes it. Padding is added top and bottom (or left and
  // right for an unusually tall source), never cropped — a dashboard with its top row cut off is
  // worse than a few invisible pixels of background.
  const w = MAX_W;                       // always render at MAX_W — see the note on it above
  const h = Math.round(w / RATIO);

  const name = `slide-${String(i + 1).padStart(2, '0')}.webp`;
  const outPath = path.join(OUT, name);

  await img
    // `withoutEnlargement` is GONE on purpose — it was what kept the output at the source's 1365px
    // and left the enlarging to the browser, which does it worse. Lanczos3 is the sharpest of the
    // standard resamplers for upscaling line art and text.
    .resize({ width: w, height: h, fit: 'contain', background: PAD, kernel: 'lanczos3' })
    // The unsharp mask is what actually recovers the crispness, by rebuilding the edge contrast that
    // any enlargement softens. Modest values: pushed harder it starts ringing around the text.
    .sharpen({ sigma: 0.7, m1: 0.5, m2: 2.0 })
    .webp({ quality: QUALITY, effort: 6 })
    .toFile(outPath);

  const size = (await stat(outPath)).size;
  after += size;
  manifest.push({ src: `/showcase/${name}`, w, h });
  console.log(`  ${f.slice(-14)}  ${meta.width}x${meta.height} -> ${w}x${h}  ${kb(size)}`);
}

await writeFile(path.join(OUT, 'manifest.json'),
                JSON.stringify({ width: manifest[0].w, height: manifest[0].h,
                                 slides: manifest.map(m => m.src) }, null, 1));

const pct = (1 - after / before) * 100;
console.log(`\n  PNG in : ${kb(before)}`);
console.log(`  WebP out: ${kb(after)}   (${pct.toFixed(0)}% smaller)`);
console.log(`  first slide alone: ${kb(after / files.length)} — that is what the page actually pays`);
console.log(`  manifest: ${path.join(OUT, 'manifest.json')}\n`);
