import React from 'react';
import { T, FONT, L, V, Sub } from '@/components/audit/saTheme';
import { AUDIT_HEAD_CSS } from '@/components/audit/auditHeadCss';

/**
 * AuditHeader — the audit page's header: "Your strategy breakdown: How sharp is your edge?" with the
 * LIVE dot, the tab bar under it, and the four headline figures on the right.
 *
 * MOVED OUT of StrategyAudit.tsx on 2026-11-15 when its row was fixed to stay on one line with the
 * sidebar open (see audit/auditHeadCss for the why). The words, sizes, colours and fonts are the
 * original's. Only the spacing that decided the wrap moved into the shared stylesheet.
 *
 * The heading is one 12.5px line, not a 26px h1: his instruction, "Your strategy breakdown: How sharp
 * is your edge?" at the eyebrow's size. Playfair at weight 600, the page's face.
 */
export type AuditKpi = { label: string; value: string; sub: string; color: string };
export type AuditTab = { id: number; label: string };

export function AuditHeader({ tabs, active, onTab, kpis, darkMode }: {
  tabs: AuditTab[]; active: number; onTab: (id: number) => void; kpis: AuditKpi[]; darkMode: boolean;
}) {
  return (
    <div className="sa-head" style={{ marginBottom: 24, paddingBottom: 20, borderBottom: `1px solid ${T.line}` }}>
      <style>{AUDIT_HEAD_CSS}</style>
      <div className="sa-head-row">
        <div className="sa-head-left">
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <p style={{ fontFamily: FONT, fontSize: 12.5, letterSpacing: ".12em", textTransform: "uppercase", color: T.dim, fontWeight: 600, margin: 0 }}>
              Your strategy breakdown: <span style={{ color: T.text }}>How sharp is your edge?</span>
            </p>
            <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
              <div style={{ width: 4, height: 4, borderRadius: "50%", background: T.green, animation: "pulse 2s infinite" }} />
              <span style={{ fontFamily: FONT, fontSize: 12.5, fontWeight: 700, letterSpacing: ".12em", color: T.green, opacity: 0.7 }}>LIVE</span>
            </div>
          </div>

          <div className="sa-tabs" style={{ background: darkMode ? "rgba(0,0,0,0.5)" : "#FFFFFF", border: `1px solid ${T.line}` }}>
            {tabs.map(tab => (
              <button
                key={tab.id}
                className="sa-tab"
                onClick={() => onTab(tab.id)}
                aria-pressed={active === tab.id}
                style={{
                  fontFamily: FONT, fontSize: 12.5, fontWeight: 600, letterSpacing: ".12em", textTransform: "uppercase",
                  cursor: "pointer", border: "none", borderRadius: 3,
                  background: active === tab.id ? (darkMode ? "rgba(255,255,255,0.08)" : "#E2E8F0") : "transparent",
                  color: active === tab.id ? T.text : T.dim, transition: "all .15s",
                }}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>
        <div className="sa-kpis">
          {kpis.map((kpi, i) => (
            <div key={i} className="sa-kpi">
              <L>{kpi.label}</L>
              <V color={kpi.color} style={{ fontSize: 15 }}>{kpi.value}</V>
              <Sub>{kpi.sub}</Sub>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
