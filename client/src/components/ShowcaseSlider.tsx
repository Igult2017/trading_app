import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Carousel, CarouselContent, CarouselItem, CarouselNext, CarouselPrevious, type CarouselApi,
} from '@/components/ui/carousel';
import manifest from '../../public/showcase/manifest.json';

/**
 * THE LANDING PAGE'S PRODUCT SLIDESHOW — his own app, one screen at a time.
 *
 * His ask, 2026-10-06: *"Use these images and do plumbing for them so that they are not heavy and
 * they dont take alot of time to load... enhance their quality to look 3D and clear... let them
 * slide show one at a time."*
 *
 * ⚠ WHAT MAKES THIS FAST IS NOT THE FILE SIZE — IT IS THAT ONE IMAGE LOADS.
 * The build script already cut the set from 1,033 KB of PNG to 337 KB of WebP, but 337 KB on a
 * landing page would still be slow. So only the FIRST slide is fetched when the page opens (eager,
 * high priority); the other twelve are `loading="lazy"` and the browser never asks for them unless
 * he advances. The page pays ~26 KB, not 337.
 *
 * EVERY IMAGE CARRIES ITS WIDTH AND HEIGHT so the browser reserves the right box before the bytes
 * arrive. Without that the page jumps as each slide lands, which is the thing that actually feels
 * slow even when the numbers are good.
 *
 * THE "3D" IS CSS, NOT BAKED INTO THE PIXELS — a slight tilt toward the viewer, a soft shadow and a
 * glow. Done here it costs no bytes, stays sharp at any size, and follows the light/dark toggle;
 * baked into the files it would enlarge every one of them and pin the shadow to one background.
 *
 * ONE SHAPE FOR EVERY SLIDE. The sources ran 2.35:1 to 3.02:1 and the build padded them all to
 * 2.6:1 on the app's own near-black, so the box never changes height as it advances.
 */

const SLIDES: string[] = manifest.slides;
const IMG_W = manifest.width;
const IMG_H = manifest.height;
const DWELL_MS = 5000;

