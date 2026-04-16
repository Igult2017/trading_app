import { useState, useCallback, useMemo, useRef, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useSessionBalance } from "@/hooks/useSessionBalance";
import { calcDollarRisk, calcPnL } from "@/lib/tradeCalculations";

// ── Scoped CSS (all rules prefixed with .tj-root) ────────────────────────────
const TJ_CSS = `
  @import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600&family=Syne:wght@400;500;700&display=swap');

  .tj-root *, .tj-root *::before, .tj-root *::after { box-sizing: border-box; margin: 0; padding: 0; }

  .tj-root {
    --c-bg:        #0d0f0e;
    --c-bg1:       #111413;
    --c-bg2:       #181c1a;
    --c-bg3:       #1e2320;
    --c-border:    rgba(255,255,255,0.07);
    --c-border2:   rgba(255,255,255,0.12);
    --c-text:      #e8ede9;
    --c-muted:     #8a9e8d;
    --c-hint:      #4d5e50;
    --c-accent:    #3b82f6;
    --c-accent2:   #2563eb;
    --c-accent3:   #1e3a5f;
    --c-warn:      #f0a500;
    --c-danger:    #e85454;
    --c-info:      #4da6ff;
    --radius:      6px;
    --radius-lg:   10px;
    --font-mono:   'JetBrains Mono', 'Fira Code', monospace !important;
    --font-display:'Syne', sans-serif;
    font-family: 'JetBrains Mono', 'Fira Code', monospace !important;
    font-size: 13px;
    color: var(--c-text);
    background: var(--c-bg);
    line-height: 1.5;
  }

  .tj-root.tj-root * { font-family: 'JetBrains Mono', 'Fira Code', monospace !important; }

  .tj-page { display: flex; align-items: stretch; width: 100%; min-height: 100%; }

  .tj-shell { flex: 1; min-width: 0; padding-bottom: 4rem; border-right: 1px solid var(--c-border); display: flex; flex-direction: column; }

  .tj-progress-bar { height: 2px; background: var(--c-bg3); flex-shrink: 0; }
  .tj-progress-fill { height: 2px; background: linear-gradient(90deg, var(--c-accent3), var(--c-accent)); transition: width 0.4s cubic-bezier(.4,0,.2,1); }

  .tj-tabs { display: flex; border-bottom: 1px solid var(--c-border); padding: 0 1.5rem; overflow-x: auto; scrollbar-width: none; flex-shrink: 0; }
  .tj-tabs::-webkit-scrollbar { display: none; }
  .tj-tab { display: flex; align-items: center; gap: 7px; padding: 12px 14px 10px; font-size: 10px; font-weight: 600; letter-spacing: 0.1em; text-transform: uppercase; cursor: pointer; color: var(--c-hint); border-bottom: 2px solid transparent; margin-bottom: -1px; white-space: nowrap; transition: color 0.15s; user-select: none; background: none; border-top: none; border-left: none; border-right: none; }
  .tj-tab:hover { color: var(--c-muted); }
  .tj-tab.active { color: var(--c-accent); border-bottom-color: var(--c-accent); }
  .tj-tab-num { width: 18px; height: 18px; border-radius: 50%; font-size: 9px; font-weight: 600; display: flex; align-items: center; justify-content: center; background: var(--c-bg3); color: var(--c-hint); flex-shrink: 0; transition: all 0.15s; }
  .tj-tab.active .tj-tab-num { background: var(--c-accent); color: #000; }
  .tj-tab.done .tj-tab-num { background: var(--c-accent3); color: var(--c-accent); }

  .tj-body { padding: 1.75rem 1.5rem 0; flex: 1; overflow-y: auto; }

  .tj-section { margin-bottom: 2rem; }
  .tj-section-label { font-size: 9px; font-weight: 600; letter-spacing: 0.18em; text-transform: uppercase; color: var(--c-accent); padding-bottom: 8px; border-bottom: 1px solid var(--c-border); margin-bottom: 14px; display: flex; align-items: center; gap: 8px; }
  .tj-section-label::before { content: ''; display: block; width: 3px; height: 10px; background: var(--c-accent); border-radius: 2px; }

  .tj-grid { display: grid; gap: 12px; }
  .tj-g2 { grid-template-columns: 1fr 1fr; }
  .tj-g3 { grid-template-columns: 1fr 1fr 1fr; }
  .tj-g4 { grid-template-columns: 1fr 1fr 1fr 1fr; }

  .tj-field { display: flex; flex-direction: column; gap: 5px; }
  .tj-label { font-size: 9px; font-weight: 600; letter-spacing: 0.1em; text-transform: uppercase; color: var(--c-muted); }
  .tj-sub { font-size: 10px; color: var(--c-hint); margin-top: -3px; }

  .tj-input, .tj-select, .tj-textarea { background: var(--c-bg2); border: 1px solid var(--c-border2); border-radius: var(--radius); padding: 8px 11px; font-size: 12px; color: var(--c-text); width: 100%; outline: none; transition: border-color 0.15s, background 0.15s; appearance: none; -webkit-appearance: none; }
  .tj-input::placeholder, .tj-textarea::placeholder { color: var(--c-hint); }
  .tj-input:focus, .tj-select:focus, .tj-textarea:focus { border-color: var(--c-accent); background: var(--c-bg3); }
  .tj-select { background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%234d5e50' stroke-width='2'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E"); background-repeat: no-repeat; background-position: right 10px center; padding-right: 32px; cursor: pointer; }
  .tj-textarea { resize: vertical; min-height: 70px; line-height: 1.6; }

  .tj-radio-group { display: flex; flex-wrap: wrap; gap: 6px; }
  .tj-radio { padding: 5px 13px; border: 1px solid var(--c-border2); border-radius: var(--radius); font-size: 11px; font-weight: 500; cursor: pointer; color: var(--c-muted); background: var(--c-bg2); transition: all 0.12s; user-select: none; }
  .tj-radio:hover { border-color: var(--c-accent); color: var(--c-accent); }
  .tj-radio.sel { background: var(--c-accent); border-color: var(--c-accent); color: #000; font-weight: 600; }

  .tj-check-wrap { display: flex; align-items: flex-start; gap: 10px; padding: 10px 12px; border: 1px solid var(--c-border2); border-radius: var(--radius); background: var(--c-bg2); cursor: pointer; transition: border-color 0.12s; }
  .tj-check-wrap:hover { border-color: var(--c-accent); }
  .tj-check-wrap input[type=checkbox] { width: 14px; height: 14px; margin-top: 1px; flex-shrink: 0; accent-color: var(--c-accent); cursor: pointer; }
  .tj-check-label { font-size: 11px; color: var(--c-muted); line-height: 1.4; }

  .tj-score-grid { display: flex; flex-direction: column; gap: 10px; }
  .tj-score-row { display: flex; align-items: center; gap: 12px; }
  .tj-score-name { font-size: 11px; color: var(--c-muted); min-width: 160px; flex-shrink: 0; }
  .tj-dots { display: flex; gap: 6px; }
  .tj-dot { width: 20px; height: 20px; border-radius: 50%; border: 1px solid var(--c-border2); cursor: pointer; background: var(--c-bg2); transition: all 0.1s; }
  .tj-dot:hover { border-color: var(--c-accent); }
  .tj-dot.lit { background: var(--c-accent); border-color: var(--c-accent); }

  .tj-slider-row { display: flex; align-items: center; gap: 10px; }
  .tj-slider { -webkit-appearance: none; appearance: none; flex: 1; height: 3px; background: var(--c-bg3); border-radius: 2px; outline: none; cursor: pointer; }
  .tj-slider::-webkit-slider-thumb { -webkit-appearance: none; width: 16px; height: 16px; border-radius: 50%; background: var(--c-accent); cursor: pointer; border: 2px solid var(--c-bg); box-shadow: 0 0 0 2px var(--c-accent3); }
  .tj-slider::-moz-range-thumb { width: 16px; height: 16px; border-radius: 50%; background: var(--c-accent); cursor: pointer; border: 2px solid var(--c-bg); }
  .tj-slider-val { min-width: 40px; font-size: 13px; font-weight: 600; color: var(--c-accent); text-align: right; }

  .tj-upload { border: 1px dashed var(--c-border2); border-radius: var(--radius-lg); padding: 20px 16px; text-align: center; cursor: pointer; color: var(--c-hint); font-size: 11px; background: var(--c-bg2); transition: border-color 0.15s, background 0.15s; position: relative; min-height: 90px; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 4px; }
  .tj-upload:hover { border-color: var(--c-accent); background: var(--c-bg3); color: var(--c-accent); }
  .tj-upload input[type=file] { position: absolute; inset: 0; opacity: 0; cursor: pointer; width: 100%; height: 100%; }
  .tj-upload-icon { font-size: 22px; margin-bottom: 2px; }
  .tj-upload-thumb { max-width: 100%; max-height: 180px; object-fit: contain; border-radius: 4px; margin-top: 6px; }
  .tj-upload-name { font-size: 10px; color: var(--c-accent); margin-top: 4px; }
  .tj-upload-actions { display: flex; gap: 6px; margin-top: 8px; }
  .tj-upload-btn { padding: 4px 10px; border-radius: var(--radius); font-size: 10px; font-weight: 600; cursor: pointer; border: 1px solid var(--c-border2); background: var(--c-bg3); color: var(--c-muted); transition: all 0.12s; }
  .tj-upload-btn:hover { border-color: var(--c-accent); color: var(--c-accent); }
  .tj-upload-btn.danger:hover { border-color: var(--c-danger); color: var(--c-danger); }

  .tj-strip { background: rgba(61,220,132,0.06); border: 1px solid rgba(61,220,132,0.15); border-radius: var(--radius); padding: 8px 12px; font-size: 11px; color: var(--c-muted); margin-bottom: 14px; }
  .tj-strip.warn { background: rgba(240,165,0,0.06); border-color: rgba(240,165,0,0.2); color: var(--c-warn); }
  .tj-strip.danger { background: rgba(232,84,84,0.06); border-color: rgba(232,84,84,0.2); color: var(--c-danger); }
  .tj-strip.info { background: rgba(77,166,255,0.06); border-color: rgba(77,166,255,0.2); color: var(--c-info); }

  /* ── Success overlay ── */
  .tj-success-overlay { position: absolute; inset: 0; background: var(--c-bg); display: flex; flex-direction: column; align-items: center; justify-content: center; z-index: 10; padding: 2rem; animation: tj-fade-in 0.3s ease; }
  @keyframes tj-fade-in { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }

  .tj-success-icon-wrap { width: 72px; height: 72px; border-radius: 50%; border: 2px solid rgba(61,220,132,0.35); background: rgba(61,220,132,0.06); display: flex; align-items: center; justify-content: center; margin-bottom: 1.25rem; position: relative; }
  .tj-success-icon-wrap::after { content: ''; position: absolute; inset: -8px; border-radius: 50%; border: 1px solid rgba(61,220,132,0.1); }
  .tj-success-check { font-size: 32px; color: #3ddc84; }

  .tj-success-title { font-size: 18px; font-weight: 700; color: var(--c-text); letter-spacing: -0.01em; margin-bottom: 4px; text-align: center; }
  .tj-success-sub { font-size: 11px; color: var(--c-hint); margin-bottom: 2rem; text-align: center; letter-spacing: 0.04em; }

  .tj-success-card { width: 100%; max-width: 420px; background: var(--c-bg2); border: 1px solid var(--c-border2); border-radius: var(--radius-lg); overflow: hidden; margin-bottom: 1.5rem; }
  .tj-success-card-header { padding: 14px 16px; border-bottom: 1px solid var(--c-border); display: flex; align-items: center; justify-content: space-between; }
  .tj-success-instrument { font-size: 16px; font-weight: 700; color: var(--c-text); letter-spacing: 0.02em; }
  .tj-success-dir { font-size: 9px; font-weight: 600; letter-spacing: 0.14em; text-transform: uppercase; padding: 3px 9px; border-radius: 3px; }
  .tj-success-dir.long { background: rgba(59,130,246,0.15); color: #60a5fa; border: 1px solid rgba(59,130,246,0.25); }
  .tj-success-dir.short { background: rgba(232,84,84,0.12); color: #f87171; border: 1px solid rgba(232,84,84,0.2); }

  .tj-success-pnl-row { padding: 18px 16px; display: flex; align-items: baseline; gap: 8px; border-bottom: 1px solid var(--c-border); }
  .tj-success-pnl { font-size: 28px; font-weight: 700; letter-spacing: -0.02em; }
  .tj-success-pnl.pos { color: #3ddc84; }
  .tj-success-pnl.neg { color: var(--c-danger); }
  .tj-success-pnl.be  { color: var(--c-warn); }
  .tj-success-pnl-label { font-size: 10px; color: var(--c-hint); letter-spacing: 0.06em; }

  .tj-success-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 0; }
  .tj-success-cell { padding: 11px 16px; border-bottom: 1px solid var(--c-border); }
  .tj-success-cell:nth-child(odd) { border-right: 1px solid var(--c-border); }
  .tj-success-cell-label { font-size: 8px; font-weight: 600; letter-spacing: 0.14em; text-transform: uppercase; color: var(--c-hint); margin-bottom: 3px; }
  .tj-success-cell-val { font-size: 12px; font-weight: 600; color: var(--c-text); }
  .tj-success-outcome { font-size: 11px; font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase; }
  .tj-success-outcome.win  { color: #3ddc84; }
  .tj-success-outcome.loss { color: var(--c-danger); }
  .tj-success-outcome.be   { color: var(--c-warn); }

  .tj-success-actions { display: flex; gap: 10px; width: 100%; max-width: 420px; }
  .tj-success-btn { flex: 1; padding: 11px 20px; border-radius: var(--radius); font-size: 11px; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; cursor: pointer; transition: all 0.15s; text-align: center; }
  .tj-success-btn.primary { background: var(--c-accent); border: 1px solid var(--c-accent); color: #000; }
  .tj-success-btn.primary:hover { background: var(--c-accent2); border-color: var(--c-accent2); }
  .tj-success-btn.ghost { background: transparent; border: 1px solid var(--c-border2); color: var(--c-muted); }
  .tj-success-btn.ghost:hover { border-color: var(--c-accent); color: var(--c-accent); }

  .tj-nav { display: flex; justify-content: space-between; align-items: center; padding: 1.25rem 1.5rem; border-top: 1px solid var(--c-border); margin-top: 1.5rem; background: var(--c-bg); flex-shrink: 0; }
  .tj-btn { padding: 9px 22px; border-radius: var(--radius); font-size: 11px; font-weight: 600; cursor: pointer; border: 1px solid var(--c-border2); background: var(--c-bg2); color: var(--c-muted); transition: all 0.12s; letter-spacing: 0.06em; text-transform: uppercase; }
  .tj-btn:hover { border-color: var(--c-accent); color: var(--c-accent); background: var(--c-bg3); }
  .tj-btn:disabled { opacity: 0.3; cursor: not-allowed; }
  .tj-btn.primary { background: var(--c-accent); border-color: var(--c-accent); color: #000; }
  .tj-btn.primary:hover { background: var(--c-accent2); border-color: var(--c-accent2); }
  .tj-btn.primary:disabled { opacity: 0.5; }
  .tj-btn-row { display: flex; gap: 8px; }

  .tj-other-wrap { display: flex; gap: 6px; }
  .tj-other-back { padding: 8px 11px; border-radius: var(--radius); font-size: 11px; cursor: pointer; border: 1px solid var(--c-border2); background: var(--c-bg3); color: var(--c-muted); transition: all 0.12s; }
  .tj-other-back:hover { border-color: var(--c-accent); color: var(--c-accent); }

  .tj-sidebar {
    width: 290px;
    flex-shrink: 0;
    background: var(--c-bg1);
    padding: 1rem 1rem 2rem;
    display: flex;
    flex-direction: column;
    position: sticky;
    top: 0;
    align-self: flex-start;
    max-height: 100vh;
    overflow-y: auto;
    scrollbar-width: thin;
    scrollbar-color: var(--c-bg3) transparent;
    font-size: 11px;
  }
  .tj-sidebar::-webkit-scrollbar { width: 3px; }
  .tj-sidebar::-webkit-scrollbar-thumb { background: var(--c-bg3); border-radius: 2px; }

  .sb-eyebrow { font-size: 8px; font-weight: 600; letter-spacing: 0.22em; text-transform: uppercase; color: var(--c-hint); margin-bottom: 8px; }
  .sb-growth-row { display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; }
  .sb-growth-label { font-size: 10px; color: var(--c-hint); }
  .sb-growth-val { font-size: 11px; font-weight: 600; color: var(--c-accent); letter-spacing: 0.04em; }
  .sb-growth-val.neg { color: var(--c-danger); }
  .sb-growth-val.zero { color: var(--c-muted); }

  .sb-card { background: var(--c-bg2); border: 1px solid var(--c-border); border-radius: var(--radius-lg); padding: 10px 12px; margin-bottom: 8px; }
  .sb-card-label { font-size: 7px; font-weight: 600; letter-spacing: 0.16em; text-transform: uppercase; color: var(--c-hint); margin-bottom: 4px; }
  .sb-pnl { font-size: 14px; font-weight: 600; line-height: 1; margin-bottom: 8px; color: var(--c-text); }
  .sb-pnl.pos { color: var(--c-accent); }
  .sb-pnl.neg { color: var(--c-danger); }

  .sb-bal-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 5px; margin-bottom: 7px; }
  .sb-bal { background: var(--c-bg3); border-radius: var(--radius); padding: 6px 8px; }
  .sb-bal-label { font-size: 7px; font-weight: 600; letter-spacing: 0.08em; text-transform: uppercase; color: var(--c-hint); margin-bottom: 2px; }
  .sb-bal-val { font-size: 10px; font-weight: 600; color: var(--c-text); }

  .sb-fee-row { display: flex; justify-content: space-between; padding-top: 7px; border-top: 1px solid var(--c-border); font-size: 10px; }
  .sb-fee-label { color: var(--c-hint); }
  .sb-fee-val { color: var(--c-danger); font-weight: 600; }

  .sb-sec { margin-top: 8px; }
  .sb-sec-title { font-size: 8px; font-weight: 600; letter-spacing: 0.18em; text-transform: uppercase; color: var(--c-hint); padding-bottom: 6px; border-bottom: 1px solid var(--c-border); margin-bottom: 2px; }
  .sb-row { display: flex; justify-content: space-between; align-items: center; padding: 4px 0; border-bottom: 1px solid var(--c-border); }
  .sb-row:last-child { border-bottom: none; }
  .sb-row-label { font-size: 10px; color: var(--c-muted); }
  .sb-row-val { font-size: 10px; font-weight: 600; color: var(--c-text); }
  .sb-row-val.pos { color: var(--c-accent); }
  .sb-row-val.neg { color: var(--c-danger); }
  .sb-row-val.dim { color: var(--c-hint); }

  .sb-divider { height: 1px; background: var(--c-border); margin: 10px 0; }

  .sb-wr { margin-top: 8px; }
  .sb-wr-header { display: flex; align-items: baseline; justify-content: space-between; margin-bottom: 4px; }
  .sb-wr-label { font-size: 8px; font-weight: 600; letter-spacing: 0.16em; text-transform: uppercase; color: var(--c-hint); }
  .sb-wr-sub { font-size: 9px; color: var(--c-hint); }
  .sb-wr-num { font-size: 14px; font-weight: 600; color: var(--c-accent); line-height: 1; }
  .sb-wr-num.zero { color: var(--c-hint); }
  .sb-bar-bg { height: 3px; background: var(--c-bg3); border-radius: 2px; overflow: hidden; margin: 5px 0 8px; }
  .sb-bar-fill { height: 3px; background: var(--c-accent); border-radius: 2px; transition: width 0.6s ease; }

  .sb-wl-row { display: flex; justify-content: space-between; margin-bottom: 8px; gap: 8px; }
  .sb-wl-item { display: flex; align-items: center; gap: 6px; }
  .sb-wl-lbl { font-size: 10px; color: var(--c-muted); }
  .sb-wl-num { font-size: 10px; font-weight: 600; }
  .sb-wl-num.w { color: var(--c-accent); }
  .sb-wl-num.l { color: var(--c-danger); }

  .sb-metrics { display: grid; grid-template-columns: 1fr 1fr; gap: 5px; margin-top: 8px; }
  .sb-met { background: var(--c-bg2); border: 1px solid var(--c-border); border-radius: var(--radius); padding: 7px 8px; }
  .sb-met-label { font-size: 7px; font-weight: 600; letter-spacing: 0.08em; text-transform: uppercase; color: var(--c-hint); margin-bottom: 2px; }
  .sb-met-val { font-size: 13px; font-weight: 600; color: var(--c-text); }
  .sb-met-val.pos { color: var(--c-accent); }

  .sb-empty { margin-top: 16px; text-align: center; padding: 20px 10px; background: var(--c-bg2); border: 1px dashed var(--c-border2); border-radius: var(--radius-lg); }
  .sb-empty-icon { font-size: 18px; color: var(--c-hint); margin-bottom: 6px; }
  .sb-empty-title { font-size: 11px; font-weight: 600; color: var(--c-muted); margin-bottom: 3px; }
  .sb-empty-sub { font-size: 10px; color: var(--c-hint); line-height: 1.5; }

  .tj-ocr-badge { display: inline-flex; align-items: center; gap: 4px; padding: 2px 7px; border-radius: 20px; background: rgba(61,220,132,0.12); border: 1px solid rgba(61,220,132,0.25); font-size: 9px; font-weight: 600; color: var(--c-accent); letter-spacing: 0.1em; margin-left: 6px; }

  .tj-analyzing { display: flex; align-items: center; gap: 8px; padding: 8px 12px; border-radius: var(--radius); border: 1px solid rgba(61,220,132,0.25); background: rgba(61,220,132,0.05); color: var(--c-accent); font-size: 11px; font-weight: 600; letter-spacing: 0.08em; margin-top: 8px; }

  @media (max-width: 900px) {
    .tj-page { flex-direction: column-reverse; }
    .tj-sidebar { width: 100%; position: static; max-height: none; border-bottom: 1px solid var(--c-border); }
    .tj-shell { border-right: none; }
  }
  @media (max-width: 720px) {
    .tj-g3, .tj-g4 { grid-template-columns: 1fr 1fr; }
  }
  @media (max-width: 540px) {
    .tj-body { padding: 1.25rem 1rem 0; }
    .tj-tabs { padding: 0 1rem; }
    .tj-nav { padding: 1rem; }
    .tj-g2, .tj-g3, .tj-g4 { grid-template-columns: 1fr; }
  }
`;

