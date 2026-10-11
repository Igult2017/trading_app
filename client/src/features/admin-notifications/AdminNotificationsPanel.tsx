import React from 'react';
import { createPortal } from 'react-dom';
import { format } from 'date-fns';
import {
  Bell, X, Check, Trash2, UserPlus, Megaphone,
  AlertTriangle, MessageSquare, Info, Shield,
} from 'lucide-react';
import type { AdminNotifCategory } from './types';
import type { useAdminNotifications } from './useAdminNotifications';

type Hook = ReturnType<typeof useAdminNotifications>;

/*
  THE ADMIN NOTIFICATION CARD — rebuilt 2026-10-11 on his instruction.

  TWO THINGS WERE WRONG, and the second one he could see on screen.

  1. IT CATEGORISED. A filter row read ALL · MESSAGES · ALERTS, and every row carried a category
     word above its title. He ticked the equivalent row on the journal card and said:
     *"Notification is notification no categorization."* There is ONE list now, and no word. The
     small coloured icon stays — a picture is not a label, and it tells a message from an alert at
     a glance.

  2. IT WAS A BLACK SLAB ON A WHITE PAGE. Every colour here was hardcoded for a dark panel
     (background #07090e, border #131c28, text as rgba(255,255,255,...)) while the admin panel
     DEFAULTS TO LIGHT (AdminPanel.tsx:115, page background #f5f7fa). Same defect the journal
     card had fixed on 2026-09-06, in a different file.

     THE FIX COSTS NOTHING AND COVERS ALL FIVE PALETTES. applyAdminTheme writes every --admin-*
     variable onto document.documentElement (AdminPanel.tsx:166) — the html element — so this
     panel already inherited them through its portal to document.body. It simply never used one.
     Light, dark, midnight, slate and forest all come right from the same rules.

     ⚠ --admin-accent, NEVER --admin-accentL, for anything that is text. The palette's own note
     (AdminPanel.tsx:76-79) records that the bright brand cyan measures 2.03:1 on white.

  AND EVERY SIZE WAS UNDER THE FLOOR. Six of them: category 8px, timestamp 9px, badge 9px, tabs
  10px, header buttons 10px, body 10.5px. docs/READABILITY.md sets 11px as this project's floor,
  measured, and everything here now clears it.

  THE SHAPE is the eco marketplace's notification centre, the same reference the journal card
  follows: a soft 16px corner, roomy rows, hairline separators, the unread dot on the title line
  rather than pushing the row sideways, and a bolder title when unread.
*/
const PANEL_STYLES = `
  .anp-root, .anp-root * { box-sizing: border-box; margin: 0; padding: 0; }
  .anp-root {
    font-family: 'Playfair Display Variable', 'Playfair Display', Georgia, serif;
    width: 400px;
    max-width: calc(100vw - 16px);
    max-height: calc(100vh - 80px);
    background: var(--admin-card, #0c1018);
    border: 1px solid var(--admin-border, #131c28);
    border-radius: 16px;
    /* Was 0 32px 80px rgba(0,0,0,0.8) — a shadow drawn for a black page, which on the light
       palette reads as a bruise under the card. */
    box-shadow: 0 24px 64px rgba(16,24,40,0.18);
    animation: anp-rise .22s cubic-bezier(.34,1.4,.64,1) both;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }
  @keyframes anp-rise {
    from { opacity:0; transform:translateY(8px) scale(.98); }
    to { opacity:1; transform:none; }
  }
  /* ⚠ THREE BUTTONS AND A TITLE IN 400px. This header carries a CLOSE button the journal's does
     not, and at 400px that is enough to overflow: measured on the light palette, "Mark all read"
     wrapped onto two lines and sat on top of the title. The three rules that hold it:
     nowrap on the buttons so the label cannot break mid-phrase, min-width:0 plus ellipsis on the
     title so the TITLE is what gives way when space runs out, and a real gap between them. */
  .anp-header {
    display:flex; align-items:center; justify-content:space-between; gap:10px;
    padding:16px 18px 13px;
    border-bottom:1px solid var(--admin-border, #131c28); flex-shrink:0;
  }
  .anp-title {
    font-size:12px; font-weight:800; color:var(--admin-text, #e8f0fb);
    letter-spacing:0.08em; text-transform:uppercase;
    display:flex; align-items:center; gap:7px;
    min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;
  }
  .anp-title svg { flex-shrink:0; }
  .anp-header-actions { display:flex; align-items:center; gap:6px; flex-shrink:0; }
  .anp-hbtn {
    background:transparent; border:1px solid var(--admin-border, #131c28); cursor:pointer;
    color:var(--admin-muted, #9db5d1); font-size:11px; font-weight:700; font-family:inherit;
    letter-spacing:0.06em; padding:6px 10px; border-radius:6px; white-space:nowrap;
    display:flex; align-items:center; gap:5px; transition:all 0.15s;
  }
  .anp-hbtn:hover { background:var(--admin-accentSoft, rgba(0,200,224,0.10)); color:var(--admin-text, #e8f0fb); }
  .anp-hbtn svg { flex-shrink:0; }

  /* ⚠ THERE IS NO FILTER ROW, AND THERE MUST NOT BE ONE (2026-10-11, his instruction).
     ALL · MESSAGES · ALERTS used to sit here. If a future session is tempted to put filtering
     back, read his sentence at the top of this file first. */
  .anp-body { flex:1; overflow-y:auto; min-height:0; max-height:460px; }
  .anp-body::-webkit-scrollbar { width:4px; }
  .anp-body::-webkit-scrollbar-thumb { background:var(--admin-border, #131c28); border-radius:2px; }

  .anp-empty {
    display:flex; flex-direction:column; align-items:center; justify-content:center;
    padding:52px 24px; gap:12px; color:var(--admin-muted, #9db5d1);
  }
  .anp-empty-icon { opacity:0.5; }
  .anp-empty-text { font-size:12px; font-weight:700; letter-spacing:0.04em; }

  .anp-item {
    display:flex; align-items:flex-start; gap:12px;
    padding:16px 20px;
    border-bottom:1px solid var(--admin-border, #131c28);
    cursor:pointer; transition:background 0.12s;
  }
  .anp-item:hover { background:var(--admin-accentSoft, rgba(0,200,224,0.06)); }
  .anp-item.unread { background:var(--admin-accentSoft, rgba(0,200,224,0.10)); }
  /* THE TILE'S WASH IS MIXED FROM ITS OWN INK, so a category needs ONE line in the accent block
     below rather than a colour, a background and a border in a separate table. */
  .anp-item-icon {
    width:32px; height:32px; border-radius:8px; flex-shrink:0;
    display:flex; align-items:center; justify-content:center; margin-top:1px;
    background: color-mix(in srgb, currentColor 12%, transparent);
  }
  .anp-item-body { flex:1; min-width:0; }
  /* Title and unread dot on one line, the dot at the end. It used to be absolutely positioned on
     the left, which forced unread rows to carry 18px of extra padding — so a read row and an
     unread row did not line up. */
  .anp-item-head { display:flex; align-items:flex-start; justify-content:space-between; gap:8px; }
  .anp-item-title {
    font-size:13px; font-weight:700; color:var(--admin-text, #e8f0fb);
    white-space:nowrap; overflow:hidden; text-overflow:ellipsis; margin-bottom:3px; min-width:0;
  }
  .anp-item.unread .anp-item-title { font-weight:800; }
  .anp-item-body-text {
    font-size:12px; font-weight:500; color:var(--admin-muted, #9db5d1); line-height:1.45;
    display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; overflow:hidden;
  }
  /* 11px and the palette's own muted ink. It was 9px at rgba(255,255,255,0.2) — about 2:1 even on
     the dark palette it was drawn for, and invisible on the light one. */
  .anp-item-time { font-size:11px; font-weight:500; color:var(--admin-muted, #9db5d1); margin-top:5px; }
  .anp-item-del {
    background:transparent; border:none; cursor:pointer;
    color:var(--admin-muted, #9db5d1); opacity:0.5; padding:5px; border-radius:6px;
    display:flex; align-items:center; justify-content:center;
    transition:all 0.12s; flex-shrink:0; margin-top:-2px;
  }
  .anp-item-del:hover { background:rgba(244,63,94,0.14); color:var(--admin-red, #dc2626); opacity:1; }
  .anp-dot {
    width:7px; height:7px; border-radius:50%;
    background:var(--admin-accent, #00c8e0); flex-shrink:0; margin-top:6px;
  }

  /* ── THE CATEGORY ACCENTS ──────────────────────────────────────────────────────────────────
     WHAT THEY COLOUR: the icon tile, and nothing else. There is no category word any more.

     EACH ONE IS THE PALETTE'S OWN SEMANTIC COLOUR, not a hex typed here, and that is what makes
     this work on all five themes at once. The old table held one hardcoded value per category
     (#3b82f6, #f43f5e, #22d3a5, #f59e0b, #a78bfa) — every one of them chosen for a dark panel and
     applied inline, so no theme could correct them. The palette already defines blue, red, green
     and amber at values measured against ITS OWN card: on light they are #1e40af, #b91c1c,
     #046c4e and #92400e; on dark, #2563eb, #dc2626, #0f9d63 and #b45309. Campaign has no token of
     its own, so it takes the brand accent. */
  .anp-cat-message  { color: var(--admin-blue,   #2563eb); }
  .anp-cat-alert    { color: var(--admin-red,    #dc2626); }
  .anp-cat-signup   { color: var(--admin-green,  #0f9d63); }
  .anp-cat-system   { color: var(--admin-amber,  #b45309); }
  .anp-cat-campaign { color: var(--admin-accent, #00c8e0); }
`;

