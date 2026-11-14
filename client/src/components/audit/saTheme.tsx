/**
 * saTheme — the audit page's palette (T), its two faces (FONT = Playfair, MONO = bold Times New Roman)
 * and its small text helpers (L caption, V figure, Sub note, Badge).
 *
 * MOVED HERE UNCHANGED from StrategyAudit.tsx on 2026-11-15, so the page header could live in its
 * own file (audit/AuditHeader) without the two files importing each other. Every comment below is
 * the original's; the reasons for each colour and face are recorded there.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Design tokens
// ─────────────────────────────────────────────────────────────────────────────

export const T = {
  bg:    'var(--sa-bg,    #080a0e)',
  bg2:   'var(--sa-bg2,   #0d1117)',
  bg3:   'var(--sa-bg3,   #0d1117)',
  bg4:   'var(--sa-bg4,   #11161e)',
  line:  'var(--sa-line,  rgba(255,255,255,0.04))',
  line2: 'var(--sa-line2, rgba(255,255,255,0.08))',
  // TEXT — fixed 2026-08-08, user: "fix the blurred display of text in white font in audit page".
  //
  // It was PURE #ffffff on a #0d1117 card. That measures 18.92:1, so it never failed a contrast
  // check — but pure white on a near-black ground blooms: the eye sees a halo around each stroke
  // and the word reads as soft or smeared. It is worst on OLED and high-contrast displays, and it
  // is why almost no dark UI uses #fff for body text. Dropping to an off-white removes the glow and
  // still measures 16.29:1. #ECEEF2 is the same white the copier UI and the metrics panel use, so
  // the three dark surfaces now agree.
  // THE METRICS TWO-STEP SCALE, adopted 2026-09-05 on his "borrow the approach used in the metrics
  // page". That panel runs exactly two text colours and no more:
  //
  //   #ECEEF2  16.29:1  everything you actually READ — values, row labels, prose
  //   #A8AEB8   8.77:1  the small uppercase captions, which sit BEHIND the content
  //
  // The change here is small because `text` was already #ECEEF2: `muted` moves UP to join it
  // (metrics sets its own `muted` to the bright value deliberately — it is content, not chrome),
  // and `dim` moves UP from 6.48:1 to the metrics caption grey. Three tiers become two.
  text:  'var(--sa-text,  #ECEEF2)',   // 16.29:1, no halation
  muted: 'var(--sa-mut,   #ECEEF2)',   // was #94a3b8 (7.38:1) — content, so it joins `text`
  // dim was #475569 — 2.5:1 on the card, far below the 4.5 minimum, and it is used as a TEXT colour
  // in 47 places. That one was a genuine defect, not a perception effect. Now the caption step.
  dim:   'var(--sa-dim,   #A8AEB8)',   //  8.77:1, the metrics caption grey
  green:  "#10b981",
  green2: "#059669",
  red:    "#f43f5e",
  red2:   "#e11d48",
  amber:  "#f59e0b",
  blue:   'var(--sa-blue, #6366f1)',
  blue2:  "#4f46e5",
};

// THE PAGE OWNS ITS TYPOGRAPHY — and until 2026-09-05 it did not. `.audit-root` was missing from
// Journal's exemption list (Journal.tsx), so its global `font-family: <journal font> !important`
// rule overrode every choice below and the whole page rendered in Playfair Display. His words:
// "its font types are horrible". Adding `.audit-root` to that list is what makes these real.
//
// HIS SPLIT, 2026-09-05: "you can use playfair for headers and montserat and inter for non header
// text." PLAYFAIR IS FOR HEADERS ONLY — it is a high-contrast display serif whose thin strokes
// disappear at the 9-11px uppercase labels this page is full of. That is cause #1 in
// docs/READABILITY.md and the exact mistake made on the drawdown panel a day earlier. Anything
// small and read stays Montserrat or Inter.
// PLAYFAIR IS THE PAGE'S TEXT FACE — his call, 2026-09-05: "even in the audit page i loved
// playfair but use a variant that is visible".
//
// "A VARIANT THAT IS VISIBLE" IS THE WEIGHT AXIS. Playfair Display is a high-contrast display
// serif: its thin strokes are what disappear at small sizes, and the fix is not a different family
// but a heavier cut of the same one. The bundled face is VARIABLE, so 500-700 costs no extra
// download and thickens exactly those hairlines. Nothing on this page is set lighter than 500 any
// more, and the sizes went up with it — weight alone does not rescue 9px text.
export const PLAYFAIR = "'Playfair Display Variable', 'Playfair Display', Georgia, serif";
export const FONT  = PLAYFAIR;   // every piece of text on the page
// FIGURES IN BOLD TIMES NEW ROMAN (2026-09-14) — they were DM Mono; his words: "replace DM mono with
// bold times new roman". The same text serif the admin panel reads in (AdminPanel.tsx ADMIN_BODY_TEXT).
export const MONO  = "'Times New Roman', Georgia, 'Liberation Serif', serif";   // every figure — reinforced below
// TWO HELPERS, AND THE NAMES NOW TELL THE TRUTH.
//
// There used to be `mono` and `num`, both DM Mono, and `mono` was spread onto FIFTY elements — of
// which only about nine were figures. The rest were words: "BASE RATE", "Avg Length", "Worst DD",
// "ADVERSE FILL RATIO", "Last 50", the verdict sentences. That is the second font he could see in
// the text (2026-09-05: "there is another font being used there in text i need you to use playfair
// there"). A helper called `mono` that is mostly setting prose is the same trap docs/READABILITY.md
// records about a constant named `sans` that held a serif — so it is renamed, not just repointed.
// NO COLOUR IN EITHER HELPER. 39 of the 42 call sites set their own, and putting one here silently
// overrode the three that spread the helper AFTER their colour — two of them buttons that are meant
// to be bright. tsc caught it; it would have been invisible otherwise.
export const lbl = { fontFamily: FONT, fontWeight: 600 as const };   // words: labels, captions
export const num = { fontFamily: MONO, fontWeight: 700 as const };   // figures only — bold, his instruction

// ─────────────────────────────────────────────────────────────────────────────
// Primitive helpers
// ─────────────────────────────────────────────────────────────────────────────

export function Badge({ children, color = T.muted, border = T.line2 }: { children: React.ReactNode; color?: string; border?: string }) {
  return (
    <span style={{ ...lbl, fontSize: 12.5, letterSpacing: ".12em", textTransform: "uppercase", padding: "3px 8px", border: `1px solid ${border}`, color, display: "inline-block" }}>
      {children}
    </span>
  );
}

export function L({ children, style = {} }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return <span style={{ fontFamily: FONT, fontSize: 12.5, letterSpacing: ".12em", textTransform: "uppercase", color: T.dim, fontWeight: 500, ...style }}>{children}</span>;
}

export function V({ children, color = T.text, style = {} }: { children: React.ReactNode; color?: string; style?: React.CSSProperties }) {
  return <span style={{ fontFamily: MONO, fontSize: 13, fontWeight: 700, color, ...style }}>{children}</span>;
}

export function Sub({ children, color = T.dim, style = {} }: { children: React.ReactNode; color?: string; style?: React.CSSProperties }) {
  return <span style={{ fontFamily: FONT, fontSize: 12.5, color, fontWeight: 500, ...style }}>{children}</span>;
}
