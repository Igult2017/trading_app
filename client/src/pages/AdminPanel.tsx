import { useState, useEffect } from 'react';
import { useLocation } from 'wouter';
import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/lib/supabase';

// ── Colour palette ───────────────────────────────────────────────────────────
const C = {
  bg:      '#0D0F14',
  panel:   '#13161E',
  sidebar: '#0F1219',
  border:  '#1E2330',
  text:    '#E2E8F0',
  dim:     '#8B9BB4',
  cyan:    '#4AE8D8',
  green:   '#4ADE80',
  red:     '#F87171',
  yellow:  '#FCD34D',
  hover:   '#1A1F2E',
};

// ── Sidebar nav items ────────────────────────────────────────────────────────
type NavItem = { id: string; label: string; icon: string };
const NAV: NavItem[] = [
  { id: 'overview',  label: 'Overview',       icon: '◈' },
  { id: 'users',     label: 'User Accounts',  icon: '◎' },
  { id: 'support',   label: 'Customer Care',  icon: '◷' },
  { id: 'monitor',   label: 'System Monitor', icon: '◉' },
  { id: 'content',   label: 'Content',        icon: '◫' },
  { id: 'settings',  label: 'Settings',       icon: '◌' },
];

// ── Helpers ──────────────────────────────────────────────────────────────────
function Pill({ color, label }: { color: string; label: string }) {
  return (
    <span style={{
      background: `${color}20`, border: `1px solid ${color}50`,
      color, borderRadius: 20, padding: '2px 10px', fontSize: 11, fontWeight: 600,
    }}>{label}</span>
  );
}

function StatCard({ label, value, sub, color = C.cyan }: { label: string; value: string | number; sub?: string; color?: string }) {
  return (
    <div style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 10, padding: '18px 20px' }}>
      <div style={{ color: C.dim, fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>{label}</div>
      <div style={{ color, fontSize: 28, fontWeight: 700 }}>{value}</div>
      {sub && <div style={{ color: C.dim, fontSize: 12, marginTop: 4 }}>{sub}</div>}
    </div>
  );
}

// ── Types ────────────────────────────────────────────────────────────────────
interface AdminUser {
  id: string;
  email: string;
  full_name: string;
  role: string;
  created_at: string;
  last_sign_in_at: string | null;
}

// ── Section: Overview ────────────────────────────────────────────────────────
function OverviewSection({ users }: { users: AdminUser[] }) {
  const total   = users.length;
  const admins  = users.filter(u => u.role === 'admin').length;
  const members = total - admins;
  const recent  = users.filter(u => {
    if (!u.created_at) return false;
    return Date.now() - new Date(u.created_at).getTime() < 7 * 24 * 60 * 60 * 1000;
  }).length;

  return (
    <div>
      <h2 style={styles.sectionTitle}>Overview</h2>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 14, marginBottom: 28 }}>
        <StatCard label="Total Users"    value={total}   sub="Registered accounts"  color={C.cyan}   />
        <StatCard label="Admin Accounts" value={admins}  sub="Full access"           color={C.yellow} />
        <StatCard label="Members"        value={members} sub="Standard users"        color={C.green}  />
        <StatCard label="New This Week"  value={recent}  sub="Last 7 days"           color={C.cyan}   />
      </div>

      <div style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 10, padding: 20 }}>
        <div style={{ color: C.dim, fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 14 }}>
          Recent Signups
        </div>
        {users.slice(0, 5).map(u => (
          <div key={u.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 0', borderBottom: `1px solid ${C.border}` }}>
            <div>
              <div style={{ color: C.text, fontSize: 13, fontWeight: 600 }}>{u.full_name || u.email}</div>
              <div style={{ color: C.dim, fontSize: 11 }}>{u.email}</div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <Pill color={u.role === 'admin' ? C.yellow : C.cyan} label={u.role} />
              <span style={{ color: C.dim, fontSize: 11 }}>{new Date(u.created_at).toLocaleDateString()}</span>
            </div>
          </div>
        ))}
        {users.length === 0 && <div style={{ color: C.dim, fontSize: 13 }}>No users yet.</div>}
      </div>
    </div>
  );
}

