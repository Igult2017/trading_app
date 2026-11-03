/**
 * ddTokens.ts — the palette for the Drawdown panel's new design (2026-11-03).
 *
 * WHERE THESE VALUES COME FROM: his own HTML mock-up, verbatim. The names are his too
 * (`--slate-400`, `--amber-500`), and keeping them means every rule in `ddStyles.ts` reads exactly as
 * it did in the design he handed over — so "recreate, do not redesign" is checkable line by line
 * rather than taken on trust.
 *
 * ⚠ THIS PANEL NOW HAS ITS OWN PALETTE, AND THAT IS A DELIBERATE DEPARTURE. His 2026-09-27
 * instruction was *"copy the design and colors used in metrics page to be copied and use in the
 * drawdown page"*, which `dpTokens.ts` did by pointing every drawdown token at the SHARED
 * `components/shared/mpTokens.ts`. That file **also feeds the Metrics page**, so re-pointing it at
 * this design would have silently restyled Metrics as well. The new design is self-contained
 * instead, and `mpTokens.ts` is untouched.
 *
 * ⚠ AND IT HAS A LIGHT THEME, WHICH THE MOCK-UP DOES NOT. The journal has a working light mode, and
 * the design he sent is dark-only — a straight port would have left the panel unreadable there. The
 * light block below overrides THE SAME NAMES with light-appropriate values, so his CSS works in both
 * themes with no duplicate rules. A name like `--slate-400` therefore means "muted text", not a
 * literal slate; that is the trap `docs/READABILITY.md` records, so read what a token HOLDS rather
 * than what it is called.
 */

/**
 * NAMES THE REUSED `monthDays.tsx` STILL ASKS FOR, pointed at the new palette.
 *
 * ⚠ THIS BLOCK IS WHY THAT COMPONENT NEEDED NO EDIT. `MONTH_DAYS_CSS` is the day-by-day month
 * expander he asked for on 2026-10-25, and it reads nine tokens under the OLD names
 * (`--gain`, `--loss-d`, `--ink3`...). Aliasing them here keeps a working, tested component
 * untouched; renaming them inside it would have been churn in a file this change has no other
 * reason to open. `--ink` and `--line` already carry the right meaning, so they are not repeated.
 */
const ALIASES = `
  --ink3:var(--ink-faint);
  --gain:var(--emerald); --gain-d:var(--t-emerald-10);
  --loss:var(--rose);    --loss-d:var(--t-rose-10);
  --warn:var(--amber);   --warn-d:var(--t-amber-10);
`;

/** His mock-up's values, unchanged. */
export const DD_TOKENS_DARK = `
  --bg:#0A0D14;
  --surface-deep:#020617;
  --surface:#0f172a;
  --line:#1e293b;
  --line-strong:#334155;
  /* ⚠ LIFTED FROM HIS #64748b, AND THIS IS THE ONE COLOUR IN THE DARK THEME THAT IS NOT HIS.
     MEASURED: #64748b reads 3.58:1 on the card surface — below the 4.5:1 minimum — and this token
     is used at 10-11px for the bar scale, the chart axis labels and the "Worst Pair" captions, which
     is exactly the small text the floor exists for. #7987a3 is the smallest step that clears it on
     all three dark surfaces (card 4.71:1, page 5.37:1, deep 5.58:1) while still reading as the
     faintest ink on the page.
     This is docs/READABILITY.md's standing rule, not a taste call: 4.5:1 is a FLOOR and a palette
     change must never lower a tier. The old drawdown page shipped this same mistake once — its own
     notes record a token at 2.56:1. */
  --ink-faint:#7987a3;
  --ink-dim:#94a3b8;
  --ink-soft:#cbd5e1;
  --ink:#e2e8f0;
  --ink-strong:#ffffff;
  --amber-soft:#fcd34d;
  --amber:#fbbf24;
  --amber-mid:#f59e0b;
  --amber-deep:#d97706;
  --emerald:#34d399;
  --emerald-mid:#10b981;
  --rose:#fb7185;
  --rose-mid:#f43f5e;
  --blue:#60a5fa;
  --blue-mid:#3b82f6;
  /* Tints, pre-mixed because the design uses them in a dozen places and a light theme needs its own.
     Written out rather than computed so the file stays greppable against the mock-up. */
  --t-amber-10:rgba(245,158,11,0.10);
  --t-amber-20:rgba(245,158,11,0.20);
  --t-amber-30:rgba(245,158,11,0.30);
  --t-emerald-10:rgba(16,185,129,0.10);
  --t-emerald-20:rgba(16,185,129,0.20);
  --t-emerald-30:rgba(16,185,129,0.30);
  --t-rose-10:rgba(244,63,94,0.10);
  --t-rose-20:rgba(244,63,94,0.20);
  --t-rose-40:rgba(244,63,94,0.40);
  --t-blue-10:rgba(59,130,246,0.10);
  --t-blue-20:rgba(59,130,246,0.20);
  --t-card:rgba(15,23,42,0.60);
  --t-card-hi:rgba(15,23,42,0.80);
  --t-inner:rgba(2,6,23,0.60);
  --t-line:rgba(30,41,59,0.90);
  --t-line-soft:rgba(30,41,59,0.60);
  --warn-grad:linear-gradient(to right,rgba(76,5,25,0.40),rgba(69,26,3,0.20),#0f172a);
  --insight-ink:#bfdbfe;
  /* The loss-share bar segments and the text sitting ON them. Separate from the text tokens above
     because a colour that reads well AS text on a card is not the same as one that works as a FILL
     with a label on top — see the note in ddStyles2. */
  --bar-1:#f43f5e; --bar-2:#fb7185; --bar-3:#f59e0b; --bar-4:#fbbf24; --bar-5:#60a5fa;
  --bar-ink:#020617;
  ${ALIASES}
`;

