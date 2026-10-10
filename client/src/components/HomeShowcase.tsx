import { useState, useEffect, useCallback } from 'react';
import { ArrowLeft, ArrowRight, Pause, Play } from 'lucide-react';
import { Carousel, CarouselContent, CarouselItem, type CarouselApi } from '@/components/ui/carousel';
import { sans, homeTokens, page, TYPE } from '@/components/homeTokens';

/**
 * HomeShowcase — the product slideshow, directly under the hero. Built 2026-10-07.
 *
 * HIS ASK: *"we need the top text then the slideshow below it"*, from the reference layout he sent.
 * This is also where the 13 showcase screens finally get used; he rejected them as HERO WALLPAPER on
 * 2026-10-06 (*"i dont like it"*) but kept them — *"we gona use them"* — and this is the placement he
 * then picked himself: a framed panel BELOW the headline, not behind it.
 *
 * THE "3D" FRAME IS CSS, NOT BAKED INTO THE FILES — a ring, a glow and a large soft shadow. Baked in
 * it would make every image heavier, lock the shadow to one background colour, and go soft when the
 * browser scales. In CSS it costs nothing, stays sharp, and follows the light/dark toggle.
 *
 * ⚠ ONLY ONE IMAGE IS FETCHED ON FIRST PAINT, and `loading="lazy"` IS NOT WHAT DOES IT. That was
 * tried on 2026-10-06 and measured: all 13 were fetched anyway (337 KB, not 26 KB), because every
 * slide is inside the carousel's track and therefore already "in the viewport" as far as the browser
 * is concerned. The only thing that actually works is WITHHOLDING `src` until a slide is reached —
 * which is what `loaded` below does. Do not "simplify" this back to a lazy attribute.
 *
 * ⚠ THE BOX IS A FIXED 2.6:1 and the images are built to exactly that shape by
 * `scripts/build-showcase.mjs`. That is what stops the page jumping as slides advance or load.
 */

/** The 13 screens, in build order, each labelled with the page it actually shows — read off the
 *  images, not guessed. Adding a screen means re-running the build script AND adding a line here. */
const SLIDES = [
  { src: '/showcase/slide-01.webp', label: 'Dashboard' },
  { src: '/showcase/slide-02.webp', label: 'Sessions' },
  { src: '/showcase/slide-03.webp', label: 'Accounts' },
  { src: '/showcase/slide-04.webp', label: 'Journal' },
  { src: '/showcase/slide-05.webp', label: 'Trade Vault' },
  { src: '/showcase/slide-06.webp', label: 'Calendar' },
  { src: '/showcase/slide-07.webp', label: 'Drawdown' },
  { src: '/showcase/slide-08.webp', label: 'Metrics' },
  { src: '/showcase/slide-09.webp', label: 'Performance summary' },
  { src: '/showcase/slide-10.webp', label: 'Strategy audit' },
  { src: '/showcase/slide-11.webp', label: 'Trader AI' },
  { src: '/showcase/slide-12.webp', label: 'FX Copier' },
  { src: '/showcase/slide-13.webp', label: 'Leaderboard' },
];

const ADVANCE_MS = 5000;