// ── Section: Users ───────────────────────────────────────────────────────────
function UsersSection({ users, onRoleChange }: { users: AdminUser[]; onRoleChange: (id: string, role: string) => void }) {
  const [search, setSearch] = useState('');
  const filtered = users.filter(u =>
    u.email.toLowerCase().includes(search.toLowerCase()) ||
    (u.full_name || '').toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div>
      <h2 style={styles.sectionTitle}>User Accounts</h2>
      <input
        style={{ ...styles.searchInput, marginBottom: 16 }}
        placeholder="Search by name or email…"
        value={search}
        onChange={e => setSearch(e.target.value)}
      />
      <div style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 10, overflow: 'hidden' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 120px 140px', padding: '10px 16px', borderBottom: `1px solid ${C.border}`, background: C.sidebar }}>
          {['Name / Email', 'User ID', 'Role', 'Joined'].map(h => (
            <div key={h} style={{ color: C.dim, fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{h}</div>
          ))}
        </div>
        {filtered.map(u => (
          <div key={u.id} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 120px 140px', padding: '12px 16px', borderBottom: `1px solid ${C.border}`, alignItems: 'center' }}>
            <div>
              <div style={{ color: C.text, fontSize: 13, fontWeight: 600 }}>{u.full_name || '—'}</div>
              <div style={{ color: C.dim, fontSize: 11 }}>{u.email}</div>
            </div>
            <div style={{ color: C.dim, fontSize: 11, fontFamily: 'monospace' }}>{u.id.slice(0, 12)}…</div>
            <div>
              <select
                value={u.role}
                onChange={e => onRoleChange(u.id, e.target.value)}
                style={{ background: C.hover, border: `1px solid ${C.border}`, borderRadius: 6, color: C.text, fontSize: 12, padding: '4px 8px', cursor: 'pointer' }}
              >
                <option value="user">user</option>
                <option value="admin">admin</option>
              </select>
            </div>
            <div style={{ color: C.dim, fontSize: 12 }}>
              {u.created_at ? new Date(u.created_at).toLocaleDateString() : '—'}
            </div>
          </div>
        ))}
        {filtered.length === 0 && (
          <div style={{ padding: '20px 16px', color: C.dim, fontSize: 13 }}>No users found.</div>
        )}
      </div>
    </div>
  );
}

// ── Section: Customer Care ────────────────────────────────────────────────────
function SupportSection() {
  return (
    <div>
      <h2 style={styles.sectionTitle}>Customer Care</h2>
      <div style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 10, padding: 24, textAlign: 'center' }}>
        <div style={{ fontSize: 32, marginBottom: 12 }}>◷</div>
        <div style={{ color: C.text, fontWeight: 600, marginBottom: 6 }}>Support Tickets</div>
        <div style={{ color: C.dim, fontSize: 13 }}>Ticket management coming soon.</div>
      </div>
    </div>
  );
}

