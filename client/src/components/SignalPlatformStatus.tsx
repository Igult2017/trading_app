import { useQuery } from "@tanstack/react-query";
import { Bell } from "lucide-react";

interface LastSignal { id: string; symbol: string; type: string; status: string; strategy: string | null; confidence: number; createdAt: string; }
interface StatusData { ctraderConfigured: boolean; dataSource: string; lastSignal: LastSignal | null; signalsLast24h: number; activeSignalsLast24h: number; error?: string; }
interface Props { darkMode?: boolean; selectedSymbol?: string; }

function timeAgo(iso: string): string {
  const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  return h < 24 ? `${h}h ago` : `${Math.floor(h / 24)}d ago`;
}

export default function SignalPlatformStatus({ darkMode = true, selectedSymbol = "" }: Props) {
  const C = darkMode
    ? { bg: "#080c10", bg2: "#0a0f16", bg3: "#0c1219", border: "#0f1923", border2: "#172233",
        text: "#c8d8e8", muted: "#4a6580", dim: "#2d4a63", hero: "#ffffff" }
    : { bg: "#f0f4f8", bg2: "#ffffff", bg3: "#f1f5f9", border: "#e2e8f0", border2: "#cbd5e1",
        text: "#1e293b", muted: "#475569", dim: "#94a3b8", hero: "#0f172a" };

  const { data, isLoading } = useQuery<StatusData>({
    queryKey: ["signal-platform-status"],
    queryFn: () => fetch("/api/signal-platform/status").then(r => r.json()),
    refetchInterval: 30_000,
    staleTime: 20_000,
  });

  const connected  = data?.ctraderConfigured ?? false;
  const statusColor = connected ? "#22d3a5" : "#f4617f";
  const statusLabel = connected ? "CTRADER CONNECTED" : "CTRADER NOT CONFIGURED";

  return (
    <div style={{ background: C.bg2, border: `1px solid ${C.border}`, borderRadius: 4, overflow: "hidden" }}>
      {/* Header row — matches chart card header */}
      <div style={{ padding: "10px 16px 8px", borderBottom: `1px solid ${C.border}`, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ fontSize: 9, color: C.dim, letterSpacing: "0.06em", fontFamily: "monospace" }}>
          SIGNAL PLATFORM STATUS
        </div>
        <div style={{ fontSize: 10, fontWeight: 900, letterSpacing: "0.12em", color: C.text, fontFamily: "monospace" }}>
          {selectedSymbol}
        </div>
        <button style={{ background: C.bg3, border: `1px solid ${C.border2}`, color: C.text, fontSize: 9, fontWeight: 700, letterSpacing: "0.08em", padding: "5px 12px", cursor: "pointer", display: "flex", alignItems: "center", gap: 6 }}>
          <Bell size={11} /> ALERT
        </button>
      </div>

      {/* Status body */}
      <div style={{ padding: "28px 24px", display: "flex", flexDirection: "column", gap: 20, minHeight: 300, justifyContent: "center" }}>

        {isLoading ? (
          <div style={{ textAlign: "center", color: C.muted, fontSize: 10, letterSpacing: "0.1em" }}>CHECKING STATUS…</div>
        ) : (
          <>
            {/* Connection status */}
            <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
              <div style={{ position: "relative", flexShrink: 0 }}>
                <div style={{ width: 10, height: 10, borderRadius: "50%", background: statusColor }} />
                {connected && (
                  <div style={{ position: "absolute", inset: -3, borderRadius: "50%", border: `2px solid ${statusColor}`, opacity: 0.35, animation: "sp-pulse 2s ease-in-out infinite" }} />
                )}
              </div>
              <div>
                <div style={{ fontSize: 11, fontWeight: 800, color: statusColor, letterSpacing: "0.12em" }}>{statusLabel}</div>
                <div style={{ fontSize: 9, color: C.muted, letterSpacing: "0.08em", marginTop: 3 }}>
                  {data?.dataSource ?? "—"} · {selectedSymbol}
                </div>
              </div>
            </div>

            {/* Scanning status */}
            <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
              <div style={{ flexShrink: 0, width: 10, height: 10, borderRadius: "50%",
                background: connected ? "#3b82f6" : C.dim,
                boxShadow: connected ? "0 0 6px rgba(59,130,246,0.6)" : "none" }} />
              <div>
                <div style={{ fontSize: 11, fontWeight: 800, color: connected ? "#60a5fa" : C.muted, letterSpacing: "0.12em" }}>
                  {connected ? `SCANNING ${selectedSymbol || data?.lastSignal?.symbol || "—"}` : "SCANNER IDLE"}
                </div>
                <div style={{ fontSize: 9, color: C.muted, letterSpacing: "0.08em", marginTop: 3 }}>
                  {data?.lastSignal?.strategy?.toUpperCase() ?? "ACTIVE STRATEGY"} · scan every 60s
                </div>
              </div>
            </div>

            {/* Divider */}
            <div style={{ height: 1, background: C.border, margin: "4px 0" }} />

            {/* Last signal */}
            <div>
              <div style={{ fontSize: 8, fontWeight: 700, color: C.dim, letterSpacing: "0.14em", marginBottom: 10 }}>LAST SIGNAL</div>
              {data?.lastSignal ? (
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <div style={{
                    padding: "5px 12px", borderRadius: 3, fontSize: 10, fontWeight: 800, letterSpacing: "0.12em",
                    background: data.lastSignal.type === "BUY" ? "rgba(34,211,165,0.12)" : "rgba(244,97,127,0.12)",
                    color:      data.lastSignal.type === "BUY" ? "#22d3a5"               : "#f4617f",
                    border:     `1px solid ${data.lastSignal.type === "BUY" ? "rgba(34,211,165,0.3)" : "rgba(244,97,127,0.3)"}`,
                  }}>{data.lastSignal.type}</div>
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 700, color: C.text, letterSpacing: "0.06em" }}>
                      {data.lastSignal.symbol}
                    </div>
                    <div style={{ fontSize: 9, color: C.muted, marginTop: 2 }}>
                      Conf {data.lastSignal.confidence}% · {timeAgo(data.lastSignal.createdAt)}
                    </div>
                  </div>
                </div>
              ) : (
                <div style={{ fontSize: 10, color: C.muted, letterSpacing: "0.06em" }}>
                  {connected ? "No signal generated yet — scanner is running" : "Configure cTrader to start receiving signals"}
                </div>
              )}
            </div>

            {/* 24h stats */}
            <div style={{ display: "flex", gap: 16 }}>
              {[
                { label: "SIGNALS 24H", value: data?.signalsLast24h ?? 0 },
                { label: "ACTIVE NOW",  value: data?.activeSignalsLast24h ?? 0 },
              ].map(({ label, value }) => (
                <div key={label} style={{ flex: 1, background: C.bg3, border: `1px solid ${C.border2}`, borderRadius: 4, padding: "12px 16px" }}>
                  <div style={{ fontSize: 8, fontWeight: 700, color: C.dim, letterSpacing: "0.14em", marginBottom: 6 }}>{label}</div>
                  <div style={{ fontSize: 22, fontWeight: 800, color: value > 0 ? "#22d3a5" : C.muted, letterSpacing: "0.02em" }}>{value}</div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      <style>{`
        @keyframes sp-pulse {
          0%, 100% { transform: scale(1); opacity: 0.35; }
          50%       { transform: scale(1.8); opacity: 0; }
        }
      `}</style>
    </div>
  );
}
