import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest, authFetch } from "@/lib/queryClient";
import { Pencil, Trash2 } from "lucide-react";
import type { JournalEntry } from "@shared/schema";

const CircleDownloadIcon = ({ success }: { success: boolean }) => (
  <svg width="28" height="28" viewBox="0 0 28 28" fill="none" xmlns="http://www.w3.org/2000/svg">
    <circle cx="14" cy="14" r="14" fill={success ? "#00d48a" : "#1e6fc8"} />
    {success ? (
      <polyline points="8,14 12,18 20,10" stroke="white" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
    ) : (
      <>
        <line x1="14" y1="7" x2="14" y2="17" stroke="white" strokeWidth="2" strokeLinecap="round" />
        <polyline points="9,13 14,18 19,13" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        <line x1="8" y1="21" x2="20" y2="21" stroke="white" strokeWidth="2" strokeLinecap="round" />
      </>
    )}
  </svg>
);

const VaultCell = ({ label, value, color, isMobile, first = false }: { label: string; value: string; color: string; isMobile: boolean; first?: boolean }) => (
  <div style={{
    flex: isMobile ? 1 : "none",
    width: isMobile ? "auto" : 110,
    padding: "10px 0",
    display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 4,
    borderLeft: first ? "none" : "1px solid #1e2535",
  }}>
    <span style={{ fontSize: 9, fontWeight: 900, color: "#3d4d6a", letterSpacing: "0.12em", fontFamily: "'Montserrat', sans-serif" }}>
      {label}
    </span>
    <span style={{
      fontSize: isMobile ? 15 : 18, fontWeight: 900, color,
      fontFamily: "'Montserrat', sans-serif", letterSpacing: "-0.02em",
      textShadow:
        color === "#00d48a" ? "0 0 16px rgba(0,212,138,0.35)" :
        color === "#4da6ff" ? "0 0 16px rgba(77,166,255,0.3)" :
        color === "#a78bfa" ? "0 0 16px rgba(167,139,250,0.3)" : "none",
    }}>
      {value}
    </span>
  </div>
);

const SESSIONS = ["LONDON", "NEW YORK", "ASIAN", "FRANKFURT"];
const STRATEGIES = ["SMC Breaker", "Silver Bullet", "ICT Killzone", "OB Mitigation"];
const ASSETS = ["EURUSD", "NAS100", "GBPUSD", "XAUUSD", "US30", "BTCUSD"];

type Trade = {
  id: string;
  date: string;
  time: string;
  asset: string;
  strategy: string;
  session: string;
  outcome: string;
  pl: number;
  rr: string;
  direction: string;
};

function journalEntryToTrade(entry: JournalEntry): Trade {
  const createdAt = entry.createdAt ? new Date(entry.createdAt) : new Date();
  const date = entry.entryTime
    ? entry.entryTime.split("T")[0] || createdAt.toISOString().split("T")[0]
    : createdAt.toISOString().split("T")[0];
  const timePart = entry.entryTime
    ? entry.entryTime.includes("T")
      ? entry.entryTime.split("T")[1]?.substring(0, 5) || "00:00"
      : entry.entryTime.substring(0, 5) || "00:00"
    : createdAt.toISOString().split("T")[1]?.substring(0, 5) || "00:00";

  const manual = (entry.manualFields && typeof entry.manualFields === "object") ? entry.manualFields as Record<string, unknown> : {};
  const ai = (entry.aiExtracted && typeof entry.aiExtracted === "object") ? entry.aiExtracted as Record<string, unknown> : {};

  const strategy = (manual.setupTag as string) || (manual.strategyVersionId as string) || (manual.strategy as string) || (ai.strategy as string) || "";
  const pl = entry.profitLoss ? parseFloat(entry.profitLoss) : 0;
  const rr = entry.riskReward ? String(entry.riskReward) : "";
  const rawDir = (entry.direction || "").toLowerCase();
  // JournalForm saves "Long"/"Short"; support both that and "bullish"/"bearish"
  const direction = rawDir === "long" ? "bullish" : rawDir === "short" ? "bearish" : rawDir;

  return {
    id: entry.id,
    date,
    time: timePart,
    asset: entry.instrument || "",
    strategy,
    session: entry.sessionName || "",
    outcome: (entry.outcome || "").toUpperCase(),
    pl: isNaN(pl) ? 0 : pl,
    rr,
    direction,
  };
}

