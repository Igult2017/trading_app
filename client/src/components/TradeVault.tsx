import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import type { JournalEntry } from "@shared/schema";

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

  const strategy = (manual.strategy as string) || (ai.strategy as string) || "";
  const pl = entry.profitLoss ? parseFloat(entry.profitLoss) : 0;

  return {
    id: entry.id,
    date,
    time: timePart,
    asset: entry.instrument || "",
    strategy,
    session: entry.sessionName || "",
    outcome: (entry.outcome || "").toUpperCase(),
    pl: isNaN(pl) ? 0 : pl,
  };
}

function formatPL(pl: number) {
  return pl >= 0 ? `+$${pl.toLocaleString()}` : `-$${Math.abs(pl).toLocaleString()}`;
}

function EditModal({ trade, onSave, onClose, isPending }: { trade: Trade; onSave: (t: Trade) => void; onClose: () => void; isPending: boolean }) {
  const [form, setForm] = useState({ ...trade });

  const handleChange = (field: string, value: string | number) => setForm((f) => ({ ...f, [field]: value }));

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
            <select value={form.asset} onChange={(e) => handleChange("asset", e.target.value)} style={styles.input} data-testid="select-asset">
              {ASSETS.map((a) => <option key={a}>{a}</option>)}
              {form.asset && !ASSETS.includes(form.asset) && <option key={form.asset}>{form.asset}</option>}
            </select>
          </div>

          <div style={styles.formGroup}>
            <label style={styles.label}>Strategy</label>
            <select value={form.strategy} onChange={(e) => handleChange("strategy", e.target.value)} style={styles.input} data-testid="select-strategy">
              {STRATEGIES.map((s) => <option key={s}>{s}</option>)}
              {form.strategy && !STRATEGIES.includes(form.strategy) && <option key={form.strategy}>{form.strategy}</option>}
            </select>
          </div>

          <div style={styles.formGroup}>
            <label style={styles.label}>Session</label>
            <select value={form.session} onChange={(e) => handleChange("session", e.target.value)} style={styles.input} data-testid="select-session">
              {SESSIONS.map((s) => <option key={s}>{s}</option>)}
              {form.session && !SESSIONS.includes(form.session) && <option key={form.session}>{form.session}</option>}
            </select>
          </div>

          <div style={styles.formGroup}>
            <label style={styles.label}>Outcome</label>
            <select value={form.outcome} onChange={(e) => handleChange("outcome", e.target.value)} style={styles.input} data-testid="select-outcome">
              <option>WIN</option>
              <option>LOSS</option>
            </select>
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
  const headers = ["Date", "Time", "Asset", "Strategy", "Session", "Outcome", "P/L"];
  const rows = trades.map(t => [
    t.date,
    t.time,
    t.asset,
    t.strategy,
    t.session,
    t.outcome,
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

export default function TradeVault({ sessionId }: { sessionId?: string | null }) {
  const [editingTrade, setEditingTrade] = useState<Trade | null>(null);

  const queryUrl = sessionId ? `/api/journal/entries?sessionId=${sessionId}` : '/api/journal/entries';
  const { data: journalEntries = [], isLoading } = useQuery<JournalEntry[]>({
    queryKey: ["/api/journal/entries", sessionId],
    queryFn: () => fetch(queryUrl).then(r => r.json()),
    enabled: !!sessionId,
  });

  const trades: Trade[] = journalEntries.map(journalEntryToTrade);

  const updateMutation = useMutation({
    mutationFn: async (updated: Trade) => {
      const body: Record<string, unknown> = {
        instrument: updated.asset,
        sessionName: updated.session,
        outcome: updated.outcome.toLowerCase(),
        profitLoss: String(updated.pl),
        entryTime: `${updated.date}T${updated.time}`,
        manualFields: { strategy: updated.strategy },
      };
      await apiRequest("PUT", `/api/journal/entries/${updated.id}`, body);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/journal/entries"] });
      setEditingTrade(null);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/journal/entries/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/journal/entries"] });
    },
  });

  const totalPL = trades.reduce((sum, t) => sum + t.pl, 0);
  const wins = trades.filter((t) => t.outcome === "WIN").length;
  const winRate = trades.length ? Math.round((wins / trades.length) * 100) : 0;

  const handleSave = (updated: Trade) => {
    updateMutation.mutate(updated);
  };

  if (!sessionId) {
    return (
      <div className="trade-vault-root" style={styles.page}>
        <div style={styles.header}>
          <div>
            <div style={styles.vaultLabel}>&#x2B21; TRADE VAULT</div>
            <div style={styles.vaultSub}>No session selected</div>
          </div>
        </div>
        <div style={{ ...styles.tableWrapper, padding: 40, textAlign: "center" as const }}>
          <div style={{ color: "#3a4a6a", fontSize: 14 }} data-testid="text-no-session">Select or create a session to view trades.</div>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="trade-vault-root" style={styles.page}>
        <div style={styles.header}>
          <div>
            <div style={styles.vaultLabel}>&#x2B21; TRADE VAULT</div>
            <div style={styles.vaultSub}>Loading entries...</div>
          </div>
        </div>
        <div style={{ ...styles.tableWrapper, padding: 40, textAlign: "center" as const }}>
          <div style={{ color: "#3a4a6a", fontSize: 14 }} data-testid="text-loading">Loading trade data...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="trade-vault-root" style={styles.page}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Montserrat:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500;600&display=swap');
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
          transition: color 0.2s, transform 0.2s;
          font-size: 16px;
          padding: 6px;
          border-radius: 6px;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .delete-btn:hover { color: #ff4d6d; transform: scale(1.15); background: rgba(255,77,109,0.1); }
      `}</style>

      <div style={styles.header}>
        <div>
          <div style={styles.vaultLabel}>&#x2B21; TRADE VAULT</div>
          <div style={styles.vaultSub}>Performance ledger · {trades.length} entries</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' as const }}>
        {trades.length > 0 && (
          <button
            onClick={() => downloadCSV(trades)}
            style={styles.downloadBtn}
            data-testid="button-download-csv"
            onMouseEnter={e => { e.currentTarget.style.background = 'rgba(91,140,248,0.2)'; e.currentTarget.style.borderColor = 'rgba(91,140,248,0.5)'; }}
            onMouseLeave={e => { e.currentTarget.style.background = 'rgba(91,140,248,0.08)'; e.currentTarget.style.borderColor = 'rgba(91,140,248,0.2)'; }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
            EXPORT CSV
          </button>
        )}
        <div style={styles.statsRow}>
          <div style={styles.statCard}>
            <div style={styles.statLabel}>NET P/L</div>
            <div style={{ ...styles.statValue, color: totalPL >= 0 ? "#00e5a0" : "#ff4d6d" }} data-testid="text-net-pl">
              {formatPL(totalPL)}
            </div>
          </div>
          <div style={styles.statDivider} />
          <div style={styles.statCard}>
            <div style={styles.statLabel}>WIN RATE</div>
            <div style={{ ...styles.statValue, color: "#5b8cf8" }} data-testid="text-win-rate">{winRate}%</div>
          </div>
          <div style={styles.statDivider} />
          <div style={styles.statCard}>
            <div style={styles.statLabel}>TRADES</div>
            <div style={{ ...styles.statValue, color: "#c0cce0" }} data-testid="text-trade-count">{trades.length}</div>
          </div>
        </div>
        </div>
      </div>

      {trades.length === 0 ? (
        <div style={{ ...styles.tableWrapper, padding: 40, textAlign: "center" as const }}>
          <div style={{ color: "#3a4a6a", fontSize: 14 }} data-testid="text-empty-state">No trades recorded yet. Start journaling to see your trades here.</div>
        </div>
      ) : (
        <div style={styles.tableWrapper}>
          <table style={styles.table}>
            <thead>
              <tr>
                {["DATE", "ASSET", "STRATEGY", "SESSION", "OUTCOME", "P/L", "ACTIONS"].map((col) => (
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
                    <span style={{
                      ...styles.outcomeBadge,
                      ...(trade.outcome === "WIN" ? styles.win : styles.loss),
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
                      <button className="edit-btn" onClick={() => setEditingTrade(trade)} title="Edit trade" data-testid={`button-edit-${trade.id}`}>
                        &#x270E;
                      </button>
                      <button
                        className="delete-btn"
                        onClick={() => {
                          if (confirm("Delete this trade?")) {
                            deleteMutation.mutate(trade.id);
                          }
                        }}
                        title="Delete trade"
                        data-testid={`button-delete-${trade.id}`}
                      >
                        &#x2715;
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

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
    padding: "32px 24px",
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
    borderRadius: 16,
    overflow: "hidden",
  },
  table: {
    width: "100%",
    borderCollapse: "collapse" as const,
  },
  th: {
    padding: "14px 20px",
    textAlign: "left" as const,
    fontSize: 10,
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
    fontSize: 12,
    color: "#8899bb",
    fontWeight: 500,
  },
  timeText: {
    fontSize: 11,
    color: "#3a4a6a",
    marginTop: 2,
  },
  asset: {
    fontFamily: "'Montserrat', sans-serif",
    fontWeight: 700,
    fontSize: 13,
    color: "#e8eeff",
    letterSpacing: "0.05em",
    fontStyle: "italic" as const,
  },
  strategy: {
    fontSize: 12,
    color: "#8899bb",
  },
  sessionBadge: {
    display: "inline-block",
    padding: "4px 10px",
    background: "#111825",
    border: "1px solid #1e2d4a",
    borderRadius: 6,
    fontSize: 10,
    fontWeight: 600,
    color: "#5b7aaa",
    letterSpacing: "0.08em",
  },
  outcomeBadge: {
    display: "inline-block",
    padding: "5px 14px",
    borderRadius: 20,
    fontSize: 10,
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
  pl: {
    fontFamily: "'Montserrat', sans-serif",
    fontWeight: 700,
    fontSize: 14,
  },
  overlay: {
    position: "fixed" as const,
    inset: 0,
    background: "rgba(0,0,0,0.7)",
    backdropFilter: "blur(6px)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 1000,
  },
  modal: {
    background: "#0d1220",
    border: "1px solid #1e2d4a",
    borderRadius: 16,
    padding: 28,
    width: "100%",
    maxWidth: 480,
  },
  modalHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 24,
  },
  modalTitle: {
    fontFamily: "'Montserrat', sans-serif",
    fontWeight: 700,
    fontSize: 16,
    color: "#e8eeff",
    letterSpacing: "0.05em",
  },
  closeBtn: {
    background: "none",
    border: "none",
    color: "#3a4a6a",
    fontSize: 16,
    cursor: "pointer",
    padding: "4px 8px",
    borderRadius: 6,
    transition: "color 0.2s",
  },
  formGrid: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: 16,
    marginBottom: 24,
  },
  formGroup: { display: "flex", flexDirection: "column" as const, gap: 6 },
  label: {
    fontSize: 10,
    color: "#3a4a6a",
    letterSpacing: "0.1em",
    fontWeight: 600,
  },
  input: {
    background: "#111825",
    border: "1px solid #1e2d4a",
    borderRadius: 8,
    padding: "9px 12px",
    color: "#c0cce0",
    fontSize: 12,
    fontFamily: "'JetBrains Mono', monospace",
    outline: "none",
    width: "100%",
  },
  modalActions: {
    display: "flex",
    justifyContent: "flex-end",
    gap: 10,
  },
  cancelBtn: {
    background: "none",
    border: "1px solid #1e2d4a",
    color: "#5b7aaa",
    padding: "9px 20px",
    borderRadius: 8,
    fontSize: 12,
    cursor: "pointer",
    fontFamily: "'JetBrains Mono', monospace",
  },
  downloadBtn: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    background: "rgba(91,140,248,0.08)",
    border: "1px solid rgba(91,140,248,0.2)",
    color: "#5b8cf8",
    padding: "9px 18px",
    borderRadius: 10,
    fontSize: 10,
    cursor: "pointer",
    fontFamily: "'Montserrat', sans-serif",
    fontWeight: 700,
    letterSpacing: "0.1em",
    transition: "all 0.2s ease",
  },
  saveBtn: {
    background: "rgba(91,140,248,0.15)",
    border: "1px solid rgba(91,140,248,0.3)",
    color: "#5b8cf8",
    padding: "9px 20px",
    borderRadius: 8,
    fontSize: 12,
    cursor: "pointer",
    fontFamily: "'Montserrat', sans-serif",
    fontWeight: 600,
    letterSpacing: "0.05em",
  },
};