/**
 * The light-theme remap — same names, values chosen for a light surface.
 *
 * ⚠ ACCENTS ARE DARKENED, NOT REUSED. `#fbbf24` amber on white is roughly 1.8:1 — invisible. Each
 * accent moves to its 600/700 step so small text keeps a real contrast ratio instead of merely
 * existing. `docs/READABILITY.md`: 4.5:1 is a FLOOR, not a target, and a palette swap must never
 * lower a tier.
 */
export const DD_TOKENS_LIGHT = `
  --bg:#f8fafc;
  --surface-deep:#ffffff;
  --surface:#ffffff;
  --line:#e2e8f0;
  --line-strong:#cbd5e1;
  --ink-faint:#64748b;
  --ink-dim:#475569;
  --ink-soft:#334155;
  --ink:#1e293b;
  --ink-strong:#0f172a;
  --amber-soft:#92400e;
  --amber:#b45309;
  --amber-mid:#d97706;
  --amber-deep:#92400e;
  --emerald:#047857;
  --emerald-mid:#059669;
  --rose:#be123c;
  --rose-mid:#e11d48;
  --blue:#1d4ed8;
  --blue-mid:#2563eb;
  --t-amber-10:rgba(180,83,9,0.08);
  --t-amber-20:rgba(180,83,9,0.16);
  --t-amber-30:rgba(180,83,9,0.28);
  --t-emerald-10:rgba(4,120,87,0.08);
  --t-emerald-20:rgba(4,120,87,0.16);
  --t-emerald-30:rgba(4,120,87,0.28);
  --t-rose-10:rgba(190,18,60,0.08);
  --t-rose-20:rgba(190,18,60,0.16);
  --t-rose-40:rgba(190,18,60,0.32);
  --t-blue-10:rgba(29,78,216,0.08);
  --t-blue-20:rgba(29,78,216,0.18);
  --t-card:#ffffff;
  --t-card-hi:#ffffff;
  --t-inner:#f1f5f9;
  --t-line:#e2e8f0;
  --t-line-soft:#eef2f7;
  --warn-grad:linear-gradient(to right,rgba(190,18,60,0.10),rgba(180,83,9,0.06),#ffffff);
  --insight-ink:#1e3a8a;
  /* Mid-tone fills so a solid bar still reads against a WHITE card (4.70-6.70:1), with white text on
     top (the same 4.70-6.70:1). The dark theme's lighter fills with dark text would have given a
     bar you could barely see and a label at 4.29:1. */
  --bar-1:#e11d48; --bar-2:#be123c; --bar-3:#b45309; --bar-4:#1d4ed8; --bar-5:#047857;
  --bar-ink:#ffffff;
  ${ALIASES}
`;
