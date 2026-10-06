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

const SRC   = process.argv[2] || 'C:/Users/FSD/Pictures/Screenshots';
const OUT   = path.resolve('client/public/showcase');
// 2x the widest the slide is ever drawn (1200px), so it stays sharp on a high-density screen.
const MAX_W = 2400;
// The one shape every slide is padded to. 2.6 is the median of his 15 sources, so most need almost
// nothing added and the few outliers get a thin invisible strip.
const RATIO = 2.6;
// Sampled from the screenshots' own corners (RGB 4-17 across the set) — the padding has to be the
// app's background, not black, or it shows as a band against the dark UI.
const PAD   = { r: 8, g: 12, b: 16 };
const QUALITY = 82;          // WebP: visually indistinguishable on UI screenshots, ~1/3 the bytes

const kb = n => `${(n / 1024).toFixed(0)} KB`;

const files = (await readdir(SRC))
  .filter(f => /\.(png|jpe?g)$/i.test(f))
  .sort();                                   // chronological, because his names are timestamps

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
  const w = Math.min(meta.width, MAX_W);
  const h = Math.round(w / RATIO);

  const name = `slide-${String(i + 1).padStart(2, '0')}.webp`;
  const outPath = path.join(OUT, name);

  await img
    .resize({ width: w, height: h, fit: 'contain', background: PAD, withoutEnlargement: true })
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