// ── Sidebar stats ─────────────────────────────────────────────────────────────
function computeStats(trades: any[], startingBalance?: number) {
  if (!trades.length) return null;
  const wins       = trades.filter(t => t.outcome === "Win");
  const losses     = trades.filter(t => t.outcome === "Loss");
  const breakevens = trades.filter(t => t.outcome === "BE");
  const pnls   = trades.map(t => parseFloat(t.profitLoss) || 0);
  const netPnL = pnls.reduce((a, b) => a + b, 0);
  const winAmts  = wins.map(t => parseFloat(t.profitLoss) || 0);
  const lossAmts = losses.map(t => parseFloat(t.profitLoss) || 0);
  const grossWin  = winAmts.reduce((a, b) => a + b, 0);
  const grossLoss = Math.abs(lossAmts.reduce((a, b) => a + b, 0));
  const profitFactor = grossLoss > 0 ? (grossWin / grossLoss).toFixed(2) : grossWin > 0 ? "∞" : "0";
  const decided  = wins.length + losses.length;
  const winRate  = decided > 0 ? (wins.length / decided) * 100 : 0;
  const commissions = trades.reduce((a, t) => a + (parseFloat(t.commission) || 0), 0);
  // Use session starting balance if provided; otherwise fall back to last trade accountBalance
  const lastAccountBal = parseFloat(trades[trades.length - 1]?.accountBalance) || 0;
  const startBal = startingBalance && startingBalance > 0 ? startingBalance : Math.max(lastAccountBal - netPnL, 0);
  const endBal   = startBal > 0 ? startBal + netPnL : lastAccountBal;
  const growth   = startBal > 0 ? (netPnL / startBal) * 100 : 0;
  const avgWin   = wins.length ? grossWin / wins.length : 0;
  const avgLoss  = losses.length ? grossLoss / losses.length : 0;
  const expectancy = decided > 0
    ? ((wins.length / decided) * avgWin - (losses.length / decided) * avgLoss).toFixed(2)
    : "0.00";
  const rrTrades = trades.filter(t => t.achievedRR);
  const avgRR    = rrTrades.length
    ? (rrTrades.reduce((a, t) => a + (parseFloat(t.achievedRR) || 0), 0) / rrTrades.length).toFixed(2)
    : "0";
  return {
    netPnL, winRate, wins: wins.length, losses: losses.length, breakevens: breakevens.length, total: trades.length,
    profitFactor, commissions, startBal, endBal, growth, avgRR, expectancy,
    buys:  trades.filter(t => t.direction === "Long").length,
    sells: trades.filter(t => t.direction === "Short").length,
  };
}

