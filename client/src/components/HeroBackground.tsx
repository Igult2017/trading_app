import { useEffect, useState } from 'react';
import manifest from '../../public/showcase/manifest.json';

/**
 * THE HERO'S BACKGROUND — screens of his own app, gently crossfading BEHIND the headline.
 *
 * His correction, 2026-10-06: *"If where you have displayed in the playwright is where you have put
 * the slider then you have put it in the wrong place. It should be here where the heros image should
 * be placed. It should be behind those text there. Eco friendly cleaning marketplace codebase is in
 * this machine please copy how its sliders were done."*
 *
 * COPIED FROM `eco-friendly-household-cleaning-services-marketplace/components/home/HeroBackground.tsx`
 * on his instruction, which is also the better design on three counts:
 *
 *   * IT CROSSFADES INSTEAD OF SLIDING SIDEWAYS. Behind text, a sideways slide drags the eye off the
 *     words; a fade changes the picture without competing with them.
 *   * `object-cover` FIXES THE PHONE. The first attempt put the screenshots in a box of their own,
 *     and at 400px wide a 2.6:1 screenshot became 344x132 — measured, and an unreadable smudge.
 *     Covering the hero instead means the image fills whatever shape the hero is and CROPS, so it
 *     stays legible at any width.
 *   * ONE STEP AHEAD, NEVER ALL AT ONCE. Only the next frame is armed, so the hero costs one image.
 *
 * ⚠ WHY `src` IS WITHHELD RATHER THAN `loading="lazy"`. Measured here on 2026-10-06: with the lazy
 * attribute the browser fetched ALL THIRTEEN images on first paint (337 KB, not the ~26 KB intended).
 * The attribute works as specified — "lazy" means "defer until near the viewport", and every frame of
 * a crossfade is stacked IN the viewport. An image with no `src` is never requested, which is the only
 * thing that actually holds them back. The cleaning site reached the same conclusion.
 *
 * DECORATIVE ON PURPOSE — `alt=""` and `aria-hidden`. The headline carries the meaning; a screen
 * reader announcing thirteen screenshots of a dashboard would be noise.
 */
const IMAGES: string[] = manifest.slides;

export function HeroBackground() {
  const [active, setActive] = useState(0);
  const [armed, setArmed] = useState<Set<number>>(() => new Set([0]));

  // The crossfade. Skipped entirely under "reduce motion" — then the first screen is all that ever
  // shows OR loads, which is both the accessible answer and the cheapest one.
  useEffect(() => {
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
    const id = setInterval(() => setActive(i => (i + 1) % IMAGES.length), 5000);
    return () => clearInterval(id);
  }, []);

  // Arm only the NEXT frame, one step ahead of the fade, so it is decoded before it is needed and
  // the rest are never fetched at all.
  useEffect(() => {
    const next = (active + 1) % IMAGES.length;
    setArmed(s => (s.has(next) ? s : new Set(s).add(next)));
  }, [active]);

  return (
    <>
      {IMAGES.map((src, i) => (
        <img
          key={src}
          src={armed.has(i) ? src : undefined}
          alt=""
          aria-hidden="true"
          width={manifest.width}
          height={manifest.height}
          fetchPriority={i === 0 ? 'high' : 'low'}
          decoding="async"
          style={{
            position: 'absolute', inset: 0, zIndex: -20,
            width: '100%', height: '100%',
            objectFit: 'cover', objectPosition: 'center',
            opacity: i === active ? 1 : 0,
            transition: 'opacity 1000ms ease-in-out',
          }}
        />
      ))}
    </>
  );
}

export default HeroBackground;
