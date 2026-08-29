import { useState } from 'react';
import { Tag, Clock, Leaf } from 'lucide-react';
import { tone, SERIF, SANS } from './blogTheme';

export type Article = {
  id: string | number;
  title: string;
  excerpt: string;
  category: string;
  author: string;
  date: string;
  readTime: string;
  imageUrl: string;
};

/**
 * One article card, copied from the reference he sent on 2026-08-29: picture on top, then the
 * category, the headline, two lines of the opening, and a quiet footer with who wrote it, when, and
 * how long it takes to read.
 *
 * EVERY CARD IS THE SAME SIZE, which is the whole point. The page used to give the newest article a
 * huge slot, the next three a sidebar and the rest a plain list — three different shapes competing
 * for attention on one screen. He called the reference "less chaotic"; uniformity is what makes it so.
 *
 * The picture keeps a fixed 16:9 box whether or not an image loads, so a card with no picture does
 * not sit shorter than its neighbours and break the row.
 */
export function ArticleCard({ a, dark, onOpen }: {
  a: Article; dark: boolean; onOpen: () => void;
}) {
  const t = tone(dark);
  const [broken, setBroken] = useState(false);
  const hasImage = !!a.imageUrl?.trim() && !broken;

  return (
    <article
      onClick={onOpen}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen(); } }}
      tabIndex={0}
      role="link"
      aria-label={a.title}
      className="group cursor-pointer overflow-hidden rounded-2xl transition-all duration-200
                 hover:-translate-y-0.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
      style={{
        background: t.card,
        border: `1px solid ${t.cardBorder}`,
        boxShadow: t.cardShadow,
        // @ts-expect-error — CSS custom property for the focus ring colour
        '--tw-ring-color': t.accent,
      }}
    >
      {/* Picture. A fixed 16:9 box keeps every card the same height. */}
      <div className="relative w-full overflow-hidden" style={{ aspectRatio: '16 / 9', background: t.placeholder }}>
        {hasImage ? (
          <img
            src={a.imageUrl}
            alt=""                            /* decorative — the headline below carries the meaning */
            loading="lazy"
            onError={() => setBroken(true)}
            className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.03]"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            <Leaf size={30} style={{ color: t.tagInk, opacity: 0.55 }} aria-hidden="true" />
          </div>
        )}
      </div>

      <div className="px-5 pb-5 pt-4">
        <span
          className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium"
          style={{ background: t.tagBg, color: t.tagInk, fontFamily: SANS }}
        >
          <Tag size={11} aria-hidden="true" />
          {a.category}
        </span>

        <h2
          className="mt-3 text-[19px] font-bold leading-snug"
          style={{
            fontFamily: SERIF, color: t.title,
            display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden',
          }}
        >
          {a.title}
        </h2>

        {a.excerpt && (
          <p
            className="mt-2 text-[13.5px] leading-relaxed"
            style={{
              fontFamily: SANS, color: t.body,
              display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden',
            }}
          >
            {a.excerpt}
          </p>
        )}

        <div
          className="mt-4 flex items-center justify-between gap-3 border-t pt-3 text-[12px]"
          style={{ borderColor: t.cardBorder, color: t.meta, fontFamily: SANS }}
        >
          <span className="min-w-0 truncate">
            {a.author}{a.date ? ` · ${a.date}` : ''}
          </span>
          {a.readTime && (
            <span className="flex shrink-0 items-center gap-1.5">
              <Clock size={11} aria-hidden="true" />
              {a.readTime}
            </span>
          )}
        </div>
      </div>
    </article>
  );
}
