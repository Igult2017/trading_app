import React, { useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { format } from 'date-fns';
import {
  Bell, Mail, X, Check, Trash2, UserPlus, Megaphone,
  AlertTriangle, MessageSquare, Info, Shield,
} from 'lucide-react';
import type { AdminNotification, AdminNotifCategory } from './types';
import { CATEGORY_META } from './constants';
import type { useAdminNotifications } from './useAdminNotifications';

type Hook = ReturnType<typeof useAdminNotifications>;

const PANEL_STYLES = `
  .anp-root, .anp-root * { box-sizing: border-box; margin: 0; padding: 0; }
  .anp-root {
    font-family: 'DM Mono', 'Montserrat', monospace;
    width: 400px;
    max-width: calc(100vw - 16px);
    max-height: calc(100vh - 80px);
    background: #07090e;
    border: 1px solid #131c28;
    border-radius: 4px;
    box-shadow: 0 32px 80px rgba(0,0,0,0.8), 0 0 0 1px rgba(255,255,255,0.03);
    animation: anp-rise .22s cubic-bezier(.34,1.4,.64,1) both;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }
  @keyframes anp-rise {
    from { opacity:0; transform:translateY(8px) scale(.98); }
    to   { opacity:1; transform:none; }
  }
  .anp-header {
    display: flex; align-items: center; justify-content: space-between;
    padding: 12px 16px 10px;
    border-bottom: 1px solid #131c28;
    flex-shrink: 0;
  }
  .anp-title {
    font-size: 11px; font-weight: 700; color: #d0dff0;
    letter-spacing: 0.1em; text-transform: uppercase;
    display: flex; align-items: center; gap: 6px;
  }
  .anp-header-actions { display: flex; gap: 4px; }
  .anp-hbtn {
    background: transparent; border: none; cursor: pointer;
    color: #3a5070; font-size: 10px; font-family: inherit;
    letter-spacing: 0.06em; padding: 4px 8px;
    border-radius: 3px; display: flex; align-items: center; gap: 4px;
    transition: all 0.15s;
  }
  .anp-hbtn:hover { background: rgba(255,255,255,0.05); color: #607898; }
  .anp-tabs {
    display: flex; gap: 0;
    border-bottom: 1px solid #131c28;
    flex-shrink: 0; overflow-x: auto;
  }
  .anp-tabs::-webkit-scrollbar { display: none; }
  .anp-tab {
    display: flex; align-items: center; gap: 5px;
    padding: 8px 14px 9px;
    font-size: 10px; font-weight: 700; letter-spacing: 0.09em; text-transform: uppercase;
    font-family: inherit; color: #3a5070;
    border: none; background: transparent; cursor: pointer;
    border-bottom: 2px solid transparent; white-space: nowrap;
    transition: all 0.15s;
  }
  .anp-tab:hover { color: #607898; }
  .anp-tab.active { color: #00c8e0; border-bottom-color: #00c8e0; }
  .anp-badge {
    min-width: 16px; height: 16px; border-radius: 3px;
    padding: 0 4px; font-size: 9px; font-weight: 800;
    display: flex; align-items: center; justify-content: center; line-height: 1;
  }
  .anp-body {
    flex: 1; overflow-y: auto; min-height: 0; max-height: 460px;
  }
  .anp-body::-webkit-scrollbar { width: 3px; }
  .anp-body::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.07); }
  .anp-empty {
    display: flex; flex-direction: column; align-items: center; justify-content: center;
    padding: 52px 24px; gap: 10px; color: rgba(255,255,255,0.18);
  }
  .anp-empty-text { font-size: 11px; letter-spacing: 0.06em; }
  .anp-item {
    display: flex; align-items: flex-start; gap: 10px;
    padding: 12px 14px; border-bottom: 1px solid rgba(255,255,255,0.04);
    cursor: pointer; transition: background 0.12s; position: relative;
  }
  .anp-item:hover { background: rgba(255,255,255,0.025); }
  .anp-item.unread { background: rgba(0,200,224,0.03); }
  .anp-item.unread:hover { background: rgba(0,200,224,0.06); }
  .anp-item-icon {
    width: 30px; height: 30px; border-radius: 4px; flex-shrink: 0;
    display: flex; align-items: center; justify-content: center; margin-top: 1px;
  }
  .anp-item-body { flex: 1; min-width: 0; }
  .anp-item-cat {
    font-size: 8px; font-weight: 800; letter-spacing: 0.14em; text-transform: uppercase;
    margin-bottom: 3px;
  }
  .anp-item-title {
    font-size: 11.5px; font-weight: 600; color: #c8d8e8;
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis; margin-bottom: 2px;
  }
  .anp-item.unread .anp-item-title { color: #e4f0ff; }
  .anp-item-body-text {
    font-size: 10.5px; color: rgba(255,255,255,0.33); line-height: 1.45;
    display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;
  }
  .anp-item-time { font-size: 9px; color: rgba(255,255,255,0.2); margin-top: 4px; }
  .anp-item-del {
    background: transparent; border: none; cursor: pointer;
    color: rgba(255,255,255,0.12); padding: 4px; border-radius: 3px;
    display: flex; align-items: center; justify-content: center;
    transition: all 0.12s; flex-shrink: 0; margin-top: -2px;
  }
  .anp-item-del:hover { background: rgba(244,63,94,0.12); color: rgba(244,63,94,0.7); }
  .anp-dot {
    width: 5px; height: 5px; border-radius: 50%; background: #00c8e0;
    position: absolute; top: 16px; left: 5px; flex-shrink: 0;
  }
  .anp-item.unread { padding-left: 18px; }
`;

function categoryIcon(cat: AdminNotifCategory) {
  switch (cat) {
    case 'message':  return <MessageSquare size={13} />;
    case 'signup':   return <UserPlus size={13} />;
    case 'campaign': return <Megaphone size={13} />;
    case 'system':   return <AlertTriangle size={13} />;
    case 'alert':    return <Shield size={13} />;
    default:         return <Info size={13} />;
  }
}

type Tab = 'all' | 'messages' | 'alerts';

interface Props {
  panelRef: React.RefObject<HTMLDivElement>;
  pos: { top: number; right: number };
  mode: 'messages' | 'alerts';
  hook: Hook;
  onClose: () => void;
}

export function AdminNotificationsPanel({ panelRef, pos, mode, hook, onClose }: Props) {
  const [tab, setTab] = React.useState<Tab>(mode === 'messages' ? 'messages' : 'alerts');
  const { notifications, counts, loading, markRead, markAllRead, deleteOne, clearAll } = hook;

  const filtered = React.useMemo(() => {
    if (tab === 'messages') return notifications.filter(n => n.category === 'message');
    if (tab === 'alerts')   return notifications.filter(n => n.category !== 'message');
    return notifications;
  }, [tab, notifications]);

  const unreadInTab = filtered.filter(n => !n.is_read).length;

  const TABS: { key: Tab; label: string; count: number }[] = [
    { key: 'all',      label: 'All',      count: counts.total },
    { key: 'messages', label: 'Messages', count: counts.messages },
    { key: 'alerts',   label: 'Alerts',   count: counts.alerts },
  ];

  return createPortal(
    <div
      ref={panelRef}
      style={{ position: 'fixed', top: pos.top + 10, right: pos.right, zIndex: 9999 }}
    >
      <style>{PANEL_STYLES}</style>
      <div className="anp-root">
        <div className="anp-header">
          <span className="anp-title">
            <Bell size={12} style={{ color: '#00c8e0' }} />
            Admin Notifications
          </span>
          <div className="anp-header-actions">
            {unreadInTab > 0 && (
              <button
                className="anp-hbtn"
                onClick={() => markAllRead(tab === 'messages' ? 'message' : tab === 'alerts' ? undefined : undefined)}
              >
                <Check size={10} /> Mark all read
              </button>
            )}
            {filtered.length > 0 && (
              <button
                className="anp-hbtn"
                onClick={() => clearAll(tab === 'messages' ? 'message' : undefined)}
              >
                <Trash2 size={10} />
              </button>
            )}
            <button className="anp-hbtn" onClick={onClose} style={{ color: '#3a5070' }}>
              <X size={12} />
            </button>
          </div>
        </div>

        <div className="anp-tabs">
          {TABS.map(t => {
            const m = t.key === 'messages'
              ? CATEGORY_META.message
              : t.key === 'alerts'
              ? CATEGORY_META.alert
              : null;
            return (
              <button
                key={t.key}
                className={`anp-tab${tab === t.key ? ' active' : ''}`}
                onClick={() => setTab(t.key)}
              >
                {t.label}
                {t.count > 0 && (
                  <span
                    className="anp-badge"
                    style={{
                      background: m ? m.bg : 'rgba(0,200,224,0.12)',
                      color: m ? m.color : '#00c8e0',
                    }}
                  >
                    {t.count > 99 ? '99+' : t.count}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        <div className="anp-body">
          {loading ? (
            <div className="anp-empty">
              <Bell size={24} style={{ opacity: 0.3 }} />
              <div className="anp-empty-text">Loading…</div>
            </div>
          ) : filtered.length === 0 ? (
            <div className="anp-empty">
              {tab === 'messages' ? <Mail size={26} style={{ opacity: 0.3 }} /> : <Bell size={26} style={{ opacity: 0.3 }} />}
              <div className="anp-empty-text">No {tab === 'all' ? '' : tab} yet</div>
            </div>
          ) : (
            filtered.map(n => {
              const meta = CATEGORY_META[n.category] ?? CATEGORY_META.alert;
              const isUnread = !n.is_read;
              return (
                <div
                  key={n.id}
                  className={`anp-item${isUnread ? ' unread' : ''}`}
                  onClick={() => { if (isUnread) markRead(n.id); }}
                >
                  {isUnread && <div className="anp-dot" />}
                  <div className="anp-item-icon" style={{ background: meta.bg, color: meta.color }}>
                    {categoryIcon(n.category)}
                  </div>
                  <div className="anp-item-body">
                    <div className="anp-item-cat" style={{ color: meta.color }}>{meta.label}</div>
                    <div className="anp-item-title">{n.title}</div>
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
                    <X size={11} />
                  </button>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
