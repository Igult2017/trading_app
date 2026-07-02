import { useQuery } from "@tanstack/react-query";
import { Bell, AlertTriangle } from "lucide-react";
import { fetchJson } from "@/lib/queryClient";

interface LastSignal { id: string; symbol: string; type: string; status: string; strategy: string | null; confidence: number; createdAt: string; }
interface PlatformStatus { status: "starting" | "ok" | "error"; error: string; hint: string; ts: number; }
interface StatusData { ctraderConfigured: boolean; dataSource: string; platformStatus: PlatformStatus | null; lastSignal: LastSignal | null; signalsLast24h: number; activeSignalsLast24h: number; error?: string; }
interface Props { darkMode?: boolean; selectedSymbol?: string; confirmed?: boolean | null; }

export default function SignalPlatformStatus({ darkMode = true, selectedSymbol = "", confirmed = null }: Props) {
  const C = darkMode
    ? { bg: "#080c10", bg2: "#0a0f16", bg3: "#0c1219", border: "#0f1923", border2: "#172233",
        text: "#c8d8e8", muted: "#4a6580", dim: "#2d4a63", hero: "#ffffff" }
    : { bg: "#f0f4f8", bg2: "#ffffff", bg3: "#f1f5f9", border: "#e2e8f0", border2: "#cbd5e1",
        text: "#1e293b", muted: "#475569", dim: "#94a3b8", hero: "#0f172a" };

  const { data, isLoading } = useQuery<StatusData>({
    queryKey: ["signal-platform-status"],
    queryFn: () => fetchJson<StatusData>("/api/signal-platform/status"),
    refetchInterval: 30_000,
    staleTime: 20_000,
  });

  const ps        = data?.platformStatus;
  const hasError  = ps?.status === "error";
  const isOk      = ps?.status === "ok";

  // Two header lights: GREEN = cTrader connected (env present & no boot error),
  // BLUE = scanner actively running ("ok"). Either turns RED (still blinking)
  // the moment that half stops working — at-a-glance health, no verbose text.
  const connected    = (data?.ctraderConfigured ?? false) && !hasError;
  const lightCtrader = connected ? "#22d3a5" : "#f4617f";
  const lightScanner = isOk ? "#3b82f6" : "#f4617f";

  return (
    <div style={{ background: C.bg2, border: `1px solid ${C.border}`, borderRadius: 4, overflow: "hidden" }}>
      {/* Header */}
      <div style={{ padding: "10px 16px 8px", borderBottom: `1px solid ${C.border}`, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ fontSize: 9, color: C.dim, letterSpacing: "0.06em", fontFamily: "monospace" }}>SIGNAL PLATFORM STATUS</div>
          <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
            <span title={connected ? "cTrader connected" : "cTrader NOT connected"}
              style={{ width: 9, height: 9, borderRadius: "50%", background: lightCtrader, boxShadow: `0 0 7px ${lightCtrader}`, animation: "sp-blink 1.4s ease-in-out infinite" }} />
            <span title={isOk ? "Scanner running" : "Scanner NOT running"}
              style={{ width: 9, height: 9, borderRadius: "50%", background: lightScanner, boxShadow: `0 0 7px ${lightScanner}`, animation: "sp-blink 1.4s ease-in-out infinite", animationDelay: "0.7s" }} />
          </div>
        </div>
        <div style={{ fontSize: 10, fontWeight: 900, letterSpacing: "0.1em", fontFamily: "monospace",
          color: confirmed == null ? C.muted : confirmed ? "#22d3a5" : "#f59e0b" }}>
          {confirmed == null ? "STATUS: —" : confirmed ? "STATUS: CONFIRMED" : "STATUS: NOT CONFIRMED"}
        </div>
        <button style={{ background: C.bg3, border: `1px solid ${C.border2}`, color: C.text, fontSize: 9, fontWeight: 700, letterSpacing: "0.08em", padding: "5px 12px", cursor: "pointer", display: "flex", alignItems: "center", gap: 6 }}>
          <Bell size={11} /> ALERT
        </button>
      </div>

      <div style={{ padding: "16px 24px 20px", display: "flex", flexDirection: "column", gap: 16 }}>
        {isLoading ? (
          <div style={{ textAlign: "center", color: C.muted, fontSize: 10, letterSpacing: "0.1em" }}>CHECKING STATUS…</div>
        ) : (
          <>
            {/* Error box — only shown when Python reported a failure */}
            {hasError && ps && (
              <div style={{ background: "rgba(244,97,127,0.08)", border: "1px solid rgba(244,97,127,0.3)", borderRadius: 6, padding: "14px 16px", display: "flex", gap: 12, alignItems: "flex-start" }}>
                <AlertTriangle size={14} color="#f4617f" style={{ flexShrink: 0, marginTop: 1 }} />
                <div>
                  <div style={{ fontSize: 10, fontWeight: 700, color: "#f4617f", letterSpacing: "0.08em", marginBottom: 6 }}>BOOT ERROR</div>
                  <div style={{ fontSize: 10, color: "#f4617f", marginBottom: ps.hint ? 8 : 0, lineHeight: 1.5 }}>{ps.error}</div>
                  {ps.hint && <div style={{ fontSize: 9, color: C.muted, lineHeight: 1.5 }}>{ps.hint}</div>}
                </div>
              </div>
            )}

            {/* 24h stats */}
            <div style={{ display: "flex", gap: 16 }}>
              {[{ label: "SIGNALS 24H", value: data?.signalsLast24h ?? 0 }, { label: "ACTIVE NOW", value: data?.activeSignalsLast24h ?? 0 }].map(({ label, value }) => (
                <div key={label} style={{ flex: 1, background: C.bg3, border: `1px solid ${C.border2}`, borderRadius: 4, padding: "12px 16px" }}>
                  <div style={{ fontSize: 8, fontWeight: 700, color: C.dim, letterSpacing: "0.14em", marginBottom: 6 }}>{label}</div>
                  <div style={{ fontSize: 22, fontWeight: 800, color: value > 0 ? "#22d3a5" : C.muted }}>{value}</div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      <style>{`@keyframes sp-blink { 0%, 100% { opacity: 1; } 50% { opacity: 0.2; } }`}</style>
    </div>
  );
}
