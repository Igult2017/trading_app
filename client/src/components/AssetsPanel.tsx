/**
 * AssetsPanel — embedded in Journal's "Assets" nav tab.
 * Fully client-side: state persisted in localStorage, no backend needed.
 */
import { useState, useEffect, useCallback } from 'react';

// ── Types ─────────────────────────────────────────────────────────────────────

type Category = 'Forex' | 'Crypto' | 'Metal' | 'Index' | 'Stock' | 'Other';
type Status   = 'Active' | 'Watchlist';

interface Asset {
  id:       string;
  symbol:   string;
  name:     string;
  category: Category;
  status:   Status;
  starred:  boolean;
  addedAt:  string;
  notes:    string;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const LS_KEY = 'fsd_assets_panel';

const CATEGORIES: Category[] = ['Forex', 'Crypto', 'Metal', 'Index', 'Stock', 'Other'];

const CAT_COLOR: Record<Category, string> = {
  Forex:  '#38bdf8',
  Crypto: '#f59e0b',
  Metal:  '#d97706',
  Index:  '#8b5cf6',
  Stock:  '#22d3a5',
  Other:  '#6b7280',
};

const POPULAR: { symbol: string; name: string; category: Category }[] = [
  { symbol: 'EURUSD', name: 'Euro / US Dollar',       category: 'Forex'  },
  { symbol: 'GBPUSD', name: 'Pound / US Dollar',      category: 'Forex'  },
  { symbol: 'USDJPY', name: 'US Dollar / Yen',        category: 'Forex'  },
  { symbol: 'XAUUSD', name: 'Gold / US Dollar',       category: 'Metal'  },
  { symbol: 'BTCUSD', name: 'Bitcoin / US Dollar',    category: 'Crypto' },
  { symbol: 'NAS100', name: 'Nasdaq 100',             category: 'Index'  },
];

// ── localStorage helpers ──────────────────────────────────────────────────────

function load(): Asset[] {
  try { return JSON.parse(localStorage.getItem(LS_KEY) ?? '[]'); }
  catch { return []; }
}
function save(a: Asset[]) { localStorage.setItem(LS_KEY, JSON.stringify(a)); }

// ── Styles ────────────────────────────────────────────────────────────────────

const FONT  = "'Montserrat', sans-serif";
const MONO  = "'JetBrains Mono', 'Share Tech Mono', monospace";

const C = {
  bg:    '#080c10', bg2: '#0d1117', bg3: '#111820', bg4: '#161e28',
  line:  '#1a2535', line2: '#223040',
  text:  '#c8d8e8', muted: '#5a7a94', dim: '#2e4055',
  green: '#22d3a5', green2: 'rgba(34,211,165,0.12)',
  blue:  '#38bdf8', blue2: 'rgba(56,189,248,0.1)',
  amber: '#f59e0b', red: '#ef4444',
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function uid() { return Math.random().toString(36).slice(2) + Date.now().toString(36); }

function CatBadge({ cat }: { cat: Category }) {
  const color = CAT_COLOR[cat];
  return (
    <span style={{
      fontFamily: MONO, fontSize: 9, letterSpacing: '.12em',
      padding: '2px 7px', border: `1px solid ${color}55`,
      color, background: `${color}15`, borderRadius: 2,
    }}>{cat.toUpperCase()}</span>
  );
}

function StatusDot({ status }: { status: Status }) {
  const active = status === 'Active';
  return (
    <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
      <span style={{
        width: 6, height: 6, borderRadius: '50%',
        background: active ? C.green : C.blue,
        boxShadow: `0 0 6px ${active ? C.green : C.blue}`,
      }} />
      <span style={{ fontFamily: MONO, fontSize: 9, color: active ? C.green : C.blue, letterSpacing: '.1em' }}>
        {status.toUpperCase()}
      </span>
    </span>
  );
}

// ── Add-asset form ────────────────────────────────────────────────────────────

function AddForm({ onAdd, onClose }: {
  onAdd: (a: Omit<Asset, 'id' | 'addedAt' | 'starred'>) => void;
  onClose: () => void;
}) {
  const [sym,  setSym]  = useState('');
  const [name, setName] = useState('');
  const [cat,  setCat]  = useState<Category>('Forex');
  const [st,   setSt]   = useState<Status>('Active');
  const [notes,setNotes]= useState('');

  const inputSt: React.CSSProperties = {
    fontFamily: MONO, fontSize: 12, color: C.text,
    background: C.bg3, border: `1px solid ${C.line2}`,
    padding: '8px 10px', outline: 'none', width: '100%', boxSizing: 'border-box',
  };

  const label = (txt: string) => (
    <div style={{ fontFamily: MONO, fontSize: 9, color: C.muted, letterSpacing: '.14em', marginBottom: 4 }}>
      {txt}
    </div>
  );

  const handlePopular = (p: typeof POPULAR[0]) => {
    setSym(p.symbol); setName(p.name); setCat(p.category);
  };

  return (
    <div style={{
      background: C.bg2, border: `1px solid ${C.line2}`,
      borderLeft: `3px solid ${C.green}`, padding: 20, marginBottom: 20,
    }}>
      <div style={{ fontFamily: MONO, fontSize: 10, color: C.green, letterSpacing: '.2em', marginBottom: 14 }}>
        ADD INSTRUMENT
      </div>

      {/* Quick-add popular */}
      <div style={{ marginBottom: 14 }}>
        <div style={{ fontFamily: MONO, fontSize: 9, color: C.muted, letterSpacing: '.12em', marginBottom: 6 }}>
          QUICK ADD
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {POPULAR.map(p => (
            <button key={p.symbol} onClick={() => handlePopular(p)} style={{
              fontFamily: MONO, fontSize: 9, letterSpacing: '.1em',
              padding: '4px 10px', cursor: 'pointer',
              background: sym === p.symbol ? C.green2 : 'none',
              border: `1px solid ${sym === p.symbol ? C.green : C.line2}`,
              color: sym === p.symbol ? C.green : C.muted,
            }}>{p.symbol}</button>
          ))}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr 1fr 1fr', gap: 10, marginBottom: 10 }}>
        <div>
          {label('SYMBOL *')}
          <input value={sym} onChange={e => setSym(e.target.value.toUpperCase())}
            placeholder="EURUSD" style={inputSt} autoFocus />
        </div>
        <div>
          {label('FULL NAME')}
          <input value={name} onChange={e => setName(e.target.value)}
            placeholder="Euro / US Dollar" style={inputSt} />
        </div>
        <div>
          {label('CATEGORY')}
          <select value={cat} onChange={e => setCat(e.target.value as Category)} style={inputSt}>
            {CATEGORIES.map(c => <option key={c}>{c}</option>)}
          </select>
        </div>
        <div>
          {label('STATUS')}
          <select value={st} onChange={e => setSt(e.target.value as Status)} style={inputSt}>
            <option>Active</option>
            <option>Watchlist</option>
          </select>
        </div>
      </div>

      <div style={{ marginBottom: 14 }}>
        {label('NOTES (optional)')}
        <input value={notes} onChange={e => setNotes(e.target.value)}
          placeholder="e.g. London session only, avoid news" style={{ ...inputSt, width: '100%' }} />
      </div>

      <div style={{ display: 'flex', gap: 8 }}>
        <button
          onClick={() => sym.trim() && onAdd({ symbol: sym.trim(), name: name.trim(), category: cat, status: st, notes: notes.trim() })}
          disabled={!sym.trim()}
          style={{
            fontFamily: MONO, fontSize: 10, letterSpacing: '.14em',
            padding: '8px 18px', cursor: sym.trim() ? 'pointer' : 'not-allowed',
            background: sym.trim() ? C.green2 : 'none',
            color: sym.trim() ? C.green : C.muted,
            border: `1px solid ${sym.trim() ? 'rgba(34,211,165,0.4)' : C.line}`,
            opacity: sym.trim() ? 1 : 0.5,
          }}>+ ADD</button>
        <button onClick={onClose} style={{
          fontFamily: MONO, fontSize: 10, letterSpacing: '.14em',
          padding: '8px 14px', background: 'none',
          color: C.muted, border: `1px solid ${C.line}`, cursor: 'pointer',
        }}>CANCEL</button>
      </div>
    </div>
  );
}

// ── Asset row ─────────────────────────────────────────────────────────────────

function AssetRow({ asset, onStar, onToggle, onRemove }: {
  asset: Asset;
  onStar:   (id: string) => void;
  onToggle: (id: string) => void;
  onRemove: (id: string) => void;
}) {
  const [hover, setHover] = useState(false);
  return (
    <div
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        display: 'grid',
        gridTemplateColumns: '28px 120px 1fr 110px 90px 80px 68px',
        alignItems: 'center', gap: 12,
        padding: '12px 16px',
        background: hover ? C.bg4 : C.bg3,
        border: `1px solid ${hover ? C.line2 : C.line}`,
        borderLeft: `3px solid ${CAT_COLOR[asset.category]}`,
        transition: 'all .15s', cursor: 'default',
      }}
    >
      {/* Star */}
      <button onClick={() => onStar(asset.id)} style={{
        background: 'none', border: 'none', cursor: 'pointer', padding: 0,
        fontSize: 16, color: asset.starred ? C.amber : C.dim, lineHeight: 1,
      }}>
        {asset.starred ? '★' : '☆'}
      </button>

      {/* Symbol */}
      <div>
        <div style={{ fontFamily: MONO, fontSize: 13, fontWeight: 700, color: C.text, letterSpacing: '.04em' }}>
          {asset.symbol}
        </div>
        {asset.name && <div style={{ fontFamily: FONT, fontSize: 10, color: C.muted, marginTop: 1 }}>{asset.name}</div>}
      </div>

      {/* Notes */}
      <div style={{ fontFamily: FONT, fontSize: 11, color: C.muted, overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>
        {asset.notes || '—'}
      </div>

      {/* Category */}
      <CatBadge cat={asset.category} />

      {/* Status */}
      <StatusDot status={asset.status} />

      {/* Date */}
      <div style={{ fontFamily: MONO, fontSize: 9, color: C.dim }}>
        {new Date(asset.addedAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })}
      </div>

      {/* Actions */}
      <div style={{ display: 'flex', gap: 4 }}>
        <button onClick={() => onToggle(asset.id)} title="Toggle Active/Watchlist" style={{
          fontFamily: MONO, fontSize: 11, background: 'none', border: 'none',
          cursor: 'pointer', color: hover ? C.text : C.dim, padding: '2px 5px',
        }}>⇄</button>
        <button onClick={() => onRemove(asset.id)} title="Remove" style={{
          fontFamily: MONO, fontSize: 11, background: 'none', border: 'none',
          cursor: 'pointer', color: hover ? C.red : C.dim, padding: '2px 5px',
        }}>✕</button>
      </div>
    </div>
  );
}

// ── Main panel ────────────────────────────────────────────────────────────────

export default function AssetsPanel() {
  const [assets,     setAssets]     = useState<Asset[]>([]);
  const [showForm,   setShowForm]   = useState(false);
  const [search,     setSearch]     = useState('');
  const [filterCat,  setFilterCat]  = useState<Category | 'All'>('All');
  const [filterSt,   setFilterSt]   = useState<Status | 'All'>('All');

  useEffect(() => { setAssets(load()); }, []);

  const persist = useCallback((next: Asset[]) => { setAssets(next); save(next); }, []);

  const handleAdd = (f: Omit<Asset, 'id' | 'addedAt' | 'starred'>) => {
    persist([{ ...f, id: uid(), addedAt: new Date().toISOString(), starred: false }, ...assets]);
    setShowForm(false);
  };

  const handleStar   = (id: string) => persist(assets.map(a => a.id === id ? { ...a, starred: !a.starred } : a));
  const handleToggle = (id: string) => persist(assets.map(a => a.id === id ? { ...a, status: a.status === 'Active' ? 'Watchlist' : 'Active' } : a));
  const handleRemove = (id: string) => persist(assets.filter(a => a.id !== id));

  const visible = assets
    .filter(a => filterCat === 'All' || a.category === filterCat)
    .filter(a => filterSt  === 'All' || a.status   === filterSt)
    .filter(a => !search || a.symbol.toLowerCase().includes(search.toLowerCase()) || a.name.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => (a.starred === b.starred ? 0 : a.starred ? -1 : 1));

  const chip = (active: boolean, color = C.green): React.CSSProperties => ({
    fontFamily: MONO, fontSize: 9, letterSpacing: '.11em',
    padding: '5px 11px', cursor: 'pointer', borderRadius: 2, transition: 'all .15s',
    background: active ? `${color}18` : 'none',
    border:     active ? `1px solid ${color}55` : `1px solid ${C.line}`,
    color:      active ? color : C.muted,
  });

  const counts = {
    active:    assets.filter(a => a.status === 'Active').length,
    watchlist: assets.filter(a => a.status === 'Watchlist').length,
    starred:   assets.filter(a => a.starred).length,
  };

  return (
    <div style={{ flex: 1, background: C.bg, color: C.text, fontFamily: FONT, overflowY: 'auto' }}>

      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '0 24px', height: 52,
        background: C.bg2, borderBottom: `1px solid ${C.line}`,
        position: 'sticky', top: 0, zIndex: 10,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontFamily: MONO, fontSize: 9, color: C.green }}>◈</span>
          <span style={{ fontFamily: MONO, fontSize: 11, letterSpacing: '.18em', color: C.text, fontWeight: 700 }}>ASSETS</span>
          <span style={{ fontFamily: MONO, fontSize: 9, color: C.muted }}>— Instrument Tracker</span>
        </div>
        <button
          onClick={() => setShowForm(v => !v)}
          style={{
            fontFamily: MONO, fontSize: 10, letterSpacing: '.14em',
            padding: '6px 16px', cursor: 'pointer', transition: 'all .15s',
            background: showForm ? C.green2 : 'none',
            color:      showForm ? C.green  : C.text,
            border:     `1px solid ${showForm ? 'rgba(34,211,165,0.4)' : C.line2}`,
          }}
        >{showForm ? '✕ CLOSE' : '+ TRACK ASSET'}</button>
      </div>