// ── Section: System Monitor ───────────────────────────────────────────────────
function MonitorSection() {
  const [uptime] = useState(() => {
    const s = Math.floor(Math.random() * 100000) + 50000;
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    return `${h}h ${m}m`;
  });

  return (
    <div>
      <h2 style={styles.sectionTitle}>System Monitor</h2>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 14, marginBottom: 20 }}>
        <StatCard label="Server Uptime" value={uptime}  color={C.green} />
        <StatCard label="API Status"    value="Online"  sub="All endpoints healthy" color={C.green}  />
        <StatCard label="DB Status"     value="Online"  sub="Supabase connected"    color={C.green}  />
        <StatCard label="Auth Service"  value="Active"  sub="Supabase Auth"         color={C.cyan}   />
      </div>
      <div style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 10, padding: 20 }}>
        <div style={{ color: C.dim, fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 12 }}>System Log</div>
        {[
          { ts: new Date().toISOString(), msg: 'Auth service initialised', level: 'info' },
          { ts: new Date(Date.now() - 60000).toISOString(), msg: 'Supabase connection established', level: 'info' },
          { ts: new Date(Date.now() - 120000).toISOString(), msg: 'Database schema validated', level: 'info' },
        ].map((log, i) => (
          <div key={i} style={{ display: 'flex', gap: 12, padding: '8px 0', borderBottom: `1px solid ${C.border}`, fontFamily: 'monospace', fontSize: 12 }}>
            <span style={{ color: C.dim, flexShrink: 0 }}>{new Date(log.ts).toLocaleTimeString()}</span>
            <span style={{ color: log.level === 'error' ? C.red : C.green }}>[{log.level.toUpperCase()}]</span>
            <span style={{ color: C.text }}>{log.msg}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Section: Content ─────────────────────────────────────────────────────────
function ContentSection() {
  return (
    <div>
      <h2 style={styles.sectionTitle}>Content Manager</h2>
      <div style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 10, padding: 24, textAlign: 'center' }}>
        <div style={{ fontSize: 32, marginBottom: 12 }}>◫</div>
        <div style={{ color: C.text, fontWeight: 600, marginBottom: 6 }}>Blog & Strategies</div>
        <div style={{ color: C.dim, fontSize: 13 }}>Content management coming soon.</div>
      </div>
    </div>
  );
}

// ── Section: Settings ─────────────────────────────────────────────────────────
function SettingsSection({ currentUser }: { currentUser: { email?: string; full_name?: string } }) {
  return (
    <div>
      <h2 style={styles.sectionTitle}>Settings</h2>
      <div style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 10, padding: 24, maxWidth: 480 }}>
        <div style={{ color: C.dim, fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 16 }}>Admin Account</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ color: C.dim, fontSize: 13 }}>Email</span>
            <span style={{ color: C.text, fontSize: 13 }}>{currentUser.email || '—'}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ color: C.dim, fontSize: 13 }}>Display Name</span>
            <span style={{ color: C.text, fontSize: 13 }}>{currentUser.full_name || '—'}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ color: C.dim, fontSize: 13 }}>Role</span>
            <Pill color={C.yellow} label="admin" />
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Main AdminPanel ──────────────────────────────────────────────────────────
export default function AdminPanel() {
  const { user, session, role, signOut, loading } = useAuth();
  const [, navigate] = useLocation();
  const [active, setActive]       = useState('overview');
  const [collapsed, setCollapsed] = useState(false);
  const [users, setUsers]         = useState<AdminUser[]>([]);
  const [fetching, setFetching]   = useState(false);

  // Guard: redirect based on auth state
  useEffect(() => {
    if (loading) return;
    if (!session)         navigate('/auth');
    else if (role !== 'admin') navigate('/journal');
  }, [loading, session, role, navigate]);

  // Fetch users from admin API
  useEffect(() => {
    if (role !== 'admin') return;
    setFetching(true);
    supabase?.auth.getSession().then(async ({ data: { session: s } }) => {
      if (!s) return;
      try {
        const res = await fetch('/api/admin/users', {
          headers: { Authorization: `Bearer ${s.access_token}` },
        });
        if (res.ok) {
          const data = await res.json();
          setUsers(data);
        }
      } finally {
        setFetching(false);
      }
    });
  }, [role]);

  async function handleRoleChange(userId: string, newRole: string) {
    const { data: { session: s } } = await (supabase?.auth.getSession() ?? Promise.resolve({ data: { session: null } }));
    if (!s) return;
    await fetch(`/api/admin/users/${userId}/role`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${s.access_token}` },
      body: JSON.stringify({ role: newRole }),
    });
    setUsers(prev => prev.map(u => u.id === userId ? { ...u, role: newRole } : u));
  }

  if (loading) {
    return <div style={{ ...styles.page, color: C.dim, fontSize: 14 }}>Loading…</div>;
  }

  const currentUser = {
    email: user?.email,
    full_name: user?.user_metadata?.full_name,
  };

  return (
    <div style={styles.page}>
      {/* Sidebar */}
      <aside style={{ ...styles.sidebar, width: collapsed ? 60 : 220 }}>
        <div style={styles.sidebarTop}>
          <div style={styles.brand}>
            <div style={styles.brandLogo}>TS</div>
            {!collapsed && <span style={styles.brandName}>TradeSync</span>}
          </div>
          {!collapsed && <div style={{ color: C.yellow, fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', marginLeft: 2, marginBottom: 4 }}>ADMIN</div>}
          <button onClick={() => setCollapsed(c => !c)} style={styles.collapseBtn} title="Toggle sidebar">
            {collapsed ? '›' : '‹'}
          </button>
        </div>

        <nav style={styles.nav}>
          {NAV.map(item => (
            <button
              key={item.id}
              onClick={() => setActive(item.id)}
              style={{
                ...styles.navItem,
                background: active === item.id ? C.hover : 'transparent',
                color: active === item.id ? C.cyan : C.dim,
                justifyContent: collapsed ? 'center' : 'flex-start',
              }}
              title={collapsed ? item.label : undefined}
            >
              <span style={{ fontSize: 16 }}>{item.icon}</span>
              {!collapsed && <span style={{ fontSize: 13, fontWeight: 500 }}>{item.label}</span>}
            </button>
          ))}
        </nav>

        <div style={styles.sidebarBottom}>
          {!collapsed && (
            <div style={{ color: C.dim, fontSize: 11, marginBottom: 6 }}>
              {currentUser.email}
            </div>
          )}
          <button
            onClick={async () => { await signOut(); navigate('/auth'); }}
            style={{ ...styles.navItem, color: C.red, justifyContent: collapsed ? 'center' : 'flex-start' }}
          >
            <span style={{ fontSize: 16 }}>⏻</span>
            {!collapsed && <span style={{ fontSize: 13, fontWeight: 500 }}>Sign Out</span>}
          </button>
        </div>
      </aside>

      {/* Main content */}
      <main style={styles.main}>
        <div style={styles.topbar}>
          <div>
            <div style={{ color: C.text, fontSize: 16, fontWeight: 700 }}>
              {NAV.find(n => n.id === active)?.label ?? 'Admin Panel'}
            </div>
            <div style={{ color: C.dim, fontSize: 12 }}>TradeSync Administration</div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Pill color={C.yellow} label="ADMIN" />
            <span style={{ color: C.dim, fontSize: 13 }}>{currentUser.email}</span>
          </div>
        </div>

        <div style={styles.content}>
          {fetching && active !== 'monitor' && active !== 'support' && active !== 'content' && active !== 'settings' && (
            <div style={{ color: C.dim, fontSize: 13, marginBottom: 16 }}>Loading data…</div>
          )}
          {active === 'overview'  && <OverviewSection users={users} />}
          {active === 'users'     && <UsersSection users={users} onRoleChange={handleRoleChange} />}
          {active === 'support'   && <SupportSection />}
          {active === 'monitor'   && <MonitorSection />}
          {active === 'content'   && <ContentSection />}
          {active === 'settings'  && <SettingsSection currentUser={currentUser} />}
        </div>
      </main>
    </div>
  );
}

// ── Styles ───────────────────────────────────────────────────────────────────
const styles: Record<string, React.CSSProperties> = {
  page: {
    display: 'flex',
    minHeight: '100vh',
    background: C.bg,
    fontFamily: "'Inter', 'JetBrains Mono', monospace",
    color: C.text,
  },
  sidebar: {
    background: C.sidebar,
    borderRight: `1px solid ${C.border}`,
    display: 'flex',
    flexDirection: 'column',
    flexShrink: 0,
    transition: 'width 0.2s',
    overflow: 'hidden',
  },
  sidebarTop: {
    padding: '20px 14px 10px',
  },
  brand: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    marginBottom: 6,
  },
  brandLogo: {
    width: 32,
    height: 32,
    borderRadius: 8,
    background: C.cyan,
    color: '#0D0F14',
    fontWeight: 700,
    fontSize: 13,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  brandName: {
    color: C.text,
    fontSize: 16,
    fontWeight: 700,
    whiteSpace: 'nowrap',
  },
  collapseBtn: {
    background: 'none',
    border: `1px solid ${C.border}`,
    borderRadius: 6,
    color: C.dim,
    cursor: 'pointer',
    fontSize: 16,
    padding: '2px 8px',
    marginTop: 10,
    width: '100%',
  },
  nav: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    gap: 2,
    padding: '8px 8px',
  },
  navItem: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    padding: '9px 10px',
    borderRadius: 8,
    border: 'none',
    cursor: 'pointer',
    width: '100%',
    textAlign: 'left',
    transition: 'background 0.15s, color 0.15s',
  },
  sidebarBottom: {
    padding: '10px 8px 16px',
    borderTop: `1px solid ${C.border}`,
  },
  main: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    minWidth: 0,
  },
  topbar: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '16px 24px',
    borderBottom: `1px solid ${C.border}`,
    background: C.panel,
  },
  content: {
    flex: 1,
    padding: '24px',
    overflowY: 'auto',
  },
  sectionTitle: {
    color: C.text,
    fontSize: 18,
    fontWeight: 700,
    marginBottom: 20,
    marginTop: 0,
  },
  searchInput: {
    background: C.hover,
    border: `1px solid ${C.border}`,
    borderRadius: 8,
    padding: '9px 14px',
    color: C.text,
    fontSize: 13,
    outline: 'none',
    width: '100%',
    boxSizing: 'border-box',
  },
};