const fmtUsd = (n: number) => (n >= 0 ? "+" : "-") + "$" + Math.abs(n).toFixed(2);

function Sidebar({ trades, startingBalance }: { trades: any[]; startingBalance?: number }) {
  const stats  = useMemo(() => computeStats(trades, startingBalance), [trades, startingBalance]);
  const has    = trades.length > 0;
  const pnlCls = stats ? (stats.netPnL > 0 ? "pos" : stats.netPnL < 0 ? "neg" : "") : "";
  const grwCls = stats ? (stats.growth > 0 ? "" : stats.growth < 0 ? "neg" : "zero") : "zero";
  return (
    <div className="tj-sidebar">
      <div className="sb-eyebrow">Session</div>
      <div className="sb-growth-row">
        <span className="sb-growth-label">Portfolio growth</span>
        <span className={`sb-growth-val ${grwCls}`}>
          {stats ? (stats.growth >= 0 ? "+" : "") + stats.growth.toFixed(1) + "%" : "+0.0%"}
        </span>
      </div>
      <div className="sb-card">
        <div className="sb-card-label">Net P&amp;L</div>
        <div className={`sb-pnl ${pnlCls}`}>{stats ? fmtUsd(stats.netPnL) : "$0.00"}</div>
        <div className="sb-bal-grid">
          <div className="sb-bal"><div className="sb-bal-label">Start balance</div><div className="sb-bal-val">${stats ? stats.startBal.toFixed(2) : "0.00"}</div></div>
          <div className="sb-bal"><div className="sb-bal-label">End balance</div><div className="sb-bal-val">${stats ? stats.endBal.toFixed(2) : "0.00"}</div></div>
        </div>
        <div className="sb-fee-row">
          <span className="sb-fee-label">Commissions &amp; fees</span>
          <span className="sb-fee-val">{stats ? "-$" + stats.commissions.toFixed(2) : "$0.00"}</span>
        </div>
      </div>
      <div className="sb-sec">
        <div className="sb-sec-title">Trading stats</div>
        <div className="sb-row"><span className="sb-row-label">Buys</span><span className="sb-row-val">{has ? stats!.buys : 0}</span></div>
        <div className="sb-row"><span className="sb-row-label">Sells</span><span className="sb-row-val">{has ? stats!.sells : 0}</span></div>
        <div className="sb-row"><span className="sb-row-label">Total trades</span><span className="sb-row-val">{has ? stats!.total : 0}</span></div>
      </div>
      <div className="sb-divider" />
      <div className="sb-wr">
        <div className="sb-wr-header">
          <span className="sb-wr-label">Win rate</span>
          <span className="sb-wr-sub">{has ? `${stats!.wins} of ${stats!.wins + stats!.losses}${stats!.breakevens > 0 ? ` (${stats!.breakevens} BE)` : ""}` : "0 of 0"}</span>
        </div>
        <div className={`sb-wr-num ${!has ? "zero" : ""}`}>{has ? Math.round(stats!.winRate) + "%" : "0%"}</div>
        <div className="sb-bar-bg"><div className="sb-bar-fill" style={{ width: has ? stats!.winRate + "%" : "0%" }} /></div>
      </div>
      <div className="sb-wl-row">
        <div className="sb-wl-item"><span className="sb-wl-lbl">Wins</span><span className="sb-wl-num w">{String(has ? stats!.wins : 0).padStart(2, "0")}</span></div>
        <div className="sb-wl-item"><span className="sb-wl-lbl">Losses</span><span className="sb-wl-num l">{String(has ? stats!.losses : 0).padStart(2, "0")}</span></div>
        {has && stats!.breakevens > 0 && (
          <div className="sb-wl-item"><span className="sb-wl-lbl">Breakeven</span><span className="sb-wl-num" style={{ color: '#8A93B8' }}>{String(stats!.breakevens).padStart(2, "0")}</span></div>
        )}
      </div>
      <div className="sb-metrics">
        <div className="sb-met"><div className="sb-met-label">Profit factor</div><div className={`sb-met-val ${has && parseFloat(stats!.profitFactor as string) > 1 ? "pos" : ""}`}>{has ? stats!.profitFactor : "0"}</div></div>
        <div className="sb-met"><div className="sb-met-label">Expectancy</div><div className={`sb-met-val ${has && parseFloat(stats!.expectancy) > 0 ? "pos" : ""}`}>{has ? stats!.expectancy : "0"}</div></div>
        <div className="sb-met"><div className="sb-met-label">Avg R:R</div><div className={`sb-met-val ${has && parseFloat(stats!.avgRR) > 0 ? "pos" : ""}`}>{has ? stats!.avgRR : "0"}</div></div>
        <div className="sb-met"><div className="sb-met-label">W / L</div><div className="sb-met-val">{has ? stats!.wins + "/" + stats!.losses : "0/0"}</div></div>
      </div>
      {!has && (
        <div className="sb-empty">
          <div className="sb-empty-icon">◈</div>
          <div className="sb-empty-title">No trades yet</div>
          <div className="sb-empty-sub">Log a trade to see stats</div>
        </div>
      )}
    </div>
  );
}

// ── Form primitives ───────────────────────────────────────────────────────────
function Field({ label, sub, children, ocrFilled }: any) {
  return (
    <div className="tj-field">
      <div className="tj-label">
        {label}
        {ocrFilled && <span className="tj-ocr-badge">✦ OCR</span>}
      </div>
      {sub && <div className="tj-sub">{sub}</div>}
      {children}
    </div>
  );
}

function Inp({ label, sub, type = "text", placeholder, value, onChange, onBlur, ocrFilled }: any) {
  return (
    <Field label={label} sub={sub} ocrFilled={ocrFilled}>
      <input
        className="tj-input"
        type={type}
        placeholder={placeholder || ""}
        value={value ?? ""}
        onChange={e => onChange(e.target.value)}
        onBlur={onBlur}
      />
    </Field>
  );
}

function Sel({ label, sub, options, value, onChange, ocrFilled }: any) {
  const notInList = value != null && value !== "" && !options.includes(value);
  const [otherMode, setOtherMode] = useState(notInList);

  useEffect(() => {
    if (value != null && value !== "" && !options.includes(value)) {
      setOtherMode(true);
    } else if (options.includes(value)) {
      setOtherMode(false);
    }
  }, [value, options.join(",")]);

  const isOther = otherMode || notInList;
  const selectVal = isOther ? "Other" : (options.includes(value) ? value : "");

  const handleSelect = (e: any) => {
    const v = e.target.value;
    if (v === "Other") { setOtherMode(true); onChange(""); }
    else { setOtherMode(false); onChange(v); }
  };

  return (
    <Field label={label} sub={sub} ocrFilled={ocrFilled}>
      {isOther ? (
        <div className="tj-other-wrap">
          <input
            autoFocus
            type="text"
            className="tj-input"
            style={{ flex: 1 }}
            value={value || ""}
            placeholder="Type custom value…"
            onChange={e => {
              const v = e.target.value;
              if (!v) { setOtherMode(false); onChange(options[0] || ""); }
              else onChange(v);
            }}
          />
          <button type="button" className="tj-other-back" title="Back to list"
            onClick={() => { setOtherMode(false); onChange(options[0] || ""); }}>↩</button>
        </div>
      ) : (
        <select
          className="tj-select"
          value={selectVal}
          onChange={handleSelect}
        >
          <option value="">— select —</option>
          {options.map((o: string) => <option key={o} value={o}>{o}</option>)}
          <option value="Other">Other…</option>
        </select>
      )}
    </Field>
  );
}

function Txt({ label, value, onChange, placeholder, rows = 3 }: any) {
  return (
    <Field label={label}>
      <textarea className="tj-textarea" rows={rows} placeholder={placeholder || ""} value={value ?? ""} onChange={e => onChange(e.target.value)} />
    </Field>
  );
}