      <div style={{ padding: '20px 24px' }}>

        {/* Summary strip */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', border: `1px solid ${C.line}`, marginBottom: 20 }}>
          {[
            { label: 'TRACKED',   value: assets.length, color: C.text  },
            { label: 'ACTIVE',    value: counts.active,    color: C.green },
            { label: 'WATCHLIST', value: counts.watchlist, color: C.blue  },
            { label: 'STARRED',   value: counts.starred,   color: C.amber },
          ].map((item, i) => (
            <div key={i} style={{ padding: '12px 16px', borderRight: i < 3 ? `1px solid ${C.line}` : 'none' }}>
              <div style={{ fontFamily: MONO, fontSize: 9, color: C.muted, letterSpacing: '.16em', marginBottom: 4 }}>{item.label}</div>
              <div style={{ fontFamily: MONO, fontSize: 20, fontWeight: 700, color: item.color, lineHeight: 1 }}>{item.value}</div>
            </div>
          ))}
        </div>

        {/* Add form */}
        {showForm && <AddForm onAdd={handleAdd} onClose={() => setShowForm(false)} />}

        {/* Filters */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
          <input
            value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search…"
            style={{
              fontFamily: MONO, fontSize: 11, color: C.text,
              background: C.bg3, border: `1px solid ${C.line}`,
              padding: '6px 10px', outline: 'none', width: 160,
            }}
          />
          <div style={{ width: 1, height: 16, background: C.line }} />
          <button style={chip(filterSt === 'All')}       onClick={() => setFilterSt('All')}>ALL</button>
          <button style={chip(filterSt === 'Active')}    onClick={() => setFilterSt('Active')}>ACTIVE</button>
          <button style={chip(filterSt === 'Watchlist', C.blue)} onClick={() => setFilterSt('Watchlist')}>WATCHLIST</button>
          <div style={{ width: 1, height: 16, background: C.line }} />
          {CATEGORIES.map(c => (
            <button key={c} style={chip(filterCat === c, CAT_COLOR[c])} onClick={() => setFilterCat(filterCat === c ? 'All' : c)}>
              {c.toUpperCase()}
            </button>
          ))}
        </div>

        {/* Column headers */}
        {assets.length > 0 && (
          <div style={{
            display: 'grid', gridTemplateColumns: '28px 120px 1fr 110px 90px 80px 68px',
            gap: 12, padding: '6px 16px',
            fontFamily: MONO, fontSize: 8, color: C.dim, letterSpacing: '.14em',
            borderBottom: `1px solid ${C.line}`, marginBottom: 4,
          }}>
            <div/>
            <div>SYMBOL</div><div>NOTES</div>
            <div>CATEGORY</div><div>STATUS</div><div>ADDED</div><div>ACTIONS</div>
          </div>
        )}

        {/* Rows */}
        {assets.length === 0 ? (
          <div style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center',
            justifyContent: 'center', padding: '64px 24px', gap: 12,
            border: `1px dashed ${C.line}`, background: C.bg2,
          }}>
            <div style={{
              width: 48, height: 48, borderRadius: '50%',
              border: `2px solid ${C.green}`, display: 'flex',
              alignItems: 'center', justifyContent: 'center',
              fontSize: 20, color: C.green,
              boxShadow: '0 0 18px rgba(34,211,165,0.15)',
            }}>◈</div>
            <div style={{ fontFamily: MONO, fontSize: 11, color: C.text, letterSpacing: '.14em' }}>
              NO INSTRUMENTS TRACKED
            </div>
            <div style={{ fontFamily: FONT, fontSize: 12, color: C.muted, textAlign: 'center', maxWidth: 280 }}>
              Click <strong style={{ color: C.text }}>+ TRACK ASSET</strong> to add forex pairs, crypto, metals, indices or stocks.
            </div>
          </div>
        ) : visible.length === 0 ? (
          <div style={{ padding: '32px 24px', textAlign: 'center', fontFamily: MONO, fontSize: 11, color: C.muted }}>
            No assets match the current filters.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {visible.map(a => (
              <AssetRow key={a.id} asset={a}
                onStar={handleStar} onToggle={handleToggle} onRemove={handleRemove} />
            ))}
          </div>
        )}

        {assets.length > 0 && (
          <div style={{ fontFamily: MONO, fontSize: 9, color: C.dim, textAlign: 'center', marginTop: 16 }}>
            {visible.length} of {assets.length} instruments · ⇄ toggles Active / Watchlist
          </div>
        )}
      </div>
    </div>
  );
}