function formatPL(pl: number) {
  return pl >= 0 ? `+$${pl.toLocaleString()}` : `-$${Math.abs(pl).toLocaleString()}`;
}

function DirectionBadge({ direction }: { direction: string }) {
  const isBullish = direction === "bullish";
  const isBearish = direction === "bearish";

  if (!isBullish && !isBearish) {
    return <span style={{ color: "#3a4a6a", fontSize: 9 }}>—</span>;
  }

  return (
    <span style={{
      display: "inline-flex",
      alignItems: "center",
      gap: 5,
      padding: "4px 10px",
      borderRadius: 20,
      fontSize: 9,
      fontWeight: 700,
      letterSpacing: "0.08em",
      border: "1px solid transparent",
      background: isBullish ? "rgba(0,212,138,0.08)" : "rgba(255,77,109,0.08)",
      color: isBullish ? "#00d48a" : "#ff4d6d",
      borderColor: isBullish ? "rgba(0,212,138,0.2)" : "rgba(255,77,109,0.2)",
      fontFamily: "'Montserrat', sans-serif",
    }}>
      {isBullish ? (
        <svg width="8" height="8" viewBox="0 0 8 8" fill="none">
          <path d="M4 7V1M1 4l3-3 3 3" stroke="#00d48a" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      ) : (
        <svg width="8" height="8" viewBox="0 0 8 8" fill="none">
          <path d="M4 1v6M7 4L4 7 1 4" stroke="#ff4d6d" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      )}
      {isBullish ? "BULLISH" : "BEARISH"}
    </span>
  );
}

function RRBadge({ rr }: { rr: string }) {
  const val = parseFloat(rr);
  if (!rr || isNaN(val)) return <span style={{ color: "#3a4a6a", fontSize: 9 }}>—</span>;
  const color = val >= 2 ? "#4da6ff" : val >= 1 ? "#a78bfa" : "#8899bb";
  return (
    <span style={{
      display: "inline-block",
      padding: "4px 10px",
      borderRadius: 6,
      fontSize: 9,
      fontWeight: 700,
      letterSpacing: "0.08em",
      background: "rgba(77,166,255,0.06)",
      border: "1px solid rgba(77,166,255,0.15)",
      color,
      fontFamily: "'Montserrat', sans-serif",
    }}>
      1:{val % 1 === 0 ? val.toFixed(0) : val.toFixed(1)}
    </span>
  );
}