function Radio({ label, options, value, onChange }: any) {
  return (
    <Field label={label}>
      <div className="tj-radio-group">
        {options.map((o: string) => (
          <div key={o} className={`tj-radio${value === o ? " sel" : ""}`} onClick={() => onChange(o)}>{o}</div>
        ))}
      </div>
    </Field>
  );
}

function Check({ label, value, onChange }: any) {
  return (
    <label className="tj-check-wrap">
      <input type="checkbox" checked={!!value} onChange={e => onChange(e.target.checked)} />
      <span className="tj-check-label">{label}</span>
    </label>
  );
}

function Dots({ name, value = 0, onChange, max = 5 }: any) {
  return (
    <div className="tj-score-row">
      <div className="tj-score-name">{name}</div>
      <div className="tj-dots">
        {Array.from({ length: max }).map((_, i) => (
          <div key={i} className={`tj-dot${i < value ? " lit" : ""}`} onClick={() => onChange(i + 1)} />
        ))}
      </div>
    </div>
  );
}

function TjSlider({ label, min = 1, max = 5, step = 1, value, onChange, suffix = "" }: any) {
  return (
    <Field label={label}>
      <div className="tj-slider-row">
        <input className="tj-slider" type="range" min={min} max={max} step={step} value={value ?? min} onChange={e => onChange(Number(e.target.value))} />
        <div className="tj-slider-val">{value ?? min}{suffix}</div>
      </div>
    </Field>
  );
}

function UploadBox({ label, value, onChange, inputId, onPasteText, analyzing }: any) {
  const editRef = useRef<HTMLDivElement>(null);

  const handleFile = (e: any) => {
    const f = e.target.files[0];
    if (f) { const r = new FileReader(); r.onloadend = () => onChange(r.result as string); r.readAsDataURL(f); }
  };

  const applyPaste = useCallback((e: ClipboardEvent | React.ClipboardEvent<HTMLDivElement>) => {
    const items = Array.from((e as any).clipboardData?.items ?? []);
    const img = (items as DataTransferItem[]).find(i => i.type.startsWith("image/"));
    if (img) {
      e.preventDefault();
      e.stopImmediatePropagation();
      if (editRef.current) editRef.current.textContent = "";
      const f = img.getAsFile();
      if (f) { const r = new FileReader(); r.onloadend = () => onChange(r.result as string); r.readAsDataURL(f); }
      return true;
    }
    const text = (e as any).clipboardData?.getData("text/plain") ?? "";
    if (text.trim() && onPasteText) {
      onPasteText(text);
      // Release focus so the contentEditable overlay doesn't trap keyboard input
      if (editRef.current) editRef.current.blur();
      return true;
    }
    return false;
  }, [onChange, onPasteText]);

  // Global paste listener — fires even when this box isn't focused.
  // Uses stopImmediatePropagation so only the first empty UploadBox handles each paste.
  useEffect(() => {
    if (value) return;
    const handleDocPaste = (e: ClipboardEvent) => {
      // Don't intercept paste inside real text inputs / textareas
      const active = document.activeElement as HTMLElement | null;
      if (active && active !== document.body && active !== editRef.current) {
        const tag = active.tagName;
        if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
        if (active.isContentEditable) return;
      }
      applyPaste(e);
    };
    document.addEventListener("paste", handleDocPaste);
    return () => document.removeEventListener("paste", handleDocPaste);
  }, [value, applyPaste]);

  return (
    <Field label={label}>
      <div className="tj-upload" style={value ? { border: "1px solid rgba(61,220,132,0.3)", padding: 0, minHeight: 0 } : {}}>
        {!value && (
          <div
            ref={editRef}
            contentEditable
            suppressContentEditableWarning
            onPaste={applyPaste as any}
            onClick={() => document.getElementById(inputId)?.click()}
            onKeyDown={e => { if (!e.ctrlKey && !e.metaKey) e.preventDefault(); }}
            style={{ position: "absolute", inset: 0, zIndex: 10, opacity: 0, outline: "none", cursor: "pointer" }}
          />
        )}
        <input type="file" id={inputId} accept="image/*" onChange={handleFile} style={{ position: "absolute", inset: 0, opacity: 0, cursor: "pointer", width: "100%", height: "100%" }} />
        {value ? (
          <div style={{ padding: 8, width: "100%" }}>
            <img className="tj-upload-thumb" src={value} alt="chart" style={{ width: "100%" }} />
            <div className="tj-upload-actions">
              <label htmlFor={inputId} className="tj-upload-btn" style={{ cursor: "pointer" }}>↺ Replace</label>
              <button type="button" className="tj-upload-btn danger" onClick={() => onChange(null)}>✕ Remove</button>
            </div>
          </div>
        ) : (
          <>
            <div className="tj-upload-icon">↑</div>
            <div>Click or paste to upload screenshot</div>
            {analyzing && <div style={{ color: "var(--c-accent)", fontSize: 10, marginTop: 4 }}>Analyzing…</div>}
          </>
        )}
      </div>
    </Field>
  );
}

function Strip({ text, type = "default" }: any) {
  return <div className={`tj-strip${type === "warn" ? " warn" : type === "danger" ? " danger" : type === "info" ? " info" : ""}`}>{text}</div>;
}

// ── Step 1 — Decision ─────────────────────────────────────────────────────────
function Step1({ d, set }: any) {
  const f = (k: string) => (v: any) => set((prev: any) => ({ ...prev, [k]: v }));
  return (
    <>
      <div className="tj-section">
        <div className="tj-section-label">Core Thesis</div>
        <Strip text="Most traders fail due to impulsive entry. Use this module to force cognitive friction between the impulse and the execution." />
        <div className="tj-grid" style={{ gap: 12 }}>
          <Txt label="Trade Thesis" value={d.thesis} onChange={f("thesis")} placeholder="If you can't articulate your edge in 2–3 sentences, you don't have one…" rows={3} />
          <div className="tj-grid tj-g2">
            <Txt label="Entry Trigger" value={d.trigger} onChange={f("trigger")} placeholder="What specifically triggered entry?" rows={2} />
            <Txt label="Invalidation Logic" value={d.invalidationLogic} onChange={f("invalidationLogic")} placeholder="What would make this setup invalid?" rows={2} />
          </div>
          <Txt label="Expected Behavior" value={d.expectedBehavior} onChange={f("expectedBehavior")} placeholder="How do you expect price to move?" rows={2} />
        </div>
      </div>

      <div className="tj-section">
        <div className="tj-section-label">Pre-Entry State Check</div>
        <div className="tj-grid tj-g2">
          <div className="tj-grid" style={{ gap: 10 }}>
            <TjSlider label="Energy Level" min={1} max={5} value={d.energyLevel} onChange={f("energyLevel")} suffix="/5" />
            <TjSlider label="Focus Level" min={1} max={5} value={d.focusLevel} onChange={f("focusLevel")} suffix="/5" />
            <TjSlider label="Confidence at Entry" min={1} max={5} value={d.confidenceAtEntry} onChange={f("confidenceAtEntry")} suffix="/5" />
            <Radio label="External Distraction" options={["No", "Yes"]} value={d.externalDistraction} onChange={f("externalDistraction")} />
          </div>
          <div className="tj-grid" style={{ gap: 10 }}>
            <Inp label="Open Trades Count" type="number" placeholder="0" value={d.openTradesCount} onChange={f("openTradesCount")} />
            <Inp label="Total Risk Open (%)" type="number" placeholder="2.5" value={d.totalRiskOpen} onChange={f("totalRiskOpen")} />
            <Radio label="Correlated Exposure" options={["No", "Yes"]} value={d.correlatedExposure} onChange={f("correlatedExposure")} />
          </div>
        </div>
      </div>

      <div className="tj-section">
        <div className="tj-section-label">Classification &amp; Quality</div>
        <div className="tj-grid tj-g2">
          <div className="tj-grid" style={{ gap: 10 }}>
            <Inp label="Strategy" placeholder="e.g., Supply & Demand, Breakout…" value={d.strategyVersionId} onChange={f("strategyVersionId")} />
            <Sel label="Setup Tag" options={["Breakout","Reversal","Continuation","Range Bound","Trend Following","Momentum","Pullback"]} value={d.setupTag} onChange={f("setupTag")} />
          </div>
          <Sel label="Trade Grade" options={["A - Textbook","B - Solid","C - Acceptable","D - Marginal","F - Poor"]} value={d.tradeGrade} onChange={f("tradeGrade")} />
        </div>
      </div>

      <div className="tj-section">
        <div className="tj-section-label">Rule Governance</div>
        <div className="tj-grid tj-g2">
          <Radio label="Setup Fully Valid" options={["Yes", "No", "Partial"]} value={d.setupFullyValid} onChange={f("setupFullyValid")} />
          <Radio label="Any Rule Broken?" options={["No", "Yes"]} value={d.anyRuleBroken} onChange={f("anyRuleBroken")} />
          {d.anyRuleBroken === "Yes" && (
            <Inp label="Which Rule?" placeholder="e.g., Risk > 2%" value={d.ruleBroken} onChange={f("ruleBroken")} />
          )}
        </div>
      </div>

      <div className="tj-section">
        <div className="tj-section-label">Impulse Control Check</div>
        <Strip text="⚠ If ANY box below is checked — stop and reconsider before executing." type="warn" />
        <div className="tj-grid tj-g2">
          <Check label="Entering due to FOMO" value={d.impulseCheckFOMO} onChange={f("impulseCheckFOMO")} />
          <Check label="Revenge trading after a loss" value={d.impulseCheckRevenge} onChange={f("impulseCheckRevenge")} />
          <Check label="Trading out of boredom" value={d.impulseCheckBored} onChange={f("impulseCheckBored")} />
          <Check label="Emotionally compromised" value={d.impulseCheckEmotional} onChange={f("impulseCheckEmotional")} />
        </div>
      </div>
    </>
  );
}