export default function ShowcaseSlider({ darkMode }: { darkMode: boolean }) {
  const dm = darkMode;
  const [api, setApi] = useState<CarouselApi>();
  const [current, setCurrent] = useState(0);
  const [paused, setPaused] = useState(false);
  const timer = useRef<ReturnType<typeof setInterval>>();

  // ⚠ WHICH SLIDES MAY HAVE AN IMAGE AT ALL — and this, not `loading="lazy"`, is what keeps the page
  // light.
  //
  // MEASURED 2026-10-06, and it disproved the first build. With `loading="lazy"` on slides 2-13 the
  // browser fetched ALL THIRTEEN on first paint — 337 KB, not the 26 KB intended. The attribute is
  // working as specified; the assumption about it was wrong. "Lazy" means "defer until near the
  // viewport", and a carousel lays every slide out SIDE BY SIDE inside a container that IS in the
  // viewport, so by the browser's reckoning they are all nearly visible.
  //
  // So the `src` is withheld instead. A slide gets its image when it is reached, plus the one on
  // either side so the next move is instant. Once given, it is kept — going back must not refetch
  // and flash. `loading="lazy"` stays as a belt-and-braces second line, but the set below is the
  // thing that actually works.
  const [armed, setArmed] = useState<Set<number>>(() => new Set([0, 1, SLIDES.length - 1]));

  useEffect(() => {
    if (!api) return;
    const sync = () => {
      const i = api.selectedScrollSnap();
      setCurrent(i);
      setArmed(prev => {
        const next = new Set(prev);
        [i - 1, i, i + 1].forEach(n => next.add((n + SLIDES.length) % SLIDES.length));
        return next;
      });
    };
    sync();
    api.on('select', sync);
    return () => { api.off('select', sync); };
  }, [api]);

  // AUTO-ADVANCE WITHOUT A NEW DEPENDENCY. `embla-carousel-autoplay` is not installed and this is
  // the whole of what it would do. It stops on hover and on focus so it cannot yank a slide away
  // while he is reading it or tabbing through the arrows.
  //
  // ⚠ AND IT RESPECTS "REDUCE MOTION". A carousel that moves on its own is the textbook case that
  // setting exists for — for some people it is motion sickness, not taste. With it on, the slides
  // stay put and the arrows and dots still work, so nothing is unreachable.
  useEffect(() => {
    const still = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (!api || paused || still) return;
    timer.current = setInterval(() => api.scrollNext(), DWELL_MS);
    return () => clearInterval(timer.current);
  }, [api, paused]);

  const go = useCallback((i: number) => api?.scrollTo(i), [api]);

  const frame = dm
    ? { border: '1px solid rgba(148,163,184,0.16)',
        shadow: '0 28px 70px -20px rgba(0,0,0,0.85), 0 0 0 1px rgba(255,255,255,0.03), 0 0 90px -40px rgba(37,99,235,0.55)' }
    : { border: '1px solid rgba(15,23,42,0.07)',
        shadow: '0 28px 64px -22px rgba(15,23,42,0.30), 0 2px 10px rgba(15,23,42,0.05), 0 0 90px -46px rgba(37,99,235,0.40)' };

  return (
    <div
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocusCapture={() => setPaused(true)}
      onBlurCapture={() => setPaused(false)}
    >
      {/* `perspective` on the parent is what makes the tilt read as depth rather than as a squash. */}
      <div style={{ perspective: 1600 }}>
        <Carousel
          opts={{ loop: true, align: 'center' }}
          setApi={setApi}
          className="w-full"
          aria-roledescription="carousel"
          aria-label="Screens from the app"
        >
          <CarouselContent>
            {SLIDES.map((src, i) => (
              <CarouselItem key={src}>
                <div
                  style={{
                    borderRadius: 14,
                    overflow: 'hidden',
                    border: frame.border,
                    boxShadow: frame.shadow,
                    background: '#080c10',
                    transform: 'rotateX(1.6deg)',
                    transformOrigin: 'center top',
                    transition: 'transform 0.45s ease, box-shadow 0.45s ease',
                  }}
                >
                  {/* The box is drawn from the aspect ratio whether or not the image is here yet, so
                      the page reserves exactly the right space and nothing shifts when one arrives. */}
                  <div style={{ aspectRatio: `${IMG_W} / ${IMG_H}`, width: '100%' }}>
                    {armed.has(i) && (
                      <img
                        src={src}
                        width={IMG_W}
                        height={IMG_H}
                        loading={i === 0 ? 'eager' : 'lazy'}
                        decoding={i === 0 ? 'sync' : 'async'}
                        {...(i === 0 ? { fetchPriority: 'high' as const } : {})}
                        alt={`App screen ${i + 1} of ${SLIDES.length}`}
                        style={{ display: 'block', width: '100%', height: '100%' }}
                      />
                    )}
                  </div>
                </div>
              </CarouselItem>
            ))}
          </CarouselContent>

          {/* Hidden below lg: on a phone the slide fills the width and the arrows would sit on top
              of the image. Swiping already works there — Embla handles touch — and the dots remain. */}
          <CarouselPrevious className="hidden lg:flex -left-14" />
          <CarouselNext className="hidden lg:flex -right-14" />
        </Carousel>
      </div>

      {/* Dots: position, and a way to jump. Real buttons, so they are keyboard-reachable and a
          screen reader announces which slide is current rather than reading a row of blanks. */}
      <div style={{ display: 'flex', justifyContent: 'center', gap: 8, marginTop: 22 }}>
        {SLIDES.map((_, i) => (
          <button
            key={i}
            type="button"
            onClick={() => go(i)}
            aria-label={`Go to screen ${i + 1}`}
            aria-current={i === current}
            style={{
              width: i === current ? 22 : 7, height: 7, padding: 0, borderRadius: 999, border: 'none',
              cursor: 'pointer',
              background: i === current ? '#2563eb' : (dm ? 'rgba(148,163,184,0.30)' : 'rgba(15,23,42,0.16)'),
              transition: 'width 0.3s ease, background 0.3s ease',
            }}
          />
        ))}
      </div>
    </div>
  );
}
