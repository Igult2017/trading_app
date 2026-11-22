import { useState, useEffect, CSSProperties } from "react";
import { Trash2, Copy, Check, ExternalLink, History } from "lucide-react";
import { SiBinance, SiBuiltbybit, SiCoinbase } from "react-icons/si";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/context/AuthContext";
import { queryClient } from "@/lib/queryClient";
import Brand from '@/components/Brand';
import { label, syncOne, startSyncAll, readSyncAll, pendingIds, summariseRun,
         type SyncResult, type SyncAllRun } from "@/lib/accountSync";
import { useJournalStream } from "@/hooks/useJournalStream";
// His new design (22 Nov 2026): the page's parts, its account shape and its light + dark colours.
import { type BrokerAccount, DISCONNECTED, DARK, LIGHT, displayName } from "@/components/accounts/accountTypes";
import { AccountRow, AccountsColumnHeads } from "@/components/accounts/AccountRow";
import { AccountsHeader, AccountsFilters, type TypeFilter } from "@/components/accounts/AccountsHeader";
import { AccountsPager, SyncLogDialog, RepairPickerDialog } from "@/components/accounts/AccountsDialogs";

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

// ── Platform icons ────────────────────────────────────────────────────────────
const PLATFORM_ICON_META: Record<string, { icon?: React.ReactNode; color: string; letters: string }> = {
  mt5:           { color: '#1BA262', letters: 'MT5' },
  mt4:           { color: '#1BA262', letters: 'MT4' },
  matchtrader:   { color: '#4F9CF9', letters: 'MTR' },
  ctrader:       { color: '#F05A22', letters: 'CT'  },
  tradelocker:   { color: '#7C3AED', letters: 'TL'  },
  dxtrade:       { color: '#3B82F6', letters: 'DX'  },
  binance:       { icon: <SiBinance />,  color: '#F3BA2F', letters: 'BN' },
  bybit:         { icon: <SiBuiltbybit />, color: '#F7A600', letters: 'BB' },
  bitget:        { color: '#00CDD1', letters: 'BG' },
  bitunix:       { color: '#FF6B35', letters: 'BU'  },
  coinbase:      { icon: <SiCoinbase />, color: '#0052FF', letters: 'CB' },
  charlesschwab: { color: '#00A0DF', letters: 'CS'  },
};