// ── Step 2 — Execution ────────────────────────────────────────────────────────
function Step2({ d, set, onScreenshotUpload, analyzing, ocrFields, currentBalance }: any) {
  const f = (k: string) => (v: any) => set((prev: any) => ({ ...prev, [k]: v }));

  // Live monetary risk preview derived from current balance + user-entered risk %
  const riskPct = parseFloat(d.riskPercent);
  const monetaryRiskPreview = currentBalance > 0 && riskPct > 0
    ? ((currentBalance * riskPct) / 100).toFixed(2)
    : null;
  return (
    <>
      <div className="tj-section">
        <div className="tj-section-label">Trade Screenshots</div>
        <div className="tj-grid tj-g2">
          <UploadBox
            label="Entry / Setup Screenshot"
            inputId="tj-up-entry"
            value={d.screenshot}
            onChange={(v: any) => onScreenshotUpload("screenshot", v)}
            onPasteText={(t: string) => onScreenshotUpload("screenshot-text", t)}
            analyzing={analyzing}
          />
          <UploadBox
            label="Exit Chart Screenshot"
            inputId="tj-up-exit"
            value={d.exitScreenshot}
            onChange={(v: any) => onScreenshotUpload("exitScreenshot", v)}
            onPasteText={(t: string) => onScreenshotUpload("exitScreenshot-text", t)}
            analyzing={false}
          />
        </div>
        {d.ocrConfidence && !analyzing && (
          <div className="tj-strip info" style={{ marginTop: 8, marginBottom: 0 }}>
            ✦ OCR complete · {ocrFields?.size ?? 0} fields extracted{d.ocrConfidence !== "text input" ? ` · confidence: ${d.ocrConfidence}` : ""}
          </div>
        )}
      </div>

      <div className="tj-section">
        <div className="tj-section-label">Position Details</div>
        <div className="tj-grid tj-g4">
          <Inp label="Instrument" placeholder="EURUSD" value={d.instrument} onChange={f("instrument")} ocrFilled={ocrFields?.has("instrument")} />
          <Sel label="Pair Category" options={["Major","Minor","Exotic","Index","Crypto","Commodity"]} value={d.pairCategory} onChange={f("pairCategory")} />
          <Radio label="Direction" options={["Long","Short"]} value={d.direction} onChange={f("direction")} />
          <Inp label="Lot Size" type="number" placeholder="0.01" value={d.lotSize} onChange={f("lotSize")} ocrFilled={ocrFields?.has("lotSize")} />
          <Inp label="Entry Price" type="number" placeholder="0.00" value={d.entryPrice} onChange={f("entryPrice")} ocrFilled={ocrFields?.has("entryPrice")} />
          <Inp label="Stop Loss" type="number" placeholder="0.00" value={d.stopLoss} onChange={f("stopLoss")} ocrFilled={ocrFields?.has("stopLoss")} />
          <Inp label="SL Distance (Pips)" type="number" placeholder="0" value={d.stopLossDistancePips} onChange={f("stopLossDistancePips")} ocrFilled={ocrFields?.has("stopLossDistancePips")} />
          <Inp label="Take Profit" type="number" placeholder="0.00" value={d.takeProfit} onChange={f("takeProfit")} ocrFilled={ocrFields?.has("takeProfit")} />
          <Inp label="TP Distance (Pips)" type="number" placeholder="0" value={d.takeProfitDistancePips} onChange={f("takeProfitDistancePips")} ocrFilled={ocrFields?.has("takeProfitDistancePips")} />
          <Inp label="Risk %" type="number" placeholder="1.0" value={d.riskPercent} onChange={f("riskPercent")} onBlur={() => { if (!d.riskPercent || d.riskPercent.trim() === "") f("riskPercent")("1"); }} />
          <Sel label="Order Type" options={["Market","Limit","Stop","Stop-Limit"]} value={d.orderType} onChange={f("orderType")} />
          <Radio label="Outcome" options={["Win","Loss","BE"]} value={d.outcome} onChange={f("outcome")} />
        </div>
        {currentBalance > 0 && (
          <div style={{ marginTop: 10, padding: "8px 12px", background: "rgba(61,220,132,0.06)", borderRadius: 6, border: "1px solid rgba(61,220,132,0.15)", fontSize: 11, color: "var(--c-muted)", display: "flex", gap: 16, flexWrap: "wrap" }}>
            <span>Session balance: <strong style={{ color: "var(--c-accent)" }}>${currentBalance.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong></span>
            {monetaryRiskPreview && (
              <span>Risk amount: <strong style={{ color: "#f59e0b" }}>${monetaryRiskPreview}</strong> · P&amp;L and balance auto-update on Step 4</span>
            )}
            {!d.riskPercent && (
              <span style={{ fontStyle: "italic" }}>Enter Risk % above to auto-calculate monetary risk, P&amp;L and account balance</span>
            )}
          </div>
        )}
      </div>

      <div className="tj-section">
        <div className="tj-section-label">Timing &amp; Duration</div>
        <div className="tj-grid tj-g4">
          <Inp label="Entry Time" type="datetime-local" value={d.entryTime} onChange={f("entryTime")} ocrFilled={ocrFields?.has("entryTime")} />
          <Inp label="Exit Time" type="datetime-local" value={d.exitTime} onChange={f("exitTime")} ocrFilled={ocrFields?.has("exitTime")} />
          <Sel label="Day of Week" options={["Monday","Tuesday","Wednesday","Thursday","Friday","Saturday","Sunday"]} value={d.dayOfWeek} onChange={f("dayOfWeek")} />
          <Inp label="Trade Duration" placeholder="2h 30m" value={d.tradeDuration} onChange={f("tradeDuration")} />
        </div>
      </div>

      <div className="tj-section">
        <div className="tj-section-label">Timeframe Analysis</div>
        <div className="tj-grid tj-g3">
          <Sel label="Entry TF" options={["1M","3M","5M","15M","30MIN"]} value={d.entryTF} onChange={f("entryTF")} />
          <Sel label="Analysis TF" options={["15M","30MIN","1HR","2HR","4HR"]} value={d.analysisTF} onChange={f("analysisTF")} />
          <Sel label="Context TF" options={["1W","1D","4HR"]} value={d.contextTF} onChange={f("contextTF")} />
        </div>
      </div>

      <div className="tj-section">
        <div className="tj-section-label">Entry &amp; Trade Management</div>
        <div className="tj-grid tj-g3">
          <Sel label="Entry Method" options={["Market","Limit","Stop"]} value={d.entryMethod} onChange={f("entryMethod")} />
          <Inp label="Exit Strategy" placeholder="Describe exit approach" value={d.exitStrategy} onChange={f("exitStrategy")} />
          <Sel label="Management Type" options={["Rule-based","Discretionary","Hybrid"]} value={d.managementType} onChange={f("managementType")} />
          <Sel label="Risk Heat" options={["Low","Medium","High"]} value={d.riskHeat} onChange={f("riskHeat")} />
          <Inp label="Spread at Entry (Pips)" type="number" placeholder="1.2" value={d.spreadAtEntry} onChange={f("spreadAtEntry")} />
          <Inp label="Strategy Version" placeholder="v2.3" value={d.strategyVersionId2} onChange={f("strategyVersionId2")} />
        </div>
        <div className="tj-grid tj-g2" style={{ marginTop: 10 }}>
          <Check label="Break-Even Applied" value={d.breakEvenApplied} onChange={f("breakEvenApplied")} />
          <Check label="Trailing Stop Applied" value={d.trailingStopApplied} onChange={f("trailingStopApplied")} />
        </div>
      </div>
    </>
  );
}

// ── Step 3 — Context ──────────────────────────────────────────────────────────
function Step3({ d, set }: any) {
  const f = (k: string) => (v: any) => set((prev: any) => ({ ...prev, [k]: v }));
  const SCORES: [string, string][] = [
    ["marketAlignment","Market Alignment"],
    ["setupClarity","Setup Clarity"],
    ["entryPrecision","Entry Precision"],
    ["confluence","Confluence"],
    ["timingQuality","Timing Quality"],
    ["signalValidation","Signal Validation"],
  ];
  return (
    <>
      <div className="tj-section">
        <div className="tj-section-label">Market Environment</div>
        <div className="tj-grid tj-g4">
          <Sel label="Market Regime" options={["Bullish","Bearish","Ranging"]} value={d.marketRegime} onChange={f("marketRegime")} />
          <Sel label="Trend Direction" options={["Bullish","Bearish","Sideways"]} value={d.trendDirection} onChange={f("trendDirection")} />
          <Sel label="Volatility" options={["Low","Normal","High"]} value={d.volatilityState} onChange={f("volatilityState")} />
          <Sel label="Liquidity" options={["Low","Normal","High"]} value={d.liquidity} onChange={f("liquidity")} />
          <Sel label="News Environment" options={["Clear","Minor","Major"]} value={d.newsEnvironment} onChange={f("newsEnvironment")} />
          <Sel label="Session" options={["London","New York","Tokyo","Sydney","Overlap"]} value={d.sessionName} onChange={f("sessionName")} />
          <Sel label="Session Phase" options={["Open","Mid","Close"]} value={d.sessionPhase} onChange={f("sessionPhase")} />
          <Inp label="ATR at Entry" type="number" placeholder="0.0045" value={d.atrAtEntry} onChange={f("atrAtEntry")} />
        </div>
      </div>

      <div className="tj-section">
        <div className="tj-section-label">Higher Timeframe Context</div>
        <div className="tj-grid tj-g2" style={{ marginBottom: 12 }}>
          <Radio label="HTF Bias" options={["Bull","Bear","Range"]} value={d.htfBias} onChange={f("htfBias")} />
          <Radio label="HTF Key Level Present" options={["Yes","No"]} value={d.htfKeyLevelPresent} onChange={f("htfKeyLevelPresent")} />
          <Radio label="Trend Alignment" options={["Yes","No"]} value={d.trendAlignment} onChange={f("trendAlignment")} />
          <Radio label="MTF Alignment" options={["Yes","No"]} value={d.multitimeframeAlignment} onChange={f("multitimeframeAlignment")} />
        </div>
        <div className="tj-grid" style={{ gap: 10 }}>
          <Txt label="Higher TF Context" value={d.higherTFContext} onChange={f("higherTFContext")} placeholder="Weekly / Daily bias and key levels…" rows={2} />
          <Txt label="Analysis TF Context" value={d.analysisTFContext} onChange={f("analysisTFContext")} placeholder="4H / 1H structure overview…" rows={2} />
          <Txt label="Entry TF Context" value={d.entryTFContext} onChange={f("entryTFContext")} placeholder="15M / 5M entry setup details…" rows={2} />
          <Txt label="Other Confluences" value={d.otherConfluences} onChange={f("otherConfluences")} placeholder="Additional confluences…" rows={2} />
        </div>
      </div>

      <div className="tj-section">
        <div className="tj-section-label">Technical Signals</div>
        <div className="tj-grid tj-g2">
          <Inp label="Timing Context" placeholder="Impulse, Correction, Ranging…" value={d.timingContext} onChange={f("timingContext")} />
          <Inp label="Candle Pattern" placeholder="e.g., Engulfing, Pin Bar" value={d.candlePattern} onChange={f("candlePattern")} />
          <Txt label="Primary Signals" value={d.primarySignals} onChange={f("primarySignals")} placeholder="Main confirmation signals" rows={2} />
          <Txt label="Secondary Signals" value={d.secondarySignals} onChange={f("secondarySignals")} placeholder="Supporting confluences" rows={2} />
        </div>
        <div style={{ marginTop: 10 }}>
          <Inp label="Indicator State" placeholder="e.g., RSI 62, MACD bullish cross, above 50 EMA…" value={d.indicatorState} onChange={f("indicatorState")} />
        </div>
        <div style={{ marginTop: 10 }}>
          <Txt label="Liquidity Targets" value={d.liquidityTargets} onChange={f("liquidityTargets")} placeholder="Major liquidity pools, stop hunts…" rows={2} />
        </div>
      </div>

      <div className="tj-section">
        <div className="tj-section-label">Key Level Analysis</div>
        <div className="tj-grid tj-g2">
          <Radio label="Key Level Respect" options={["Yes","No","Partial"]} value={d.keyLevelRespect} onChange={f("keyLevelRespect")} />
          <Sel label="Key Level Type" options={["Support","Resistance","Pivot","Fib Level"]} value={d.keyLevelType} onChange={f("keyLevelType")} />
          <Radio label="Momentum Validity" options={["Strong","Moderate","Weak"]} value={d.momentumValidity} onChange={f("momentumValidity")} />
          <Radio label="Target Logic Clarity" options={["High","Medium","Low"]} value={d.targetLogicClarity} onChange={f("targetLogicClarity")} />
        </div>
      </div>

      <div className="tj-section">
        <div className="tj-section-label">Setup Quality Scores (1–5)</div>
        <div className="tj-score-grid">
          {SCORES.map(([k, name]) => (
            <Dots key={k} name={name} value={d[k]} onChange={(v: number) => f(k)(v)} />
          ))}
        </div>
      </div>
    </>
  );
}

// ── Step 4 — Review ───────────────────────────────────────────────────────────
function Step4({ d, set }: any) {
  const f = (k: string) => (v: any) => set((prev: any) => ({ ...prev, [k]: v }));
  return (
    <>
      <div className="tj-section">
        <div className="tj-section-label">Exit Causation</div>
        <Sel label="Primary Exit Reason" options={["Target Hit","Stop Hit","Time Exit","Structure Change","News","Emotional Exit"]} value={d.primaryExitReason} onChange={f("primaryExitReason")} />
      </div>

      <div className="tj-section">
        <div className="tj-section-label">Performance Data</div>
        <div className="tj-grid tj-g4">
          <Inp label="Pips / Points" type="number" placeholder="0" value={d.pipsGainedLost} onChange={f("pipsGainedLost")} />
          <Inp label="P&L Amount ($)" type="number" placeholder="0.00" value={d.profitLoss} onChange={f("profitLoss")} />
          <Inp label="Account Balance" type="number" placeholder="0.00" value={d.accountBalance} onChange={f("accountBalance")} />
          <Inp label="Commission / Fees" type="number" placeholder="3.50" value={d.commission} onChange={f("commission")} />
        </div>
      </div>

      <div className="tj-section">
        <div className="tj-section-label">Planning vs Execution</div>
        <div className="tj-grid tj-g3">
          <Inp label="Planned Entry" type="number" placeholder="0.00" value={d.plannedEntry} onChange={f("plannedEntry")} />
          <Inp label="Planned SL" type="number" placeholder="0.00" value={d.plannedSL} onChange={f("plannedSL")} />
          <Inp label="Planned TP" type="number" placeholder="0.00" value={d.plannedTP} onChange={f("plannedTP")} />
          <Inp label="Actual Entry" type="number" placeholder="0.00" value={d.actualEntry} onChange={f("actualEntry")} />
          <Inp label="Actual SL" type="number" placeholder="0.00" value={d.actualSL} onChange={f("actualSL")} />
          <Inp label="Actual TP" type="number" placeholder="0.00" value={d.actualTP} onChange={f("actualTP")} />
        </div>
      </div>

      <div className="tj-section">
        <div className="tj-section-label">Trade Metrics</div>
        <div className="tj-grid tj-g3">
          <Inp label="MAE (Max Adverse Excursion)" placeholder="-15 pts" value={d.mae} onChange={f("mae")} />
          <Inp label="MFE (Max Favorable Excursion)" placeholder="+45 pts" value={d.mfe} onChange={f("mfe")} />
          <Inp label="Monetary Risk ($)" type="number" placeholder="0.00" value={d.monetaryRisk} onChange={f("monetaryRisk")} />
          <Inp label="Potential Reward ($)" type="number" placeholder="0.00" value={d.potentialReward} onChange={f("potentialReward")} />
          <Inp label="Planned R:R" placeholder="1:2" value={d.plannedRR} onChange={f("plannedRR")} />
          <Inp label="Achieved R:R" placeholder="1:1.5" value={d.achievedRR} onChange={f("achievedRR")} />
        </div>
      </div>

      <div className="tj-section">
        <div className="tj-section-label">Psychological State</div>
        <div className="tj-grid tj-g3">
          <Sel label="Emotional State" options={["Calm","Anxious","FOMO","Confident","Fearful","Neutral"]} value={d.emotionalState} onChange={f("emotionalState")} />
          <Sel label="Focus / Stress" options={["Low","Medium","High"]} value={d.focusStressLevel} onChange={f("focusStressLevel")} />
          <Inp label="Rules Followed %" type="number" placeholder="100" value={d.rulesFollowed} onChange={f("rulesFollowed")} />
          <TjSlider label="Confidence Level" min={1} max={5} value={d.confidenceLevel} onChange={f("confidenceLevel")} suffix="/5" />
          <Sel label="Post-Trade Emotion" options={["Neutral","Relieved","Euphoric","Frustrated","Regretful","Calm","Anxious"]} value={d.postTradeEmotion} onChange={f("postTradeEmotion")} />
          <Inp label="Consecutive Trade Count" type="number" placeholder="3" value={d.consecutiveTradeCount} onChange={f("consecutiveTradeCount")} />
        </div>
        <div className="tj-grid tj-g2" style={{ marginTop: 10 }}>
          <Check label="Worth repeating this setup" value={d.worthRepeating} onChange={f("worthRepeating")} />
          <Check label="Recency bias (influenced by last trade)" value={d.recencyBiasFlag} onChange={f("recencyBiasFlag")} />
        </div>
      </div>

      <div className="tj-section">
        <div className="tj-section-label">Trade Debrief</div>
        <div className="tj-grid" style={{ gap: 12 }}>
          <Txt label="What Worked" value={d.whatWorked} onChange={f("whatWorked")} placeholder="Describe what went well in this trade…" />
          <Txt label="What Failed" value={d.whatFailed} onChange={f("whatFailed")} placeholder="Describe what went wrong or could be improved…" />
          <Txt label="Future Adjustments" value={d.adjustments} onChange={f("adjustments")} placeholder="What would you do differently next time?" />
          <Txt label="Additional Notes" rows={4} value={d.notes} onChange={f("notes")} placeholder="Any additional observations, ideas, market context, or lessons learned…" />
        </div>
      </div>
    </>
  );
}

// ── Initial state ─────────────────────────────────────────────────────────────
const INIT_STEP1 = {
  thesis: "", trigger: "", invalidationLogic: "", expectedBehavior: "",
  energyLevel: 3, focusLevel: 3, confidenceAtEntry: 3,
  externalDistraction: "No", openTradesCount: "", totalRiskOpen: "", correlatedExposure: "No",
  strategyVersionId: "", setupTag: "Breakout", tradeGrade: "A - Textbook",
  setupFullyValid: "Yes", anyRuleBroken: "No", ruleBroken: "",
  impulseCheckFOMO: false, impulseCheckRevenge: false, impulseCheckBored: false, impulseCheckEmotional: false,
};
const INIT_STEP2 = {
  screenshot: null, exitScreenshot: null,
  instrument: "", pairCategory: "Major", direction: "Long", lotSize: "",
  entryPrice: "", stopLoss: "", stopLossDistancePips: "", takeProfit: "", takeProfitDistancePips: "",
  riskPercent: "", orderType: "Market", outcome: "Win",
  entryTime: "", exitTime: "", dayOfWeek: "Monday", tradeDuration: "",
  entryTF: "5M", analysisTF: "1HR", contextTF: "1D",
  entryMethod: "Market", exitStrategy: "", managementType: "Rule-based",
  riskHeat: "Low", spreadAtEntry: "", strategyVersionId2: "", breakEvenApplied: false, trailingStopApplied: false,
  ocrConfidence: "", ocrValidation: "",
};
const INIT_STEP3 = {
  marketRegime: "Bullish", trendDirection: "Bullish", volatilityState: "Normal",
  liquidity: "Normal", newsEnvironment: "Clear", sessionName: "London",
  sessionPhase: "Open", atrAtEntry: "",
  htfBias: "Bull", htfKeyLevelPresent: "Yes", trendAlignment: "Yes", multitimeframeAlignment: "Yes",
  higherTFContext: "", analysisTFContext: "", entryTFContext: "", otherConfluences: "",
  timingContext: "", candlePattern: "", primarySignals: "", secondarySignals: "",
  indicatorState: "", liquidityTargets: "",
  keyLevelRespect: "Yes", keyLevelType: "Support", momentumValidity: "Strong", targetLogicClarity: "High",
  marketAlignment: 3, setupClarity: 3, entryPrecision: 3, confluence: 3, timingQuality: 3, signalValidation: 3,
};
const INIT_STEP4 = {
  primaryExitReason: "Target Hit",
  pipsGainedLost: "", profitLoss: "", accountBalance: "", commission: "",
  plannedEntry: "", plannedSL: "", plannedTP: "",
  actualEntry: "", actualSL: "", actualTP: "",
  mae: "", mfe: "", monetaryRisk: "", potentialReward: "", plannedRR: "", achievedRR: "",
  emotionalState: "Calm", focusStressLevel: "Low", rulesFollowed: 100,
  confidenceLevel: 3, postTradeEmotion: "Neutral", consecutiveTradeCount: "",
  worthRepeating: true, recencyBiasFlag: false,
  whatWorked: "", whatFailed: "", adjustments: "", notes: "",
};

const STEPS_DEF = [
  { n: 1, label: "Decision",  key: "step1", Component: Step1 },
  { n: 2, label: "Execution", key: "step2", Component: Step2 },
  { n: 3, label: "Context",   key: "step3", Component: Step3 },
  { n: 4, label: "Review",    key: "step4", Component: Step4 },
];

// ── Main component ────────────────────────────────────────────────────────────
export default function JournalForm({ sessionId, startingBalance }: { sessionId?: string | number | null; startingBalance?: number }) {
  const [step, setStep] = useState(1);
  const [s1, setS1] = useState({ ...INIT_STEP1 });
  const [s2, setS2] = useState({ ...INIT_STEP2 });
  const [s3, setS3] = useState({ ...INIT_STEP3 });
  const [s4, setS4] = useState({ ...INIT_STEP4 });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [savedTrade, setSavedTrade] = useState<{
    instrument: string; direction: string; outcome: string;
    profitLoss: string; pips: string; grade: string; session: string; tf: string; category: string;
  } | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [ocrFields, setOcrFields] = useState<Set<string>>(new Set());

  const { data: tradesData } = useQuery<any[]>({
    queryKey: ["/api/journal/entries"],
    select: (d: any) => (Array.isArray(d) ? d : d?.entries ?? []),
  });
  const trades = tradesData ?? [];

  // Live running balance for this session (starting balance + previous trade P&Ls)
  const { currentBalance } = useSessionBalance(sessionId != null ? String(sessionId) : null);

  // Parse "1:8.07", "8.07", "1:2" → 8.07
  const parseRR = (v: string): number => {
    if (!v) return 0;
    const parts = v.split(":");
    const n = parseFloat(parts[parts.length - 1]);
    return isNaN(n) ? 0 : n;
  };

  // ── Auto-calculate monetary fields whenever risk% or key values change ──────
  useEffect(() => {
    const riskPct = parseFloat(s2.riskPercent);
    if (!riskPct || riskPct <= 0 || !currentBalance || currentBalance <= 0) return;

    const monetaryRisk  = calcDollarRisk(currentBalance, riskPct);
    const achievedRRNum = parseRR(s4.achievedRR);
    const plannedRRNum  = parseRR(s4.plannedRR);
    const outcome       = s2.outcome as "Win" | "Loss" | "BE";

    const s4Updates: Record<string, string> = {
      monetaryRisk: monetaryRisk.toFixed(2),
    };

    // Potential reward always from planned RR × monetary risk
    if (plannedRRNum > 0) {
      s4Updates.potentialReward = (monetaryRisk * plannedRRNum).toFixed(2);
    }

    // Actual P&L:  Win → achievedRR × risk,  Loss → −risk,  BE → 0
    let profitLoss: number | null = null;
    if (outcome === "Loss") {
      profitLoss = -monetaryRisk;
    } else if (outcome === "BE") {
      profitLoss = 0;
    } else if (outcome === "Win" && achievedRRNum > 0) {
      profitLoss = monetaryRisk * achievedRRNum;
    }

    if (profitLoss !== null) {
      s4Updates.profitLoss    = profitLoss.toFixed(2);
      s4Updates.accountBalance = (currentBalance + profitLoss).toFixed(2);
    }

    // Pips for a Loss = negative SL distance (stop was hit)
    if (outcome === "Loss" && s2.stopLossDistancePips) {
      const slPips = parseFloat(s2.stopLossDistancePips);
      if (!isNaN(slPips) && slPips > 0) {
        s4Updates.pipsGainedLost = String(-Math.abs(slPips));
      }
    }

    setS4(prev => ({ ...prev, ...s4Updates }));
  }, [s2.riskPercent, s2.outcome, s4.achievedRR, s4.plannedRR, s2.stopLossDistancePips, currentBalance]);

  // Format a numeric RR value as "1:X" string
  const fmtRR = (v: any): string | null => {
    if (v == null) return null;
    const n = typeof v === "number" ? v : parseFloat(String(v));
    if (isNaN(n)) return String(v);
    return `1:${n}`;
  };

  // Distribute parsed fields across s2, s3 and s4 with proper key mapping
  // and derive calculated fields (pips, planned/actual prices, MAE/MFE, RR).
  const applyAnalyzedFields = useCallback((fields: Record<string, any>, confidence: string) => {
    const s2Up: Record<string, any> = {};
    const s3Up: Record<string, any> = {};
    const s4Up: Record<string, any> = {};
    const filled = new Set<string>();

    const set2 = (k: string, v: any) => { if (v != null && v !== "") { s2Up[k] = v; filled.add(k); } };
    const set3 = (k: string, v: any) => { if (v != null && v !== "") { s3Up[k] = v; filled.add(k); } };
    const set4 = (k: string, v: any) => { if (v != null && v !== "") { s4Up[k] = v; filled.add(k); } };

    // ── Step 2: Execution details ──────────────────────────────────────────
    set2("instrument",            fields.instrument);
    set2("direction",             fields.direction);
    set2("lotSize",               fields.lotSize != null ? String(fields.lotSize) : null);
    set2("entryPrice",            fields.entryPrice != null ? String(fields.entryPrice) : null);
    set2("stopLoss",              fields.stopLoss != null ? String(fields.stopLoss) : null);
    set2("takeProfit",            fields.takeProfit != null ? String(fields.takeProfit) : null);
    set2("stopLossDistancePips",  fields.stopLossPips != null ? String(fields.stopLossPips) : null);
    set2("takeProfitDistancePips",fields.takeProfitPips != null ? String(fields.takeProfitPips) : null);
    set2("outcome",               fields.outcome);
    set2("entryTime",             fields.entryTime);
    set2("exitTime",              fields.exitTime);
    set2("dayOfWeek",             fields.dayOfWeek);
    set2("tradeDuration",         fields.tradeDuration != null ? String(fields.tradeDuration) : null);

    // ── Step 3: Session / context ──────────────────────────────────────────
    if (fields.sessionName) {
      // Map free-text session names to the closest dropdown value
      const sn = String(fields.sessionName).toLowerCase();
      if (/london/.test(sn) && /new.?york|us/.test(sn))   set3("sessionName", "Overlap");
      else if (/london/.test(sn))                          set3("sessionName", "London");
      else if (/new.?york|us|ny/.test(sn))                 set3("sessionName", "New York");
      else if (/tokyo|asian|asia/.test(sn))                 set3("sessionName", "Tokyo");
      else if (/sydney|aus/.test(sn))                       set3("sessionName", "Sydney");
      else if (/overlap/.test(sn))                          set3("sessionName", "Overlap");
    }
    if (fields.sessionPhase) {
      const sp = String(fields.sessionPhase).toLowerCase();
      if (/open|early|start/.test(sp))    set3("sessionPhase", "Open");
      else if (/mid|middle/.test(sp))     set3("sessionPhase", "Mid");
      else if (/close|late|end/.test(sp)) set3("sessionPhase", "Close");
    }

    // ── Step 4: Performance data ───────────────────────────────────────────
    // Planning vs Execution prices
    set4("plannedEntry", fields.entryPrice != null ? String(fields.entryPrice) : null);
    set4("plannedSL",    fields.stopLoss   != null ? String(fields.stopLoss)   : null);
    set4("plannedTP",    fields.takeProfit != null ? String(fields.takeProfit) : null);
    set4("actualEntry",  fields.entryPrice != null ? String(fields.entryPrice) : null);
    set4("actualSL",     fields.stopLoss   != null ? String(fields.stopLoss)   : null);
    set4("actualTP",     fields.closingPrice != null ? String(fields.closingPrice) : (fields.takeProfit != null ? String(fields.takeProfit) : null));

    // MAE / MFE
    if (fields.drawdownPoints != null) set4("mae", `${fields.drawdownPoints} pts`);
    if (fields.runUpPoints    != null) set4("mfe", `${fields.runUpPoints} pts`);

    // RR — formatted as "1:X"
    if (fields.plannedRR  != null) set4("plannedRR",  fmtRR(fields.plannedRR));
    if (fields.achievedRR != null) set4("achievedRR", fmtRR(fields.achievedRR));

    // Pips / Points: outcome-driven
    // - Loss  → negative SL distance
    // - Win / Open → open P/L if available, else closed P/L, else actual TP pips
    const isLoss    = fields.outcome === "Loss";
    const slPips    = fields.stopLossPips ?? fields.plannedSLPips;
    const openPL    = fields.openPLPoints;
    const closedPL  = fields.closedPLPips;
    const actualTP  = fields.actualTPPips;

    let pips: string | null = null;
    if (isLoss && slPips != null) {
      pips = String(-Math.abs(slPips));
    } else if (openPL != null && openPL !== 0) {
      pips = String(openPL);
    } else if (closedPL != null && closedPL !== 0) {
      pips = String(closedPL);
    } else if (actualTP != null) {
      pips = String(actualTP);
    }
    if (pips != null) set4("pipsGainedLost", pips);

    setS2(prev => ({ ...prev, ...s2Up, ocrConfidence: confidence, ocrValidation: "" }));
    setS3(prev => ({ ...prev, ...s3Up }));
    setS4(prev => ({ ...prev, ...s4Up }));
    setOcrFields(prev => new Set([...Array.from(prev), ...Array.from(filled)]));
  }, []);

  const handleScreenshotUpload = useCallback(async (field: string, value: any) => {
    if (field === "screenshot" || field === "exitScreenshot") {
      setS2(prev => ({ ...prev, [field]: value }));
      if (value && typeof value === "string" && value.startsWith("data:image")) {
        setAnalyzing(true);
        try {
          const raw = await apiRequest("POST", "/api/journal/analyze-screenshot", { image: value, field });
          const res = await raw.json();
          if (res?.fields) {
            applyAnalyzedFields(res.fields, res.confidence ?? "high");
          }
        } catch {
          // OCR failed silently — user can fill manually
        } finally {
          setAnalyzing(false);
        }
      }
    } else if (field === "screenshot-text" || field === "exitScreenshot-text") {
      setAnalyzing(true);
      try {
        const raw = await apiRequest("POST", "/api/journal/analyze-text", { text: value });
        const res = await raw.json();
        if (res?.fields) {
          applyAnalyzedFields(res.fields, "text input");
        }
      } catch {
        // silent
      } finally {
        setAnalyzing(false);
      }
    }
  }, [applyAnalyzedFields]);

  const handleSave = async () => {
    setSaving(true);
    setSaveError(null);
    try {
      // Parse achievedRR "1:2.5" or "2.5" into a decimal for the riskReward DB column
      const parseRR = (s: string): string | null => {
        if (!s) return null;
        const parts = s.split(":");
        const val = parseFloat(parts[parts.length - 1]);
        return isNaN(val) ? null : String(val);
      };

      const payload: Record<string, any> = {
        instrument:           s2.instrument           || null,
        pairCategory:         s2.pairCategory         || null,
        direction:            s2.direction             || null,
        orderType:            s2.orderType             || null,
        entryPrice:           s2.entryPrice            || null,
        stopLoss:             s2.stopLoss              || null,
        takeProfit:           s2.takeProfit            || null,
        stopLossDistance:     s2.stopLossDistancePips  || null,
        takeProfitDistance:   s2.takeProfitDistancePips|| null,
        lotSize:              s2.lotSize               || null,
        riskPercent:          s2.riskPercent           || null,
        spreadAtEntry:        s2.spreadAtEntry         || null,
        entryTime:            s2.entryTime             || null,
        exitTime:             s2.exitTime              || null,
        dayOfWeek:            s2.dayOfWeek             || null,
        tradeDuration:        s2.tradeDuration         || null,
        entryTF:              s2.entryTF               || null,
        analysisTF:           s2.analysisTF            || null,
        contextTF:            s2.contextTF             || null,
        outcome:              s2.outcome               || null,
        profitLoss:           s4.profitLoss !== "" ? s4.profitLoss : null,
        pipsGainedLost:       s4.pipsGainedLost !== "" ? s4.pipsGainedLost : null,
        accountBalance:       s4.accountBalance !== "" ? s4.accountBalance : null,
        commission:           s4.commission            || null,
        mae:                  s4.mae                   || null,
        mfe:                  s4.mfe                   || null,
        plannedRR:            s4.plannedRR             || null,
        achievedRR:           s4.achievedRR            || null,
        monetaryRisk:         s4.monetaryRisk          || null,
        potentialReward:      s4.potentialReward       || null,
        primaryExitReason:    s4.primaryExitReason     || null,
        riskReward:           parseRR(s4.achievedRR),
        sessionName:          s3.sessionName           || null,
        sessionPhase:         s3.sessionPhase          || null,
        sessionId:            sessionId                || null,
        timingContext:        s3.timingContext          || null,
        aiExtracted: {
          method: "ocr_v8_jforex",
          ocrConfidence: s2.ocrConfidence,
          ocrValidation: s2.ocrValidation,
          ocrFilledFields: Array.from(ocrFields),
        },
        manualFields: {
          thesis:                s1.thesis,
          trigger:               s1.trigger,
          invalidationLogic:     s1.invalidationLogic,
          expectedBehavior:      s1.expectedBehavior,
          setupTag:              s1.setupTag,
          tradeGrade:            s1.tradeGrade,
          marketRegime:          s3.marketRegime,
          trendDirection:        s3.trendDirection,
          volatilityState:       s3.volatilityState,
          liquidity:             s3.liquidity,
          newsEnvironment:       s3.newsEnvironment,
          htfBias:               s3.htfBias,
          emotionalState:        s4.emotionalState,
          focusStressLevel:      s4.focusStressLevel,
          postTradeEmotion:      s4.postTradeEmotion,
          rulesFollowed:         s4.rulesFollowed,
          confidenceLevel:       s4.confidenceLevel,
          worthRepeating:        s4.worthRepeating,
          whatWorked:            s4.whatWorked,
          whatFailed:            s4.whatFailed,
          adjustments:           s4.adjustments,
          notes:                 s4.notes,
          energyLevel:           s1.energyLevel,
          focusLevel:            s1.focusLevel,
          marketAlignment:       s3.marketAlignment,
          setupClarity:          s3.setupClarity,
          entryPrecision:        s3.entryPrecision,
          confluence:            s3.confluence,
          timingQuality:         s3.timingQuality,
          signalValidation:      s3.signalValidation,
          plannedEntry:          s4.plannedEntry         || null,
          plannedSL:             s4.plannedSL            || null,
          plannedTP:             s4.plannedTP            || null,
          actualEntry:           s4.actualEntry          || null,
          actualSL:              s4.actualSL             || null,
          actualTP:              s4.actualTP             || null,
          confidenceAtEntry:     s1.confidenceAtEntry,
          trendAlignment:        s3.trendAlignment,
          mtfAlignment:          s3.multitimeframeAlignment,
          htfKeyLevelPresent:    s3.htfKeyLevelPresent,
          keyLevelRespected:     s3.keyLevelRespect,
          keyLevelType:          s3.keyLevelType,
          targetLogic:           s3.targetLogicClarity,
          strongMomentum:        s3.momentumValidity,
          managementType:        s2.managementType,
          candlePattern:         s3.candlePattern,
          indicatorState:        s3.indicatorState       || null,
          setupFullyValid:       s1.setupFullyValid,
          anyRuleBroken:         s1.anyRuleBroken,
          ruleBroken:            s1.ruleBroken          || null,
          breakevenApplied:      s2.breakEvenApplied,
          fomoTrade:             s1.impulseCheckFOMO,
          revengeTrade:          s1.impulseCheckRevenge,
          boredomTrade:          s1.impulseCheckBored,
          emotionalTrade:        s1.impulseCheckEmotional,
          externalDistraction:   s1.externalDistraction,
          strategyVersionId:     s1.strategyVersionId,
          riskHeat:              s2.riskHeat,
          trailingStopApplied:   s2.trailingStopApplied,
          exitStrategy:          s2.exitStrategy,
          openTradesCount:       s1.openTradesCount,
          totalRiskOpen:         s1.totalRiskOpen,
          correlatedExposure:    s1.correlatedExposure,
          primarySignals:        s3.primarySignals,
          secondarySignals:      s3.secondarySignals,
          liquidityTargets:      s3.liquidityTargets,
          higherTFContext:       s3.higherTFContext,
          analysisTFContext:     s3.analysisTFContext,
          entryTFContext:        s3.entryTFContext,
          otherConfluences:      s3.otherConfluences,
          consecutiveTradeCount: s4.consecutiveTradeCount,
          recencyBiasFlag:       s4.recencyBiasFlag,
          atrAtEntry:            s3.atrAtEntry          || null,
          strategyVersion:       s2.strategyVersionId2  || null,
        },
      };
      await apiRequest("POST", "/api/journal/entries", payload);
      queryClient.invalidateQueries({ queryKey: ["/api/journal/entries"] });
      queryClient.invalidateQueries({ queryKey: ["/api/metrics/compute"] });
      queryClient.invalidateQueries({ queryKey: ["/api/calendar/compute"] });
      queryClient.invalidateQueries({ queryKey: ["/api/drawdown/compute"] });
      queryClient.invalidateQueries({ queryKey: ["/api/analytics"] });
      setSavedTrade({
        instrument: s2.instrument || "—",
        direction:  s2.direction  || "Long",
        outcome:    s2.outcome    || "Win",
        profitLoss: s4.profitLoss,
        pips:       s4.pipsGainedLost,
        grade:      s1.tradeGrade || "—",
        session:    s3.sessionName || "—",
        tf:         s2.entryTF    || "—",
        category:   s2.pairCategory || "—",
      });
      setSaved(true);
      setS1({ ...INIT_STEP1 });
      setS2({ ...INIT_STEP2 });
      setS3({ ...INIT_STEP3 });
      setS4({ ...INIT_STEP4 });
      setOcrFields(new Set());
      setStep(1);
    } catch (err: any) {
      setSaveError(err.message || "Failed to save entry");
    } finally {
      setSaving(false);
    }
  };

  const stepData: Record<string, any> = { step1: s1, step2: s2, step3: s3, step4: s4 };
  const setStepData: Record<string, (v: any) => void> = { step1: setS1, step2: setS2, step3: setS3, step4: setS4 };

  return (
    <div className="tj-root" style={{ minHeight: "100%" }}>
      <style dangerouslySetInnerHTML={{ __html: TJ_CSS }} />
      <div className="tj-page">
        {/* ── Form column ── */}
        <div className="tj-shell" style={{ position: "relative" }}>
          {/* ── Success overlay ── */}
          {saved && savedTrade && (() => {
            const pnlNum   = parseFloat(savedTrade.profitLoss);
            const pipsNum  = parseFloat(savedTrade.pips);
            const hasPnl   = savedTrade.profitLoss !== "" && !isNaN(pnlNum);
            const hasPips  = savedTrade.pips !== "" && !isNaN(pipsNum);
            const isWin    = savedTrade.outcome === "Win";
            const isLoss   = savedTrade.outcome === "Loss";
            const pnlCls   = isWin ? "pos" : isLoss ? "neg" : "be";
            const outCls   = isWin ? "win" : isLoss ? "loss" : "be";
            const dirCls   = savedTrade.direction === "Long" ? "long" : "short";
            const pnlStr   = hasPnl
              ? `${pnlNum >= 0 ? "+" : ""}$${Math.abs(pnlNum).toFixed(2)}`
              : savedTrade.outcome === "Win" ? "Win" : savedTrade.outcome === "Loss" ? "Loss" : "BE";
            return (
              <div className="tj-success-overlay">
                <div className="tj-success-icon-wrap">
                  <span className="tj-success-check">✓</span>
                </div>
                <div className="tj-success-title">Trade Logged</div>
                <div className="tj-success-sub">Entry recorded · form has been reset</div>

                <div className="tj-success-card">
                  <div className="tj-success-card-header">
                    <span className="tj-success-instrument">{savedTrade.instrument}</span>
                    <span className={`tj-success-dir ${dirCls}`}>{savedTrade.direction}</span>
                  </div>

                  <div className="tj-success-pnl-row">
                    <span className={`tj-success-pnl ${pnlCls}`}>{pnlStr}</span>
                    {hasPips && (
                      <span className="tj-success-pnl-label">
                        {pipsNum >= 0 ? "+" : ""}{pipsNum.toFixed(1)} pips
                      </span>
                    )}
                  </div>

                  <div className="tj-success-grid">
                    <div className="tj-success-cell">
                      <div className="tj-success-cell-label">Outcome</div>
                      <div className={`tj-success-outcome ${outCls}`}>{savedTrade.outcome}</div>
                    </div>
                    <div className="tj-success-cell">
                      <div className="tj-success-cell-label">Grade</div>
                      <div className="tj-success-cell-val">{savedTrade.grade}</div>
                    </div>
                    <div className="tj-success-cell">
                      <div className="tj-success-cell-label">Session</div>
                      <div className="tj-success-cell-val">{savedTrade.session}</div>
                    </div>
                    <div className="tj-success-cell">
                      <div className="tj-success-cell-label">Timeframe</div>
                      <div className="tj-success-cell-val">{savedTrade.tf}</div>
                    </div>
                    <div className="tj-success-cell" style={{ borderBottom: "none" }}>
                      <div className="tj-success-cell-label">Category</div>
                      <div className="tj-success-cell-val">{savedTrade.category}</div>
                    </div>
                    <div className="tj-success-cell" style={{ borderBottom: "none" }}>
                      <div className="tj-success-cell-label">Entries</div>
                      <div className="tj-success-cell-val" style={{ color: "var(--c-hint)" }}>
                        +1 logged
                      </div>
                    </div>
                  </div>
                </div>

                <div className="tj-success-actions">
                  <button
                    className="tj-success-btn primary"
                    onClick={() => { setSaved(false); setSavedTrade(null); }}
                  >
                    + Log Another Trade
                  </button>
                  <button
                    className="tj-success-btn ghost"
                    onClick={() => { setSaved(false); setSavedTrade(null); }}
                  >
                    Done
                  </button>
                </div>
              </div>
            );
          })()}

          <div className="tj-progress-bar">
            <div className="tj-progress-fill" style={{ width: `${(step / STEPS_DEF.length) * 100}%` }} />
          </div>

          <div className="tj-tabs">
            {STEPS_DEF.map(s => (
              <button
                key={s.n}
                className={`tj-tab${step === s.n ? " active" : ""}${step > s.n ? " done" : ""}`}
                onClick={() => setStep(s.n)}
              >
                <span className="tj-tab-num">{step > s.n ? "✓" : s.n}</span>
                {s.label}
              </button>
            ))}
          </div>

          <div className="tj-body">
            {saveError && (
              <div className="tj-strip danger" style={{ marginBottom: 16 }}>
                ✕ {saveError}
              </div>
            )}

            {step === 1 && <Step1 d={s1} set={setS1} />}
            {step === 2 && (
              <Step2
                d={s2}
                set={setS2}
                onScreenshotUpload={handleScreenshotUpload}
                analyzing={analyzing}
                ocrFields={ocrFields}
                currentBalance={currentBalance}
              />
            )}
            {step === 3 && <Step3 d={s3} set={setS3} />}
            {step === 4 && <Step4 d={s4} set={setS4} />}
          </div>

          <div className="tj-nav">
            {step > 1
              ? <button className="tj-btn" onClick={() => { setStep(s => s - 1); setSaved(false); }}>← Previous</button>
              : <div />
            }
            <div className="tj-btn-row">
              {step < STEPS_DEF.length
                ? <button className="tj-btn primary" onClick={() => { setStep(s => s + 1); setSaved(false); }}>Next →</button>
                : <button className="tj-btn primary" onClick={handleSave} disabled={saving}>
                    {saving ? "Saving…" : "✓ Save Entry"}
                  </button>
              }
            </div>
          </div>
        </div>

        {/* ── Sidebar ── */}
        <Sidebar trades={trades} startingBalance={startingBalance} />
      </div>
    </div>
  );
}