export default function HomeShowcase({ darkMode }: { darkMode: boolean }) {
  const t = homeTokens(darkMode);
  const [api, setApi] = useState<CarouselApi>();
  const [current, setCurrent] = useState(0);
  const [playing, setPlaying] = useState(true);
  // Slide 1 only, until the viewer gets further. See the warning above.
  const [loaded, setLoaded] = useState<Set<number>>(() => new Set([0]));

  // Follow the carousel's own idea of which slide is showing — it also moves on drag and keyboard,
  // so tracking our own counter instead would drift out of step with what is on screen.
  useEffect(() => {
    if (!api) return;
    const onSelect = () => setCurrent(api.selectedScrollSnap());
    onSelect();
    api.on('select', onSelect);
    return () => { api.off('select', onSelect); };
  }, [api]);

  // Load the slide being shown plus the next one, so advancing never shows an empty frame.
  useEffect(() => {
    setLoaded(prev => {
      const next = new Set(prev);
      next.add(current);
      next.add((current + 1) % SLIDES.length);
      return next;
    });
  }, [current]);

  // Auto-advance. Switched off entirely for anyone who asked their system to reduce motion — for
  // them the arrows are the only way it moves, which is the point.
  useEffect(() => {
    if (!api || !playing) return;
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
    const id = setInterval(() => api.scrollNext(), ADVANCE_MS);
    return () => clearInterval(id);
  }, [api, playing]);

  const go = useCallback((dir: -1 | 1) => {
    if (!api) return;
    dir === 1 ? api.scrollNext() : api.scrollPrev();
  }, [api]);

  const chip = {
    ...sans, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
    background: 'rgba(8,13,23,0.74)', border: '1px solid rgba(148,163,184,0.26)', color: '#e8eefc',
    backdropFilter: 'blur(6px)', borderRadius: 999, cursor: 'pointer',
  } as const;

  return (
    <section style={{ background: t.heroBg, transition: 'background 0.4s ease' }}>
      {/* Pulled UP into the hero's bottom padding, so the panel tucks under the headline block
          instead of reading as a separate band — the reference's defining move. */}
      <div style={{ ...page(), marginTop: -110 }}>

        <div style={{
          position: 'relative', padding: 8, borderRadius: 22,
          background: darkMode ? 'rgba(59,130,246,0.14)' : 'rgba(37,99,235,0.10)',
          border: `1px solid ${t.accentSoft}`,
          boxShadow: darkMode
            ? '0 24px 70px rgba(0,0,0,0.6), 0 0 0 1px rgba(59,130,246,0.18)'
            : '0 24px 70px rgba(15,23,42,0.18), 0 2px 10px rgba(15,23,42,0.06)',
        }}>
          {/* ⚠ THE BOX GETS TALLER ON SMALL SCREENS, AND THAT IS NOT A STYLE CHOICE — IT IS
              LEGIBILITY. The images are 2.6:1. Held at 2.6:1 on a 400px phone the panel is 138px
              tall and a whole dashboard is squeezed into it: measured, and unreadable. Taller boxes
              on phone and tablet crop the image instead (object-fit: cover, anchored LEFT TOP), so a
              reader sees the sidebar and the top-left panels at a size they can actually read.
              The height still never changes BETWEEN SLIDES, which is what stops the page jumping —
              it changes only between breakpoints, which no one is looking at. */}
          {/* ⚠ `.hs-car>div` IS LOAD-BEARING, NOT A TIDY-UP. shadcn's CarouselContent renders an
              `overflow-hidden` wrapper of its own that takes NO height class, and `className` on
              CarouselContent lands on the flex track INSIDE it. So the chain frame -> wrapper ->
              track -> img broke at the wrapper: the image's `height:100%` resolved against an auto
              height and the picture sat letterboxed at the top of the frame with dead space under
              it. It only looked right at 2.6:1 because that happens to be the images' own shape.
              This gives the wrapper the height the rest of the chain needs. */}
          <style>{`.hs-frame{aspect-ratio:1.45/1}@media(min-width:640px){.hs-frame{aspect-ratio:2/1}}@media(min-width:1024px){.hs-frame{aspect-ratio:2.6/1}}.hs-car,.hs-car>div{height:100%}`}</style>
          <div className="hs-frame" style={{
            position: 'relative', borderRadius: 15, overflow: 'hidden', background: '#080c14',
            border: `1.5px solid ${t.accent}`,
          }}>
            <Carousel setApi={setApi} opts={{ loop: true, align: 'start' }} className="hs-car"
                      aria-label="Screens from the app">
              {/* -ml-4/pl-4 are the shadcn gutter; zeroed because this is one full-bleed panel. */}
              <CarouselContent className="ml-0 h-full">
                {SLIDES.map((s, i) => (
                  <CarouselItem key={s.src} className="pl-0 h-full">
                    <img
                      src={loaded.has(i) ? s.src : undefined}
                      alt={`${s.label} screen`}
                      width={2560} height={985}
                      fetchPriority={i === 0 ? 'high' : 'low'}
                      decoding="async"
                      style={{ display: 'block', width: '100%', height: '100%', objectFit: 'cover',
                               objectPosition: 'left top' }}
                    />
                  </CarouselItem>
                ))}
              </CarouselContent>
            </Carousel>

            {/* ⚠ THE LABEL SITS WITH THE CONTROLS, NOT IN THE TOP-LEFT CORNER. It was top-left first
                and landed exactly on the app's own sidebar — a pill reading "Dashboard" on top of a
                highlighted "Dashboard" menu item, which read as a rendering fault. Down here it is
                over the chart area, which is the quietest part of every screen in the set.

                The reference labels nothing at all; with 13 screens a label is what makes the set
                readable rather than a blur of dashboards going past. */}
            <div style={{ position: 'absolute', bottom: 14, left: 14, display: 'flex', gap: 8, alignItems: 'center' }}>
              <button type="button" onClick={() => go(-1)} aria-label="Previous screen"
                      style={{ ...chip, width: 32, height: 32, padding: 0 }}>
                <ArrowLeft size={15} aria-hidden />
              </button>
              <button type="button" onClick={() => go(1)} aria-label="Next screen"
                      style={{ ...chip, width: 32, height: 32, padding: 0 }}>
                <ArrowRight size={15} aria-hidden />
              </button>
              <span style={{ ...chip, padding: '7px 13px', fontSize: TYPE.small, fontWeight: 600,
                             cursor: 'default', fontVariantNumeric: 'tabular-nums' }}>
                {SLIDES[current].label}
                <span style={{ opacity: 0.6 }}>&nbsp;&middot;&nbsp;{current + 1}/{SLIDES.length}</span>
              </span>
            </div>

            <button type="button" onClick={() => setPlaying(p => !p)}
                    aria-label={playing ? 'Pause the slideshow' : 'Play the slideshow'}
                    style={{ ...chip, position: 'absolute', bottom: 14, right: 14, padding: '7px 14px',
                             fontSize: TYPE.small, fontWeight: 600 }}>
              {playing ? <Pause size={13} aria-hidden /> : <Play size={13} aria-hidden />}
              {playing ? 'Pause' : 'Play'}
            </button>
          </div>
        </div>

        {/* Caption row. The reference puts a Trustpilot score on the right; we have no Trustpilot
            profile, so it is a link to the thing that IS true — the screens are free to try. */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center',
                      justifyContent: 'space-between', padding: '20px 2px 0' }}>
          <p style={{ ...sans, fontSize: TYPE.body, color: t.muted, margin: 0 }}>
            A closer look at your trading workspace.
          </p>
          <a href="/#pricing" style={{ ...sans, fontSize: TYPE.body, fontWeight: 600, color: t.accent, textDecoration: 'none' }}>
            Every screen, free to try &rarr;
          </a>
        </div>
      </div>
    </section>
  );
}
