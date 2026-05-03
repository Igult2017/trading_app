import { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import {
  Bell, Check, Trash2, X, TrendingUp, Calendar, Mail, Zap, Megaphone, Info,
} from 'lucide-react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { queryClient, authFetch } from '@/lib/queryClient';
import { format } from 'date-fns';
import type { Notification } from '@shared/schema';

const PANEL_CSS = `
  .np-root, .np-root * { box-sizing: border-box; margin: 0; padding: 0; }
  .np-root {
    font-family: 'DM Mono', 'Courier New', monospace;
    width: 380px;
    max-width: calc(100vw - 16px);
    max-height: calc(100vh - 120px);
    background: #13131f;
    border: 1px solid rgba(255,255,255,0.08);
    border-radius: 12px;
    box-shadow: 0 28px 72px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.03);
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
    padding: 14px 16px 10px;
    border-bottom: 1px solid rgba(255,255,255,0.06);
    flex-shrink: 0;
  }
  .np-title {
    font-size: 12px; font-weight: 600; color: #e2e8f0;
    letter-spacing: 0.04em; text-transform: uppercase;
  }
  .np-actions {
    display: flex; align-items: center; gap: 4px;
  }
  .np-action-btn {
    display: flex; align-items: center; gap: 4px;
    background: transparent; border: none; cursor: pointer;
    color: rgba(255,255,255,0.35); font-size: 10px;
    font-family: inherit; letter-spacing: 0.06em;
    padding: 4px 8px; border-radius: 4px;
    transition: all 0.15s;
  }
  .np-action-btn:hover { background: rgba(255,255,255,0.06); color: rgba(255,255,255,0.7); }
  .np-action-btn svg { flex-shrink: 0; }
  .np-tabs {
    display: flex; gap: 2px;
    padding: 8px 12px 0;
    border-bottom: 1px solid rgba(255,255,255,0.06);
    flex-shrink: 0;
    overflow-x: auto;
  }
  .np-tabs::-webkit-scrollbar { display: none; }
  .np-tab {
    display: flex; align-items: center; gap: 5px;
    padding: 6px 10px 8px;
    font-size: 10px; font-weight: 600; letter-spacing: 0.08em; text-transform: uppercase;
    font-family: inherit;
    color: rgba(255,255,255,0.3); border: none; background: transparent;
    cursor: pointer; border-bottom: 2px solid transparent; white-space: nowrap;
    transition: all 0.15s;
  }
  .np-tab:hover { color: rgba(255,255,255,0.6); }
  .np-tab.active { color: #3b82f6; border-bottom-color: #3b82f6; }
  .np-tab-count {
    background: rgba(59,130,246,0.15); color: #60a5fa;
    border-radius: 8px; padding: 1px 6px;
    font-size: 9px; font-weight: 700;
  }
  .np-tab.active .np-tab-count { background: rgba(59,130,246,0.25); }
  .np-body {
    flex: 1; overflow-y: auto; min-height: 0;
    max-height: 420px;
  }
  .np-body::-webkit-scrollbar { width: 4px; }
  .np-body::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.08); border-radius: 2px; }
  .np-empty {
    display: flex; flex-direction: column; align-items: center; justify-content: center;
    padding: 48px 24px; gap: 10px;
    color: rgba(255,255,255,0.2);
  }
  .np-empty-icon { opacity: 0.3; }
  .np-empty-text { font-size: 11px; letter-spacing: 0.06em; text-align: center; }
  .np-item {
    display: flex; align-items: flex-start; gap: 10px;
    padding: 12px 14px;
    border-bottom: 1px solid rgba(255,255,255,0.04);
    cursor: pointer;
    transition: background 0.12s;
    position: relative;
  }
  .np-item:hover { background: rgba(255,255,255,0.03); }
  .np-item.unread { background: rgba(59,130,246,0.04); }
  .np-item.unread:hover { background: rgba(59,130,246,0.07); }
  .np-item-icon {
    width: 32px; height: 32px; border-radius: 8px; flex-shrink: 0;
    display: flex; align-items: center; justify-content: center;
    margin-top: 1px;
  }
  .np-item-body { flex: 1; min-width: 0; }
  .np-item-cat {
    font-size: 8.5px; font-weight: 700; letter-spacing: 0.12em; text-transform: uppercase;
    margin-bottom: 3px;
  }
  .np-item-title {
    font-size: 11.5px; font-weight: 500; color: #c8d8e8;
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
    margin-bottom: 2px;
  }
  .np-item.unread .np-item-title { color: #e2eeff; }
  .np-item-msg {
    font-size: 10.5px; color: rgba(255,255,255,0.35); line-height: 1.4;
    display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;
  }
  .np-item-time { font-size: 9.5px; color: rgba(255,255,255,0.22); margin-top: 4px; }
  .np-item-del {
    background: transparent; border: none; cursor: pointer;
    color: rgba(255,255,255,0.15); padding: 4px;
    border-radius: 4px; display: flex; align-items: center; justify-content: center;
    transition: all 0.12s; flex-shrink: 0; margin-top: -2px;
  }
  .np-item-del:hover { background: rgba(239,68,68,0.12); color: rgba(239,68,68,0.7); }
  .np-unread-dot {
    width: 6px; height: 6px; border-radius: 50%;
    background: #3b82f6;
    position: absolute; top: 14px; left: 6px;
    flex-shrink: 0;
  }
  .np-item.unread { padding-left: 20px; }
`;

type TabKey = 'all' | 'signals' | 'calendar' | 'emails' | 'updates';

const TABS: { key: TabKey; label: string; icon: React.ReactNode; types: string[] }[] = [
  { key: 'all',       label: 'All',       icon: <Bell size={10} />,       types: [] },
  { key: 'signals',   label: 'Signals',   icon: <TrendingUp size={10} />, types: ['trading_signal'] },
  { key: 'calendar',  label: 'Calendar',  icon: <Calendar size={10} />,   types: ['economic_event', 'trading_session'] },
  { key: 'emails',    label: 'Emails',    icon: <Mail size={10} />,       types: ['email'] },
  { key: 'updates',   label: 'Updates',   icon: <Zap size={10} />,        types: ['update'] },
];

const TYPE_META: Record<string, { color: string; bg: string; label: string }> = {
  trading_signal:  { color: '#22d3a5', bg: 'rgba(34,211,165,0.10)',  label: 'Signal' },
  economic_event:  { color: '#f59e0b', bg: 'rgba(245,158,11,0.10)',  label: 'Economic' },
  trading_session: { color: '#38bdf8', bg: 'rgba(56,189,248,0.10)',  label: 'Session' },
  email:           { color: '#3b82f6', bg: 'rgba(59,130,246,0.10)',  label: 'Email' },
  update:          { color: '#a78bfa', bg: 'rgba(167,139,250,0.10)', label: 'Update' },
};

const TYPE_ICONS: Record<string, React.ReactNode> = {
  trading_signal:  <TrendingUp size={14} />,
  economic_event:  <Calendar size={14} />,
  trading_session: <Calendar size={14} />,
  email:           <Mail size={14} />,
  update:          <Zap size={14} />,
};

function getMeta(type: string) {
  return TYPE_META[type] ?? { color: '#6b7280', bg: 'rgba(107,114,128,0.10)', label: 'Notice' };
}

function getIcon(type: string) {
  return TYPE_ICONS[type] ?? <Info size={14} />;
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

function NotificationsPanel({ panelRef, pos }: NotificationsPanelProps) {
  const [tab, setTab] = useState<TabKey>('all');

  const { data: allNotifs = [], isLoading } = useQuery<Notification[]>({
    queryKey: ['/api/notifications'],
    queryFn: () => authFetch('/api/notifications').then(r => r.json()),
    refetchInterval: 30000,
  });

  const { data: unread = [] } = useQuery<Notification[]>({
    queryKey: ['/api/notifications/unread'],
    queryFn: () => authFetch('/api/notifications/unread').then(r => r.json()),
    refetchInterval: 30000,
  });

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

  const tabDef = TABS.find(t => t.key === tab)!;
  const filtered = tab === 'all'
    ? allNotifs
    : allNotifs.filter(n => tabDef.types.includes(n.type));

  const unreadCount = (id: string) => unread.some(u => u.id === id);
  const unreadCountForTab = tab === 'all'
    ? unread.length
    : unread.filter(n => tabDef.types.includes(n.type)).length;
  const tabCount = (t: typeof TABS[0]) =>
    t.key === 'all' ? unread.length : unread.filter(n => t.types.includes(n.type)).length;

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

        <div className="np-tabs">
          {TABS.map(t => {
            const count = tabCount(t);
            return (
              <button
                key={t.key}
                className={`np-tab${tab === t.key ? ' active' : ''}`}
                onClick={() => setTab(t.key)}
              >
                {t.icon}
                {t.label}
                {count > 0 && <span className="np-tab-count">{count}</span>}
              </button>
            );
          })}
        </div>

        <div className="np-body">
          {isLoading ? (
            <div className="np-empty">
              <div className="np-empty-icon"><Bell size={28} /></div>
              <div className="np-empty-text">Loading notifications...</div>
            </div>
          ) : filtered.length === 0 ? (
            <div className="np-empty">
              <div className="np-empty-icon">
                {tab === 'signals'   ? <TrendingUp size={28} /> :
                 tab === 'calendar'  ? <Calendar size={28} /> :
                 tab === 'emails'    ? <Mail size={28} /> :
                 tab === 'updates'   ? <Zap size={28} /> :
                 <Bell size={28} />}
              </div>
              <div className="np-empty-text">
                No {tab === 'all' ? '' : tab + ' '}notifications yet
              </div>
            </div>
          ) : (
            filtered.map(n => {
              const meta = getMeta(n.type);
              const isUnread = unreadCount(n.id);
              return (
                <div
                  key={n.id}
                  className={`np-item${isUnread ? ' unread' : ''}`}
                  onClick={() => { if (isUnread) markRead.mutate(n.id); }}
                >
                  {isUnread && <div className="np-unread-dot" />}
                  <div className="np-item-icon" style={{ background: meta.bg, color: meta.color }}>
                    {getIcon(n.type)}
                  </div>
                  <div className="np-item-body">
                    <div className="np-item-cat" style={{ color: meta.color }}>{meta.label}</div>
                    <div className="np-item-title">{n.title}</div>
                    <div className="np-item-msg">{n.message}</div>
                    <div className="np-item-time">
                      {n.createdAt ? format(new Date(n.createdAt), 'MMM dd · HH:mm') : '—'}
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
              );
            })
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}

export function Notifications({ dm }: { dm: boolean }) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ top: 108, right: 12 });
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const { data: unread = [] } = useQuery<Notification[]>({
    queryKey: ['/api/notifications/unread'],
    queryFn: () => authFetch('/api/notifications/unread').then(r => r.json()),
    refetchInterval: 30000,
  });

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
            boxShadow: '0 0 0 2px #13131f',
          }}>
            {count > 9 ? '9+' : count}
          </span>
        )}
      </button>
      {open && <NotificationsPanel panelRef={panelRef} pos={pos} />}
    </>
  );
}