function EditModal({ trade, onSave, onClose, isPending }: { trade: Trade; onSave: (t: Trade) => void; onClose: () => void; isPending: boolean }) {
  const [form, setForm] = useState({ ...trade });

  const handleChange = (field: string, value: string | number) => {
    setForm((f) => {
      const updated = { ...f, [field]: value };

      if (field === 'outcome') {
        // Normalize so typing "win", "Win", "WIN" all behave the same
        const newOutcome = String(value).trim().toUpperCase();
        const oldOutcome = String(f.outcome).trim().toUpperCase();

        // Only auto-recalc P/L when flipping between WIN ↔ LOSS
        if ((newOutcome === 'WIN' || newOutcome === 'LOSS') && newOutcome !== oldOutcome) {
          const currentRR = parseFloat(String(f.rr)) || 1;
          const monetaryRisk = oldOutcome === 'LOSS'
            ? Math.abs(f.pl)
            : Math.round((Math.abs(f.pl) / currentRR) * 100) / 100;

          if (newOutcome === 'WIN') {
            updated.pl = Math.round(monetaryRisk * currentRR * 100) / 100;
          } else {
            updated.pl = -monetaryRisk;
          }
        }
      }

      if (field === 'rr' && String(f.outcome).trim().toUpperCase() === 'WIN') {
        // When RR changes on a WIN, scale the P/L proportionally
        const currentRR = parseFloat(String(f.rr)) || 1;
        const newRR = parseFloat(String(value)) || 1;
        const monetaryRisk = Math.abs(f.pl) / currentRR;
        updated.pl = Math.round(monetaryRisk * newRR * 100) / 100;
      }

      return updated;
    });
  };

  return (
    <div style={styles.overlay}>
      <div style={styles.modal}>
        <div style={styles.modalHeader}>
          <span style={styles.modalTitle}>Edit Trade</span>
          <button onClick={onClose} style={styles.closeBtn} data-testid="button-close-edit">&#x2715;</button>
        </div>

        <div style={styles.formGrid}>
          {[
            { label: "Date", field: "date", type: "date" },
            { label: "Time", field: "time", type: "time" },
          ].map(({ label, field, type }) => (
            <div key={field} style={styles.formGroup}>
              <label style={styles.label}>{label}</label>
              <input
                type={type}
                value={(form as any)[field]}
                onChange={(e) => handleChange(field, e.target.value)}
                style={styles.input}
                data-testid={`input-${field}`}
              />
            </div>
          ))}

          <div style={styles.formGroup}>
            <label style={styles.label}>Asset</label>
            <input
              type="text"
              value={form.asset}
              onChange={(e) => handleChange("asset", e.target.value)}
              placeholder="e.g. EUR/USD"
              style={styles.input}
              data-testid="input-asset"
            />
          </div>

          <div style={styles.formGroup}>
            <label style={styles.label}>Strategy</label>
            <input
              type="text"
              value={form.strategy}
              onChange={(e) => handleChange("strategy", e.target.value)}
              placeholder="e.g. M1H1"
              style={styles.input}
              data-testid="input-strategy"
            />
          </div>

          <div style={styles.formGroup}>
            <label style={styles.label}>Session</label>
            <input
              type="text"
              value={form.session}
              onChange={(e) => handleChange("session", e.target.value)}
              placeholder="e.g. London"
              style={styles.input}
              data-testid="input-session"
            />
          </div>

          <div style={styles.formGroup}>
            <label style={styles.label}>Outcome</label>
            <input
              type="text"
              value={form.outcome}
              onChange={(e) => handleChange("outcome", e.target.value)}
              placeholder="WIN or LOSS"
              style={styles.input}
              data-testid="input-outcome"
            />
          </div>

          <div style={styles.formGroup}>
            <label style={styles.label}>Direction</label>
            <input
              type="text"
              value={form.direction}
              onChange={(e) => handleChange("direction", e.target.value)}
              placeholder="bullish / bearish"
              style={styles.input}
              data-testid="input-direction"
            />
          </div>

          <div style={styles.formGroup}>
            <label style={styles.label}>Risk:Reward (R)</label>
            <input
              type="number"
              min="0"
              step="0.1"
              placeholder="e.g. 2.5"
              value={form.rr}
              onChange={(e) => handleChange("rr", e.target.value)}
              style={styles.input}
              data-testid="input-rr"
            />
          </div>

          <div style={styles.formGroup}>
            <label style={styles.label}>P/L ($)</label>
            <input
              type="number"
              value={Math.abs(form.pl)}
              onChange={(e) => {
                const val = parseInt(e.target.value) || 0;
                handleChange("pl", form.outcome === "LOSS" ? -val : val);
              }}
              style={styles.input}
              data-testid="input-pl"
            />
          </div>
        </div>

        <div style={styles.modalActions}>
          <button onClick={onClose} style={styles.cancelBtn} data-testid="button-cancel-edit">Cancel</button>
          <button
            onClick={() => {
              const pl = form.outcome === "LOSS" ? -Math.abs(form.pl) : Math.abs(form.pl);
              onSave({ ...form, pl });
            }}
            style={styles.saveBtn}
            disabled={isPending}
            data-testid="button-save-edit"
          >
            {isPending ? "Saving..." : "Save Changes"}
          </button>
        </div>
      </div>
    </div>
  );
}

