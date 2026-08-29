import { Archive } from 'lucide-react';
import { tone, SERIF, SANS } from './blogTheme';

/**
 * What the blog shows when there are no articles TO show — still loading, failed to load, nothing
 * published yet, or nothing in the chosen category.
 *
 * Split out of BlogPage 2026-08-29 because the page was 236 lines against a 200-line limit, and
 * "what to display when there is no content" is a different job from "display the content". Each of
 * these four states is a real one the page can reach, not defensive padding.
 */

export function BlogSkeleton({ dark }: { dark: boolean }) {
  const t = tone(dark);
  return (
    <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
      {[0, 1, 2, 3, 4, 5].map(i => (
        <div
          key={i}
          className="overflow-hidden rounded-2xl"
          style={{
            background: t.card, border: `1px solid ${t.cardBorder}`,
            animation: `blog-pulse 1.5s ${i * 0.08}s ease-in-out infinite`,
          }}
        >
          <div style={{ aspectRatio: '16 / 9', background: t.placeholder }} />
          <div className="space-y-3 p-5">
            <div className="h-4 w-24 rounded-full" style={{ background: t.tagBg }} />
            <div className="h-4 w-full rounded"    style={{ background: t.tagBg }} />
            <div className="h-4 w-2/3 rounded"     style={{ background: t.tagBg }} />
          </div>
        </div>
      ))}
    </div>
  );
}

/** A calm panel with a heading, a line of explanation, and an optional way out. Never a bare blank
 *  area — an empty screen with no words on it reads as broken. */
export function BlogNotice({ dark, head, sub, actionLabel, onAction }: {
  dark: boolean; head: string; sub: string; actionLabel?: string; onAction?: () => void;
}) {
  const t = tone(dark);
  return (
    <div className="rounded-2xl py-20 text-center"
         style={{ background: t.card, border: `1px solid ${t.cardBorder}` }}>
      <Archive size={26} className="mx-auto mb-4" style={{ color: t.meta }} aria-hidden="true" />
      <div className="text-[15px] font-bold" style={{ fontFamily: SERIF, color: t.title }}>{head}</div>
      <div className="mt-1.5 text-[13px]" style={{ fontFamily: SANS, color: t.body }}>{sub}</div>
      {actionLabel && onAction && (
        <button
          onClick={onAction}
          className="mt-5 rounded-full px-5 py-2 text-[13px] font-semibold text-white"
          style={{ background: t.accent, fontFamily: SANS }}
        >
          {actionLabel}
        </button>
      )}
    </div>
  );
}