// ── Brand logos for the major platforms (inline SVG → crisp at any size) ──────
// Official cTrader brand mark (the red "c", #FF101F) — sourced from ctrader.com.
const CTraderLogo = ({ size = 36 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 32 32" fill="none" style={{ flexShrink: 0 }} aria-label="cTrader">
    <path fill="#FF101F" d="M16 0C7.176 0 0 7.176 0 16s7.176 16 16 16 16-7.177 16-16S24.823 0 16 0m0 2.572c7.17 0 13.045 5.647 13.41 12.727q.017.349.018.701c0 6.873-5.294 9.419-8.13 9.784-4.484.576-8.26-1.845-8.26-6.584 0-4.492 4.967-8.381 11.258-6.466l.814-3.663c-2.28-1.109-4.731-1.612-7.127-1.612-9.209 0-14.969 6.85-14.437 13.068-.05.026-.118.064-.186.101-.421-1.39-.647-2.936-.647-4.628C2.713 8.595 8.595 2.572 16 2.572" />
  </svg>
);
const MetaTraderLogo = ({ size = 36, n = '5' }: { size?: number; n?: string }) => (
  <svg width={size} height={size} viewBox="0 0 100 100" style={{ flexShrink: 0 }} aria-label={`MetaTrader ${n}`}>
    <rect width="100" height="100" rx="24" fill="#0A1A33" />
    <text x="50" y="55" textAnchor="middle" dominantBaseline="central" fontSize="62" fontWeight="900" fill="#EFA42A" fontFamily="Georgia, 'Times New Roman', serif">{n}</text>
  </svg>
);
const PLATFORM_LOGOS: Record<string, (size: number) => React.ReactNode> = {
  ctrader: (s) => <CTraderLogo size={s} />,
  mt5:     (s) => <MetaTraderLogo size={s} n="5" />,
  mt4:     (s) => <MetaTraderLogo size={s} n="4" />,
};

function PlatformIcon({ id, size = 36 }: { id: string; size?: number }) {
  const logo = PLATFORM_LOGOS[id];
  if (logo) return <span style={{ display: 'inline-flex', lineHeight: 0, flexShrink: 0 }}>{logo(size)}</span>;
  const meta = PLATFORM_ICON_META[id] ?? { color: '#64748b', letters: '?' };
  return (
    <div style={{ width: size, height: size, background: `${meta.color}22`, border: `1.5px solid ${meta.color}55`, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', color: meta.color, fontSize: meta.icon ? size * 0.58 : size * 0.3, fontWeight: 800, flexShrink: 0 }}>
      {meta.icon ?? meta.letters}
    </div>
  );
}

// ── Platform credential config ────────────────────────────────────────────────
const WEBHOOK_PLATFORMS  = new Set(['mt4', 'mt5', 'matchtrader', 'charlesschwab']);
const CRYPTO_PLATFORMS   = new Set(['binance', 'bybit', 'bitget', 'bitunix', 'coinbase']);
const BROKER_API_PLATFORMS = new Set(['dxtrade', 'tradelocker']);   // REST API, no OAuth
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
  const [ctConfigured, setCtConfigured] = useState<boolean | null>(null);

  const isMT        = WEBHOOK_PLATFORMS.has(platform);
  const isCT        = platform === CTRADER_PLATFORM;
  const isCrypto    = CRYPTO_PLATFORMS.has(platform);
  const isBrokerApi = BROKER_API_PLATFORMS.has(platform);
  const connType    = platformConnType(platform);

  useEffect(() => {
    if (isCT) fetch("/api/broker/ctrader/configured").then(r => r.json()).then(d => setCtConfigured(d.configured)).catch(() => setCtConfigured(false));
  }, [isCT]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name) { setError("Display name is required."); return; }
    if (!isCT && !loginId) { setError(isCrypto ? "API Key is required." : isBrokerApi ? "Username / Email is required." : "Account Number is required."); return; }
    if (isBrokerApi && !secret) { setError("Password is required."); return; }
    if (isBrokerApi && platform === 'dxtrade' && !server) { setError("Broker API URL is required."); return; }

    setBusy(true); setError("");
    try {
      let passwordPayload: string | undefined;
      if (isCrypto) {
        const creds: Record<string, string> = { secret };
        if (passphrase) creds.passphrase = passphrase;
        passwordPayload = JSON.stringify(creds);
      } else if (isBrokerApi) {
        passwordPayload = JSON.stringify({ password: secret });
      } else if (isMT) {
        passwordPayload = secret || undefined;
      }

      const body: Record<string, any> = {
        name,
        loginId:        isCT ? `pending_${Date.now()}` : loginId,
        password:       passwordPayload,
        server:         server || undefined,
        platform,
        accountType,
        connectionType: connType,
      };

      const headers = await authHeaders();
      const res  = await fetch("/api/broker-accounts", { method: "POST", headers, body: JSON.stringify(body) });
      const data = await res.json();
      if (!res.ok) { setError(data.error || "Failed to add account"); return; }

      if (isCT && data.id) {
        const connectRes = await fetch(`/api/broker/ctrader/connect?accountId=${data.id}`, { headers });
        const connectData = await connectRes.json();
        if (connectData.url) { window.location.href = connectData.url; return; }
        setError(connectData.error || "cTrader OAuth is not configured on the server.");
        return;
      }

      onCreated(data as BrokerAccount);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  const inp: CSSProperties = { background: "#0d1827", border: "1px solid #1e3050", color: "#e2e8f0", borderRadius: 0, padding: "9px 12px", fontSize: 15.5, width: "100%", outline: "none" };
  const lbl: CSSProperties = { color: "#64748b", fontSize: 13.5, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em", display: "block", marginBottom: 5 };
  const pname = PLATFORMS.find(p => p.id === platform)?.name ?? platform;

  return (
    <form onSubmit={handleSubmit} style={{ padding: "0 24px 24px", display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ color: "#94a3b8", fontSize: 15.5, marginBottom: 4 }}>
        Platform: <strong style={{ color: "#38bdf8" }}>{pname}</strong>
        <span style={{ marginLeft: 10, fontSize: 13.5, color: connType === 'webhook' ? '#facc15' : '#4ade80', fontWeight: 600 }}>
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
        <div style={{ background: "#0a1628", border: "1px solid #1e3a55", padding: "11px 14px", fontSize: 14.5, color: "#64748b" }}>
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
        <div style={{ background: "#0a1628", border: "1px solid #1e3a55", padding: "11px 14px", fontSize: 14.5, color: "#64748b" }}>
          Use a <strong style={{ color: "#38bdf8" }}>read-only API key</strong> — <Brand /> only reads your trade history, never places orders.
        </div>
      </>)}

      {/* DXTrade / TradeLocker — username + password + server */}
      {isBrokerApi && (<>
        <div><label style={lbl}>{platform === 'tradelocker' ? 'Email *' : 'Username *'}</label>
          <input style={inp} placeholder={platform === 'tradelocker' ? 'your@email.com' : 'Your login username'} value={loginId} onChange={e => setLoginId(e.target.value)} required />
        </div>
        <div><label style={lbl}>Password *</label>
          <input style={inp} type="password" placeholder="Your account password" value={secret} onChange={e => setSecret(e.target.value)} required />
        </div>
        {platform === 'dxtrade' && (
          <div><label style={lbl}>Broker API URL *</label>
            <input style={inp} placeholder="https://trade.yourbroker.com" value={server} onChange={e => setServer(e.target.value)} required />
          </div>
        )}
        {platform === 'tradelocker' && (
          <div><label style={lbl}>Broker Server</label>
            <input style={inp} placeholder="e.g. ICMarkets-Live01" value={server} onChange={e => setServer(e.target.value)} />
          </div>
        )}
        <div style={{ background: "#0a1628", border: "1px solid #1e3a55", padding: "11px 14px", fontSize: 14.5, color: "#64748b" }}>
          Connects via REST API — no EA or desktop terminal needed. Closed trades arrive the moment they close, and a daily check catches anything missed.
        </div>
      </>)}

      {/* cTrader — OAuth only (cTrader ID supports Google login) */}
      {isCT && (
        ctConfigured === false ? (
          <div style={{ background: "#120a04", border: "1px solid #7c2d12", padding: "14px 16px", fontSize: 14.5, color: "#fca5a5", display: "flex", flexDirection: "column", gap: 8 }}>
            <div style={{ fontWeight: 700, fontSize: 15.5, color: "#f87171" }}>cTrader connection pending Spotware approval</div>
            <div>The app has been submitted to Spotware for review. KYC approval takes up to 3 business days. Once the status changes to <strong>Active</strong>, cTrader accounts can be connected here automatically — no further setup needed.</div>
          </div>
        ) : (
          <div style={{ background: "#0a1628", border: "1px solid #1e3a55", padding: "14px 16px", fontSize: 15.5, color: "#94a3b8", display: "flex", flexDirection: "column", gap: 8 }}>
            <div style={{ color: "#38bdf8", fontWeight: 600 }}>No account ID or password required</div>
            <div>Click <strong>Connect with cTrader</strong> below. You'll be taken to cTrader's login page — sign in with your <strong>broker credentials, Google, or email</strong>. Your account number, balance, and trade history are fetched automatically after you approve access.</div>
            <div style={{ fontSize: 13.5, color: "#475569" }}>Works with Pepperstone, IC Markets, Exness, FP Markets, and all cTrader-powered brokers.</div>
          </div>
        )
      )}

      {/* NOT OFFERED FOR cTRADER — signing in tells us, and asking first would be asking him to
          guess at something the broker is about to state. The value chosen here used to survive
          until sign-in overwrote it, so the form could show LIVE for a demo account and look like
          the app had got it wrong. */}
      {isCT ? (
        <div>
          <label style={lbl}>Account Type</label>
          <div style={{ ...inp, cursor: 'default', color: '#94a3b8' }}>Read from cTrader when you sign in</div>
        </div>
      ) : (
        <div>
          <label style={lbl}>Account Type</label>
          <select style={inp} value={accountType} onChange={e => setAccountType(e.target.value as any)}>
            <option value="demo">DEMO</option>
            <option value="live">LIVE</option>
            <option value="funded">FUNDED</option>
          </select>
        </div>
      )}

      {error && <div style={{ color: "#ef4444", fontSize: 14.5 }}>{error}</div>}

      <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
        <button type="button" onClick={onCancel} style={{ background: "none", border: "1px solid #1e3050", color: "#94a3b8", padding: "9px 20px", cursor: "pointer", fontSize: 15.5, fontWeight: 600 }}>Cancel</button>
        <button type="submit" disabled={busy || (isCT && ctConfigured === false)} style={{ background: "linear-gradient(to right,#1d4ed8,#3b82f6)", border: "none", color: "white", padding: "9px 20px", cursor: (busy || (isCT && ctConfigured === false)) ? "not-allowed" : "pointer", fontSize: 15.5, fontWeight: 700, opacity: (busy || (isCT && ctConfigured === false)) ? 0.5 : 1, display: "flex", alignItems: "center", gap: 6 }}>
          {busy ? (isCT ? "Redirecting…" : "Adding…") : isCT ? (<>Connect with cTrader <ExternalLink size={13} /></>) : "Add Account"}
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
            style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 10, background: "linear-gradient(to right,#1d4ed8,#3b82f6)", color: "#fff", padding: "13px 20px", fontWeight: 700, fontSize: 16.5, textDecoration: "none", borderRadius: 4 }}
          >
            ⬇ Download FSD_Journal_EA.mq5
          </a>

          {/* Steps */}
          <div>
            <div style={{ color: "#64748b", fontSize: 13.5, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 12 }}>Setup Steps</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {SETUP_STEPS.map(step => (
                <div key={step.n} style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
                  <span style={{ minWidth: 24, height: 24, background: "#1e3a6e", color: "#60a5fa", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13.5, fontWeight: 700, flexShrink: 0 }}>{step.n}</span>
                  <span style={{ color: "#94a3b8", fontSize: 15.5, lineHeight: 1.5 }}>{step.text}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Webhook URL */}
          <div>
            <div style={{ color: "#64748b", fontSize: 13.5, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8 }}>Your Webhook URL</div>
            <div style={{ background: "#070f1e", border: "1px solid #1e3a55", padding: "11px 14px", display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ color: "#38bdf8", fontSize: 14.5, fontFamily: "monospace", flex: 1, wordBreak: "break-all" }}>{webhookUrl}</span>
              <CopyBtn text={webhookUrl} />
            </div>
            <p style={{ color: "#475569", fontSize: 13.5, margin: "6px 0 0" }}>Paste this URL into the EA's <strong style={{ color: "#64748b" }}>InpWebhookURL</strong> input field.</p>
          </div>

          {/* Info note */}
          <div style={{ background: "#0c1e10", border: "1px solid #1a4020", padding: "11px 14px", borderRadius: 4 }}>
            <span style={{ color: "#4ade80", fontSize: 14.5, fontWeight: 600 }}>How it works: </span>
            <span style={{ color: "#6b8f72", fontSize: 14.5 }}>When you close a trade in MT5, the EA automatically posts it to <Brand />. It is journaled instantly with P&amp;L, session, pips, and duration — no manual entry needed.</span>
          </div>

          <button onClick={onClose} style={{ background: "#1e293b", border: "1px solid #334155", color: "#94a3b8", padding: "10px 20px", cursor: "pointer", fontSize: 15.5, fontWeight: 600, alignSelf: "flex-end" }}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Edit Account Modal ────────────────────────────────────────────────────────
function EditModal({ account, onClose, onSaved }: { account: BrokerAccount; onClose: () => void; onSaved: (a: BrokerAccount) => void }) {
  const [name,        setName]        = useState(account.name);
  const [accountType, setAccountType] = useState(account.accountType);
  const [busy,        setBusy]        = useState(false);
  const [err,         setErr]         = useState('');

  // DEMO OR LIVE IS cTRADER'S ANSWER, NOT A CHOICE. His instruction, 2026-10-26: *"request ctrader
  // for account status as Demo or Live. This will prevent users from editing but display real
  // status."* It is re-read from the broker on every sync (`server/services/accountTypeSync.ts`),
  // and the server refuses a change to it on a cTrader account — this just stops him being
  // offered a control that would be rejected.
  const typeIsFixed = account.platform?.toLowerCase() === 'ctrader';

  async function save() {
    setBusy(true); setErr('');
    // The type is left OUT of the request entirely when the broker owns it, so saving a rename
    // can never be refused because of a field he was not allowed to change anyway.
    const body = typeIsFixed ? { name } : { name, accountType };
    const res  = await fetch(`/api/broker-accounts/${account.id}`, { method: 'PUT', headers: await authHeaders(), body: JSON.stringify(body) });
    const data = await res.json();
    setBusy(false);
    if (res.ok) onSaved({ ...account, name, accountType: typeIsFixed ? account.accountType : accountType });
    else setErr(data.error || 'Save failed');
  }

  const ov: CSSProperties  = { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center' };
  const card: CSSProperties = { background: '#0d1829', border: '1px solid #1e3a55', borderRadius: 12, padding: 24, width: 320, maxWidth: '90vw' };
  const inp: CSSProperties  = { background: '#0b1220', border: '1px solid #1e3050', color: '#e2e8f0', padding: '8px 12px', fontSize: 15.5, width: '100%', borderRadius: 4, outline: 'none' };
  const lbl: CSSProperties  = { color: '#64748b', fontSize: 13.5, fontWeight: 600, display: 'block', marginBottom: 4, textTransform: 'uppercase' };

  return (
    <div style={ov} onClick={onClose}>
      <div style={card} onClick={e => e.stopPropagation()}>
        <div style={{ color: '#e2e8f0', fontWeight: 700, fontSize: 17.5, marginBottom: 18 }}>Edit Account</div>
        <label style={lbl}>Name</label>
        <input value={name} onChange={e => setName(e.target.value)} style={{ ...inp, marginBottom: 14 }} />
        <label style={lbl}>Type</label>
        {typeIsFixed ? (
          <div style={{ marginBottom: err ? 8 : 20 }}>
            <div style={{ ...inp, display: 'flex', alignItems: 'center', gap: 8, cursor: 'default',
                          color: account.accountType === 'live' ? '#4ade80' : '#ef4444',
                          fontWeight: 700, letterSpacing: '0.04em' }}>
              {(account.accountType || 'demo').toUpperCase()}
            </div>
            <div style={{ color: '#64748b', fontSize: 13, marginTop: 6, lineHeight: 1.45 }}>
              Read from cTrader itself and checked again on every sync, so it always shows the real
              status of the account.
            </div>
          </div>
        ) : (
          <select value={accountType} onChange={e => setAccountType(e.target.value)} style={{ ...inp, marginBottom: err ? 8 : 20 }}>
            {['demo', 'live', 'funded'].map(t => <option key={t} value={t}>{t.toUpperCase()}</option>)}
          </select>
        )}
        {err && <div style={{ color: '#ef4444', fontSize: 14.5, marginBottom: 12 }}>{err}</div>}
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={{ background: 'none', border: '1px solid #334155', color: '#94a3b8', padding: '7px 16px', cursor: 'pointer', fontSize: 15.5, borderRadius: 4 }}>Cancel</button>
          <button onClick={save} disabled={busy} style={{ background: '#1d6ed8', border: 'none', color: 'white', padding: '7px 16px', cursor: 'pointer', fontSize: 15.5, fontWeight: 600, borderRadius: 4 }}>
            {busy ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main AccountsPage ─────────────────────────────────────────────────────────
// Module-level cache of the last-fetched accounts: survives component remounts
// (navigating away and back to the Accounts tab) so the page shows data instantly
// instead of flashing a loading spinner and re-fetching from scratch every open.
let _accountsCache: BrokerAccount[] | null = null;

export default function AccountsPage({ openModal = false, darkMode = true, onViewSession }: { openModal?: boolean; darkMode?: boolean; onViewSession?: (sessionId: string) => void }) {
  const { session } = useAuth();
  const [accounts,    setAccounts]    = useState<BrokerAccount[]>(_accountsCache ?? []);
  const [loading,     setLoading]     = useState(_accountsCache === null);
  const [modalOpen,   setModalOpen]   = useState(openModal);
  const [selectedPlatform, setSelectedPlatform] = useState<string | null>(null);
  const [showForm,    setShowForm]    = useState(false);
  const [webhookAcc,  setWebhookAcc]  = useState<BrokerAccount | null>(null);
  const [info,        setInfo]        = useState<string | null>(null);
  // THE SYNC ANSWER HAS ITS OWN BANNER. `info` cannot carry it: `fetchAccounts` clears `info` on every
  // successful load, and a sync ends by reloading the list — the answer would vanish as it appeared.
  const [syncing,     setSyncing]     = useState<Set<string>>(new Set());
  const [syncNote,    setSyncNote]    = useState<SyncResult | null>(null);
  const [pageSize,    setPageSize]    = useState(10);
  const [page,        setPage]        = useState(1);
  const [isMobile,    setIsMobile]    = useState(false);
  const [ctSelectToken,    setCtSelectToken]    = useState<string | null>(null);
  const [ctSelectAccounts, setCtSelectAccounts] = useState<any[]>([]);
  const [ctSelectBusy,     setCtSelectBusy]     = useState(false);
  const [editAccount,      setEditAccount]      = useState<BrokerAccount | null>(null);
  const [confirmDel,       setConfirmDel]       = useState<BrokerAccount | null>(null);
  // The account awaiting a "re-sync everything" confirm. A separate piece of state from the delete
  // confirm so the two modals can never be open at once or mistaken for one another.
  const [confirmResync,    setConfirmResync]    = useState<BrokerAccount | null>(null);
  const [resyncing,        setResyncing]        = useState<Set<string>>(new Set());
  const [deleting,         setDeleting]         = useState(false);
  const [delErr,           setDelErr]           = useState<string>("");
  // HIS NEW DESIGN (22 Nov 2026, sync plan step 9): filter, Demo/Live pills, the sync log, the repair picker,
  // and the account limit read from the server (it used to be a "/20" typed into the page).
  const [query,            setQuery]            = useState("");
  const [typeFilter,       setTypeFilter]       = useState<TypeFilter>("ALL");
  const [logsAcc,          setLogsAcc]          = useState<BrokerAccount | null>(null);
  const [repairOpen,       setRepairOpen]       = useState(false);
  const [limit,            setLimit]            = useState<number | null>(null);
  const T = darkMode ? DARK : LIGHT;
  useEffect(() => {
    if (!session) return;
    void (async () => {
      const r = await fetch("/api/broker-accounts/limit", { headers: await authHeaders() }).catch(() => null);
      if (r?.ok) setLimit((await r.json()).limit ?? null);
    })();
  }, [session]);

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 640);
    check(); window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  useEffect(() => { if (session) fetchAccounts(); }, [session]);
  // Keep the module cache in sync with every accounts change (fetch, add, delete,
  // edit, balance refresh) so the next remount renders instantly from it.
  useEffect(() => { _accountsCache = accounts; }, [accounts]);
  useEffect(() => { setModalOpen(openModal); }, [openModal]);

  // Handle cTrader OAuth callback query params
  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    // Strip ctrader params from URL without losing the base path (works both at /accounts and /journal?tab=accounts)
    function cleanCtUrl() {
      const q = new URLSearchParams(window.location.search);
      q.delete('ctrader_connected'); q.delete('ctrader_error'); q.delete('ctrader_select');
      const qs = q.toString();
      window.history.replaceState({}, '', window.location.pathname + (qs ? '?' + qs : ''));
    }
    if (p.get('ctrader_connected')) {
      setInfo('cTrader connected! Your full trade history is syncing in the background — this may take a minute.');
      cleanCtUrl();
      fetchAccounts();
    } else if (p.get('ctrader_error')) {
      setInfo(`cTrader error: ${decodeURIComponent(p.get('ctrader_error') ?? '')}`);
      cleanCtUrl();
    } else if (p.get('ctrader_select')) {
      const token = p.get('ctrader_select')!;
      cleanCtUrl();
      (async () => {
        try {
          const r = await fetch(`/api/broker/ctrader/pending-accounts?token=${token}`, { headers: await authHeaders() });
          const d = await r.json();
          if (d.accounts) { setCtSelectToken(token); setCtSelectAccounts(d.accounts); }
          else setInfo(`cTrader: ${d.error}`);
        } catch { setInfo('cTrader: failed to load account choices'); }
      })();
    }
  }, []);

  /**
   * ⚠ IT RETRIES BY ITSELF RATHER THAN TELLING HIM TO.
   *
   * 2026-10-25: a redeploy restarted the server while he had this page open, the one load in
   * flight came back 502, and the page then sat showing "please retry in a moment" — with the
   * accounts listed underneath, from cache — until he reloaded by hand. The server was healthy
   * again seconds later. Nothing was broken except that nobody asked a second time.
   *
   * A 502/503/504 or a dropped connection means "the server is not there THIS SECOND", which is
   * exactly the shape of a deploy, a restart or a blip — so it is retried, three times, backing
   * off 1s / 2s / 4s. The banner only appears if all of them fail.
   *
   * ⚠ A 401 IS NOT RETRIED. That is a sign-in problem, and hammering it would neither fix it nor
   * tell him anything new.
   */
  async function fetchAccounts() {
    if (_accountsCache === null) setLoading(true);   // spinner only on first-ever load; otherwise refresh silently
    const WAITS = [1000, 2000, 4000];
    try {
      for (let attempt = 0; ; attempt++) {
        let res: Response | null = null;
        try {
          res = await fetch("/api/broker-accounts", { headers: await authHeaders() });
        } catch { /* network/connection failure — treated the same as a 5xx below */ }

        if (res?.ok) {
          const data = await res.json();
          setAccounts(Array.isArray(data) ? data : []);
          setInfo("");                                // clear any prior load error
          return;
        }
        if (res && res.status === 401) {
          setInfo("Session expired — refresh the page or sign in again to load your accounts (they're safe).");
          return;
        }
        // Worth another try? Only while attempts remain AND it looks momentary.
        const momentary = !res || res.status >= 500;
        if (momentary && attempt < WAITS.length) {
          await new Promise(r => setTimeout(r, WAITS[attempt]));
          continue;
        }
        // Never blank an existing list on a transient failure — surface the real
        // reason instead of the misleading "No accounts yet" empty state. Accounts
        // live server-side; a failed load does NOT mean they're gone.
        setInfo(res
          ? `Couldn't load your accounts (error ${res.status}) after ${attempt + 1} tries. They're safe on the server — it should clear on its own; reload if it does not.`
          : "Couldn't reach the server to load your accounts. Check your connection — your accounts are safe.");
        return;
      }
    } finally {
      setLoading(false);
    }
  }

  // Confirmation is handled by an in-app modal (setConfirmDel) — no native confirm().
  async function handleDelete(id: string) {
    setDeleting(true);
    setDelErr("");
    try {
      const res = await fetch(`/api/broker-accounts/${id}`, { method: "DELETE", headers: await authHeaders() });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? `Delete failed (${res.status})`);
      }
      // Only drop the row once the server confirms — otherwise a failed delete
      // would vanish from the UI but reappear on the next refresh.
      setAccounts(prev => prev.filter(a => a.id !== id));
      // Its session + all its journal entries are gone server-side too — refresh
      // the journal/metrics views so they don't keep showing deleted data.
      ['/api/sessions', '/api/journal/entries', '/api/metrics/compute', '/api/calendar/compute', '/api/drawdown/compute']
        .forEach(key => queryClient.invalidateQueries({ queryKey: [key] }));
      setConfirmDel(null);   // success — close the modal
    } catch (e: any) {
      setDelErr(e.message ?? "Failed to delete account");   // keep modal open, show inline
    } finally {
      setDeleting(false);
    }
  }

  // A MANUAL SYNC IS A QUESTION — ANSWER IT (2026-09-14). Both buttons used to throw the server's reply
  // away (Sync All did not even wait for it), so a dozen successful syncs showed him nothing. They now
  // wait, show the server's own answer, and refuse a second click while one is running. `finally`
  // releases the busy state however the sync ends — a lock with no release is a trap.
  // SYNC ALL IS RUN BY THE SERVER (22 Nov 2026). It used to sync every account at once from this page and
  // was lost if the page closed. Now one click hands the whole list to the server, which syncs them one
  // after another and pushes each step here; leaving and coming back shows where it is.
  function showRun(run: SyncAllRun | null) {
    if (!run) return;
    setSyncing(pendingIds(run));
    setSyncNote(summariseRun(run));
    if (run.finishedAt) fetchAccounts();
  }
  useJournalStream(!!session, (e) => { if (e.type === "sync-all") showRun(e.run as SyncAllRun); });
  useEffect(() => {
    if (!session) return;
    void (async () => { const run = await readSyncAll(await authHeaders()); if (run && !run.finishedAt) showRun(run); })();
  }, [session]);

  async function handleSyncAll() {
    if (syncing.size) return;
    // A logged-out account is deliberately left out: it has no credentials to sync with. The server
    // skips it too (`syncAllQueue.whyNot`) — this only answers at once when there is nothing to do.
    const api = accounts.filter(a => a.connectionType === "api" && a.syncStatus !== DISCONNECTED);
    if (!api.length) {
      setSyncNote({ ok: true, text: "No API-connected accounts to sync — EA accounts send their trades on their own." });
      return;
    }
    setSyncing(new Set(api.map(a => a.id)));
    setSyncNote({ ok: true, text: "Sync All started — your accounts are synced one at a time. You can leave this page." });
    const { run, error } = await startSyncAll(await authHeaders());
    if (error) { setSyncing(new Set()); setSyncNote({ ok: false, text: error }); return; }
    showRun(run);
  }

  async function handleSync(account: BrokerAccount) {
    if (account.connectionType === "webhook") { setWebhookAcc(account); return; }
    if (syncing.has(account.id)) return;
    setSyncing(prev => new Set(prev).add(account.id));
    setSyncNote(null);
    try {
      const result = await syncOne(account, await authHeaders());
      setSyncNote({ ok: result.ok, text: label(account) + ": " + result.text });
    } finally {
      setSyncing(prev => { const next = new Set(prev); next.delete(account.id); return next; });
      fetchAccounts();
    }
  }

  /**
   * LOG OUT OF AN ACCOUNT, KEEPING EVERYTHING IT HAS RECORDED.
   *
   * His instruction, 2026-10-26: *"when i logout account, its data is not errased and when i log
   * it back in it is not autosynced from scratch."* This is NOT the Delete button beside it —
   * delete still removes the trades and the journal, and its warning still says so.
   *
   * No confirmation box: nothing is lost, and reconnecting is one click away. The server's own
   * answer is shown instead, so he can see what was kept rather than take it on trust.
   */
  async function handleDisconnect(account: BrokerAccount) {
    setSyncNote(null);
    try {
      const res  = await fetch(`/api/broker-accounts/${account.id}/disconnect`,
                               { method: "POST", headers: await authHeaders() });
      const data = await res.json();
      setSyncNote({ ok: res.ok, text: label(account) + ": " + (data.message ?? data.error ?? "Logged out.") });
    } catch (e: any) {
      setSyncNote({ ok: false, text: label(account) + ": " + (e?.message ?? "Could not log out") });
    } finally {
      fetchAccounts();
    }
  }

  /**
   * SIGN BACK IN — ON THE SAME ACCOUNT ROW.
   *
   * It passes this account's own id, so the sign-in writes the new tokens into the row that
   * already holds the trades, the journal and `last_sync_at`. That last one is what makes the
   * first sweep afterwards fetch only the stretch he was logged out for
   * (`server/services/autoSyncService.ts:301-303`) instead of the whole history.
   */
  /**
   * RE-SYNC EVERYTHING — fetch the account's whole history again.
   *
   * His ask, 2026-10-26: *"a functioning button that enables one to sync the entire data from
   * ctrader account again if for some reasons that is required. That button bypasses account sync
   * memory that discards data that had been deleted from the journal."*
   *
   * The everyday Sync beside it looks back a week and already rebuilds deleted trades; this one is
   * about REACH — two years. It can run well past the 30-second reply, so the message distinguishes
   * "finished" from "still going" rather than claiming either.
   */
  async function handleResyncAll(account: BrokerAccount) {
    setConfirmResync(null);
    setResyncing(prev => new Set(prev).add(account.id));
    setSyncNote(null);
    try {
      const res  = await fetch(`/api/broker-accounts/${account.id}/resync-all`,
                               { method: 'POST', headers: await authHeaders() });
      const data = await res.json();
      setSyncNote({ ok: res.ok, text: label(account) + ': ' + (data.message ?? data.error ?? 'Re-sync finished.') });
    } catch (e: any) {
      setSyncNote({ ok: false, text: label(account) + ': ' + (e?.message ?? 'Re-sync failed') });
    } finally {
      setResyncing(prev => { const next = new Set(prev); next.delete(account.id); return next; });
      fetchAccounts();
    }
  }

  async function handleReconnect(account: BrokerAccount) {
    setSyncNote(null);
    try {
      const res  = await fetch(`/api/broker/ctrader/connect?accountId=${account.id}`, { headers: await authHeaders() });
      const data = await res.json();
      if (data.url) { window.location.href = data.url; return; }
      setSyncNote({ ok: false, text: label(account) + ": " + (data.error ?? "Could not start the cTrader sign-in") });
    } catch (e: any) {
      setSyncNote({ ok: false, text: label(account) + ": " + (e?.message ?? "Could not start the cTrader sign-in") });
    }
  }

  async function handleRefreshBalance(account: BrokerAccount) {
    try {
      const res = await fetch(`/api/broker-accounts/${account.id}/refresh-balance`, { method: "POST", headers: await authHeaders() });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Balance refresh failed");
      setAccounts(prev => prev.map(a => a.id === account.id ? { ...a, balance: String(data.balance), currency: data.currency } : a));
    } catch (e: any) {
      alert(e.message);
    }
  }

  /** ONE SWITCH: "use this account in the copier."
   *
   *  HIS INSTRUCTION, 2026-09-29: *"a button here that user can click to be listed in the copier list
   *  of accounts that can be copied and also to enable that account to copy another in copier. If
   *  that button is not enabled the account does not appear in copier."*
   *
   *  So it is not just a marketplace listing any more. OFF removes the account from the copier's
   *  setup form entirely - both the "copy from" step and the "copy into" step - because the server
   *  filters that list on the flag this writes.
   *
   *  ⚠ IT DOES NOT STOP COPYING THAT IS ALREADY RUNNING. Links built on the account keep mirroring;
   *  ending one is Drop, in the copier's Connected accounts list. This switch governs what the copier
   *  OFFERS, and the tooltip says so rather than implying a kill switch. */
  async function handleToggleCopy(account: BrokerAccount) {
    const next = !account.copyEnabled;
    setAccounts(prev => prev.map(a => a.id === account.id ? { ...a, copyEnabled: next } : a));
    try {
      const res = await fetch(`/api/broker-accounts/${account.id}/copy-listing`, {
        method: "POST", headers: await authHeaders(), body: JSON.stringify({ enabled: next }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "Failed to update");
    } catch (e: any) {
      setAccounts(prev => prev.map(a => a.id === account.id ? { ...a, copyEnabled: !next } : a)); // revert
      alert(e.message ?? "Could not update copy setting");
    }
  }

  async function handleCreated(account: BrokerAccount) {
    setAccounts(prev => [account, ...prev]);
    setModalOpen(false);
    setShowForm(false);
    setSelectedPlatform(null);

    if (account.connectionType === "webhook") { setWebhookAcc(account); return; }
    // cTrader redirect is handled inside AddAccountForm.handleSubmit — nothing to do here
  }

  const q = query.trim().toLowerCase();
  const filtered = accounts.filter(a =>
    (typeFilter === "ALL" || (a.accountType || "demo").toUpperCase() === typeFilter
       || (typeFilter === "LIVE" && a.accountType === "funded"))
    && (!q || [displayName(a), a.name, a.loginId, a.platform].some(v => (v ?? "").toLowerCase().includes(q))));
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const paged = filtered.slice((safePage - 1) * pageSize, safePage * pageSize);

  return (
    <div className={`accounts-root relative min-h-full pb-16 ${T.page}`}>
      <div className="relative mx-auto max-w-[1400px] px-4 pt-6 sm:px-8 sm:pt-8">
      <AccountsHeader T={T} accounts={accounts} limit={limit} syncingAll={syncing.size > 0}
                      onRepair={() => setRepairOpen(true)}
                      onAdd={() => { setModalOpen(true); setShowForm(false); setSelectedPlatform(null); }}
                      onSyncAll={handleSyncAll} />

      {/* cTrader multi-account picker */}
      {ctSelectAccounts.length > 0 && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: '#0d1829', border: '1px solid #1e3a55', borderRadius: 12, padding: 28, width: 360, maxWidth: '90vw' }}>
            <div style={{ color: '#e2e8f0', fontWeight: 700, fontSize: 18, marginBottom: 6 }}>Select cTrader Account</div>
            <div style={{ color: '#64748b', fontSize: 14.5, marginBottom: 20 }}>Multiple accounts found. Choose which one to link.</div>
            {ctSelectAccounts.map((a: any) => (
              <button
                key={a.ctidTraderAccountId}
                disabled={ctSelectBusy}
                onClick={async () => {
                  setCtSelectBusy(true);
                  try {
                    const res = await fetch('/api/broker/ctrader/select-account', { method: 'POST', headers: await authHeaders(), body: JSON.stringify({ token: ctSelectToken, ctidTraderAccountId: a.ctidTraderAccountId }) });
                    const d = await res.json();
                    if (d.ok) { setCtSelectAccounts([]); setCtSelectToken(null); setInfo('cTrader connected! Trade history syncing in background.'); fetchAccounts(); }
                    else setInfo(`cTrader: ${d.error}`);
                  } catch { setInfo('cTrader: selection failed'); }
                  setCtSelectBusy(false);
                }}
                style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%', background: '#111e30', border: '1px solid #1e3a55', borderRadius: 8, padding: '12px 16px', marginBottom: 10, cursor: 'pointer', color: '#e2e8f0', fontSize: 15.5 }}
              >
                <span><strong>{a.traderLogin}</strong> · {a.brokerName}</span>
                <span style={{ color: a.isLive ? '#4ade80' : '#facc15', fontSize: 13.5, fontWeight: 700 }}>{a.isLive ? 'LIVE' : 'DEMO'}</span>
              </button>
            ))}
            <button onClick={() => { setCtSelectAccounts([]); setCtSelectToken(null); }} style={{ background: 'none', border: 'none', color: '#64748b', fontSize: 14.5, cursor: 'pointer', marginTop: 4 }}>Cancel</button>
          </div>
        </div>
      )}

      {/* OAuth / info message */}
      {info && (
        <div role="status" className={`mb-5 flex items-center justify-between gap-3 rounded-2xl bg-[#10B981]/12 px-5 py-3 text-[15px] ${T.good}`}>
          <span>{info}</span>
          <button type="button" onClick={() => setInfo(null)} aria-label="Dismiss" className={`rounded-md px-2 text-lg ${T.focus}`}>✕</button>
        </div>
      )}

      {/* Manual sync answer — red when any account failed, so a failure never reads as a success */}
      {syncNote && (
        <div role="status" className={`mb-5 flex items-center justify-between gap-3 rounded-2xl px-5 py-3 text-[15px] ${syncNote.ok
               ? `bg-[#10B981]/12 ${T.good}` : `bg-[#EF4444]/12 ${T.bad}`}`}>
          <span>{syncNote.text}</span>
          <button type="button" onClick={() => setSyncNote(null)} aria-label="Dismiss sync result" className={`rounded-md px-2 text-lg ${T.focus}`}>✕</button>
        </div>
      )}

      <section aria-label="Trading accounts">
        <AccountsFilters T={T} query={query} onQuery={(v) => { setQuery(v); setPage(1); }}
                         type={typeFilter} onType={(v) => { setTypeFilter(v); setPage(1); }} />
        <AccountsColumnHeads T={T} />
        <div className="space-y-2.5">
          {loading ? (
            [0, 1, 2].map(i => <div key={i} className={`h-[72px] animate-pulse rounded-2xl ${T.surface}`} />)
          ) : paged.length === 0 ? (
            <div className={`flex flex-col items-center justify-center rounded-2xl py-16 text-center ${T.surface}`}>
              <p className={`text-lg font-medium ${T.text}`}>
                {accounts.length ? "No accounts match this filter." : "No accounts yet."}</p>
              <p className={`mt-1 text-sm ${T.faint}`}>
                {accounts.length ? "Clear the search or change Demo / Live." : "Add Account connects your first broker."}</p>
              {accounts.length > 0 && (
                <button type="button" onClick={() => { setQuery(""); setTypeFilter("ALL"); }}
                        className={`mt-4 rounded-xl px-4 py-2 text-sm ${T.secondaryBtn} ${T.focus}`}>Reset filters</button>)}
            </div>
          ) : paged.map(a => (
            <AccountRow key={a.id} a={a} T={T} platformIcon={<PlatformIcon id={a.platform.toLowerCase()} size={28} />}
              syncing={syncing.has(a.id)} resyncing={resyncing.has(a.id)}
              act={{
                onAnalytics: a.defaultSessionId && onViewSession ? () => onViewSession(a.defaultSessionId!) : undefined,
                onCopyToggle: () => handleToggleCopy(a),
                onRepair: () => { setSyncNote(null); setConfirmResync(a); },
                onSync: () => handleSync(a),
                onLogs: () => setLogsAcc(a),
                onLogout: () => handleDisconnect(a),
                onReconnect: () => handleReconnect(a),
                onEdit: () => setEditAccount(a),
                onDelete: () => { setDelErr(""); setConfirmDel(a); },
                onWebhook: () => setWebhookAcc(a),
                onRefreshBalance: () => handleRefreshBalance(a),
              }} />
          ))}
        </div>
        <AccountsPager T={T} total={filtered.length} page={safePage} pageSize={pageSize}
                       onPage={(p) => setPage(Math.max(1, Math.min(totalPages, p)))}
                       onPageSize={(n) => { setPageSize(n); setPage(1); }} />
      </section>
      </div>

      <SyncLogDialog account={logsAcc} onClose={() => setLogsAcc(null)} headers={authHeaders} />
      <RepairPickerDialog open={repairOpen} accounts={accounts} onClose={() => setRepairOpen(false)}
                          onPick={(a) => { setRepairOpen(false); setSyncNote(null); setConfirmResync(a); }} />


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
                      <PlatformIcon id={p.id} size={38} />
                      <span style={{ fontSize: 13.5, fontWeight: 600, textAlign: "center" }}>{p.name}</span>
                    </button>
                  ))}
                </div>
                <button
                  disabled={!selectedPlatform}
                  onClick={() => setShowForm(true)}
                  style={{ width: "100%", background: selectedPlatform ? "#1d6ed8" : "#1e293b", border: "none", color: selectedPlatform ? "white" : "#475569", padding: "11px", fontWeight: 700, fontSize: 16.5, cursor: selectedPlatform ? "pointer" : "not-allowed" }}
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

      {/* Edit Account Modal */}
      {editAccount && (
        <EditModal
          account={editAccount}
          onClose={() => setEditAccount(null)}
          onSaved={updated => { setAccounts(prev => prev.map(a => a.id === updated.id ? updated : a)); setEditAccount(null); }}
        />
      )}

      {/* Webhook Info Modal */}
      {webhookAcc && <WebhookModal account={webhookAcc} onClose={() => setWebhookAcc(null)} />}

      {/* RE-SYNC EVERYTHING — CONFIRM FIRST. It rebuilds journal entries he deleted on purpose,
          which is what he asked for and exactly why it is not a single click. The wording says what
          will happen in his own terms rather than asking "are you sure". */}
      {confirmResync && (
        <div style={s.overlay as CSSProperties} onClick={() => setConfirmResync(null)}>
          <div style={{ ...(s.modal as CSSProperties), width: 470, padding: 28 }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
              <div style={{ width: 40, height: 40, borderRadius: 10, background: 'rgba(56,189,248,0.12)', border: '1px solid rgba(56,189,248,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <History size={18} color="#38bdf8" />
              </div>
              <div>
                <div style={{ fontSize: 18, fontWeight: 700, color: '#f1f5f9' }}>Re-sync everything for &ldquo;{confirmResync.name}&rdquo;?</div>
                <div style={{ fontSize: 14.5, color: '#94a3b8', marginTop: 2 }}>{(confirmResync.platform || '').toUpperCase()} &middot; {confirmResync.loginId}</div>
              </div>
            </div>
            <div style={{ fontSize: 15, color: '#cbd5e1', lineHeight: 1.6, marginBottom: 20 }}>
              This fetches <strong style={{ color: '#f1f5f9' }}>two years</strong> of closed trades from the broker again, instead of the last week.
              <span style={{ display: 'block', marginTop: 10, color: '#fcd34d' }}>
                It will also bring back any trades you <strong>deleted from your journal</strong> for this account &mdash; that is what makes it a full re-sync.
              </span>
              <span style={{ display: 'block', marginTop: 10, color: '#94a3b8' }}>
                Nothing is duplicated: a trade already in your journal is left as it is. It can take a while, and will carry on in the background.
              </span>
            </div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button onClick={() => setConfirmResync(null)}
                style={{ background: 'none', border: '1px solid #334155', color: '#94a3b8', padding: '9px 18px', cursor: 'pointer', fontSize: 15, borderRadius: 6 }}>
                Cancel
              </button>
              <button onClick={() => handleResyncAll(confirmResync)}
                style={{ background: '#0ea5e9', border: 'none', color: 'white', padding: '9px 18px', cursor: 'pointer', fontSize: 15, fontWeight: 700, borderRadius: 6, display: 'flex', alignItems: 'center', gap: 7 }}
                data-testid="button-confirm-resync">
                <History size={14} /> Re-sync everything
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Proper styled delete-confirmation modal (replaces the native confirm dialog) */}
      {confirmDel && (
        <div style={s.overlay as CSSProperties} onClick={() => { if (!deleting) setConfirmDel(null); }}>
          <div style={{ ...(s.modal as CSSProperties), width: 460, padding: 28 }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
              <div style={{ width: 40, height: 40, borderRadius: 10, background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <Trash2 size={18} color="#ef4444" />
              </div>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 18, fontWeight: 700, color: '#f1f5f9' }}>Delete “{confirmDel.name}”?</div>
                <div style={{ fontSize: 14.5, color: '#94a3b8', marginTop: 2 }}>{(confirmDel.platform || '').toUpperCase()} · {confirmDel.loginId}</div>
              </div>
            </div>
            <p style={{ fontSize: 15.5, color: '#cbd5e1', lineHeight: 1.6, marginBottom: delErr ? 12 : 20 }}>
              Everything tied to this account — all its <strong style={{ color: '#f1f5f9' }}>synced trades</strong>, <strong style={{ color: '#f1f5f9' }}>journal entries</strong> and its <strong style={{ color: '#f1f5f9' }}>performance dashboard</strong> — will be permanently removed. <span style={{ color: '#fca5a5' }}>This cannot be undone.</span>
              {/* SAY THE SAFE OPTION EXISTS, HERE. This modal is where he decides, and until now
                  deleting was the only way to take an account off the platform — which is how the
                  history kept getting thrown away and re-imported. */}
              {confirmDel.platform?.toLowerCase() === 'ctrader' && (
                <span style={{ display: 'block', marginTop: 10, color: '#94a3b8' }}>
                  If you only want to sign out, use <strong style={{ color: '#facc15' }}>Log out</strong> instead — it keeps every trade and journal entry, and signing back in carries on from where it left off.
                </span>
              )}
            </p>
            {delErr && <div style={{ fontSize: 14.5, color: '#fca5a5', background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)', borderRadius: 8, padding: '8px 12px', marginBottom: 18 }}>{delErr}</div>}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
              <button onClick={() => setConfirmDel(null)} disabled={deleting}
                style={{ padding: '9px 18px', borderRadius: 8, border: '1px solid #1e3050', background: 'transparent', color: '#cbd5e1', fontSize: 15.5, fontWeight: 600, cursor: deleting ? 'default' : 'pointer' }}>
                Cancel
              </button>
              <button onClick={() => handleDelete(confirmDel.id)} disabled={deleting}
                style={{ padding: '9px 18px', borderRadius: 8, border: 'none', background: '#dc2626', color: '#fff', fontSize: 15.5, fontWeight: 700, cursor: deleting ? 'default' : 'pointer', opacity: deleting ? 0.65 : 1, display: 'flex', alignItems: 'center', gap: 6 }}>
                <Trash2 size={14} /> {deleting ? 'Deleting…' : 'Delete permanently'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────
const s: Record<string, CSSProperties> = {
  overlay: { position: "fixed", inset: 0, background: "rgba(0,0,0,0.75)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, backdropFilter: "blur(4px)" },
  modal:   { background: "#0d1827", border: "1px solid #1e3050", width: 560, maxWidth: "95vw", maxHeight: "90vh", overflowY: "auto", position: "relative", boxShadow: "0 24px 80px rgba(0,0,0,0.7)" },
  modalHeader:{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "20px 24px 14px", position: "sticky", top: 0, background: "#0d1827", zIndex: 1, borderBottom: "1px solid #1e3050" },
  modalTitle: { fontSize: 18.5, fontWeight: 700, color: "#f1f5f9", margin: 0 },
  closeBtn:   { background: "none", border: "none", color: "#ef4444", fontSize: 19, cursor: "pointer", padding: "2px 6px" },
  platformCard:       { background: "#111e30", border: "1.5px solid #1e3050", padding: "14px 8px 10px", display: "flex", flexDirection: "column", alignItems: "center", gap: 8, cursor: "pointer", color: "#e2e8f0", fontFamily: "inherit" },
  platformCardSelected:{ border: "1.5px solid #38bdf8", background: "#0c2233" },
};