function downloadCSV(trades: Trade[]) {
  const headers = ["Date", "Time", "Asset", "Strategy", "Session", "Outcome", "Direction", "RR", "P/L"];
  const rows = trades.map(t => [
    t.date,
    t.time,
    t.asset,
    t.strategy,
    t.session,
    t.outcome,
    t.direction,
    t.rr,
    t.pl.toString(),
  ]);
  const csv = [headers, ...rows].map(r => r.map(c => `"${(c || '').replace(/"/g, '""')}"`).join(",")).join("\n");
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `trade_vault_${new Date().toISOString().split("T")[0]}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export default function TradeVault({ sessionId, startingBalance: sessionStartingBalance }: { sessionId?: string | null; startingBalance?: number }) {
  const [editingTrade, setEditingTrade] = useState<Trade | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [exported, setExported] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 640);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  useEffect(() => {
    if (!confirmDeleteId) return;
    const handler = (e: MouseEvent) => {
      const target = e.target as Element;
      if (!target.closest(".delete-btn")) {
        setConfirmDeleteId(null);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [confirmDeleteId]);

  const queryUrl = sessionId ? `/api/journal/entries?sessionId=${sessionId}` : '/api/journal/entries';
  const { data: journalEntries = [], isLoading } = useQuery<JournalEntry[]>({
    queryKey: ["/api/journal/entries", sessionId],
    queryFn: async () => {
      const r = await authFetch(queryUrl);
      if (!r.ok) throw new Error(`${r.status}: ${r.statusText}`);
      return r.json();
    },
    enabled: !!sessionId,
  });

  const trades: Trade[] = journalEntries.map(journalEntryToTrade);

  function invalidateAll() {
    queryClient.invalidateQueries({ queryKey: ["/api/journal/entries"] });
    queryClient.invalidateQueries({ queryKey: ["/api/calendar/compute"] });
    queryClient.invalidateQueries({ queryKey: ["/api/metrics/compute"] });
    queryClient.invalidateQueries({ queryKey: ["/api/drawdown/compute"] });
    queryClient.invalidateQueries({ queryKey: ["/api/analytics"] });
    queryClient.invalidateQueries({ queryKey: ["/api/tf-metrics/matrix"] });
    queryClient.invalidateQueries({ queryKey: ["strategyAudit"] });
    queryClient.invalidateQueries({ queryKey: ["aiAnalysis"] });
    queryClient.invalidateQueries({ queryKey: ["aiStrategy"] });
  }

  const updateMutation = useMutation({
    mutationFn: async (updated: Trade) => {
      // Normalize free-text inputs so backend / Python receive clean values
      const normalizedOutcome = String(updated.outcome).trim().toLowerCase();
      const normalizedDirection = updated.direction
        ? String(updated.direction).trim().toLowerCase()
        : null;
      const body: Record<string, unknown> = {
        instrument: String(updated.asset).trim(),
        sessionName: String(updated.session).trim(),
        outcome: normalizedOutcome,
        profitLoss: String(updated.pl),
        entryTime: `${updated.date}T${updated.time}`,
        manualFields: { strategy: String(updated.strategy).trim() },
        direction: normalizedDirection,
        riskReward: updated.rr ? String(updated.rr) : null,
      };
      await apiRequest("PUT", `/api/journal/entries/${updated.id}`, body);
    },
    onSuccess: () => {
      invalidateAll();
      setEditingTrade(null);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/journal/entries/${id}`);
    },
    onSuccess: () => {
      invalidateAll();
    },
  });

  const totalPL = trades.reduce((sum, t) => sum + t.pl, 0);
  const wins = trades.filter((t) => t.outcome === "WIN").length;
  const winRate = trades.length ? Math.round((wins / trades.length) * 100) : 0;

  const growthPct = sessionStartingBalance && sessionStartingBalance > 0
    ? (totalPL / sessionStartingBalance) * 100
    : 0;
  const days = new Set(trades.map(t => t.date)).size;

  const handleExport = () => {
    downloadCSV(trades);
    setExported(true);
    setTimeout(() => setExported(false), 1800);
  };

  const vaultHeader = (subtitle: string) => (
    <header style={{
      width: "100%",
      background: "#111520",
      borderBottom: "1px solid #1e2535",
      padding: isMobile ? "12px 14px" : "14px 20px",
      display: "flex",
      flexDirection: isMobile ? "column" : "row",
      alignItems: isMobile ? "stretch" : "center",
      justifyContent: "space-between",
      gap: isMobile ? 12 : 16,
      boxSizing: "border-box",
      fontFamily: "'Montserrat', sans-serif",
      boxShadow: "0 4px 24px rgba(0,0,0,0.4)",
      marginBottom: 0,
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#00d48a", boxShadow: "0 0 6px #00d48a", flexShrink: 0 }} />
        <div>
          <div style={{ fontSize: 12, fontWeight: 900, color: "#eef2ff", letterSpacing: "0.12em", fontFamily: "'Montserrat', sans-serif" }}>TRADE VAULT</div>
          <div style={{ fontSize: 11, fontWeight: 900, color: "#4a5778", marginTop: 2, fontFamily: "'Montserrat', sans-serif" }}>{subtitle}</div>
        </div>
      </div>
      <div style={{ display: "flex", background: "#0d1018", border: "1px solid #1e2535", overflow: "hidden", flexShrink: 0, width: isMobile ? "100%" : "auto" }}>
        <VaultCell label="NET P/L"  value={totalPL >= 0 ? `+$${Math.abs(totalPL).toLocaleString()}` : `-$${Math.abs(totalPL).toLocaleString()}`} color={totalPL >= 0 ? "#00d48a" : "#ff4d6d"} isMobile={isMobile} first />
        <VaultCell label="WIN RATE" value={`${winRate}%`}    color="#4da6ff" isMobile={isMobile} />
        <VaultCell label="TRADES"   value={String(trades.length)} color="#f0f4ff" isMobile={isMobile} />
        <VaultCell label="NET GROWTH" value={`${growthPct >= 0 ? "+" : ""}${growthPct.toFixed(1)}%`} color="#a78bfa" isMobile={isMobile} />
        <VaultCell label="DAYS"     value={String(days)}     color="#f0f4ff" isMobile={isMobile} />
        <div
          onClick={trades.length > 0 ? handleExport : undefined}
          style={{
            flex: isMobile ? 1 : "none", width: isMobile ? "auto" : 110,
            padding: "10px 0", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 6,
            borderLeft: "1px solid #1e2535",
            cursor: trades.length > 0 ? "pointer" : "default",
            opacity: trades.length > 0 ? 1 : 0.4,
            transition: "background 0.15s",
          }}
          onMouseEnter={e => { if (trades.length > 0) e.currentTarget.style.background = "#161b27"; }}
          onMouseLeave={e => { e.currentTarget.style.background = "transparent"; }}
          data-testid="button-download-csv"
        >
          <span style={{ fontSize: 9, fontWeight: 900, color: "#3d4d6a", letterSpacing: "0.12em", fontFamily: "'Montserrat', sans-serif" }}>
            {exported ? "EXPORTED" : "EXPORT CSV"}
          </span>
          <CircleDownloadIcon success={exported} />
        </div>
      </div>
    </header>
  );

  const handleSave = (updated: Trade) => {
    updateMutation.mutate(updated);
  };

  if (sessionId && isLoading) {
    return (
      <div className="trade-vault-root" style={styles.page}>
        {vaultHeader("Loading entries...")}
        <div style={{ ...styles.tableWrapper, padding: 40, textAlign: "center" as const, marginTop: 20 }}>
          <div style={{ color: "#3a4a6a", fontSize: 14 }} data-testid="text-loading">Loading trade data...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="trade-vault-root" style={styles.page}>
      <style>{`
        .trade-vault-root, .trade-vault-root * { box-sizing: border-box; }
        .trade-vault-root select option { background: #111520; color: #e0e6f0; }

        .row-hover { transition: background 0.15s ease; }
        .row-hover:hover { background: rgba(255,255,255,0.03) !important; }

        .edit-btn {
          background: none;
          border: none;
          cursor: pointer;
          color: #3a4560;
          transition: color 0.2s, transform 0.2s;
          font-size: 16px;
          padding: 6px;
          border-radius: 6px;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .edit-btn:hover { color: #5b8cf8; transform: scale(1.15); background: rgba(91,140,248,0.1); }

        .delete-btn {
          background: none;
          border: none;
          cursor: pointer;
          color: #3a4560;
          transition: color 0.2s, transform 0.2s, background 0.2s;
          font-size: 16px;
          padding: 6px;
          border-radius: 6px;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 4px;
        }
        .delete-btn:hover { color: #ff4d6d; transform: scale(1.1); background: rgba(255,77,109,0.1); }
        .delete-btn:disabled { opacity: 0.4; cursor: not-allowed; }
        .delete-btn--confirm {
          color: #ff4d6d !important;
          background: rgba(255,77,109,0.15) !important;
          border: 1px solid rgba(255,77,109,0.35) !important;
          padding: 5px 8px !important;
          animation: pulse-red 0.6s ease-in-out infinite alternate;
        }
        .delete-btn--confirm:hover { background: rgba(255,77,109,0.28) !important; transform: none !important; }
        @keyframes pulse-red {
          from { box-shadow: 0 0 0 0 rgba(255,77,109,0.0); }
          to   { box-shadow: 0 0 6px 2px rgba(255,77,109,0.25); }
        }
      `}</style>

      {vaultHeader(`Performance ledger · ${trades.length} ${trades.length === 1 ? "entry" : "entries"}`)}

      <div style={{ padding: 0 }}>
      {trades.length === 0 ? (
        <div style={{ ...styles.tableWrapper, padding: 40, textAlign: "center" as const }}>
          <div style={{ color: "#3a4a6a", fontSize: 14 }} data-testid="text-empty-state">No trades recorded yet. Start journaling to see your trades here.</div>
        </div>
      ) : (
        <div style={styles.tableWrapper}>
          <table style={styles.table}>
            <thead>
              <tr>
                {["DATE", "ASSET", "STRATEGY", "SESSION", "DIRECTION", "RR", "OUTCOME", "P/L", "ACTIONS"].map((col) => (
                  <th key={col} style={styles.th}>{col}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {trades.map((trade, i) => (
                <tr
                  key={trade.id}
                  className="row-hover"
                  style={{
                    ...styles.tr,
                    borderTop: i === 0 ? "1px solid #1a2035" : "none",
                  }}
                  data-testid={`row-trade-${trade.id}`}
                >
                  <td style={styles.td}>
                    <div style={styles.dateText}>{trade.date}</div>
                    <div style={styles.timeText}>{trade.time}</div>
                  </td>
                  <td style={styles.td}>
                    <span style={styles.asset}>{trade.asset}</span>
                  </td>
                  <td style={styles.td}>
                    <span style={styles.strategy}>{trade.strategy}</span>
                  </td>
                  <td style={styles.td}>
                    <span style={styles.sessionBadge}>{trade.session}</span>
                  </td>
                  <td style={styles.td}>
                    <DirectionBadge direction={trade.direction} />
                  </td>
                  <td style={styles.td}>
                    <RRBadge rr={trade.rr} />
                  </td>
                  <td style={styles.td}>
                    <span style={{
                      ...styles.outcomeBadge,
                      ...(trade.outcome === "WIN" ? styles.win
                        : trade.outcome === "BE" ? styles.be
                        : styles.loss),
                    }}>
                      {trade.outcome}
                    </span>
                  </td>
                  <td style={styles.td}>
                    <span style={{
                      ...styles.pl,
                      color: trade.pl >= 0 ? "#00e5a0" : "#ff4d6d",
                    }}>
                      {formatPL(trade.pl)}
                    </span>
                  </td>
                  <td style={styles.td}>
                    <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
                      <button
                        className="edit-btn"
                        onClick={() => { setConfirmDeleteId(null); setEditingTrade(trade); }}
                        title="Edit trade"
                        data-testid={`button-edit-${trade.id}`}
                      >
                        <Pencil size={14} />
                      </button>
                      {confirmDeleteId === trade.id ? (
                        <button
                          className="delete-btn delete-btn--confirm"
                          onClick={() => {
                            deleteMutation.mutate(trade.id);
                            setConfirmDeleteId(null);
                          }}
                          title="Confirm delete"
                          data-testid={`button-confirm-delete-${trade.id}`}
                        >
                          <Trash2 size={14} />
                          <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.06em", lineHeight: 1 }}>DELETE?</span>
                        </button>
                      ) : (
                        <button
                          className="delete-btn"
                          onClick={() => setConfirmDeleteId(trade.id)}
                          title="Delete trade"
                          data-testid={`button-delete-${trade.id}`}
                          disabled={deleteMutation.isPending}
                        >
                          <Trash2 size={14} />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      </div>

      {editingTrade && (
        <EditModal
          trade={editingTrade}
          onSave={handleSave}
          onClose={() => setEditingTrade(null)}
          isPending={updateMutation.isPending}
        />
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  page: {
    minHeight: "100vh",
    background: "#080b10",
    fontFamily: "'JetBrains Mono', monospace",
    color: "#c0cce0",
    padding: 0,
  },
  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 28,
    flexWrap: "wrap",
    gap: 16,
  },
  vaultLabel: {
    fontFamily: "'Montserrat', sans-serif",
    fontWeight: 700,
    fontSize: 14,
    color: "#e8eeff",
    letterSpacing: "0.06em",
  },
  vaultSub: {
    fontSize: 11,
    color: "#3a4a6a",
    marginTop: 4,
    letterSpacing: "0.05em",
  },
  statsRow: {
    display: "flex",
    alignItems: "center",
    background: "#0d1220",
    border: "1px solid #1a2035",
    borderRadius: 12,
    padding: "12px 20px",
    gap: 20,
  },
  statCard: { textAlign: "center" as const },
  statLabel: {
    fontSize: 9,
    color: "#3a4a6a",
    letterSpacing: "0.12em",
    marginBottom: 4,
  },
  statValue: {
    fontFamily: "'Montserrat', sans-serif",
    fontWeight: 700,
    fontSize: 18,
  },
  statDivider: {
    width: 1,
    height: 32,
    background: "#1a2035",
  },
  tableWrapper: {
    background: "#0d1220",
    border: "1px solid #1a2035",
    borderRadius: 0,
    overflow: "hidden",
  },
  table: {
    width: "100%",
    borderCollapse: "collapse" as const,
  },
  th: {
    padding: "14px 20px",
    textAlign: "left" as const,
    fontSize: 9,
    fontWeight: 600,
    color: "#3a4a6a",
    letterSpacing: "0.12em",
    borderBottom: "1px solid #1a2035",
    fontFamily: "'Montserrat', sans-serif",
  },
  tr: {
    borderBottom: "1px solid #111825",
    transition: "background 0.15s",
  },
  td: {
    padding: "18px 20px",
    verticalAlign: "middle" as const,
  },
  dateText: {
    fontSize: 10,
    color: "#8899bb",
    fontWeight: 500,
  },
  timeText: {
    fontSize: 9,
    color: "#3a4a6a",
    marginTop: 2,
  },
  asset: {
    fontFamily: "'Montserrat', sans-serif",
    fontWeight: 700,
    fontSize: 11,
    color: "#e8eeff",
    letterSpacing: "0.05em",
    fontStyle: "italic" as const,
  },
  strategy: {
    fontSize: 10,
    color: "#8899bb",
  },
  sessionBadge: {
    display: "inline-block",
    padding: "4px 10px",
    background: "#111825",
    border: "1px solid #1e2d4a",
    borderRadius: 6,
    fontSize: 9,
    fontWeight: 600,
    color: "#5b7aaa",
    letterSpacing: "0.08em",
  },
  outcomeBadge: {
    display: "inline-block",
    padding: "5px 14px",
    borderRadius: 20,
    fontSize: 9,
    fontWeight: 700,
    letterSpacing: "0.1em",
    border: "1px solid transparent",
  },
  win: {
    background: "rgba(0,229,160,0.08)",
    color: "#00e5a0",
    borderColor: "rgba(0,229,160,0.2)",
  },
  loss: {
    background: "rgba(255,77,109,0.08)",
    color: "#ff4d6d",
    borderColor: "rgba(255,77,109,0.2)",
  },
  be: {
    background: "rgba(250,204,21,0.08)",
    color: "#facc15",
    borderColor: "rgba(250,204,21,0.2)",
  },
  pl: {
    fontFamily: "'Montserrat', sans-serif",
    fontWeight: 800,
    fontSize: 12,
  },
  overlay: {
    position: "fixed" as const,
    inset: 0,
    background: "rgba(0,0,0,0.7)",
    backdropFilter: "blur(4px)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 1000,
  },
  modal: {
    background: "#0d1220",
    border: "1px solid #1e2d4a",
    borderRadius: 12,
    padding: 28,
    width: "100%",
    maxWidth: 480,
    maxHeight: "90vh",
    overflowY: "auto" as const,
  },
  modalHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 24,
  },
  modalTitle: {
    fontFamily: "'Montserrat', sans-serif",
    fontWeight: 800,
    fontSize: 14,
    color: "#e8eeff",
    letterSpacing: "0.1em",
  },
  closeBtn: {
    background: "none",
    border: "none",
    color: "#3a4a6a",
    cursor: "pointer",
    fontSize: 16,
  },
  formGrid: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: 16,
    marginBottom: 24,
  },
  formGroup: {
    display: "flex",
    flexDirection: "column" as const,
    gap: 6,
  },
  label: {
    fontSize: 9,
    fontWeight: 700,
    color: "#3a4a6a",
    letterSpacing: "0.12em",
    fontFamily: "'Montserrat', sans-serif",
  },
  input: {
    background: "#080c15",
    border: "1px solid #1e2d4a",
    borderRadius: 6,
    padding: "8px 10px",
    color: "#c0cce0",
    fontSize: 12,
    fontFamily: "'JetBrains Mono', monospace",
    outline: "none",
    width: "100%",
  },
  modalActions: {
    display: "flex",
    gap: 10,
    justifyContent: "flex-end",
  },
  cancelBtn: {
    padding: "8px 18px",
    background: "none",
    border: "1px solid #1e2d4a",
    borderRadius: 6,
    color: "#5b7aaa",
    fontSize: 11,
    fontWeight: 700,
    cursor: "pointer",
    fontFamily: "'Montserrat', sans-serif",
    letterSpacing: "0.08em",
  },
  saveBtn: {
    padding: "8px 18px",
    background: "#1e6fc8",
    border: "none",
    borderRadius: 6,
    color: "#fff",
    fontSize: 11,
    fontWeight: 700,
    cursor: "pointer",
    fontFamily: "'Montserrat', sans-serif",
    letterSpacing: "0.08em",
  },
};
