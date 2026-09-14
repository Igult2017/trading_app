import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { authFetch, fetchJson } from "@/lib/queryClient";
import { Search, Bell, BellOff, Share2, ChevronRight, Loader2, ZoomIn, X } from "lucide-react";
import TradingChart, { INDICATOR_DEFS, prefetchCandles, type IndicatorId, type ChartType } from "@/components/TradingChart";
import SignalPlatformStatus from "@/components/SignalPlatformStatus";
import { useFastBatchPrices, useFastPrice } from "@/hooks/useFastPrice";
import TickingPrice from "@/components/TickingPrice";
import { confirmedEntries, type SignalRow } from "./assets/confirmedEntries";

// ─── Types ────────────────────────────────────────────────────────────────────
interface Instrument {
  /** THE SIGNAL'S id, and the sidebar's identity. Rows are one-per-SIGNAL, so a symbol can appear
   *  more than once and `symbol` is no longer unique — selection, React keys and the highlight all
   *  key on this. Absent only for the pending-setup rows, which are keyed by symbol. */
  id?: string;
  symbol: string;
  assetClass: "crypto" | "forex" | "stock" | "commodity";
  category: "Crypto" | "Forex" | "Stock" | "Index" | "Commodity";
  direction?: string;      // signal side (BUY/SELL) for the sidebar
  createdAt?: string;      // signal time — sidebar is ordered latest-first
  confirmed?: boolean;     // valid signal that can be taken vs a watch/validating one
  state?: "watching" | "live" | "closed";   // lifecycle position — see signalState
  strategy?: string;       // which strategy produced it — shown on the card
}

interface ContextItem { label: string; value: string; color: string; loading?: boolean }
interface TechItem    { label: string; value: string; color: string }

// ─── Signal → display data transformer ────────────────────────────────────────

function trendColor(dir?: string | null): string {
  if (!dir) return "#4a6580";
  const d = dir.toLowerCase();
  if (d === "bullish") return "#22d3a5";
  if (d === "bearish") return "#f4617f";
  return "#f59e0b";
}

function valueColor(val?: string | null): string {
  if (!val) return "#4a6580";
  const v = val.toUpperCase();
  if (["BULLISH","CONFIRMED","HIGH","TAKEN","DISCOUNT","AVAILABLE"].some(k => v.includes(k))) return "#22d3a5";
  if (["BEARISH","REJECTED","LOW","PREMIUM"].some(k => v.includes(k))) return "#f4617f";
  if (["NEUTRAL","PENDING","MODERATE"].some(k => v.includes(k))) return "#f59e0b";
  return "#c8d8e8";
}

/** Sentence case for strategy-authored text.
 *
 * The strategies emit SHOUTED tokens ("RESPECTED SUPPLY", "PULLBACK STOP-ENTRY (2.0R)") because
 * this panel used to upper-case everything anyway. The user: *"write in no caps because it is not
 * visible."* All-caps at 9px with wide tracking is genuinely harder to read than sentence case.
 *
 * Only the first word keeps its capital. A word is left ALONE when lower-casing it would be wrong
 * rather than merely different: real acronyms (BOS, FVG, CHoCH), anything containing a digit (4H,
 * 1M, 2.0R, 1.34546), and one- or two-letter tokens. Surrounding punctuation is stripped before the
 * test and put back after, or "(FROM" would never match as a word and would stay shouting.
 */
const ACRONYMS = new Set([
  "BOS", "CHOCH", "FVG", "SMC", "POI", "HTF", "LTF", "RSI", "EMA", "ADX", "ATR",
  "SL", "TP", "RR", "UTC", "BX", "VIX", "OB", "EQH", "EQL",
]);

