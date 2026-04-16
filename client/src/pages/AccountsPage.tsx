import { useState, useEffect, CSSProperties } from "react";
import { Wrench, RefreshCw, Pencil, Trash2, Copy, Check, ExternalLink } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/context/AuthContext";

// ── Types ─────────────────────────────────────────────────────────────────────
interface BrokerAccount {
  id: string;
  name: string;
  loginId: string;
  server: string | null;
  platform: string;
  accountType: string;
  connectionType: string;
  currency: string;
  balance: string | null;
  syncStatus: string;
  lastSyncAt: string | null;
  tradeCount: number;
  webhookToken: string | null;
  isActive: boolean;
}

// ── Platform list ─────────────────────────────────────────────────────────────
const PLATFORMS = [
  { id: "mt5",          name: "MT5" },
  { id: "mt4",          name: "MT4" },
  { id: "matchtrader",  name: "MatchTrader" },
  { id: "ctrader",      name: "CTrader" },
  { id: "tradelocker",  name: "TradeLocker" },
  { id: "dxtrade",      name: "DXTrade" },
  { id: "binance",      name: "Binance" },
  { id: "bybit",        name: "ByBit" },
  { id: "bitget",       name: "Bitget" },
  { id: "bitunix",      name: "Bitunix" },
  { id: "coinbase",     name: "CoinBase" },
  { id: "charlesschwab",name: "Charles Schwab" },
];