const CATEGORY_ICONS: Record<AdminNotifCategory, React.ReactNode> = {
  message:  <MessageSquare size={14} />,
  signup:   <UserPlus size={14} />,
  campaign: <Megaphone size={14} />,
  system:   <AlertTriangle size={14} />,
  alert:    <Shield size={14} />,
};

interface Props {
  panelRef: React.RefObject<HTMLDivElement>;
  pos: { top: number; right: number };
  hook: Hook;
  onClose: () => void;
}

export function AdminNotificationsPanel({ panelRef, pos, hook, onClose }: Props) {
  const { notifications, loading, markRead, markAllRead, deleteOne, clearAll } = hook;

  const unreadCount = notifications.filter(n => !n.is_read).length;

  return createPortal(
    <div ref={panelRef} style={{ position: 'fixed', top: pos.top + 10, right: pos.right, zIndex: 9999 }}>
      <style>{PANEL_STYLES}</style>
      <div className="anp-root">
        <div className="anp-header">
          <span className="anp-title">
            <Bell size={13} style={{ color: 'var(--admin-accent, #00c8e0)' }} />
            Notifications{unreadCount > 0 ? ` (${unreadCount})` : ''}
          </span>
          <div className="anp-header-actions">
            {unreadCount > 0 && (
              <button className="anp-hbtn" onClick={() => markAllRead()}><Check size={11} /> Mark all read</button>
            )}
            {notifications.length > 0 && (
              <button className="anp-hbtn" onClick={() => clearAll()} title="Clear all"><Trash2 size={11} /></button>
            )}
            <button className="anp-hbtn" onClick={onClose} title="Close"><X size={12} /></button>
          </div>
        </div>

        <div className="anp-body">
          {loading ? (
            <div className="anp-empty">
              <div className="anp-empty-icon"><Bell size={28} /></div>
              <div className="anp-empty-text">Loading notifications...</div>
            </div>
          ) : notifications.length === 0 ? (
            <div className="anp-empty">
              <div className="anp-empty-icon"><Bell size={28} /></div>
              <div className="anp-empty-text">No notifications yet</div>
            </div>
          ) : (
            notifications.map(n => {
              const isUnread = !n.is_read;
              return (
                <div
                  key={n.id}
                  className={`anp-item${isUnread ? ' unread' : ''}`}
                  onClick={() => { if (isUnread) markRead(n.id); }}
                >
                  {/* ⚠ THE CATEGORY COLOUR IS A CLASS, NEVER AN INLINE STYLE. Inline beats a plain
                      rule, so colouring this from JS — as it was — is what stopped any theme from
                      correcting it. */}
                  <div className={`anp-item-icon anp-cat-${n.category}`}>
                    {CATEGORY_ICONS[n.category] ?? <Info size={14} />}
                  </div>
                  <div className="anp-item-body">
                    <div className="anp-item-head">
                      <div className="anp-item-title">{n.title}</div>
                      {isUnread && <div className="anp-dot" />}
                    </div>
                    <div className="anp-item-body-text">{n.body}</div>
                    <div className="anp-item-time">
                      {n.created_at ? format(new Date(n.created_at), 'MMM dd · HH:mm') : '—'}
                    </div>
                  </div>
                  <button
                    className="anp-item-del"
                    onClick={e => { e.stopPropagation(); deleteOne(n.id); }}
                    title="Dismiss"
                  >
                    <X size={12} />
                  </button>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>,
    // document.body is fine HERE, unlike the journal card: the --admin-* variables are set on
    // document.documentElement (AdminPanel.tsx:166), so they inherit all the way down to body.
    document.body,
  );
}
