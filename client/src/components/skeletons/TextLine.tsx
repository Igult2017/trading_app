/**
 * ONE LINE OF TEXT, AS A PLACEHOLDER — shared by the per-page loading screens.
 *
 * A slot as tall as a line of `px`-sized text really is (px x lh), holding a bar about cap height
 * (px x 0.72). Sizing the SLOT and not only the bar is what keeps each placeholder the same height as
 * the words that replace it, so the page does not jump when its data arrives.
 *
 * `color` overrides the bar's ink for the one panel whose palette ignores the journal theme.
 *
 * `minWidth: 0` LETS A LINE GIVE WAY. Real words wrap when a row runs out of room; a fixed-width bar
 * does not, and at phone width the drawdown section headings pushed their sub-title 25px past the
 * screen edge. The slot may now shrink (and its bar with it) — only when the row is actually too
 * narrow, so every placeholder that fits is drawn exactly as before.
 */
import { Skeleton } from "./DashboardSkeletons";

export const TextLine = ({ w, px = 12.5, lh = 1.35, color }:
    { w: number | string; px?: number; lh?: number; color?: string }) => (
  <div style={{ height: Math.round(px * lh), minWidth: 0, display: "flex", alignItems: "center" }}>
    <Skeleton className="rounded-sm"
      style={{ width: w, maxWidth: "100%", height: Math.max(4, Math.round(px * 0.72)), ...(color ? { color } : {}) }} />
  </div>
);
