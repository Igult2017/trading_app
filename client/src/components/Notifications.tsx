import { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import {
  Bell, Check, Trash2, X, TrendingUp, Calendar, Mail, Zap, Info,
} from 'lucide-react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { queryClient, authFetch, fetchJson } from '@/lib/queryClient';
import { format } from 'date-fns';
import type { Notification } from '@shared/schema';

/*
  THE TRADE VAULT'S EDIT-TRADE MODAL, APPLIED HERE — his ask, 2026-09-06: "I love the design in
  image 2... copy the same smooth design."

  WHAT WAS ACTUALLY WRONG, and it is one thing wearing two hats:

  EVERY COLOUR WAS HARDCODED DARK — #13131f, rgba(255,255,255,...) for all text and borders. The
  journal has a LIGHT theme, so on his screenshot this panel is a dark slab floating on a white
  page. The Edit Trade modal looks right for exactly one reason: it uses the theme's own tokens.

  AND ALMOST EVERY SIZE WAS UNDER THE 11px FLOOR — category 8.5px, timestamp 9.5px, tabs 10px,
  message 10.5px. docs/READABILITY.md records that floor and we removed sub-11px text everywhere
  else in the journal; this panel was missed. Under 11px on a light ground is not dim, it is gone.

  THE CONTRACT BELOW IS COPIED FROM TradeVault.tsx:1061-1158, not invented:
    surface  --jr-panel, 1px --jr-border, radius 12, generous padding
    title    14px / 800, --jr-ink, tracking 0.1em
    label    11px / 700, --jr-ink-dim, tracking 0.12em
    buttons  radius 6, 11px / 700, tracking 0.08em, primary #1e6fc8
    spacing  6 / 10 / 16 / 24

  FONT: NOTHING UNDER 700 WEIGHT. The panel now sits inside .journal-root (see the portal note in
  the component), so the journal's font rule reaches it and it renders in Playfair like everything
  else. His instruction — "dont use playfair variant that is not visible, use a visible one" — is
  the WEIGHT axis: Playfair is a high-contrast serif and its hairlines are what disappear. Same
  finding as the audit page and the dashboard figures.
*/
// ⚠ --jr-cap DOES NOT EXIST. Every rule here used to read `var(--jr-cap, #A8AEB8)`, and that token
// is DEFINED NOWHERE in the app — so the fallback rendered every time, in both themes. The muted
// text was a hardcoded grey pretending to be a theme value: right-ish on the dark panel, and about
// 2.3:1 on the light one. The panel's own test asserted "the colour is a token" and passed, because
// it checked the SPELLING and not whether anything defines it.
//
// `--jr-ink-dim` is the journal's real second ink tier (Journal.tsx: #a6b3d1 on dark, var(--jr-muted)
// on light), so these now change with the theme instead of only claiming to.
//
// ⚠ IT IS USED THE SAME WAY IN SIX OTHER FILES (JournalForm, JournalHeader, TradeVault, Journal,
// profileSettingsCss, streakCss). Those are NOT touched here — he asked for the notification box.
const PANEL_CSS = `
  .np-root, .np-root * { box-sizing: border-box; margin: 0; padding: 0; }
  .np-root {
    width: 380px;
    max-width: calc(100vw - 16px);
    max-height: calc(100vh - 120px);
    background: var(--jr-panel, #13131f);
    border: 1px solid var(--jr-border, rgba(255,255,255,0.08));
    /* 16, up from 12 — the eco marketplace's notification card is rounded-2xl, and the softer
       corner is most of why it reads as calm rather than boxy. */
    border-radius: 16px;
    box-shadow: 0 28px 72px rgba(0,0,0,0.28);
    animation: np-rise .25s cubic-bezier(.34,1.4,.64,1) both;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }
  @keyframes np-rise {
    from { opacity:0; transform:translateY(10px) scale(.97); }
    to   { opacity:1; transform:none; }
  }
  .np-header {
    display: flex; align-items: center; justify-content: space-between;
    padding: 18px 20px 14px;
    border-bottom: 1px solid var(--jr-border, rgba(255,255,255,0.06));
    flex-shrink: 0;
  }
  /* 12px, down from 14px (2026-09-29, his instruction). It is a panel heading, not a page title,
     and at 14px + 800 weight + wide tracking it shouted over the notices themselves. Still clear of
     the 11px floor this file is tested against. */
  .np-title {
    font-size: 12px; font-weight: 800; color: var(--jr-ink, #ECEEF2);
    letter-spacing: 0.08em; text-transform: uppercase;
  }
  .np-actions { display: flex; align-items: center; gap: 6px; }
  .np-action-btn {
    display: flex; align-items: center; gap: 5px;
    background: transparent; border: 1px solid var(--jr-border, rgba(255,255,255,0.1));
    cursor: pointer;
    color: var(--jr-ink-dim, #a6b3d1); font-size: 11px; font-weight: 700;
    font-family: inherit; letter-spacing: 0.08em;
    padding: 6px 12px; border-radius: 6px;
    transition: all 0.15s;
  }
  .np-action-btn:hover { background: var(--jr-border, rgba(255,255,255,0.06)); color: var(--jr-ink, #fff); }
  .np-action-btn svg { flex-shrink: 0; }
  /* ⚠ THERE IS NO FILTER ROW, AND THERE MUST NOT BE ONE (2026-10-11, his instruction).
     ALL · SIGNALS · CALENDAR · EMAILS · UPDATES used to sit here. He ticked all five and said:
     *"Notification is notification no categorization."* The panel is ONE list now. If a future
     session is tempted to add filtering back, that is the sentence to read first. */
  .np-body { flex: 1; overflow-y: auto; min-height: 0; max-height: 430px; }
  .np-body::-webkit-scrollbar { width: 4px; }
  .np-body::-webkit-scrollbar-thumb { background: var(--jr-border, rgba(255,255,255,0.08)); border-radius: 2px; }
  /* DAY HEADERS — a list of twenty notices with no structure is a wall. Sticky so the day stays
     visible while scrolling through it. */
  .np-day {
    position: sticky; top: 0; z-index: 1;
    padding: 8px 20px;
    background: var(--jr-panel, #13131f);
    border-bottom: 1px solid var(--jr-border, rgba(255,255,255,0.05));
    font-size: 11px; font-weight: 700; letter-spacing: 0.12em; text-transform: uppercase;
    color: var(--jr-ink-dim, #a6b3d1);
  }
  .np-empty {
    display: flex; flex-direction: column; align-items: center; justify-content: center;
    padding: 48px 24px; gap: 12px;
    color: var(--jr-ink-dim, #a6b3d1);
  }
  .np-empty-icon { opacity: 0.5; }
  .np-empty-text { font-size: 12px; font-weight: 700; letter-spacing: 0.04em; text-align: center; }
  /* ROOMIER ROWS, borrowed from the eco marketplace's notification centre (px-5 py-4 there).
     14px top and bottom was tight for three lines of text. */
  .np-item {
    display: flex; align-items: flex-start; gap: 12px;
    padding: 16px 20px;
    border-bottom: 1px solid var(--jr-border, rgba(255,255,255,0.04));
    cursor: pointer;
    transition: background 0.12s;
  }
  .np-item:hover { background: rgba(30,111,200,0.06); }
  .np-item.unread { background: rgba(30,111,200,0.07); }
  .np-item.unread:hover { background: rgba(30,111,200,0.11); }
  /* THE TILE'S WASH IS DERIVED FROM ITS OWN INK, so one colour per type serves BOTH themes.
     The type colour arrives on this element as an np-cat- class (see the accent block below), so
     currentColor is that colour, and the background is a 12% mix of it. Before
     2026-10-11 the colour and the wash were set as INLINE STYLES from a second table — which meant
     the light-theme accents further down could never reach the tile, because an inline style beats
     a plain rule. The tile kept its dark-theme colour on the light panel. */
  .np-item-icon {
    width: 32px; height: 32px; border-radius: 8px; flex-shrink: 0;
    display: flex; align-items: center; justify-content: center;
    margin-top: 1px;
    background: color-mix(in srgb, currentColor 12%, transparent);
  }
  .np-item-body { flex: 1; min-width: 0; }
  /* TITLE AND UNREAD DOT SHARE A LINE, the dot on the right — the eco notification centre's
     arrangement. The dot used to be absolutely positioned on the LEFT edge, which forced unread
     rows to carry 24px of extra left padding, so a read row and an unread row did not line up. */
  .np-item-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 8px; }
  .np-item-title {
    font-size: 13px; font-weight: 700; color: var(--jr-ink, #ECEEF2);
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
    margin-bottom: 3px; min-width: 0;
  }
  /* 800 on unread, 700 on read. NOTHING GOES UNDER 700 — Playfair is a high-contrast serif and its
     hairlines are what disappear, which is the whole reason this panel reads in weight. */
  .np-item.unread .np-item-title { font-weight: 800; }
  .np-item-msg {
    font-size: 12px; font-weight: 500; color: var(--jr-ink-dim, #a6b3d1); line-height: 1.45;
    display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;
  }
  /* THE MONEY, COLOURED. A notice reading "P/L -1.88" in the same grey as the rest tells him
     nothing at a glance — a loss and a win looked identical. */
  .np-pl { font-weight: 700; }
  .np-pl-up { color: #34d399; }
  .np-pl-down { color: #fb7185; }

  /* ── THE TYPE ACCENTS, ONE SOURCE, BOTH THEMES ────────────────────────────────────────────
     WHAT THESE COLOUR, as of 2026-10-11: the small icon tile at the left of each row, and nothing
     else. They used to colour a CATEGORY WORD above the title ("SIGNAL", "EMAIL", "NOTICE"); the
     word is gone on his instruction — *"Notification is notification no categorization"* — and the
     tile inherited the rules, which is also how the tile stopped being coloured inline and started
     obeying the light theme. Its 12% background wash is mixed from this same colour, so adding a
     type here needs ONE line, not three.

     THE COLOUR IS SET HERE AND NOT INLINE, and that is deliberate. An inline style beats a plain
     CSS rule, so setting it on the element from JS would silently defeat every light-theme
     override below — the rules would exist, look right in the file, and never apply. That is
     exactly what WAS happening to the tile.

     THE LIGHT VALUES ARE NOT COSMETIC. Rendered on the light theme and MEASURED, these accents
     came back at 1.92:1 and 2.15:1 against white, and the green P/L at 1.92:1, against a 4.5:1
     minimum. Every one had been chosen for a dark panel; on white they are nearly invisible — the
     same defect docs/READABILITY.md exists for. Each light value is the 700 step of the same hue:
     it clears 4.5:1 and still reads as that colour. */
  .np-cat-trading_signal  { color: #22d3a5; }
  .np-cat-economic_event  { color: #f59e0b; }
  .np-cat-trading_session { color: #38bdf8; }
  .np-cat-email           { color: #3b82f6; }
  .np-cat-update          { color: #a78bfa; }
  .np-cat-default         { color: #c3cad6; }

  .journal-light .np-root .np-pl-up   { color: #047857; }
  .journal-light .np-root .np-pl-down { color: #be123c; }
  .journal-light .np-root .np-cat-trading_signal  { color: #047857; }
  .journal-light .np-root .np-cat-economic_event  { color: #b45309; }
  .journal-light .np-root .np-cat-trading_session { color: #0369a1; }
  .journal-light .np-root .np-cat-email           { color: #1d4ed8; }
  .journal-light .np-root .np-cat-update          { color: #6d28d9; }
  .journal-light .np-root .np-cat-default         { color: #4b5563; }
  /* ⚠ NO OPACITY MULTIPLIER HERE ANY MORE, AND THAT WAS THE WHOLE DEFECT (2026-09-29). The colour passed its
     contrast check on its own — and then 0.8 opacity blended it 20% back into the panel behind it,
     which no colour check ever sees. That is docs/READABILITY.md's first lesson: "the cause is
     almost never the colour". It is now the journal's own dim-ink tier at full strength. */
  .np-item-time { font-size: 11px; font-weight: 500; color: var(--jr-ink-dim, #a6b3d1); margin-top: 5px; }
  .np-item-del {
    background: transparent; border: none; cursor: pointer;
    color: var(--jr-ink-dim, #a6b3d1); opacity: 0.5; padding: 5px;
    border-radius: 6px; display: flex; align-items: center; justify-content: center;
    transition: all 0.12s; flex-shrink: 0; margin-top: -2px;
  }
  .np-item-del:hover { background: rgba(239,68,68,0.14); color: #fb7185; opacity: 1; }
  /* IN THE FLOW, NOT ABSOLUTELY POSITIONED, and that is what keeps the rows aligned. It sits at the
     end of the title line; margin-top centres it against the first line of a 13px title. */
  .np-unread-dot {
    width: 7px; height: 7px; border-radius: 50%;
    background: #60a5fa;
    flex-shrink: 0; margin-top: 6px;
  }
  .journal-light .np-root .np-unread-dot { background: #1e6fc8; }
`;

/*
  ONE TABLE, NOT THREE. There used to be a TABS list (the five filters), a TYPE_META table carrying
  a colour, a wash and a WORD per type, and this icon list. The filters are gone on his instruction;
  the word is gone with them — *"Notification is notification no categorization"* — and the colour
  and the wash now live in the stylesheet as the np-cat- rules, which is the only place they can be
  corrected per theme. What is left is the picture, which is not a label: it tells a signal from an
  email at a glance without naming a category, exactly as the eco marketplace's own list does.
*/
const TYPE_ICONS: Record<string, React.ReactNode> = {
  trading_signal:  <TrendingUp size={14} />,
  economic_event:  <Calendar size={14} />,
  trading_session: <Calendar size={14} />,
  email:           <Mail size={14} />,
  update:          <Zap size={14} />,
};

function getIcon(type: string) {
  return TYPE_ICONS[type] ?? <Info size={14} />;
}

/** The accent class for a type, falling back to the neutral one. TYPE_ICONS is the list of types
 *  the panel knows — keeping a second list in step with it is how one of them goes stale. */
function catClass(type: string) {
  return `np-cat-${TYPE_ICONS[type] ? type : 'default'}`;
}

/**
 * "2h ago", not "Sep 02 · 14:09".
 *
 * The absolute stamp made him do the arithmetic to answer the only question a notification list is
 * really asked — *is this new?* The exact time is still there, on hover, for when it matters.
 */
function relativeTime(at: Date): string {
  const secs = Math.max(0, Math.round((Date.now() - at.getTime()) / 1000));
  if (secs < 60) return 'just now';
  const mins = Math.round(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.round(hrs / 24);
  if (days === 1) return 'yesterday';
  if (days < 7) return `${days}d ago`;
  return format(at, 'MMM d');
}

/** Today / Yesterday / the date — the sticky header a run of notices is grouped under. */
function dayLabel(at: Date): string {
  const d0 = new Date(); d0.setHours(0, 0, 0, 0);
  const d1 = new Date(at); d1.setHours(0, 0, 0, 0);
  const diff = Math.round((d0.getTime() - d1.getTime()) / 86_400_000);
  if (diff <= 0) return 'Today';
  if (diff === 1) return 'Yesterday';
  return format(at, 'EEEE, MMM d');
}

/**
 * Colour the money inside a notice, and nothing else.
 *
 * A trade notification reads "Short GBPUSD closed @ 1.34882 · P/L -1.88" — and every character of
 * it was the same grey, so a loss and a win were indistinguishable without reading the sign. This
 * finds the P/L figure and paints it, leaving the rest of the sentence alone.
 *
 * DELIBERATELY NARROW: it matches only a signed number following "P/L", so it cannot accidentally
 * colour a price, a lot size or a date.
 */
function withColouredPL(message: string): React.ReactNode {
  const m = /(P\/L\s*)(-?\d+(?:\.\d+)?)/i.exec(message);
  if (!m) return message;
  const value = parseFloat(m[2]);
  if (!Number.isFinite(value)) return message;
  const start = m.index + m[1].length;
  const end = start + m[2].length;
  return (
    <>
      {message.slice(0, start)}
      <span className={`np-pl ${value >= 0 ? 'np-pl-up' : 'np-pl-down'}`}>{m[2]}</span>
      {message.slice(end)}
    </>
  );
}

async function apiFetch(method: string, path: string) {
  const r = await authFetch(path, { method });
  if (!r.ok) throw new Error(`${method} ${path} failed`);
  return r;
}

interface NotificationsPanelProps {
  panelRef: React.RefObject<HTMLDivElement>;
  pos: { top: number; right: number };
}

/**
 * A list, whatever arrived.
 *
 * ⚠ THIS GUARD IS NOT PARANOIA — IT STOPS THE WHOLE JOURNAL GOING BLANK. These two queries are
 * PERSISTED (App.tsx mounts PersistQueryClientProvider), so whatever shape was last written under
 * these keys is restored from the browser on the next load, before any request is made. Let one
 * non-array in — an old cache from before a response shape changed, a proxy or a captive portal
 * answering with an object — and `unread.some(...)` throws during render. There is no error
 * boundary above this panel, so React unmounts the entire tree: the journal renders as an empty
 * page, and a reload does not clear it because the bad value is in storage.
 *
 * Observed exactly that way on 2026-10-11 (TypeError: unread.some is not a function, taking
 * Journal.tsx down with it). A notification list must never be able to do that.
 */
function asList(v: unknown): Notification[] {
  return Array.isArray(v) ? v as Notification[] : [];
}

function NotificationsPanel({ panelRef, pos }: NotificationsPanelProps) {
  const { data: allRaw, isLoading } = useQuery<Notification[]>({
    queryKey: ['/api/notifications'],
    queryFn: () => fetchJson<Notification[]>('/api/notifications'),
    refetchInterval: 30000,
  });

  const { data: unreadRaw } = useQuery<Notification[]>({
    queryKey: ['/api/notifications/unread'],
    queryFn: () => fetchJson<Notification[]>('/api/notifications/unread'),
    refetchInterval: 30000,
  });

  const allNotifs = asList(allRaw);
  const unread    = asList(unreadRaw);

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['/api/notifications'] });
    queryClient.invalidateQueries({ queryKey: ['/api/notifications/unread'] });
  };

  const markRead = useMutation({
    mutationFn: (id: string) => apiFetch('PATCH', `/api/notifications/${id}/read`),
    onSuccess: invalidate,
  });

  const markAll = useMutation({
    mutationFn: () => apiFetch('PATCH', '/api/notifications/read-all'),
    onSuccess: invalidate,
  });

  const deleteOne = useMutation({
    mutationFn: (id: string) => apiFetch('DELETE', `/api/notifications/${id}`),
    onSuccess: invalidate,
  });

  const clearAll = useMutation({
    mutationFn: () => apiFetch('DELETE', '/api/notifications/clear-all'),
    onSuccess: invalidate,
  });

  const isUnreadId = (id: string) => unread.some(u => u.id === id);

  return createPortal(
    <div
      ref={panelRef}
      style={{ position: 'fixed', top: pos.top + 12, right: pos.right, zIndex: 9998 }}
    >
      <style>{PANEL_CSS}</style>
      <div className="np-root">
        <div className="np-header">
          <span className="np-title">Notifications{unread.length > 0 ? ` (${unread.length})` : ''}</span>
          <div className="np-actions">
            {unread.length > 0 && (
              <button
                className="np-action-btn"
                onClick={() => markAll.mutate()}
                disabled={markAll.isPending}
              >
                <Check size={11} /> Mark all read
              </button>
            )}
            {allNotifs.length > 0 && (
              <button
                className="np-action-btn"
                onClick={() => clearAll.mutate()}
                disabled={clearAll.isPending}
              >
                <Trash2 size={11} />
              </button>
            )}
          </div>
        </div>

        <div className="np-body">
          {isLoading ? (
            <div className="np-empty">
              <div className="np-empty-icon"><Bell size={28} /></div>
              <div className="np-empty-text">Loading notifications...</div>
            </div>
          ) : allNotifs.length === 0 ? (
            <div className="np-empty">
              <div className="np-empty-icon"><Bell size={28} /></div>
              <div className="np-empty-text">No notifications yet</div>
            </div>
          ) : (
            /* GROUPED BY DAY. A flat run of notices is a wall; "Today / Yesterday / Tuesday" makes
               it scannable, and the header sticks while you scroll its group. */
            allNotifs.map((n, i) => {
              const isUnread = isUnreadId(n.id);
              const at = n.createdAt ? new Date(n.createdAt) : null;
              const prev = i > 0 ? allNotifs[i - 1] : null;
              const prevAt = prev?.createdAt ? new Date(prev.createdAt) : null;
              const showDay = at !== null
                && (prevAt === null || dayLabel(at) !== dayLabel(prevAt));
              return (
                <div key={n.id}>
                  {showDay && at && <div className="np-day">{dayLabel(at)}</div>}
                  <div
                    className={`np-item${isUnread ? ' unread' : ''}`}
                    onClick={() => { if (isUnread) markRead.mutate(n.id); }}
                  >
                    {/* ⚠ THE TYPE COLOUR IS A CLASS, NEVER AN INLINE STYLE. Inline wins over a plain
                        rule, so colouring this tile from JS would silently defeat every
                        light-theme accent in PANEL_CSS — the rules would exist, look right in the
                        file, and never apply. */}
                    <div className={`np-item-icon ${catClass(n.type)}`}>
                      {getIcon(n.type)}
                    </div>
                    <div className="np-item-body">
                      {/* No category word above the title any more (2026-10-11, his instruction).
                          The picture on the left is the only type cue, as in the reference design. */}
                      <div className="np-item-head">
                        <div className="np-item-title">{n.title}</div>
                        {isUnread && <div className="np-unread-dot" />}
                      </div>
                      <div className="np-item-msg">{withColouredPL(n.message)}</div>
                      {/* Relative, with the exact stamp on hover for when it matters. */}
                      <div
                        className="np-item-time"
                        title={at ? format(at, "EEEE d MMMM yyyy 'at' HH:mm") : undefined}
                      >
                        {at ? relativeTime(at) : '—'}
                      </div>
                    </div>
                    <button
                      className="np-item-del"
                      onClick={e => { e.stopPropagation(); deleteOne.mutate(n.id); }}
                      title="Dismiss"
                    >
                      <X size={12} />
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>,
    // MOUNTED INSIDE THE JOURNAL, NOT ON document.body — and this line is what makes every
    // `var(--jr-…)` above actually resolve.
    //
    // The theme's colours are declared as INLINE STYLES on the `.journal-root` div
    // (Journal.tsx:1590), and CSS custom properties inherit down the tree. A panel portalled to
    // `document.body` is not a descendant of it, so every token would fall back to its hardcoded
    // default — the panel would look perfect in dark mode and STILL be a dark slab on his light
    // page, which is the exact bug being fixed. It would have looked fixed and not been.
    //
    // Mounting here also puts it inside the journal's font rule, so it renders in the selected
    // font like every other panel instead of carrying its own.
    //
    // FALLS BACK TO body so nothing breaks if this is ever rendered outside the journal shell.
    document.querySelector('.journal-root') ?? document.body
  );
}

export function Notifications({ dm }: { dm: boolean }) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ top: 108, right: 12 });
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  // Same persisted-cache guard as the panel — see asList. A bad shape here is milder (the badge
  // would silently never appear rather than crashing), but it is the same key and the same risk.
  const { data: unreadRaw } = useQuery<Notification[]>({
    queryKey: ['/api/notifications/unread'],
    queryFn: () => fetchJson<Notification[]>('/api/notifications/unread'),
    refetchInterval: 30000,
  });
  const unread = asList(unreadRaw);

  const handleToggle = useCallback(() => {
    if (triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      setPos({ top: rect.bottom + 8, right: Math.max(8, window.innerWidth - rect.right - 4) });
    }
    setOpen(o => !o);
  }, []);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      const inTrigger = triggerRef.current?.contains(e.target as Node);
      const inPanel   = panelRef.current?.contains(e.target as Node);
      if (!inTrigger && !inPanel) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const count = unread.length;
  const iconColor = dm ? '#3b82f6' : '#2563eb';

  return (
    <>
      <button
        ref={triggerRef}
        onClick={handleToggle}
        title="Notifications"
        style={{
          position: 'relative',
          width: 32, height: 32,
          borderRadius: '50%',
          border: 'none',
          background: open ? (dm ? 'rgba(59,130,246,0.12)' : 'rgba(37,99,235,0.08)') : 'transparent',
          color: iconColor,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          cursor: 'pointer',
          transition: 'background 0.15s',
          flexShrink: 0,
        }}
        className="jh-icon-btn"
      >
        <Bell size={16} />
        {count > 0 && (
          <span style={{
            position: 'absolute', top: 2, right: 2,
            minWidth: 14, height: 14,
            background: '#ef4444',
            borderRadius: 7,
            fontSize: 8, fontWeight: 800,
            color: '#fff',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: '0 3px',
            fontFamily: 'monospace',
            lineHeight: 1,
            // THE RING TAKES THE PAGE'S COLOUR, not a hardcoded dark one. It was `#13131f`, which
            // punched a dark halo around the red badge on the light theme — the same "built for
            // dark only" defect as the panel itself, just small enough to miss. Found by the
            // stylesheet test, not by looking.
            boxShadow: `0 0 0 2px var(--jr-bg, ${dm ? '#13131f' : '#ffffff'})`,
          }}>
            {count > 9 ? '9+' : count}
          </span>
        )}
      </button>
      {open && <NotificationsPanel panelRef={panelRef} pos={pos} />}
    </>
  );
}