function sentence(raw?: string | null): string {
  if (!raw) return "";
  const words = String(raw).trim().split(/\s+/).map((w, i) => {
    const m = w.match(/^([^A-Za-z0-9]*)(.*?)([^A-Za-z0-9]*)$/);
    if (!m) return w;
    const [, pre, core, post] = m;
    if (!core || /[0-9]/.test(core) || core.length <= 2) return w;
    if (ACRONYMS.has(core.toUpperCase())) return pre + core.toUpperCase() + post;
    if (!/^[A-Z][A-Z'’\-]*$/.test(core)) return w;      // already mixed case — the author's choice
    const lower = core.toLowerCase();
    return pre + (i === 0 ? lower.charAt(0).toUpperCase() + lower.slice(1) : lower) + post;
  });
  const s = words.join(" ");
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function parseReason(reasons: string[] | null | undefined, keyword: string): string {
  if (!reasons?.length) return "—";
  const match = reasons.find(r => r.toLowerCase().includes(keyword.toLowerCase()));
  if (!match) return "—";
  // Only surface a tidy "key: value" reading — never cram a whole free-text
  // reason (or a duplicate of one) into the small value cell. Anything that
  // isn't a clean 1–2 word value falls back to "—" so the row stays organized.
  const parts = match.split(/:\s*/);
  if (parts.length < 2) return "—";
  const val = parts.slice(1).join(": ").replace(/[✓✗]/g, "").trim();
  if (!val || val.length > 14 || val.split(/\s+/).length > 2) return "—";
  return val.toUpperCase();
}

function deriveOptimalRisk(confidence?: number | null): string {
  if (!confidence) return "—";
  if (confidence >= 85) return "1.5% - 2.0% CAPITAL";
  if (confidence >= 70) return "1.0% - 1.5% CAPITAL";
  return "0.5% - 1.0% CAPITAL";
}

// The signal's REAL state, for the status badge.
//
// This used to be a boolean sniffed out of the free-text market context with
// `!/validating|watch|invalidated/i.test(...)`, ignoring the row's own `status` column — which is
// the authoritative field the platform actually sets and the monitor actually updates. So the badge
// tracked wording, not state: an invalidated signal whose context happened not to contain the word
// "invalidated" still showed CONFIRMED, and it could never distinguish a setup being WATCHED from a
// live entry, which is precisely the two-stage distinction the cards now make.
//
// Reads `status` first and falls back to the old text sniff only when a row has none.
export type SignalState = "watching" | "confirmed" | "closed" | "invalidated" | "unknown";

function badgeState(sig?: { status?: string | null; marketContext?: string | null } | null): SignalState {
  if (!sig) return "unknown";
  switch (String(sig.status || "").toLowerCase()) {
    case "watching":               return "watching";
    case "active":                 return "confirmed";
    case "executed": case "closed": return "closed";
    case "invalidated": case "expired": return "invalidated";
  }
  return /validating|watch|invalidated/i.test(String(sig.marketContext || ""))
    ? "watching" : "confirmed";
}

// Split the strategy's smcFactors into the three panels by an explicit prefix, so each panel is
// DYNAMIC per strategy — no hardcoded TF/indicator rows. Convention the strategy emits:
//   CTX::<label>::<note>   → Context Alignment (what's happening in a timeframe)
//   IND::<name>::<status>  → Technical Confluence (an indicator + its reading)
//   PA::<note>             → Price Action
// Anything without a prefix falls back to Price Action (older strategies).
function splitFactors(smcFactors?: string[] | null) {
  const ctx: ContextItem[] = [], ind: TechItem[] = [], pa: string[] = [];
  for (const raw of smcFactors ?? []) {
    const s = String(raw);
    if (s.startsWith("CTX::")) {
      const [, label, note] = s.split("::");
      ctx.push({ label: sentence(label), value: sentence(note), color: valueColor(note) });
    } else if (s.startsWith("IND::")) {
      const [, name, status] = s.split("::");
      ind.push({ label: sentence(name), value: sentence(status), color: valueColor(status) });
    } else {
      pa.push(s.startsWith("PA::") ? s.slice(4) : s);
    }
  }
  return { ctx, ind, pa };
}

function buildPriceAction(sig: any, pa: string[]): { icon: "layers" | "layers2" | "zoom"; text: string; bold?: string }[] {
  const icons: ("layers" | "layers2" | "zoom")[] = ["layers", "layers2", "zoom"];
  const items: { icon: "layers" | "layers2" | "zoom"; text: string; bold?: string }[] = [];

  // Strategy-authored price-action notes first (dynamic, short — no free-text stories).
  for (const p of pa) items.push({ icon: icons[items.length] ?? "zoom", text: sentence(p), bold: undefined });

  // Then any SMC field the strategy set (order block / FVG / liquidity), appended if there's room.
  if (items.length < 3 && sig.bocChochDetected)   items.push({ icon: "layers",  text: `${sig.bocChochDetected.toUpperCase()} CONFIRMED.`, bold: sig.bocChochDetected.toUpperCase() });
  if (items.length < 3 && sig.orderBlockType)      items.push({ icon: "layers2", text: `${sig.orderBlockType.toUpperCase()} ORDER BLOCK IN PLAY.`, bold: "ORDER BLOCK" });
  if (items.length < 3 && sig.fvgDetected)         items.push({ icon: "zoom",    text: "FAIR VALUE GAP IDENTIFIED — AWAITING MITIGATION.", bold: "FAIR VALUE GAP" });
  else if (items.length < 3 && sig.liquiditySweep) items.push({ icon: "zoom",    text: "LIQUIDITY SWEEP DETECTED — ENTRY TRIGGER PENDING.", bold: "LIQUIDITY SWEEP" });

  while (items.length < 3) items.push({ icon: "zoom", text: "AWAITING FURTHER CONFIRMATION.", bold: undefined });
  return items.slice(0, 3);
}

function signalToDisplayData(sig: any | null) {
  if (!sig) return null;
  const { ctx, ind, pa } = splitFactors(sig.smcFactors);

  // CONTEXT ALIGNMENT + TECHNICAL CONFLUENCE — ONLY what the strategy explicitly labelled (CTX:: /
  // IND:: factors). Never fabricated or guessed: a strategy with no indicators shows an EMPTY
  // Technical panel; one with no per-TF notes shows an EMPTY Context panel. No fake rows.
  const context: ContextItem[] = ctx;
  const tech: TechItem[] = ind;

  return {
    entry: sig.entryPrice ? String(sig.entryPrice) : null,
    tp:    sig.takeProfit ? String(sig.takeProfit) : "—",
    sl:    sig.stopLoss   ? String(sig.stopLoss)   : "—",
    rr:    sig.riskRewardRatio ? `1:${sig.riskRewardRatio}` : "—",
    direction: (sig.type === "buy" ? "up" : "down") as "up" | "down",
    probability: sig.overallConfidence ?? 0,
    optimalRisk: deriveOptimalRisk(sig.overallConfidence),
    context,
    tech,
    priceAction: buildPriceAction(sig, pa),
  };
}

function assetClassToCategory(ac: string): Instrument["category"] {
  if (ac === "crypto")    return "Crypto";
  if (ac === "forex")     return "Forex";
  if (ac === "commodity") return "Commodity";
  if (ac === "index")     return "Index";
  return "Stock";
}

// ASSET_DATA removed — data now fetched live from /api/trading-signals

// Icon-only scaffolds: the panels ALWAYS render their row/line icons; the TEXT
// (labels, values, price-action lines) fills in — in green — only when a live
// setup provides it. No setup ⇒ icons only, no text.
const _ICON_CTX:  ContextItem[] = Array.from({ length: 5 }, () => ({ label: "", value: "", color: "" }));
const _ICON_TECH: TechItem[]    = Array.from({ length: 5 }, () => ({ label: "", value: "", color: "" }));
const _ICON_PA = [
  { icon: "layers"  as const, text: "", bold: undefined as string | undefined },
  { icon: "layers2" as const, text: "", bold: undefined as string | undefined },
  { icon: "zoom"    as const, text: "", bold: undefined as string | undefined },
];

// ─── Icon helpers ─────────────────────────────────────────────────────────────
function LayersIcon({ color }: { color: string }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="12 2 2 7 12 12 22 7 12 2" />
      <polyline points="2 17 12 22 22 17" />
      <polyline points="2 12 12 17 22 12" />
    </svg>
  );
}
function ZoomIcon({ color }: { color: string }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  );
}

// ─── Live Clock (isolated so only it re-renders every second) ─────────────────
function LiveClock() {
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  const formatted =
    now.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" }).toUpperCase() +
    " | " +
    now.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", second: "2-digit" }).toUpperCase();
  return <span>{formatted}</span>;
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function AssetPage({ darkMode = true }: { darkMode?: boolean }) {
  // SELECTION KEYS ON THE SIGNAL id, NOT THE SYMBOL. The sidebar now lists one row per confirmed
  // entry, so two rows can share a pair — EUR/USD traded twice in the week of 17 Aug 2026. Keyed by
  // symbol, both rows would highlight together and the detail pane could only ever show one of them.
  // `selected` (the symbol) is DERIVED from the chosen row below, so every downstream use of it —
  // prices, alerts, chart — keeps working exactly as before.
  const [selectedId, setSelectedId] = useState("");
  const [search,   setSearch]     = useState("");
  const [alertModal, setAlertModal] = useState(false);
  const [alertTarget, setAlertTarget] = useState("");
  const [alertDir, setAlertDir]     = useState<"above"|"below">("above");
  const [alertProx, setAlertProx]   = useState("0");
  const qc = useQueryClient();
  const [showIndicators, setShowIndicators] = useState(false);
  const [activeIndicators, setActiveIndicators] = useState<Set<IndicatorId>>(() => {
    try {
      const saved = localStorage.getItem("asset-indicators");
      if (saved) return new Set<IndicatorId>(JSON.parse(saved));
    } catch {}
    return new Set<IndicatorId>(["EMA_9", "EMA_21", "VOL"]);
  });
  const indicatorBtnRef = useRef<HTMLDivElement>(null);

  // Timeframe state
  const [showTF, setShowTF] = useState(false);
  const [activeTF, setActiveTF] = useState(() =>
    localStorage.getItem("asset-tf") ?? "5m"
  );
  const tfBtnRef = useRef<HTMLDivElement>(null);

  const TIMEFRAMES: { label: string; interval: string; period: string }[] = [
    { label: "1m",  interval: "1m",  period: "1d"  },
    { label: "5m",  interval: "5m",  period: "5d"  },
    { label: "15m", interval: "15m", period: "5d"  },
    { label: "30m", interval: "30m", period: "1mo" },
    { label: "1H",  interval: "60m", period: "1mo" },
    { label: "4H",  interval: "4h",  period: "3mo" },
    { label: "1D",  interval: "1d",  period: "1y"  },
    { label: "1W",  interval: "1wk", period: "2y"  },
  ];
  const currentTF = TIMEFRAMES.find(t => t.label === activeTF) ?? TIMEFRAMES[1];

  // Chart type state
  const [chartType, setChartType] = useState<ChartType>(() =>
    (localStorage.getItem("asset-chart-type") as ChartType | null) ?? "candle"
  );
  const setAndSaveChartType = (t: ChartType) => {
    setChartType(t);
    localStorage.setItem("asset-chart-type", t);
  };

  // Mobile responsiveness
  const [isMobile, setIsMobile] = useState(() => typeof window !== 'undefined' && window.innerWidth < 768);
  const [mobileShowSidebar, setMobileShowSidebar] = useState(false);
  const CHART_TYPES: { id: ChartType; label: string }[] = [
    { id: "candle", label: "CANDLE" },
    { id: "ha",     label: "HA" },
    { id: "bar",    label: "BAR" },
    { id: "line",   label: "LINE" },
    { id: "area",   label: "AREA" },
  ];

  // Close dropdowns when clicking outside
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (indicatorBtnRef.current && !indicatorBtnRef.current.contains(e.target as Node)) {
        setShowIndicators(false);
      }
      if (tfBtnRef.current && !tfBtnRef.current.contains(e.target as Node)) {
        setShowTF(false);
      }
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // Track mobile breakpoint
  useEffect(() => {
    const check = () => {
      const mobile = window.innerWidth < 768;
      setIsMobile(mobile);
      if (!mobile) setMobileShowSidebar(false);
    };
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  // When the user switches row, prefetch the next few in the sidebar list ──────
  // Found by id, not symbol: several rows can share a pair, and `findIndex` on the symbol would
  // always land on the first of them and prefetch the wrong neighbours.
  useEffect(() => {
    const idx = sidebarInstruments.findIndex(i => i.id === selectedId);
    if (idx === -1) return;
    const next = Array.from(new Set(sidebarInstruments.slice(idx + 1, idx + 5).map(i => i.symbol)))
      .slice(0, 3);
    next.forEach((sym, i) => {
      setTimeout(() => prefetchCandles(sym, currentTF.interval, currentTF.period), i * 600);
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId]);

  function toggleIndicator(id: IndicatorId) {
    setActiveIndicators(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      localStorage.setItem("asset-indicators", JSON.stringify(Array.from(next)));
      return next;
    });
  }

  function setTF(label: string) {
    setActiveTF(label);
    localStorage.setItem("asset-tf", label);
  }

  // ── Theme palette ─────────────────────────────────────────────────────────
  //
  // THE FOUR GREY TEXT TOKENS WERE UNREADABLE AND ARE NOW MEASURED (2026-08-23). He reported it:
  // "The visibility of text in assets UI is very poor, I cant even see the white text in the sidebar
  // where signals are listed." Measured on the surfaces they actually sit on (bg / bg2 / bg3), AA
  // needs 4.5:1 for text and 3:1 for a border or an icon:
  //
  //            DARK, was            ->  now          LIGHT, was          ->  now
  //   muted    #4a6580  3.10:1  FAIL   #95acc2 8.03   #475569  6.86  ok     unchanged
  //   muted2   #3a5470  2.40:1  FAIL   #7495b7 6.03   #64748b  4.31  FAIL   #556275 5.60
  //   dim      #2d4a63  2.03:1  FAIL   #5386b1 4.85   #94a3b8  2.32  FAIL   #5a6c87 4.84
  //   dim2     #1e3045  1.40:1  FAIL   #3e638e 3.03   #b0bec5  1.72  FAIL   #79909c 3.02
  //
  // `muted` is the PAIR NAME in the sidebar list, which is what he could not read. `dim` is the
  // asset-class badge, the search box and the section labels. `dim2` at 1.40:1 was invisible.
  //
  // WHY THE TOKENS AND NOT THE CALL SITES. This was "fixed" once before by hardcoding better colours
  // into ONE row (see the note above the timestamp/strategy row further down) and leaving the tokens
  // broken, so every other use stayed unreadable and it came straight back. Fixing the tokens
  // corrects all 28 uses at once, and anything added later inherits a readable colour.
  //
  // HUE AND SATURATION ARE PRESERVED — only lightness moved — so the page keeps its blue-grey
  // character rather than turning into flat greys.
  //
  // THE LADDER STAYS DISTINCT, which is the other half of the job: readable text that still reads as
  // primary / secondary / tertiary. Dark 12.9 > 8.0 > 6.0 > 4.8 > 3.0, light 13.2 > 6.9 > 5.6 > 4.8
  // > 3.0. Five separate steps, not five near-identical greys.
  //
  // `dim2` TARGETS 3:1, NOT 4.5:1, because it is a BORDER colour and that is the right standard for
  // an interface element carrying no text. Its one TEXT use (the category header) moved to `dim`.
  // Forcing dim2 to 4.5 would have put dim and dim2 at 4.84 and 4.50 — indistinguishable.
  const C = darkMode ? {
    bg:       '#080c10', bg2: '#0a0f16', bg3: '#0c1219',
    probBg:   '#07090f', scoreBg: '#0b1120', activeBg: '#0e1620',
    catHdr:   '#080c10',
    border:   '#0f1923', border2: '#172233', border3: '#131d2b', border4: '#1e2d45',
    text:     '#c8d8e8', textB: '#c8d8ec', heroText: '#ffffff',
    muted:    '#95acc2', muted2: '#7495b7', dim: '#5386b1', dim2: '#3e638e',
    accent:   '#60a5fa',   // signal-info blue — 7.56:1 on bg2, measured
  } : {
    bg:       '#f0f4f8', bg2: '#ffffff', bg3: '#f1f5f9',
    probBg:   '#f8fafc', scoreBg: '#eef2f7', activeBg: '#e8f0fb',
    catHdr:   '#f1f5f9',
    border:   '#e2e8f0', border2: '#cbd5e1', border3: '#dde4ed', border4: '#c8d3e0',
    text:     '#1e293b', textB: '#1e293b', heroText: '#0f172a',
    muted:    '#475569', muted2: '#556275', dim: '#5a6c87', dim2: '#79909c',
    accent:   '#2563eb',   // the light-theme pair — 5.17:1 on white, measured
  };

  // Right sidebar resize
  const [sidebarWidth, setSidebarWidth] = useState(320);
  const isDragging = useRef(false);
  const dragStartX = useRef(0);
  const dragStartWidth = useRef(320);

  function handleDragStart(e: React.MouseEvent) {
    isDragging.current = true;
    dragStartX.current = e.clientX;
    dragStartWidth.current = sidebarWidth;
    e.preventDefault();

    function onMove(ev: MouseEvent) {
      if (!isDragging.current) return;
      const delta = dragStartX.current - ev.clientX;
      setSidebarWidth(Math.max(140, Math.min(520, dragStartWidth.current + delta)));
    }
    function onUp() {
      isDragging.current = false;
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    }
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }

  // ── Live signal board → the sidebar's rows AND the detail pane's data ────────
  // This ONE query now feeds both. It carries complete rows, so the detail pane selects from it by
  // id rather than refetching per symbol — see `selectedRow` below.
  //
  // `limit=300`: the endpoint defaults to 50, which was ample for a week and is not for a MONTH
  // (his rule changed 2026-08-22). Silently truncating would drop the OLDEST entries — exactly the
  // ones this change exists to make visible.
  const { data: allSignals = [] } = useQuery<any[]>({
    queryKey: ["all-active-signals"],
    queryFn: async () => {
      // The full lifecycle: watching -> in progress -> closed. 'expired' is deliberately absent —
      // a stop order cancelled before it filled never became a trade, so it is dropped, not shown.
      const res = await fetch(
        "/api/trading-signals?status=watching,active,executed,invalidated&limit=300");
      if (!res.ok) return [];
      const json = await res.json();
      return Array.isArray(json) ? json : [];
    },
    refetchInterval: 60_000,
    staleTime: 30_000,
  });

  // The `/api/pending-setups` query was deleted here (2026-08-22) along with its two consumers —
  // the sidebar's PENDING rows and the UNCONFIRMED banner. A pending setup has no confirmed entry by
  // definition, so his "only signals with confirmed entry" rule leaves it nothing to feed on this
  // page. The endpoint itself is untouched and still serves the Telegram side.

  /**
   * The two states the user asked to see, derived — no new column.
   *
   *   WATCHING FOR ENTRY  status 'watching', or 'active' with no fill yet (a stop order resting)
   *   IN PROGRESS         'active' AND triggered_at set — the entry filled, the trade is running
   *
   * `triggered_at` is stamped by the monitor the moment price touches the entry, so this reads the
   * same fact the monitor acts on rather than inventing a parallel notion of "taken".
   *
   * Deliberately NO win/loss anywhere: there is no entry logic yet, so an outcome would be a guess
   * presented as a record.
   */
  /**
   * "2m ago", "15m ago", "3h ago", "1d ago" — how long since the signal was generated.
   *
   * A signal board is read as "what is happening and how fresh is it". An absolute date makes you
   * do that subtraction in your head, and on a board that only ever holds one week the date adds
   * nothing. The absolute time is kept on the element's title so precision is still one hover away.
   *
   * Re-renders on the 60s refetch the list already does, so the value never drifts by more than a
   * minute — which is inside its own resolution.
   */
  function timeAgo(iso?: string): string {
    if (!iso) return "";
    const t = new Date(iso).getTime();
    if (!isFinite(t)) return "";
    const secs = Math.floor((Date.now() - t) / 1000);
    if (secs < 0) return "just now";          // clock skew — never render "in -3m"
    if (secs < 60) return "just now";
    const mins = Math.floor(secs / 60);
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    const days = Math.floor(hrs / 24);
    return `${days}d ago`;
  }

  function signalState(s: any): "watching" | "live" | "closed" {
    const status = s?.status;
    if (status === "executed" || status === "invalidated") return "closed";
    const triggered = s?.triggeredAt ?? s?.triggered_at ?? null;
    return status === "active" && triggered ? "live" : "watching";
  }

  // EVERY CONFIRMED ENTRY THIS MONTH, NEWEST FIRST — one row per SIGNAL, not per instrument.
  //
  // His rule, 2026-08-22: *"Assets page should record all the signals with confirmed entries per
  // [month] … Only signals with confirmed entry from the newest at the top and the oldest below in
  // that order."*
  //
  // What this replaces: a `seen` set that kept one row per SYMBOL. The week of 17 Aug 2026 recorded
  // 5 confirmed entries and the board showed 3 rows — XAU/USD traded twice on the 19th and BOTH were
  // invisible, because a watch alert on the 21st had taken the single XAU/USD slot. The old
  // state-ranked ordering (live, then watching, then closed) goes with it: he asked for time order,
  // and with watches filtered out there is little left for it to separate.
  //
  // The filter itself lives in `./assets/confirmedEntries` so it can be tested against real
  // production rows — this page is behind RequireAuth, so an inline rule could only be eyeballed.
  const signalRows = confirmedEntries(allSignals as SignalRow[]);

  const sidebarInstruments: Instrument[] = (() => {
    const list: Instrument[] = signalRows.map(s => ({
      id: String(s.id ?? ""),
      symbol: String(s.symbol ?? ""),
      assetClass: s.assetClass as Instrument["assetClass"],
      category: assetClassToCategory(s.assetClass as string),
      direction: s.type as string, createdAt: s.createdAt as string,
      confirmed: signalState(s) === "live",
      state: signalState(s), strategy: (s.strategy as string) || "",
    }));
    // Pending setups are NOT listed here any more — they have no confirmed entry by definition, so
    // his "only signals with confirmed entry" rule excludes them. The detail-pane banner that
    // explains an unconfirmed setup is untouched; this is only about what the sidebar lists.
    return list;
  })();

  // THE SELECTED SIGNAL — the exact row he clicked, straight out of the list already fetched.
  //
  // This is what the whole detail dashboard reads (entry / stop / target / R:R, the chart's levels,
  // the context panels). It replaces a second query, `/api/trading-signals?symbol=…`, which the
  // server answers with `limit(1)` — the NEWEST row for that pair. That was invisible while the
  // sidebar showed one row per symbol; the moment it lists two EUR/USD entries, clicking the older
  // one would have shown the newer one's numbers against a real trade.
  const selectedRow = signalRows.find(s => String(s.id ?? "") === selectedId) ?? null;

  // The symbol, DERIVED. Everything downstream — prices, alerts, chart, headings — still reads
  // `selected` exactly as it did before, so none of it needed touching.
  const selected = String(selectedRow?.symbol ?? "");

  // Auto-select the newest confirmed entry when nothing is selected yet
  useEffect(() => {
    if (!selectedId && sidebarInstruments.length > 0) {
      setSelectedId(sidebarInstruments[0].id ?? "");
    }
  }, [sidebarInstruments, selectedId]);

  // Live prices — sidebar batch every 35s, selected instrument every 8s.
  // De-duplicated: the same pair can now hold several rows, and asking for its price once per row
  // would multiply the polling for no gain.
  const sidebarSymbols = Array.from(new Set(sidebarInstruments.map(i => i.symbol)));
  const tickerPrices   = useFastBatchPrices(sidebarSymbols, 35000);
  const entryTick      = useFastPrice(selected, 8000);

  // Price alerts for the selected symbol (all, not just first)
  const { data: myAlerts = [] } = useQuery<any[]>({
    queryKey: ["/api/price-alerts", selected],
    queryFn: async () => {
      const d = await fetchJson<any[]>(`/api/price-alerts?symbol=${encodeURIComponent(selected)}`);
      return Array.isArray(d) ? d : [];
    },
    staleTime: 30_000,
  });
  const activeAlerts = myAlerts.filter((a: any) => !a.isTriggered);

  const createAlertMutation = useMutation({
    mutationFn: async ({ targetPrice, direction, proximityPct }: { targetPrice: string; direction: string; proximityPct: string }) => {
      const ac = sidebarInstruments.find(i => i.symbol === selected)?.assetClass ?? "forex";
      const r = await authFetch("/api/price-alerts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ symbol: selected, assetClass: ac, targetPrice, direction, proximityPct }),
      });
      if (!r.ok) throw new Error("Failed to create alert");
      return r.json();
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/price-alerts", selected] }); setAlertModal(false); setAlertTarget(""); },
  });

  const deleteAlertMutation = useMutation({
    mutationFn: async (id: string) => {
      await authFetch(`/api/price-alerts/${id}`, { method: "DELETE" });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/price-alerts", selected] }),
  });

  // ── The signal behind the dashboard — the row he clicked, nothing refetched ──
  // Was a second query keyed on the SYMBOL (`?symbol=…`, answered `limit(1)` server-side). The
  // sidebar list already holds every field this needs and refreshes on the same 60s interval, so
  // reading the exact row is both fewer requests and the only way to show the right one when a pair
  // has more than one entry in the month.
  const rawSignal = selectedRow as any;
  // Loading = the board itself has not arrived yet. Once it has, a missing row is genuinely "no
  // signal selected", not a pending fetch.
  const signalLoading = allSignals.length === 0 && !selectedId;

  // Transform DB signal into display-ready structure; null = no signal
  const data = signalToDisplayData(rawSignal ?? null);

  // Row/line ICONS always render (scaffold); the TEXT fills in green only where a
  // live setup actually has a data-point. No signal ⇒ icons only, no text.
  // Show the strategy's real rows; when a panel has none (e.g. VIX.1 uses no indicators), fall
  // back to the blank icon scaffold — icons only, no fabricated text.
  const displayContext     = data?.context?.length     ? data.context     : _ICON_CTX;
  const displayTech        = data?.tech?.length         ? data.tech        : _ICON_TECH;
  const displayPriceAction = data?.priceAction?.length  ? data.priceAction : _ICON_PA;

  const filtered = sidebarInstruments.filter(i =>
    i.symbol.toLowerCase().includes(search.toLowerCase())
  );

  function boldify(text: string, bold?: string) {
    if (!bold) return <span>{text}</span>;
    const parts = text.split(bold);
    return (
      <span>
        {parts[0]}<strong style={{ color: C.heroText }}>{bold}</strong>{parts[1]}
      </span>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", background: C.bg, fontFamily: "'Poppins', sans-serif", overflow: "hidden" }}>
      <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>
      <style>{`
        * { box-sizing: border-box; }
        .asset-scroll::-webkit-scrollbar { width: 0; height: 0; }
        .asset-scroll { scrollbar-width: none; -ms-overflow-style: none; }
        .inst-card:hover { background: ${C.bg3} !important; cursor: pointer; }
        .chart-btn { background: ${C.bg3}; border: 1px solid ${C.border2}; color: ${C.muted}; font-size: 9px; font-weight: 700; letter-spacing: 0.08em; padding: 5px 12px; cursor: pointer; transition: all 0.15s; }
        .chart-btn:hover { border-color: #3b82f6; color: ${C.text}; }
        .chart-btn-alert { background: ${C.bg3}; border: 1px solid ${C.border2}; color: ${C.text}; font-size: 9px; font-weight: 700; letter-spacing: 0.08em; padding: 5px 12px; cursor: pointer; transition: all 0.15s; display: flex; align-items: center; gap: 6px; }
        .chart-btn-alert:hover { border-color: #f59e0b; color: #f59e0b; }
        .set-alert-btn { background: ${darkMode ? '#100d04' : '#fffbec'}; border: 1.5px solid #c8a84b; color: #c8a84b; font-size: 10px; font-weight: 800; letter-spacing: 0.12em; padding: 13px 28px; cursor: pointer; transition: all 0.15s; display: flex; align-items: center; gap: 8px; border-radius: 3px; }
        .set-alert-btn:hover { background: rgba(200,168,75,0.12); border-color: #f0c040; color: #f0c040; }
        .set-alert-btn.active { background: rgba(200,168,75,0.18); border-color: #f0c040; color: #f0c040; }
        .share-btn { background: #5b4fcf; border: none; color: #fff; font-size: 10px; font-weight: 800; letter-spacing: 0.12em; padding: 13px 32px; cursor: pointer; transition: all 0.15s; display: flex; align-items: center; gap: 8px; border-radius: 3px; }
        .share-btn:hover { background: #6c63d9; }
        .ctx-row:hover { background: ${darkMode ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.03)'}; }
        .news-btn { background: ${darkMode ? '#1a0a0e' : '#fff0f3'}; border: 1px solid #f4617f; color: #f4617f; font-size: 9px; font-weight: 800; letter-spacing: 0.12em; padding: 5px 14px; cursor: pointer; display: flex; align-items: center; gap: 6px; }
        .mob-instruments-fab { display: none; }
        @media (max-width: 767px) {
          .entry-grid { grid-template-columns: 1fr 1fr !important; }
          .entry-grid > div:nth-child(2n) { border-right: none !important; }
          .entry-grid > div:nth-child(-n+2) { border-bottom: 1px solid ${C.border}; }
          .analysis-grid { grid-template-columns: 1fr !important; }
          .asset-main-pad { padding: 12px 12px 32px !important; }
          .asset-inner-pad { padding: 12px 12px !important; }
          .prob-panel { flex-wrap: wrap; gap: 12px !important; }
          .prob-btns { flex-direction: column; gap: 6px !important; width: 100%; }
          .set-alert-btn, .share-btn { width: 100%; justify-content: center; }
          .chart-row2 { flex-wrap: wrap; gap: 6px !important; }
          .chart-type-pills { overflow-x: auto; flex-shrink: 1 !important; min-width: 0; }
          .mob-instruments-fab { display: flex !important; position: fixed; bottom: 24px; right: 20px; z-index: 40; background: #7c3aed; border: none; border-radius: 28px; color: #fff; font-size: 10px; font-weight: 800; letter-spacing: 0.1em; padding: 11px 18px; cursor: pointer; align-items: center; gap: 6px; box-shadow: 0 4px 20px rgba(124,58,237,0.5); }
        }
      `}</style>

      {/* ── Main Content ── */}
      <div className="asset-scroll" style={{ flex: 1, overflowY: "auto", padding: "0 0 32px" }}>


        <div className="asset-inner-pad" style={{ padding: "16px 24px", display: "flex", flexDirection: "column", gap: 16 }}>

          {/* ── Entry / TP / SL / RR Panel ── */}
          <div className="entry-grid" style={{ background: C.bg2, border: `1px solid ${C.border}`, borderRadius: 4, display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr" }}>
            {[
              {
                label: "ENTRY",
                value: (
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
                    <svg width="14" height="14" viewBox="0 0 12 12"
                      fill={data?.direction === "down" ? "#f4617f" : "#22d3a5"}>
                      {data?.direction === "down"
                        ? <polygon points="6,11 11,2 1,2" />
                        : <polygon points="6,1 11,10 1,10" />}
                    </svg>
                    {/* The signal's ENTRY LEVEL (real) — not the live price feed, which read 0. */}
                    <span style={{ fontSize: 9, fontWeight: 700, color: C.text }}>{data?.entry ?? "—"}</span>
                  </div>
                )
              },
              { label: "TARGET (TP)", value: <span style={{ fontSize: 9, fontWeight: 700, color: C.text }}>{data?.tp ?? "—"}</span> },
              { label: "PROTECT (SL)", value: <span style={{ fontSize: 9, fontWeight: 700, color: C.text }}>{data?.sl ?? "—"}</span> },
              { label: "RISK : REWARD", value: <span style={{ fontSize: 9, fontWeight: 700, color: C.text }}>{data?.rr ?? "—"}</span> },
            ].map((col, i) => (
              <div key={i} style={{
                padding: "20px 16px", textAlign: "center",
                borderRight: i < 3 ? `1px solid ${C.border}` : undefined
              }}>
                <div style={{ fontSize: 9, fontWeight: 700, color: C.muted2, letterSpacing: "0.12em", marginBottom: 12 }}>{col.label}</div>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "center" }}>{col.value}</div>
              </div>
            ))}
          </div>

          {/* ── Analysis Panels Row ── */}
          <div className="analysis-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>

            {/* Context Alignment */}
            <div style={{ background: C.bg2, border: `1px solid ${C.border}`, borderRadius: 4, padding: "16px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
                <div style={{ width: 10, height: 10, background: "#3b82f6" }} />
                <span style={{ fontSize: 9, fontWeight: 800, color: C.muted, letterSpacing: "0.14em" }}>CONTEXT ALIGNMENT</span>
              </div>
              {displayContext.map((row, i) => {
                const has = !!row.value && row.value !== "—";
                return (
                <div key={i} className="ctx-row" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "7px 4px", borderRadius: 3, minHeight: 24 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    {row.loading
                      ? <Loader2 size={10} color="#f59e0b" style={{ animation: "spin 1.5s linear infinite" }} />
                      : <ChevronRight size={10} color={C.dim} />}
                    {has && <span style={{ fontSize: 11, fontWeight: 600, color: C.accent, letterSpacing: "0.01em" }}>{row.label}</span>}
                  </div>
                  {has && <span style={{ fontSize: 11, fontWeight: 700, color: C.accent, letterSpacing: "0.01em", display: "inline-block", maxWidth: "62%", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", textAlign: "right" }}>{row.value}</span>}
                </div>
                );
              })}
            </div>

            {/* Technical Confluence */}
            <div style={{ background: C.bg2, border: `1px solid ${C.border}`, borderRadius: 4, padding: "16px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
                <div style={{ width: 10, height: 10, background: "#22d3a5" }} />
                <span style={{ fontSize: 9, fontWeight: 800, color: C.muted, letterSpacing: "0.14em" }}>TECHNICAL CONFLUENCE</span>
              </div>
              {displayTech.map((row, i) => {
                const has = !!row.value && row.value !== "—";
                return (
                <div key={i} className="ctx-row" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "7px 4px", borderRadius: 3, minHeight: 24 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <ChevronRight size={10} color={C.dim} />
                    {has && <span style={{ fontSize: 11, fontWeight: 600, color: C.accent, letterSpacing: "0.01em" }}>{row.label}</span>}
                  </div>
                  {has && <span style={{ fontSize: 11, fontWeight: 700, color: C.accent, letterSpacing: "0.01em", display: "inline-block", maxWidth: "62%", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", textAlign: "right" }}>{row.value}</span>}
                </div>
                );
              })}
            </div>

            {/* Price Action */}
            <div style={{ background: C.bg2, border: `1px solid ${C.border}`, borderRadius: 4, padding: "16px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
                <div style={{ width: 10, height: 10, background: "#f59e0b" }} />
                <span style={{ fontSize: 9, fontWeight: 800, color: C.muted, letterSpacing: "0.14em" }}>PRICE ACTION</span>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                {displayPriceAction.map((item, i) => {
                  const has = !!item.text && !/AWAITING FURTHER CONFIRMATION/i.test(item.text);
                  return (
                  <div key={i} style={{ display: "flex", gap: 10, alignItems: "flex-start", minHeight: 18 }}>
                    <div style={{ flexShrink: 0, marginTop: 1 }}>
                      {item.icon === "zoom"
                        ? <ZoomIcon color="#f59e0b" />
                        : <LayersIcon color={item.icon === "layers" ? "#3b82f6" : "#3b82f6"} />}
                    </div>
                    {has && <p style={{ fontSize: 11, fontWeight: 500, color: C.accent, letterSpacing: "0.01em", lineHeight: 1.6, margin: 0 }}>
                      {boldify(item.text, item.bold)}
                    </p>}
                  </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* ── Probability Panel ── */}
          <div className="prob-panel" style={{
            background: C.probBg,
            border: `1px solid ${C.border3}`,
            borderRadius: 4,
            padding: "22px 28px",
            display: "flex",
            alignItems: "center",
            gap: 20,
          }}>
            {/* Score Box */}
            <div style={{
              width: 68, height: 68, flexShrink: 0,
              border: `1.5px solid ${C.border4}`,
              borderRadius: 4,
              background: C.scoreBg,
              display: "flex", alignItems: "center", justifyContent: "center",
              position: "relative", overflow: "hidden",
            }}>
              {/* Thick diagonal slash */}
              <svg style={{ position: "absolute", top: 0, left: 0 }} width="68" height="68">
                <line x1="14" y1="58" x2="54" y2="10" stroke="#5b4fcf" strokeWidth="5" strokeLinecap="round" opacity="0.9" />
              </svg>
              <span style={{
                fontSize: 10, fontWeight: 800, color: C.heroText,
                position: "relative", letterSpacing: "0.02em",
              }}>{data?.probability ?? 0}%</span>
            </div>

            {/* Text */}
            <div style={{ flex: 1 }}>
              <div style={{
                fontSize: 10, fontWeight: 800, color: C.heroText,
                letterSpacing: "0.05em", marginBottom: 5,
              }}>
                PROBABILITY: {data?.probability ?? 0}%
              </div>
              <div style={{
                fontSize: 10, fontWeight: 600,
                color: "#3d9fd3",
                letterSpacing: "0.1em",
              }}>
                OPTIMAL RISK: {data?.optimalRisk ?? "—"}
              </div>
            </div>

            {/* Buttons */}
            <div className="prob-btns" style={{ display: "flex", gap: 10, flexShrink: 0 }}>
              <button className={`set-alert-btn${activeAlerts.length > 0 ? " active" : ""}`} onClick={() => {
                setAlertTarget(entryTick.price ? String(entryTick.price.toPrecision(6)) : "");
                setAlertModal(true);
              }}>
                <Bell size={13} />
                {activeAlerts.length > 0 ? `${activeAlerts.length} ALERT${activeAlerts.length > 1 ? "S" : ""} SET` : "SET ALERT"}
              </button>
              <button className="share-btn">
                <Share2 size={13} />
                SHARE
              </button>
            </div>
          </div>

          {/* ── Alert Modal ── */}
          {alertModal && (
            <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.75)", backdropFilter: "blur(4px)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center" }} onClick={() => setAlertModal(false)}>
              <div style={{ background: "#0a0f16", border: "1px solid #1e2d45", borderRadius: 8, padding: 24, width: 340, display: "flex", flexDirection: "column", gap: 16, maxHeight: "85vh", overflowY: "auto" }} onClick={e => e.stopPropagation()}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ fontSize: 12, fontWeight: 800, color: "#c8d8e8", letterSpacing: "0.08em" }}>PRICE ALERTS · {selected}</span>
                  <button onClick={() => setAlertModal(false)} style={{ background: "none", border: "none", color: "#4a6580", cursor: "pointer" }}><X size={16} /></button>
                </div>

                {/* Existing active alerts */}
                {activeAlerts.length > 0 && (
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    <div style={{ fontSize: 9, fontWeight: 700, color: "#4a6580", letterSpacing: "0.1em" }}>ACTIVE ALERTS</div>
                    {activeAlerts.map((a: any) => (
                      <div key={a.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 12px", background: "rgba(59,130,246,0.06)", border: "1px solid rgba(59,130,246,0.2)", borderRadius: 6 }}>
                        <span style={{ fontSize: 12, color: "#93c5fd", fontWeight: 600 }}>
                          {a.direction === "above" ? "▲" : "▼"} {parseFloat(a.targetPrice).toPrecision(6)}
                          {parseFloat(a.proximityPct ?? "0") > 0 && <span style={{ fontSize: 10, color: "#4a6580", marginLeft: 6 }}>±{a.proximityPct}%</span>}
                        </span>
                        <button onClick={() => deleteAlertMutation.mutate(a.id)} style={{ background: "none", border: "none", color: "#4a6580", cursor: "pointer", padding: 4 }} title="Remove alert"><X size={13} /></button>
                      </div>
                    ))}
                    <div style={{ height: 1, background: "#1e2d45", margin: "4px 0" }} />
                  </div>
                )}

                {/* Add new alert */}
                <div style={{ fontSize: 11, color: "#4a6580" }}>
                  Add a new level — Telegram fires when price {parseFloat(alertProx) > 0 ? "nears or reaches" : "reaches"} the target.
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  {(["above","below"] as const).map(d => {
                    const sel   = alertDir === d;
                    const arrow = d === "above" ? "#22d3a5" : "#f4617f";   // green up / red down
                    return (
                    <button key={d} onClick={() => setAlertDir(d)} title={d === "above" ? "Above" : "Below"}
                      style={{ flex: 1, padding: "9px 0",
                        background: sel ? (d === "above" ? "rgba(34,211,165,0.12)" : "rgba(244,97,127,0.12)") : "transparent",
                        border: `1px solid ${sel ? arrow : "#1e2d45"}`, borderRadius: 6,
                        color: arrow, fontSize: 18, fontWeight: 800, lineHeight: 1, cursor: "pointer" }}>
                      {d === "above" ? "▲" : "▼"}
                    </button>
                    );
                  })}
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  <label style={{ fontSize: 9, fontWeight: 700, color: "#4a6580", letterSpacing: "0.1em" }}>TARGET PRICE</label>
                  <input
                    type="number" step="any" value={alertTarget}
                    onChange={e => setAlertTarget(e.target.value)}
                    style={{ background: "#070d1a", border: "1px solid #1e2d45", borderRadius: 6, padding: "10px 12px", color: "#c8d8e8", fontSize: 13, outline: "none", width: "100%" }}
                    placeholder={entryTick.price ? String(entryTick.price) : "Enter price…"}
                    autoFocus
                  />
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  <label style={{ fontSize: 9, fontWeight: 700, color: "#4a6580", letterSpacing: "0.1em" }}>NOTIFY WHEN</label>
                  <div style={{ display: "flex", gap: 6 }}>
                    {[["0","At price"],["0.2","Within 0.2%"],["0.5","Within 0.5%"],["1","Within 1%"]].map(([v,lbl]) => (
                      <button key={v} onClick={() => setAlertProx(v)} style={{ flex: 1, padding: "6px 4px", fontSize: 9, fontWeight: 700, background: alertProx === v ? "rgba(34,211,165,0.15)" : "transparent", border: `1px solid ${alertProx === v ? "#22d3a5" : "#1e2d45"}`, borderRadius: 6, color: alertProx === v ? "#22d3a5" : "#4a6580", cursor: "pointer", letterSpacing: "0.04em" }}>
                        {lbl}
                      </button>
                    ))}
                  </div>
                </div>
                <button
                  disabled={!alertTarget || createAlertMutation.isPending}
                  onClick={() => createAlertMutation.mutate({ targetPrice: alertTarget, direction: alertDir, proximityPct: alertProx })}
                  style={{ padding: "10px 0", background: "#1e4db7", border: "none", borderRadius: 6, color: "#fff", fontSize: 12, fontWeight: 700, cursor: !alertTarget ? "not-allowed" : "pointer", opacity: !alertTarget ? 0.5 : 1, letterSpacing: "0.08em" }}
                >
                  {createAlertMutation.isPending ? "SAVING…" : "ADD ALERT"}
                </button>
              </div>
            </div>
          )}

          {/* The UNCONFIRMED-setup banner was deleted here (2026-08-22). Its condition was
              "a pending setup exists for this symbol AND no signal does" — and the selected symbol
              is now always derived from a confirmed-entry row, so the second half can never hold.
              A branch that cannot run reads like a live feature to the next session, so it goes
              rather than sitting here disabled. The `/api/pending-setups` query it was the only
              consumer of went with it. */}

          {/* ── Signal Platform Status (replaces live chart — signal-only mode) ── */}
          <SignalPlatformStatus darkMode={darkMode} selectedSymbol={selected} state={rawSignal ? badgeState(rawSignal) : null} />

          {/* ── Live Visualizer Chart (disabled — signal-only mode) ── */}
          {false && <div style={{ background: C.bg2, border: `1px solid ${C.border}`, borderRadius: 4, overflow: "hidden" }}>
            {/* Chart Header */}
            {/* ── Row 1: symbol + clock + alert ── */}
            <div style={{ padding: "10px 16px 8px", borderBottom: `1px solid ${C.border}`, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div style={{ fontSize: 9, color: C.dim, letterSpacing: "0.06em" }}>
                <LiveClock />
              </div>
              <div style={{ fontSize: 10, fontWeight: 900, letterSpacing: "0.12em", color: C.textB, fontFamily: "monospace" }}>
                {selected}
              </div>
              <button className="chart-btn-alert" style={{ flexShrink: 0 }}>
                <Bell size={11} />
                ALERT
              </button>
            </div>

            {/* ── Row 2: chart controls toolbar ── */}
            <div className="chart-row2" style={{ padding: "6px 16px", borderBottom: `1px solid ${C.border}`, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
              {/* Left: chart type pills */}
              <div className="chart-type-pills" style={{ display: "flex", gap: 2, background: C.bg, border: `1px solid ${C.border}`, borderRadius: 4, padding: 2, flexShrink: 0 }}>
                {CHART_TYPES.map(ct => {
                  const active = ct.id === chartType;
                  return (
                    <button
                      key={ct.id}
                      onClick={() => setAndSaveChartType(ct.id)}
                      style={{
                        background: active ? "rgba(59,130,246,0.18)" : "transparent",
                        border: `1px solid ${active ? "#3b82f6" : "transparent"}`,
                        borderRadius: 3, color: active ? "#60a5fa" : C.dim,
                        fontSize: 9, fontWeight: 800, letterSpacing: "0.07em",
                        padding: "4px 8px", cursor: "pointer", transition: "all 0.12s",
                      }}
                      onMouseEnter={e => { if (!active) e.currentTarget.style.color = C.muted; }}
                      onMouseLeave={e => { if (!active) e.currentTarget.style.color = C.dim; }}
                    >
                      {ct.label}
                    </button>
                  );
                })}
              </div>

              {/* Right: TF + Indicators */}
              <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                <div ref={tfBtnRef} style={{ position: "relative" }}>
                  <button
                    className="chart-btn"
                    style={{ borderColor: showTF ? "#22d3a5" : undefined, color: showTF ? "#22d3a5" : undefined }}
                    onClick={() => setShowTF(v => !v)}
                  >
                    {activeTF}
                  </button>
                  {showTF && (
                    <div style={{
                      position: "absolute", top: "calc(100% + 6px)", left: "50%",
                      transform: "translateX(-50%)", zIndex: 100,
                      background: C.bg3, border: `1px solid ${C.border2}`, borderRadius: 6,
                      padding: "6px", display: "grid", gridTemplateColumns: "1fr 1fr",
                      gap: 4, minWidth: 120,
                      boxShadow: darkMode ? "0 8px 24px rgba(0,0,0,0.5)" : "0 8px 24px rgba(0,0,0,0.15)",
                    }}>
                      {TIMEFRAMES.map(tf => {
                        const isActive = tf.label === activeTF;
                        return (
                          <button
                            key={tf.label}
                            onClick={() => { setTF(tf.label); setShowTF(false); }}
                            style={{
                              background: isActive ? "rgba(34,211,165,0.15)" : "transparent",
                              border: `1px solid ${isActive ? "#22d3a5" : C.border2}`,
                              borderRadius: 4, color: isActive ? "#22d3a5" : C.muted,
                              fontSize: 10, fontWeight: 800, letterSpacing: "0.06em",
                              padding: "6px 0", cursor: "pointer",
                              transition: "all 0.1s",
                            }}
                            onMouseEnter={e => { if (!isActive) e.currentTarget.style.borderColor = C.dim; }}
                            onMouseLeave={e => { if (!isActive) e.currentTarget.style.borderColor = C.border2; }}
                          >
                            {tf.label}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Indicators toggle */}
                <div ref={indicatorBtnRef} style={{ position: "relative" }}>
                  <button
                    className="chart-btn"
                    style={{ borderColor: showIndicators ? "#7c3aed" : undefined, color: showIndicators ? "#a78bfa" : undefined }}
                    onClick={() => setShowIndicators(v => !v)}
                  >
                    INDICATORS
                    {activeIndicators.size > 0 && (
                      <span style={{
                        marginLeft: 5, background: "#7c3aed", color: "#fff",
                        borderRadius: 9, fontSize: 8, fontWeight: 800,
                        padding: "1px 5px", letterSpacing: 0,
                      }}>{activeIndicators.size}</span>
                    )}
                  </button>

                  {showIndicators && (() => {
                    const categories = ["Trend", "Momentum", "Volume", "Volatility"] as const;
                    return (
                    <div style={{
                      position: "absolute", top: "calc(100% + 6px)", right: 0, zIndex: 100,
                      background: C.bg3, border: `1px solid ${C.border2}`, borderRadius: 6,
                      minWidth: 220, maxHeight: 440, display: "flex", flexDirection: "column",
                      boxShadow: darkMode ? "0 8px 32px rgba(0,0,0,0.6)" : "0 8px 32px rgba(0,0,0,0.15)",
                    }}>
                      {/* Header */}
                      <div style={{ padding: "8px 14px", fontSize: 9, fontWeight: 800, color: C.dim, letterSpacing: "0.12em", borderBottom: `1px solid ${C.border}`, flexShrink: 0, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <span>INDICATORS ({INDICATOR_DEFS.length})</span>
                        <span style={{ color: "#7c3aed" }}>{activeIndicators.size} ON</span>
                      </div>
                      {/* Scrollable body */}
                      <div style={{ overflowY: "auto", flex: 1 }} className="asset-scroll">
                        {categories.map(cat => {
                          const catDefs = INDICATOR_DEFS.filter(d => d.category === cat);
                          return (
                            <div key={cat}>
                              {/* C.dim, NOT C.dim2 (2026-08-23). This is TEXT, and `dim2` is now
                                  scoped to borders — it targets 3:1, the standard for an interface
                                  element carrying no text, so it is not bright enough to read at
                                  8px. `dim` is 4.85:1. */}
                              <div style={{ padding: "6px 14px 4px", fontSize: 8, fontWeight: 800, color: C.dim, letterSpacing: "0.14em", background: C.catHdr }}>
                                {cat.toUpperCase()}
                              </div>
                              {catDefs.map(ind => {
                                const on = activeIndicators.has(ind.id);
                                return (
                                  <div
                                    key={ind.id}
                                    onClick={() => toggleIndicator(ind.id)}
                                    style={{
                                      display: "flex", alignItems: "center", gap: 10,
                                      padding: "6px 14px", cursor: "pointer",
                                      background: on ? "rgba(124,58,237,0.08)" : "transparent",
                                    }}
                                    onMouseEnter={e => (e.currentTarget.style.background = darkMode ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.04)")}
                                    onMouseLeave={e => (e.currentTarget.style.background = on ? "rgba(124,58,237,0.08)" : "transparent")}
                                  >
                                    <span style={{ width: 10, height: 3, borderRadius: 2, background: ind.color, flexShrink: 0 }} />
                                    <span style={{ flex: 1, fontSize: 10, fontWeight: 700, color: on ? C.text : C.muted, letterSpacing: "0.05em" }}>
                                      {ind.label}
                                    </span>
                                    <span style={{
                                      width: 14, height: 14, borderRadius: "50%", flexShrink: 0,
                                      border: `2px solid ${on ? "#7c3aed" : C.dim2}`,
                                      background: on ? "#7c3aed" : "transparent",
                                      display: "flex", alignItems: "center", justifyContent: "center",
                                    }}>
                                      {on && <span style={{ width: 4, height: 4, borderRadius: "50%", background: "#fff" }} />}
                            </span>
                                  </div>
                                );
                              })}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                    );
                  })()}
                </div>

              </div>
            </div>

            {/* Chart */}
            <TradingChart
              symbol={selected}
              interval={currentTF.interval}
              period={currentTF.period}
              height={360}
              activeIndicators={activeIndicators}
              chartType={chartType}
              signalLevels={rawSignal ? (() => {
                const safeNum = (v: any) => { const n = Number(v); return (v != null && !isNaN(n)) ? n : undefined; };
                return { entry: safeNum(rawSignal.entryPrice), sl: safeNum(rawSignal.stopLoss), tp: safeNum(rawSignal.takeProfit), direction: rawSignal.type };
              })() : undefined}
            />
          </div>}
        </div>
      </div>

      {/* ── Mobile backdrop ── */}
      {isMobile && mobileShowSidebar && (
        <div
          onClick={() => setMobileShowSidebar(false)}
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.65)", zIndex: 49 }}
        />
      )}

      {/* ── Right Sidebar ── */}
      <div style={{
        width: isMobile ? 280 : sidebarWidth,
        minWidth: isMobile ? undefined : 140,
        maxWidth: isMobile ? undefined : 520,
        background: C.bg2,
        borderLeft: `1px solid ${C.border}`,
        display: isMobile ? (mobileShowSidebar ? "flex" : "none") : "flex",
        flexDirection: "column",
        height: "100%",
        position: isMobile ? "fixed" : "relative",
        right: isMobile ? 0 : undefined,
        top: isMobile ? 0 : undefined,
        bottom: isMobile ? 0 : undefined,
        zIndex: isMobile ? 50 : undefined,
        flexShrink: 0,
      }}>
        {/* Drag handle — hidden on mobile */}
        {!isMobile && (
        <div
          onMouseDown={handleDragStart}
          style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 5, cursor: "col-resize", zIndex: 10, background: "transparent" }}
          onMouseEnter={e => { e.currentTarget.style.background = "rgba(59,130,246,0.25)"; }}
          onMouseLeave={e => { e.currentTarget.style.background = "transparent"; }}
        />
        )}

        {/* Mobile close button */}
        {isMobile && (
          <div style={{ padding: "10px 14px", borderBottom: `1px solid ${C.border}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontSize: 9, fontWeight: 800, color: C.muted, letterSpacing: "0.12em" }}>INSTRUMENTS</span>
            <button onClick={() => setMobileShowSidebar(false)} style={{ background: "none", border: "none", color: C.muted, cursor: "pointer", fontSize: 18, lineHeight: 1, padding: 4 }}>×</button>
          </div>
        )}

        {/* Search */}
        <div style={{ padding: "16px 14px 10px", borderBottom: `1px solid ${C.border}` }}>
          <div style={{ position: "relative" }}>
            <Search size={13} style={{ position: "absolute", left: 11, top: "50%", transform: "translateY(-50%)", color: C.dim }} />
            <input
              value={search} onChange={e => setSearch(e.target.value)}
              placeholder="SEARCH INSTRUMENTS..."
              style={{
                width: "100%", background: C.bg3, border: `1px solid ${C.border2}`, borderRadius: 4,
                color: C.muted, fontSize: 10, fontWeight: 700, letterSpacing: "0.08em",
                padding: "8px 10px 8px 30px", outline: "none", fontFamily: "inherit"
              }}
            />
          </div>
        </div>

        {/* Instrument List */}
        <div className="asset-scroll" style={{ flex: 1, overflowY: "auto" }}>
          {filtered.length === 0 && (
            <div style={{ padding: "32px 16px", textAlign: "center", color: C.dim, fontSize: 10, fontWeight: 700, letterSpacing: "0.08em", lineHeight: 1.8 }}>
              {search ? "NO MATCH" : "NO CONFIRMED ENTRIES THIS MONTH"}
              {!search && <div style={{ fontSize: 9, fontWeight: 500, marginTop: 6, color: C.muted2 }}>A signal appears here once its entry is actually taken. The list clears on the 1st.</div>}
            </div>
          )}
          {filtered.map(card => {
            // Identity is the SIGNAL id — two rows can share a pair, and keying on the symbol made
            // both highlight at once and gave React duplicate keys.
            const isActive = card.id === selectedId;
            return (
              <div
                key={card.id}
                className="inst-card"
                onClick={() => setSelectedId(card.id ?? "")}
                style={{
                  padding: "14px 16px",
                  borderBottom: `1px solid ${C.border}`,
                  background: isActive ? C.activeBg : "transparent",
                  borderRight: isActive ? "3px solid #7c3aed" : "3px solid transparent",
                  transition: "all 0.15s",
                }}
              >
                {/* Row 1: Symbol + Category badge (sidebar stays a clean pair list) */}
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                  <span style={{ fontSize: 10, fontWeight: 700, color: isActive ? "#7c6ff7" : C.muted, letterSpacing: "0.04em" }}>
                    {card.symbol}
                  </span>
                  {card.state && (() => {
                    // Three states, no outcome. CLOSED says the trade finished; it deliberately
                    // does NOT say won or lost — there is no entry logic, so that would be invented.
                    const S = {
                      watching: { text: "WATCHING FOR ENTRY", c: "#fbbf24" },
                      live:     { text: "IN PROGRESS",        c: "#34d399" },
                      closed:   { text: "CLOSED",             c: "#8b8b94" },
                    }[card.state];
                    return (
                      <span style={{
                        fontSize: 8, fontWeight: 700, letterSpacing: "0.1em", padding: "2px 6px",
                        borderRadius: 3, whiteSpace: "nowrap",
                        color: S.c, background: `${S.c}18`, border: `1px solid ${S.c}40`,
                      }}>{S.text}</span>
                    );
                  })()}
                  {/* No PENDING branch any more — every row here has a confirmed entry, so the
                      badge could only ever read the asset class. */}
                  {sidebarWidth >= 200 && (
                    <span style={{ fontSize: 8, fontWeight: 700, color: C.dim, letterSpacing: "0.08em",
                      background: C.bg3, border: `1px solid ${C.border2}`, borderRadius: 3, padding: "2px 6px" }}>
                      {card.category.toUpperCase()}
                    </span>
                  )}
                </div>

                {/* Row 1b: when it was recorded + which strategy produced it. Both were asked for
                    explicitly; both come straight off the row (created_at, strategy). */}
                {/* Fixed colours, NOT the C.muted2 / C.dim tokens. On the dark palette those are
                    #3a5470 and #2d4a63 — 2.46:1 and 2.09:1 on this background, which is why the
                    timestamp and strategy were on screen but unreadable. These measure 8.97:1 and
                    9.41:1. Size also up from 8px to 10px; 8px uppercase with tracking is
                    unreadable whatever colour it is. */}
                {(card.createdAt || card.strategy) && (
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center",
                                marginBottom: 8, fontSize: 10, fontWeight: 700, letterSpacing: "0.05em" }}>
                    {/* BOTH: relative answers "how fresh", absolute answers "which candle" — a
                        signal you are checking against a chart needs the second. The absolute is a
                        step dimmer so the pair reads as one field, not two competing ones, but it
                        is still 6.6:1, well clear of AA. */}
                    <span style={{ display: "flex", alignItems: "baseline", gap: 5 }}>
                      <span style={{ color: "#9fb3c8" }}>{timeAgo(card.createdAt)}</span>
                      {/* NAME THE TIMEZONE. This rendered via toLocaleString with no label, so it
                          showed the BROWSER's zone while the Telegram card stamps UTC — the same
                          signal carried two different clock times and neither said which. Checking
                          one against a UTC+3 chart then lands three hours from the candle that
                          produced it, which is exactly how a correct SELL came to be read off a
                          green candle. `timeZoneName: short` renders e.g. "GMT+3". */}
                      {card.createdAt && (
                        <span style={{ color: "#6f849b", fontWeight: 600 }}>
                          {new Date(card.createdAt).toLocaleString(undefined, {
                            month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
                            hour12: false, timeZoneName: "short",
                          })}
                        </span>
                      )}
                    </span>
                    {card.strategy && (
                      <span style={{ color: "#c3a8f5", textTransform: "uppercase" }}>{card.strategy}</span>
                    )}
                  </div>
                )}

                {/* Row 2: Arrow + Price + Change % */}
                {(() => {
                  const tp = tickerPrices[card.symbol];
                  const chg = tp?.changePercent;
                  // Tick direction — used ONLY by TickingPrice for the price-flash colour. It is a
                  // different fact from the signal's side and must not be confused with it again.
                  const dir = tp?.direction ?? "flat";
                  // THE ARROW IS THE SIGNAL'S SIDE, not the tick direction. It used to read
                  // tickerPrices[...].direction — live price movement — which defaults to "flat"
                  // when no tick has arrived, so every row rendered the same grey up-triangle
                  // regardless of whether the signal was a buy or a sell. These rows exist because
                  // a signal exists; its side is the fact worth showing.
                  const side = String(card.direction ?? "").toLowerCase();
                  const isSell = side === "sell" || side === "short";
                  const isBuy  = side === "buy"  || side === "long";
                  const col    = isSell ? "#f4617f" : isBuy ? "#22d3a5" : C.dim;
                  return (
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <div style={{
                          width: 26, height: 26, borderRadius: 4,
                          background: isSell ? "rgba(244,97,127,0.14)" : isBuy ? "rgba(34,211,165,0.14)" : "rgba(255,255,255,0.04)",
                          display: "flex", alignItems: "center", justifyContent: "center"
                        }}>
                          <svg width="12" height="12" viewBox="0 0 12 12" fill={col}>
                            {isSell
                              ? <polygon points="6,11 11,2 1,2" />
                              : <polygon points="6,1 11,10 1,10" />}
                          </svg>
                        </div>
                        <TickingPrice
                          price={tp?.price ?? null}
                          prevPrice={tp?.prevPrice ?? null}
                          direction={dir}
                          fontSize={11}
                        />
                      </div>
                      {chg != null && sidebarWidth >= 200 && (
                        <span style={{ fontSize: 10, fontWeight: 700,
                          color: chg >= 0 ? "#22d3a5" : "#f4617f", letterSpacing: "0.04em" }}>
                          {chg >= 0 ? "+" : ""}{chg.toFixed(2)}%
                        </span>
                      )}
                    </div>
                  );
                })()}
              </div>
            );
          })}
        </div>
      </div>

      </div>

      {/* ── Mobile Instruments FAB ── */}
      <button
        className="mob-instruments-fab"
        onClick={() => setMobileShowSidebar(true)}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/>
          <line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/>
        </svg>
        MARKETS
      </button>

      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}