// ── Auth helper ───────────────────────────────────────────────────────────────
async function authHeaders(): Promise<HeadersInit> {
  const result = await (supabase?.auth.getSession() ?? Promise.resolve({ data: { session: null } }));
  const session = result.data.session;
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${session?.access_token ?? ""}`,
  };
}

// ── Sync status badge ─────────────────────────────────────────────────────────
function SyncBadge({ status, lastSyncAt }: { status: string; lastSyncAt: string | null }) {
  const color = status === "ok" ? "#4ade80" : status === "error" ? "#ef4444" : status === "syncing" ? "#facc15" : "#64748b";
  const label = status === "ok" && lastSyncAt
    ? new Date(lastSyncAt).toLocaleDateString()
    : status === "error" ? "Error" : status === "syncing" ? "Syncing…" : "Pending";
  return <span style={{ color, fontWeight: 600, fontSize: 13 }}>{label}</span>;
}

// ── Copy-to-clipboard button ──────────────────────────────────────────────────
function CopyBtn({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      style={{ background: "none", border: "none", cursor: "pointer", padding: "2px 4px" }}
      onClick={() => { navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 2000); }}
      title="Copy"
    >
      {copied ? <Check size={13} color="#4ade80" /> : <Copy size={13} color="#94a3b8" />}
    </button>
  );
}

// ── Platform credential config ────────────────────────────────────────────────
const WEBHOOK_PLATFORMS  = new Set(['mt4', 'mt5', 'matchtrader', 'dxtrade', 'tradelocker', 'charlesschwab']);
const CRYPTO_PLATFORMS   = new Set(['binance', 'bybit', 'bitget', 'bitunix', 'coinbase']);
const CTRADER_PLATFORM   = 'ctrader';

function platformConnType(pid: string): 'webhook' | 'api' {
  return WEBHOOK_PLATFORMS.has(pid) ? 'webhook' : 'api';
}

// ── Add Account Form (step 2 after platform selection) ───────────────────────
interface AddFormProps {
  platform: string;
  onCancel: () => void;
  onCreated: (account: BrokerAccount) => void;
}

function AddAccountForm({ platform, onCancel, onCreated }: AddFormProps) {
  const [name,        setName]        = useState("");
  const [loginId,     setLoginId]     = useState("");     // account no. / API key
  const [secret,      setSecret]      = useState("");     // API secret
  const [passphrase,  setPassphrase]  = useState("");     // Bitget only
  const [server,      setServer]      = useState("");     // MT4/5 server or Binance symbol list
  const [accountType, setAccountType] = useState<"demo"|"live"|"funded">("demo");
  const [busy,        setBusy]        = useState(false);
  const [error,       setError]       = useState("");

  const isMT    = WEBHOOK_PLATFORMS.has(platform);
  const isCT    = platform === CTRADER_PLATFORM;
  const isCrypto = CRYPTO_PLATFORMS.has(platform);
  const connType = platformConnType(platform);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name)    { setError("Display name is required."); return; }
    if (!isCT && !loginId) { setError(isCrypto ? "API Key is required." : "Account Number is required."); return; }

    setBusy(true); setError("");
    try {
      // Build password payload: for crypto, encrypt as JSON
      let passwordPayload: string | undefined;
      if (isCrypto) {
        const creds: Record<string, string> = { secret };
        if (passphrase) creds.passphrase = passphrase;
        passwordPayload = JSON.stringify(creds);
      } else if (isMT) {
        passwordPayload = secret || undefined;
      }

      const body: Record<string, any> = {
        name,
        loginId:         isCT ? `pending_${Date.now()}` : loginId,
        password:        passwordPayload,
        server:          server || undefined,
        platform,
        accountType,
        connectionType:  connType,
      };

      const res  = await fetch("/api/broker-accounts", {
        method: "POST",
        headers: await authHeaders(),
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || "Failed to add account"); return; }
      onCreated(data as BrokerAccount);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  const inp: CSSProperties = { background: "#0d1827", border: "1px solid #1e3050", color: "#e2e8f0", borderRadius: 0, padding: "9px 12px", fontSize: 13, width: "100%", outline: "none" };
  const lbl: CSSProperties = { color: "#64748b", fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em", display: "block", marginBottom: 5 };
  const pname = PLATFORMS.find(p => p.id === platform)?.name ?? platform;

  return (
    <form onSubmit={handleSubmit} style={{ padding: "0 24px 24px", display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ color: "#94a3b8", fontSize: 13, marginBottom: 4 }}>
        Platform: <strong style={{ color: "#38bdf8" }}>{pname}</strong>
        <span style={{ marginLeft: 10, fontSize: 11, color: connType === 'webhook' ? '#facc15' : '#4ade80', fontWeight: 600 }}>
          {connType === 'webhook' ? '⚡ EA Webhook' : '🔗 REST API'}
        </span>
      </div>

      {/* Common */}
      <div><label style={lbl}>Display Name *</label>
        <input style={inp} placeholder={`e.g. My ${pname} Account`} value={name} onChange={e => setName(e.target.value)} required />
      </div>

      {/* MT4/MT5/webhook platforms */}
      {isMT && (<>
        <div><label style={lbl}>Account Number *</label>
          <input style={inp} placeholder="e.g. 10676855" value={loginId} onChange={e => setLoginId(e.target.value)} required />
        </div>
        <div><label style={lbl}>Broker Server</label>
          <input style={inp} placeholder="e.g. ICMarkets-Live01" value={server} onChange={e => setServer(e.target.value)} />
        </div>
        <div><label style={lbl}>Investor Password (optional)</label>
          <input style={inp} type="password" placeholder="Read-only investor password" value={secret} onChange={e => setSecret(e.target.value)} />
        </div>
        <div style={{ background: "#0a1628", border: "1px solid #1e3a55", padding: "11px 14px", fontSize: 12, color: "#64748b" }}>
          After adding, you'll receive a webhook URL. Install the EA on any chart — trades sync automatically.
        </div>
      </>)}

      {/* Crypto exchanges */}
      {isCrypto && (<>
        <div><label style={lbl}>API Key *</label>
          <input style={inp} placeholder="Paste your API key" value={loginId} onChange={e => setLoginId(e.target.value)} required />
        </div>
        <div><label style={lbl}>API Secret *</label>
          <input style={inp} type="password" placeholder="Paste your API secret" value={secret} onChange={e => setSecret(e.target.value)} required />
        </div>
        {platform === 'bitget' && (
          <div><label style={lbl}>Passphrase *</label>
            <input style={inp} type="password" placeholder="Bitget API passphrase" value={passphrase} onChange={e => setPassphrase(e.target.value)} required />
          </div>
        )}
        {platform === 'binance' && (
          <div><label style={lbl}>Trading Pairs (Spot only — leave blank for Futures)</label>
            <input style={inp} placeholder="e.g. BTCUSDT, ETHUSDT" value={server} onChange={e => setServer(e.target.value)} />
          </div>
        )}
        <div style={{ background: "#0a1628", border: "1px solid #1e3a55", padding: "11px 14px", fontSize: 12, color: "#64748b" }}>
          Use a <strong style={{ color: "#38bdf8" }}>read-only API key</strong> — FSD Journal only reads your trade history, never places orders.
        </div>
      </>)}

      {/* cTrader — OAuth flow */}
      {isCT && (
        <div style={{ background: "#0a1628", border: "1px solid #1e3a55", padding: "14px", fontSize: 13, color: "#94a3b8", display: "flex", flexDirection: "column", gap: 8 }}>
          <div>cTrader uses OAuth — after adding the account you'll be redirected to cTrader to authorize access.</div>
          <div style={{ fontSize: 12, color: "#64748b" }}>No passwords are stored. FSD Journal receives a read-only access token.</div>
        </div>
      )}

      <div>
        <label style={lbl}>Account Type</label>
        <select style={inp} value={accountType} onChange={e => setAccountType(e.target.value as any)}>
          <option value="demo">DEMO</option>
          <option value="live">LIVE</option>
          <option value="funded">FUNDED</option>
        </select>
      </div>

      {error && <div style={{ color: "#ef4444", fontSize: 12 }}>{error}</div>}

      <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
        <button type="button" onClick={onCancel} style={{ background: "none", border: "1px solid #1e3050", color: "#94a3b8", padding: "9px 20px", cursor: "pointer", fontSize: 13, fontWeight: 600 }}>Cancel</button>
        <button type="submit" disabled={busy} style={{ background: "linear-gradient(to right,#1d4ed8,#3b82f6)", border: "none", color: "white", padding: "9px 20px", cursor: busy ? "not-allowed" : "pointer", fontSize: 13, fontWeight: 700, opacity: busy ? 0.7 : 1, display: "flex", alignItems: "center", gap: 6 }}>
          {busy ? "Adding…" : isCT ? (<>Authorize with cTrader <ExternalLink size={13} /></>) : "Add Account"}
        </button>
      </div>
    </form>
  );
}

// ── Webhook info modal ────────────────────────────────────────────────────────
const SETUP_STEPS = [
  { n: "1", text: "Download the EA file using the button above." },
  { n: "2", text: "In MT5: File → Open Data Folder → MQL5 → Experts. Copy the file there." },
  { n: "3", text: "Back in MT5 press F5 (or right-click Navigator → Refresh). The EA appears under Expert Advisors." },
  { n: "4", text: "Drag the EA onto any chart (any symbol / any timeframe)." },
  { n: "5", text: "In the EA inputs, paste your Webhook URL (copy it below)." },
  { n: "6", text: "Go to Tools → Options → Expert Advisors → Allow WebRequest. Add your server domain." },
  { n: "7", text: "Click the Auto Trading button in the toolbar (or press F7). Done — trades sync automatically." },
];

function WebhookModal({ account, onClose }: { account: BrokerAccount; onClose: () => void }) {
  const webhookUrl = `${window.location.origin}/api/broker/webhook/${account.webhookToken}`;

  return (
    <div style={s.overlay as CSSProperties} onClick={onClose}>
      <div style={{ ...s.modal, width: 560, maxWidth: "95vw" } as CSSProperties} onClick={e => e.stopPropagation()}>
        <div style={s.modalHeader as CSSProperties}>
          <h2 style={s.modalTitle as CSSProperties}>EA Setup — {account.name}</h2>
          <button style={s.closeBtn as CSSProperties} onClick={onClose}>✕</button>
        </div>

        <div style={{ padding: "20px 24px 28px", display: "flex", flexDirection: "column", gap: 20 }}>

          {/* Download */}
          <a
            href="/ea/FSD_Journal_EA.mq5"
            download="FSD_Journal_EA.mq5"
            style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 10, background: "linear-gradient(to right,#1d4ed8,#3b82f6)", color: "#fff", padding: "13px 20px", fontWeight: 700, fontSize: 14, textDecoration: "none", borderRadius: 4 }}
          >
            ⬇ Download FSD_Journal_EA.mq5
          </a>

          {/* Steps */}
          <div>
            <div style={{ color: "#64748b", fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 12 }}>Setup Steps</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {SETUP_STEPS.map(step => (
                <div key={step.n} style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
                  <span style={{ minWidth: 24, height: 24, background: "#1e3a6e", color: "#60a5fa", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700, flexShrink: 0 }}>{step.n}</span>
                  <span style={{ color: "#94a3b8", fontSize: 13, lineHeight: 1.5 }}>{step.text}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Webhook URL */}
          <div>
            <div style={{ color: "#64748b", fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8 }}>Your Webhook URL</div>
            <div style={{ background: "#070f1e", border: "1px solid #1e3a55", padding: "11px 14px", display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ color: "#38bdf8", fontSize: 12, fontFamily: "monospace", flex: 1, wordBreak: "break-all" }}>{webhookUrl}</span>
              <CopyBtn text={webhookUrl} />
            </div>
            <p style={{ color: "#475569", fontSize: 11, margin: "6px 0 0" }}>Paste this URL into the EA's <strong style={{ color: "#64748b" }}>InpWebhookURL</strong> input field.</p>
          </div>

          {/* Info note */}
          <div style={{ background: "#0c1e10", border: "1px solid #1a4020", padding: "11px 14px", borderRadius: 4 }}>
            <span style={{ color: "#4ade80", fontSize: 12, fontWeight: 600 }}>How it works: </span>
            <span style={{ color: "#6b8f72", fontSize: 12 }}>When you close a trade in MT5, the EA automatically posts it to FSD Journal. It is journaled instantly with P&amp;L, session, pips, and duration — no manual entry needed.</span>
          </div>

          <button onClick={onClose} style={{ background: "#1e293b", border: "1px solid #334155", color: "#94a3b8", padding: "10px 20px", cursor: "pointer", fontSize: 13, fontWeight: 600, alignSelf: "flex-end" }}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main AccountsPage ─────────────────────────────────────────────────────────
export default function AccountsPage({ openModal = false }: { openModal?: boolean }) {
  const { session } = useAuth();
  const [accounts,    setAccounts]    = useState<BrokerAccount[]>([]);
  const [loading,     setLoading]     = useState(true);
  const [modalOpen,   setModalOpen]   = useState(openModal);
  const [selectedPlatform, setSelectedPlatform] = useState<string | null>(null);
  const [showForm,    setShowForm]    = useState(false);
  const [webhookAcc,  setWebhookAcc]  = useState<BrokerAccount | null>(null);
  const [info,        setInfo]        = useState<string | null>(null);
  const [pageSize,    setPageSize]    = useState(10);
  const [page,        setPage]        = useState(1);
  const [isMobile,    setIsMobile]    = useState(false);

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 640);
    check(); window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  useEffect(() => { if (session) fetchAccounts(); }, [session]);
  useEffect(() => { setModalOpen(openModal); }, [openModal]);

  // Handle cTrader OAuth callback query params
  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    if (p.get('ctrader_connected')) {
      setInfo('cTrader connected! Click Sync on the account to import your trades.');
      window.history.replaceState({}, '', '/accounts');
      fetchAccounts();
    } else if (p.get('ctrader_error')) {
      setInfo(`cTrader error: ${decodeURIComponent(p.get('ctrader_error') ?? '')}`);
      window.history.replaceState({}, '', '/accounts');
    }
  }, []);

  async function fetchAccounts() {
    setLoading(true);
    try {
      const res = await fetch("/api/broker-accounts", { headers: await authHeaders() });
      if (res.ok) setAccounts(await res.json());
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Remove this account? Synced trades will also be deleted.")) return;
    await fetch(`/api/broker-accounts/${id}`, { method: "DELETE", headers: await authHeaders() });
    setAccounts(prev => prev.filter(a => a.id !== id));
  }

  async function handleSync(account: BrokerAccount) {
    if (account.connectionType === "webhook") { setWebhookAcc(account); return; }
    await fetch(`/api/broker-accounts/${account.id}/sync`, { method: "POST", headers: await authHeaders() });
    fetchAccounts();
  }

  async function handleCreated(account: BrokerAccount) {
    setAccounts(prev => [account, ...prev]);
    setModalOpen(false);
    setShowForm(false);
    setSelectedPlatform(null);

    if (account.connectionType === "webhook") { setWebhookAcc(account); return; }

    // cTrader: kick off OAuth redirect
    if (account.platform === "ctrader") {
      try {
        const res  = await fetch(`/api/broker/ctrader/connect?accountId=${account.id}`, { headers: await authHeaders() });
        const data = await res.json();
        if (data.url) window.location.href = data.url;
        else setInfo(`cTrader connect failed: ${data.error}`);
      } catch (err: any) { setInfo(`cTrader connect failed: ${err.message}`); }
    }
  }

  const totalPages = Math.max(1, Math.ceil(accounts.length / pageSize));
  const paged = accounts.slice((page - 1) * pageSize, page * pageSize);

  return (
    <div style={s.root as CSSProperties}>
      <style>{`* { box-sizing: border-box; } ::-webkit-scrollbar { height: 4px; width: 4px; background: #0b1220; } ::-webkit-scrollbar-thumb { background: #1e293b; }`}</style>

      {/* Top Banner */}
      <div style={s.banner as CSSProperties}>
        <span style={{ color: "#38bdf8" }}>ⓘ</span>
        <span>Issues syncing? Try an account history repair</span>
        <span>🔧</span>
      </div>

      {/* OAuth / info message */}
      {info && (
        <div style={{ background: "#0c2a1a", border: "1px solid #166534", padding: "10px 24px", fontSize: 13, color: "#4ade80", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span>{info}</span>
          <button onClick={() => setInfo(null)} style={{ background: "none", border: "none", color: "#4ade80", cursor: "pointer", fontSize: 16 }}>✕</button>
        </div>
      )}

      <div style={{ padding: isMobile ? "0 12px 20px" : "0 24px 24px", flex: 1 }}>
        {/* Tab row */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "14px 0 0", marginBottom: 16, flexWrap: "wrap", gap: 10 }}>
          <div style={{ display: "flex", gap: 28, alignItems: "center" }}>
            <button style={{ ...s.tab, ...s.tabActive } as CSSProperties}>Accounts</button>
            <button style={s.tab as CSSProperties}>Portfolios <span style={s.proBadge as CSSProperties}>Pro</span></button>
          </div>
          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
            <span style={s.counter as CSSProperties}>{accounts.length}/20</span>
            <button style={s.addBtn as CSSProperties} onClick={() => { setModalOpen(true); setShowForm(false); setSelectedPlatform(null); }}>
              <span style={{ fontSize: 18, lineHeight: 1 }}>+</span> {isMobile ? "Add" : "Add Account"}
            </button>
            <button style={s.syncBtn as CSSProperties} onClick={fetchAccounts}>
              <span style={{ fontSize: 14 }}>↻</span> {isMobile ? "Sync" : "Sync All"}
            </button>
          </div>
        </div>

        {/* Table */}
        <div style={{ ...s.tableWrap, overflowX: "auto" } as CSSProperties}>
          <table style={{ ...s.table, minWidth: 620 } as CSSProperties}>
            <thead>
              <tr>
                {["Name", "Number", "Server", "Type", "Platform", "Balance", "Connection", "Last Sync", "Actions"].map(h => (
                  <th key={h} style={s.th as CSSProperties}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={9} style={{ ...s.td, textAlign: "center", color: "#38bdf8", padding: 24 } as CSSProperties}>Loading accounts…</td></tr>
              ) : paged.length === 0 ? (
                <tr><td colSpan={9} style={{ ...s.td, textAlign: "center", color: "#64748b", padding: 28 } as CSSProperties}>
                  No accounts yet. Click <strong style={{ color: "#38bdf8" }}>+ Add Account</strong> to connect your first broker.
                </td></tr>
              ) : paged.map(a => (
                <tr key={a.id} style={s.tr as CSSProperties}>
                  <td style={s.td as CSSProperties}>{a.name}</td>
                  <td style={{ ...s.td, color: "#38bdf8", fontWeight: 700 } as CSSProperties}>{a.loginId}</td>
                  <td style={{ ...s.td, maxWidth: 110, overflow: "hidden", textOverflow: "ellipsis" } as CSSProperties}>{a.server ?? "—"}</td>
                  <td style={{ ...s.td, color: a.accountType === "live" ? "#4ade80" : a.accountType === "funded" ? "#a78bfa" : "#ef4444", fontWeight: 700 } as CSSProperties}>
                    {a.accountType.toUpperCase()}
                  </td>
                  <td style={s.td as CSSProperties}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <span style={{ width: 22, height: 22, background: "#1a3a5c", display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 12 }}>⚙</span>
                      {a.platform.toUpperCase()}
                    </div>
                  </td>
                  <td style={s.td as CSSProperties}>{a.balance ? `$${parseFloat(a.balance).toLocaleString(undefined, { minimumFractionDigits: 2 })}` : "—"}</td>
                  <td style={s.td as CSSProperties}>{a.connectionType === "webhook" ? "EA" : "API"}</td>
                  <td style={s.td as CSSProperties}><SyncBadge status={a.syncStatus} lastSyncAt={a.lastSyncAt} /></td>
                  <td style={s.td as CSSProperties}>
                    <div style={{ display: "flex", gap: isMobile ? 2 : 5, alignItems: "center" }}>
                      <button style={s.actionBtn as CSSProperties} title="Webhook / Settings" onClick={() => setWebhookAcc(a)}><Wrench size={14} color="#f59e0b" /></button>
                      <button style={s.actionBtn as CSSProperties} title="Sync" onClick={() => handleSync(a)}><RefreshCw size={14} color="#94a3b8" /></button>
                      <button style={s.actionBtn as CSSProperties} title="Edit"><Pencil size={14} color="#38bdf8" /></button>
                      <button style={s.actionBtn as CSSProperties} title="Delete" onClick={() => handleDelete(a.id)}><Trash2 size={14} color="#ef4444" /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 10, padding: "14px 0 0", fontSize: 13, color: "#64748b", flexWrap: "wrap" }}>
          <span>Page Size:</span>
          <select style={s.pageSelect as CSSProperties} value={pageSize} onChange={e => { setPageSize(Number(e.target.value)); setPage(1); }}>
            {[10, 25, 50].map(n => <option key={n} value={n}>{n}</option>)}
          </select>
          <span>{Math.min((page - 1) * pageSize + 1, accounts.length)} to {Math.min(page * pageSize, accounts.length)} of {accounts.length}</span>
          <div style={{ display: "flex", gap: 4 }}>
            {[["«", 1], ["‹", page - 1], ["›", page + 1], ["»", totalPages]].map(([label, target]) => (
              <button key={label} style={s.pageBtn as CSSProperties} onClick={() => setPage(Math.max(1, Math.min(totalPages, Number(target))))}>
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Add Account Modal */}
      {modalOpen && (
        <div style={s.overlay as CSSProperties} onClick={() => { setModalOpen(false); setShowForm(false); setSelectedPlatform(null); }}>
          <div style={{ ...s.modal, width: isMobile ? "100%" : 560, maxWidth: isMobile ? "100%" : "95vw" } as CSSProperties} onClick={e => e.stopPropagation()}>
            <div style={s.modalHeader as CSSProperties}>
              <h2 style={s.modalTitle as CSSProperties}>{showForm ? "Account Details" : "Select trading platform"}</h2>
              <button style={s.closeBtn as CSSProperties} onClick={() => { setModalOpen(false); setShowForm(false); setSelectedPlatform(null); }}>✕</button>
            </div>

            {!showForm ? (
              <div style={{ padding: "18px 24px 24px" }}>
                <div style={{ display: "grid", gridTemplateColumns: isMobile ? "repeat(3,1fr)" : "repeat(4,1fr)", gap: 10, marginBottom: 20 }}>
                  {PLATFORMS.map(p => (
                    <button
                      key={p.id}
                      style={{ ...s.platformCard, ...(selectedPlatform === p.id ? s.platformCardSelected : {}) } as CSSProperties}
                      onClick={() => setSelectedPlatform(p.id)}
                    >
                      <span style={{ fontSize: 22 }}>⚙</span>
                      <span style={{ fontSize: 11, fontWeight: 600, textAlign: "center" }}>{p.name}</span>
                    </button>
                  ))}
                </div>
                <button
                  disabled={!selectedPlatform}
                  onClick={() => setShowForm(true)}
                  style={{ width: "100%", background: selectedPlatform ? "#1d6ed8" : "#1e293b", border: "none", color: selectedPlatform ? "white" : "#475569", padding: "11px", fontWeight: 700, fontSize: 14, cursor: selectedPlatform ? "pointer" : "not-allowed" }}
                >
                  Continue →
                </button>
              </div>
            ) : (
              <AddAccountForm
                platform={selectedPlatform!}
                onCancel={() => setShowForm(false)}
                onCreated={handleCreated}
              />
            )}
          </div>
        </div>
      )}

      {/* Webhook Info Modal */}
      {webhookAcc && <WebhookModal account={webhookAcc} onClose={() => setWebhookAcc(null)} />}
    </div>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────
const s: Record<string, CSSProperties> = {
  root:    { minHeight: "100%", background: "#070d1a", fontFamily: "'Montserrat','Segoe UI',sans-serif", color: "#cbd5e1", display: "flex", flexDirection: "column" },
  banner:  { background: "#0c1a2e", borderBottom: "1px solid #1a3050", padding: "10px 24px", fontSize: 13, color: "#94a3b8", display: "flex", alignItems: "center", gap: 6 },
  tab:     { background: "none", border: "none", color: "#64748b", fontSize: 15, fontWeight: 500, cursor: "pointer", padding: "6px 0", display: "flex", alignItems: "center", gap: 6, fontFamily: "inherit" },
  tabActive:{ color: "#38bdf8", borderBottom: "2px solid #38bdf8", fontWeight: 700 },
  proBadge:{ background: "#1e40af", color: "#93c5fd", fontSize: 10, fontWeight: 700, padding: "2px 6px" },
  counter: { background: "#1e293b", border: "1px solid #334155", padding: "4px 10px", fontSize: 13, color: "#94a3b8" },
  addBtn:  { background: "transparent", border: "1.5px solid #38bdf8", color: "#38bdf8", padding: "7px 16px", fontSize: 13, fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", gap: 6, fontFamily: "inherit" },
  syncBtn: { background: "transparent", border: "1.5px solid #334155", color: "#94a3b8", padding: "7px 16px", fontSize: 13, fontWeight: 500, cursor: "pointer", display: "flex", alignItems: "center", gap: 6, fontFamily: "inherit" },
  tableWrap:{ border: "1px solid #1e293b", overflow: "hidden" },
  table:   { width: "100%", borderCollapse: "collapse", background: "#0b1220" },
  th:      { padding: "12px 14px", textAlign: "left", fontSize: 12, fontWeight: 600, color: "#64748b", borderBottom: "1px solid #1e293b", whiteSpace: "nowrap" },
  tr:      { borderBottom: "1px solid #111d30" },
  td:      { padding: "13px 14px", fontSize: 13, color: "#cbd5e1", whiteSpace: "nowrap" },
  actionBtn:{ background: "none", border: "none", color: "#94a3b8", cursor: "pointer", padding: "2px 4px" },
  pageSelect:{ background: "#1e293b", border: "1px solid #334155", color: "#cbd5e1", padding: "3px 8px", fontSize: 12, cursor: "pointer" },
  pageBtn: { background: "none", border: "1px solid #1e293b", color: "#64748b", padding: "3px 8px", cursor: "pointer", fontSize: 12 },
  overlay: { position: "fixed", inset: 0, background: "rgba(0,0,0,0.75)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, backdropFilter: "blur(4px)" },
  modal:   { background: "#0d1827", border: "1px solid #1e3050", width: 560, maxWidth: "95vw", maxHeight: "90vh", overflowY: "auto", position: "relative", boxShadow: "0 24px 80px rgba(0,0,0,0.7)" },
  modalHeader:{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "20px 24px 14px", position: "sticky", top: 0, background: "#0d1827", zIndex: 1, borderBottom: "1px solid #1e3050" },
  modalTitle: { fontSize: 17, fontWeight: 700, color: "#f1f5f9", margin: 0 },
  closeBtn:   { background: "none", border: "none", color: "#ef4444", fontSize: 18, cursor: "pointer", padding: "2px 6px" },
  platformCard:       { background: "#111e30", border: "1.5px solid #1e3050", padding: "14px 8px 10px", display: "flex", flexDirection: "column", alignItems: "center", gap: 8, cursor: "pointer", color: "#e2e8f0", fontFamily: "inherit" },
  platformCardSelected:{ border: "1.5px solid #38bdf8", background: "#0c2233" },
};
