import { useState, useCallback, useMemo, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import {
  Check as CheckIcon, ArrowRight, RotateCcw,
  TrendingUp, TrendingDown, Minus,
  Timer, Globe2, Box, BookOpen, Zap,
} from "lucide-react";
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

  /* ── Classification row (Strategy stack | Sticky | Trade Grade) ── */
  .tj-classify-quad { display: grid; gap: 12px; grid-template-columns: repeat(4, minmax(0, 1fr)); align-items: end; }
  .tj-classify-grade { margin-top: 12px; max-width: 320px; }
  @media (max-width: 1100px) { .tj-classify-quad { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
  @media (max-width: 540px)  { .tj-classify-quad { grid-template-columns: 1fr; } .tj-classify-grade { max-width: none; } }

  /* ── Sticky chip (matches .tj-input / .tj-select shape) ── */
  .tj-sticky-box {
    background: var(--c-bg2); border: 1px solid var(--c-border2); border-radius: var(--radius);
    padding: 3px 4px 3px 11px; min-height: 32px;
    display: flex; align-items: center; gap: 6px;
    transition: border-color 0.15s, background 0.15s;
  }
  .tj-sticky-box:focus-within { border-color: var(--c-accent); background: var(--c-bg3); }
  .tj-sticky-box.is-active { background: var(--c-accent3); border-color: var(--c-accent); }
  .tj-sticky-box input {
    flex: 1; min-width: 0; background: transparent; border: 0; outline: 0;
    color: var(--c-text); font-size: 12px; padding: 0;
  }
  .tj-sticky-box input::placeholder { color: var(--c-hint); }
  .tj-sticky-box select {
    flex: 1; min-width: 0; background: transparent; border: 0; outline: 0;
    color: var(--c-text); font-size: 12px; padding: 0 18px 0 0; cursor: pointer;
    appearance: none; -webkit-appearance: none;
    background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%234d5e50' stroke-width='2'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E");
    background-repeat: no-repeat; background-position: right center;
  }
  .tj-sticky-name {
    flex: 1; min-width: 0;
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
    font-size: 12px; font-weight: 600; color: var(--c-accent); letter-spacing: 0.01em;
  }
  .tj-sticky-btn {
    width: 22px; height: 22px; border-radius: var(--radius);
    border: 1px solid var(--c-border2); background: var(--c-bg3);
    color: var(--c-muted); font-size: 14px; line-height: 1; cursor: pointer;
    display: flex; align-items: center; justify-content: center; flex-shrink: 0;
    transition: all 0.12s;
  }
  .tj-sticky-btn:hover { border-color: var(--c-accent); color: var(--c-accent); background: var(--c-accent3); }
  .tj-sticky-btn.danger:hover { border-color: var(--c-danger); color: var(--c-danger); background: rgba(232,84,84,0.08); }

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
  .sb-pnl { font-size: 12px; font-weight: 600; line-height: 1; margin-bottom: 8px; color: var(--c-text); }
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
  .sb-wr-num { font-size: 12px; font-weight: 600; color: var(--c-accent); line-height: 1; }
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
  .sb-met-val { font-size: 11px; font-weight: 600; color: var(--c-text); }
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

// ── Smart datetime parser ────────────────────────────────────────────────
// Accepts almost any user-pasted format and normalises to YYYY-MM-DDTHH:mm
// (the canonical value the rest of the form / backend already expects).
//   ISO        2026-04-25 09:30        2026-04-25T09:30:00
//   MT4/MT5    2026.04.25 09:30
//   US slash   04/25/2026 9:30 AM      4/25/26 09:30
//   EU slash   25/04/2026 09:30
//   EU dot     25.04.2026 09:30
//   Month name April 25, 2026 09:30    25 Apr 2026 9:30 am
//   Date only  2026-04-25              25/04/2026          → T00:00
//   Time only  09:30                                       → today's date
function pad2(n: number | string): string { return String(n).padStart(2, "0"); }
function to24h(h: number, ampm?: string | null): number {
  if (!ampm) return h;
  const u = ampm.toUpperCase();
  if (u === "PM" && h < 12) return h + 12;
  if (u === "AM" && h === 12) return 0;
  return h;
}
function parseSmartDateTime(raw: string): string | null {
  if (!raw) return null;
  const s = raw.trim();
  if (!s) return null;

  // Already in canonical form — accept as-is (allow seconds)
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::\d{2})?$/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}`;

  // YYYY[.\-\/]MM[.\-\/]DD [T ]HH:MM[:SS] [AM|PM]   (ISO, MT4, MT5)
  m = s.match(/^(\d{4})[.\-\/](\d{1,2})[.\-\/](\d{1,2})[T\s]+(\d{1,2}):(\d{2})(?::\d{2})?\s*(AM|PM)?$/i);
  if (m) {
    const hh = to24h(parseInt(m[4], 10), m[6]);
    return `${m[1]}-${pad2(m[2])}-${pad2(m[3])}T${pad2(hh)}:${m[5]}`;
  }

  // DD[.\-\/]MM[.\-\/]YYYY  /  MM[.\-\/]DD[.\-\/]YYYY  + time + AM/PM
  m = s.match(/^(\d{1,2})[.\-\/](\d{1,2})[.\-\/](\d{2,4})[T\s,]+(\d{1,2}):(\d{2})(?::\d{2})?\s*(AM|PM)?$/i);
  if (m) {
    let dd = parseInt(m[1], 10);
    let mm = parseInt(m[2], 10);
    let yy = m[3];
    if (yy.length === 2) yy = (parseInt(yy, 10) >= 70 ? "19" : "20") + yy;
    const hh = to24h(parseInt(m[4], 10), m[7]);
    if (mm > 12 && dd <= 12) [dd, mm] = [mm, dd];
    if (dd > 12 && mm > 12) return null;
    return `${yy}-${pad2(mm)}-${pad2(dd)}T${pad2(hh)}:${m[5]}`;
  }

  // Date only: YYYY-MM-DD or DD/MM/YYYY
  m = s.match(/^(\d{4})[.\-\/](\d{1,2})[.\-\/](\d{1,2})$/);
  if (m) return `${m[1]}-${pad2(m[2])}-${pad2(m[3])}T00:00`;
  m = s.match(/^(\d{1,2})[.\-\/](\d{1,2})[.\-\/](\d{2,4})$/);
  if (m) {
    let dd = parseInt(m[1], 10);
    let mm = parseInt(m[2], 10);
    let yy = m[3];
    if (yy.length === 2) yy = (parseInt(yy, 10) >= 70 ? "19" : "20") + yy;
    if (mm > 12 && dd <= 12) [dd, mm] = [mm, dd];
    if (dd > 12 && mm > 12) return null;
    return `${yy}-${pad2(mm)}-${pad2(dd)}T00:00`;
  }

  // Time only → today's date
  m = s.match(/^(\d{1,2}):(\d{2})(?::\d{2})?\s*(AM|PM)?$/i);
  if (m) {
    const now = new Date();
    const hh = to24h(parseInt(m[1], 10), m[3]);
    return `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}T${pad2(hh)}:${m[2]}`;
  }

  // Native Date.parse fallback (handles month-name formats, RFC, etc.)
  const dt = new Date(s);
  if (!isNaN(dt.getTime())) {
    return `${dt.getFullYear()}-${pad2(dt.getMonth() + 1)}-${pad2(dt.getDate())}T${pad2(dt.getHours())}:${pad2(dt.getMinutes())}`;
  }
  return null;
}

// Smart datetime input — type any format, parses on blur, stores YYYY-MM-DDTHH:mm.
// Shows a friendly readable form when not focused; user's raw input while editing.
function DateTimeInput({ label, value, onChange, ocrFilled }: any) {
  const [draft, setDraft] = useState<string>("");
  const [focused, setFocused] = useState(false);
  const [invalid, setInvalid] = useState(false);

  // Pretty label for the canonical value when not focused
  const display = (() => {
    if (focused) return draft;
    if (!value) return "";
    const m = String(value).match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);
    if (!m) return String(value);
    return `${m[3]}/${m[2]}/${m[1]} ${m[4]}:${m[5]}`;
  })();

  const commit = (raw: string) => {
    const trimmed = raw.trim();
    if (!trimmed) { onChange(""); setInvalid(false); return; }
    const parsed = parseSmartDateTime(trimmed);
    if (parsed) { onChange(parsed); setInvalid(false); }
    else        { setInvalid(true); }
  };

  return (
    <Field label={label} ocrFilled={ocrFilled}>
      <input
        className="tj-input"
        type="text"
        placeholder="dd/mm/yyyy hh:mm"
        value={display}
        style={invalid ? { borderColor: "#ef4444" } : undefined}
        onFocus={() => { setDraft(display); setFocused(true); }}
        onChange={e => { setDraft(e.target.value); setInvalid(false); }}
        onBlur={() => { commit(draft); setFocused(false); }}
        onKeyDown={e => { if (e.key === "Enter") (e.currentTarget as HTMLInputElement).blur(); }}
      />
      {invalid && (
        <div style={{ fontSize: "11px", color: "#ef4444", marginTop: 4 }}>
          Couldn't recognise that date/time — try e.g. 25/04/2026 09:30
        </div>
      )}
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

// Reusable sticky-pin component. Lives inside a `.tj-sticky-box` whose
// dimensions and styling mirror the surrounding `.tj-input` / `.tj-select`
// fields, so it sits flush in the form grid. When `options` is provided it
// renders as a select (e.g. Setup Tag); otherwise as a free-text input
// (e.g. Strategy). One sub-line replaces the old double helper text.
function StickyChip({
  storageKey, label, value, options, onChoose,
}: {
  storageKey: string;
  label: string;
  value: string;
  options?: string[];
  onChoose: (v: string) => void;
}) {
  const [draft, setDraft] = useState("");
  const [sticky, setSticky] = useState<string>(() => {
    try { return sessionStorage.getItem(storageKey) || ""; } catch { return ""; }
  });

  // Auto-fill the linked manual field from the active session pin:
  //  • after the form resets (value becomes empty) — re-fill from sticky.
  //  • whenever the user changes the pin itself — push the new pinned
  //    value into the manual field so it always mirrors the active pin
  //    until the user changes the active pin again.
  const prevSticky = useRef(sticky);
  useEffect(() => {
    const stickyChanged = prevSticky.current !== sticky;
    prevSticky.current = sticky;
    if (sticky && (!value || stickyChanged)) onChoose(sticky);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sticky, value]);

  const apply = (raw: string) => {
    const v = (raw || "").trim();
    if (!v) return;
    try { sessionStorage.setItem(storageKey, v); } catch {}
    setSticky(v);
    setDraft("");
    onChoose(v);
  };

  const clear = () => {
    try { sessionStorage.removeItem(storageKey); } catch {}
    setSticky("");
  };

  const tid = storageKey.replace(/[^a-z0-9]+/gi, "-");

  return (
    <Field label={label} sub={sticky ? "Auto-fills until removed" : "Pin once, reuse all session"}>
      <div className={`tj-sticky-box${sticky ? " is-active" : ""}`}>
        {sticky ? (
          <>
            <span className="tj-sticky-name" title={sticky} data-testid={`${tid}-chip`}>{sticky}</span>
            <button
              type="button"
              className="tj-sticky-btn danger"
              onClick={clear}
              aria-label={`Clear ${label}`}
              data-testid={`${tid}-remove`}
            >×</button>
          </>
        ) : options ? (
          <select
            value=""
            onChange={e => apply(e.target.value)}
            data-testid={`${tid}-select`}
          >
            <option value="">Select to pin…</option>
            {options.map(o => <option key={o} value={o}>{o}</option>)}
          </select>
        ) : (
          <>
            <input
              type="text"
              placeholder="Type to pin…"
              value={draft}
              onChange={e => setDraft(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); apply(draft); } }}
              data-testid={`${tid}-input`}
            />
            <button
              type="button"
              className="tj-sticky-btn"
              onClick={() => apply(draft)}
              aria-label={`Pin ${label}`}
              data-testid={`${tid}-add`}
            >+</button>
          </>
        )}
      </div>
    </Field>
  );
}

function StickyTF({ storageKey, label, options, value, onChange }: {
  storageKey: string;
  label: string;
  options: string[];
  value: any;
  onChange: (v: any) => void;
}) {
  // On mount: if a previously chosen TF is saved for this session, restore it.
  useEffect(() => {
    try {
      const saved = sessionStorage.getItem(storageKey);
      if (saved && options.includes(saved) && saved !== value) {
        onChange(saved);
      }
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleChange = (v: string) => {
    try { sessionStorage.setItem(storageKey, v); } catch {}
    onChange(v);
  };

  return <Sel label={label} options={options} value={value} onChange={handleChange} />;
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
        <div className="tj-classify-quad">
          <Inp label="Strategy" placeholder="e.g., Supply & Demand, Breakout…" value={d.strategyVersionId} onChange={f("strategyVersionId")} />
          <Sel label="Setup Tag" options={["Breakout","Reversal","Continuation","Range Bound","Trend Following","Momentum","Pullback"]} value={d.setupTag} onChange={f("setupTag")} />
          <StickyChip
            storageKey="fsd:stickyStrategy"
            label="Active Strategy"
            value={d.strategyVersionId}
            onChoose={(v) => set((prev: any) => ({ ...prev, strategyVersionId: v }))}
          />
          <StickyChip
            storageKey="fsd:stickySetup"
            label="Active Setup"
            value={d.setupTag}
            onChoose={(v) => set((prev: any) => ({ ...prev, setupTag: v }))}
          />
        </div>
        <div className="tj-classify-grade">
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
          <DateTimeInput
            label="Entry Time"
            value={d.entryTime}
            ocrFilled={ocrFields?.has("entryTime")}
            onChange={(v: string) => set((prev: any) => {
              const next: any = { ...prev, entryTime: v };
              const days = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];
              if (v) {
                const dt = new Date(v);
                if (!isNaN(dt.getTime())) next.dayOfWeek = days[dt.getDay()];
              }
              if (v && prev.exitTime) {
                const a = new Date(v).getTime(), b = new Date(prev.exitTime).getTime();
                if (!isNaN(a) && !isNaN(b) && b > a) {
                  const mins = Math.round((b - a) / 60000);
                  next.tradeDuration = mins < 60 ? `${mins} minutes`
                    : mins < 1440 ? `${Math.floor(mins/60)}h ${mins%60}m`
                    : `${Math.floor(mins/1440)}d ${Math.floor((mins%1440)/60)}h`;
                }
              }
              return next;
            })}
          />
          <DateTimeInput
            label="Exit Time"
            value={d.exitTime}
            ocrFilled={ocrFields?.has("exitTime")}
            onChange={(v: string) => set((prev: any) => {
              const next: any = { ...prev, exitTime: v };
              if (v && prev.entryTime) {
                const a = new Date(prev.entryTime).getTime(), b = new Date(v).getTime();
                if (!isNaN(a) && !isNaN(b) && b > a) {
                  const mins = Math.round((b - a) / 60000);
                  next.tradeDuration = mins < 60 ? `${mins} minutes`
                    : mins < 1440 ? `${Math.floor(mins/60)}h ${mins%60}m`
                    : `${Math.floor(mins/1440)}d ${Math.floor((mins%1440)/60)}h`;
                }
              }
              return next;
            })}
          />
          <Sel label="Day of Week" options={["Monday","Tuesday","Wednesday","Thursday","Friday","Saturday","Sunday"]} value={d.dayOfWeek} onChange={f("dayOfWeek")} />
          <Inp label="Trade Duration" placeholder="2h 30m" value={d.tradeDuration} onChange={f("tradeDuration")} />
        </div>
      </div>

      <div className="tj-section">
        <div className="tj-section-label">Timeframe Analysis</div>
        <div className="tj-grid tj-g3">
          <StickyTF storageKey="fsd:tf:entry"    label="Entry TF"    options={["1M","3M","5M","15M","30MIN"]}  value={d.entryTF}    onChange={f("entryTF")} />
          <StickyTF storageKey="fsd:tf:analysis" label="Analysis TF" options={["15M","30MIN","1HR","2HR","4HR"]} value={d.analysisTF} onChange={f("analysisTF")} />
          <StickyTF storageKey="fsd:tf:context"  label="Context TF"  options={["1W","1D","4HR"]}                value={d.contextTF}  onChange={f("contextTF")} />
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
function Step3({ d, set, direction, regimeTouchedRef, trendTouchedRef }: any) {
  // Track the direction the auto-derive last ran for, so we only re-derive
  // when direction actually changes — not on every remount of this step.
  const lastDirectionRef = useRef<string | null>(null);

  // Auto-derive Market Regime + Trend Direction from execution direction
  // whenever direction changes, unless the user has already set them manually.
  // Touched flags are stored in refs owned by the parent form so they survive
  // step navigation (Step3 unmounts when the user moves to another step).
  useEffect(() => {
    if (lastDirectionRef.current === direction) return;
    lastDirectionRef.current = direction;
    const derived = direction === "Short" ? "Bearish" : "Bullish";
    set((prev: any) => ({
      ...prev,
      ...(!regimeTouchedRef.current ? { marketRegime: derived }  : {}),
      ...(!trendTouchedRef.current  ? { trendDirection: derived } : {}),
    }));
  }, [direction]);

  const f = (k: string) => (v: any) => {
    if (k === "marketRegime")   regimeTouchedRef.current = true;
    if (k === "trendDirection") trendTouchedRef.current  = true;
    set((prev: any) => ({ ...prev, [k]: v }));
  };
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
        <Sel label="Primary Exit Reason" options={["Target Hit","Partial TP","Stop Hit","Time Exit","Structure Change","News","Emotional Exit"]} value={d.primaryExitReason} onChange={f("primaryExitReason")} />
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
  strategyVersionId: "", setupTag: "", tradeGrade: "A - Textbook",
  setupFullyValid: "Yes", anyRuleBroken: "No", ruleBroken: "",
  impulseCheckFOMO: false, impulseCheckRevenge: false, impulseCheckBored: false, impulseCheckEmotional: false,
};
const INIT_STEP2 = {
  screenshot: null, exitScreenshot: null,
  instrument: "", pairCategory: "Major", direction: "Long", lotSize: "",
  entryPrice: "", stopLoss: "", stopLossDistancePips: "", takeProfit: "", takeProfitDistancePips: "",
  riskPercent: "1", orderType: "Market", outcome: "Win",
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
  // Touched flags for the Step 3 auto-derive (Market Regime / Trend Direction).
  // Owned by the parent so they survive Step3 unmount/remount when the user
  // navigates between steps. Reset on save so a fresh entry starts clean.
  const regimeTouchedRef = useRef(false);
  const trendTouchedRef  = useRef(false);
  const [savedTrade, setSavedTrade] = useState<{
    instrument: string; direction: string; outcome: string;
    profitLoss: string; pips: string; grade: string; session: string; tf: string; category: string;
  } | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [ocrFields, setOcrFields] = useState<Set<string>>(new Set());
  const [unfilledSections, setUnfilledSections] = useState<{ step: number; name: string }[] | null>(null);

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
    // Mark these autocalculated fields as "filled by the system" so the
    // unfilled-panels reminder won't flag Performance Data / Trade Metrics
    // when their values were derived from OCR-supplied risk %, RR, etc.
    setOcrFields(prev => {
      let changed = false;
      const next = new Set(prev);
      Object.keys(s4Updates).forEach(k => {
        if (!next.has(k)) { next.add(k); changed = true; }
      });
      return changed ? next : prev;
    });
  }, [s2.riskPercent, s2.outcome, s4.achievedRR, s4.plannedRR, s2.stopLossDistancePips, currentBalance]);

  // ── Auto-fill Primary Exit Reason from Outcome (+ RR comparison for Wins) ──
  // Loss            → Stop Hit
  // BE              → Structure Change
  // Win, RR matches → Target Hit
  // Win, RR differs → Partial TP
  // Re-runs only when outcome / planned RR / achieved RR change, so a manual
  // override stays in place until one of those inputs changes again.
  useEffect(() => {
    const outcome = s2.outcome as "Win" | "Loss" | "BE";
    let reason: string | null = null;

    if (outcome === "Loss") {
      reason = "Stop Hit";
    } else if (outcome === "BE") {
      reason = "Structure Change";
    } else if (outcome === "Win") {
      const planned  = parseRR(s4.plannedRR);
      const achieved = parseRR(s4.achievedRR);
      if (achieved > 0 && planned > 0) {
        reason = Math.abs(achieved - planned) < 0.01 ? "Target Hit" : "Partial TP";
      }
    }

    if (reason && reason !== s4.primaryExitReason) {
      setS4(prev => ({ ...prev, primaryExitReason: reason! }));
      setOcrFields(prev => {
        if (prev.has("primaryExitReason")) return prev;
        const next = new Set(prev);
        next.add("primaryExitReason");
        return next;
      });
    }
  }, [s2.outcome, s4.plannedRR, s4.achievedRR]);

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

  // Sections we want to remind the user about if they look untouched.
  // A section is flagged as "unfilled" when EVERY one of its listed fields
  // still matches its INIT default — i.e. the user hasn't changed anything
  // in that panel (whether it's text inputs OR dropdowns / radios / scores).
  // Partially edited panels are treated as intentional and not flagged.
  const getUnfilledSections = (): { step: number; name: string }[] => {
    const eq = (a: any, b: any) => {
      // Treat null / undefined / "" as equivalent for "empty" comparison
      const norm = (v: any) =>
        v === undefined || v === null || (typeof v === "string" && v.trim() === "")
          ? ""
          : v;
      return norm(a) === norm(b);
    };
    // A field counts as "touched" if either:
    //   1. its current value differs from the INIT default, OR
    //   2. it was filled by OCR / pasted-text analysis (tracked in ocrFields)
    // A section is "untouched" only when ALL of its fields are still at their
    // defaults AND none of them were autofilled.
    const untouched = (state: any, init: any, fields: string[]) =>
      fields.every(f => eq(state[f], init[f]) && !ocrFields.has(f));

    const sections: {
      step: number;
      name: string;
      state: any;
      init: any;
      fields: string[];
    }[] = [
      // ── Step 1 ────────────────────────────────────────────────────────
      { step: 1, name: "Core Thesis",            state: s1, init: INIT_STEP1, fields: ["thesis","trigger","invalidationLogic","expectedBehavior"] },
      { step: 1, name: "Pre-Entry State Check",  state: s1, init: INIT_STEP1, fields: ["energyLevel","focusLevel","confidenceAtEntry","externalDistraction","openTradesCount","totalRiskOpen","correlatedExposure"] },
      { step: 1, name: "Classification & Quality", state: s1, init: INIT_STEP1, fields: ["setupTag","tradeGrade"] },
      { step: 1, name: "Rule Governance",        state: s1, init: INIT_STEP1, fields: ["setupFullyValid","anyRuleBroken","ruleBroken"] },
      { step: 1, name: "Impulse Control Check",  state: s1, init: INIT_STEP1, fields: ["impulseCheckFOMO","impulseCheckRevenge","impulseCheckBored","impulseCheckEmotional"] },

      // ── Step 2 ────────────────────────────────────────────────────────
      { step: 2, name: "Trade Screenshots",      state: s2, init: INIT_STEP2, fields: ["screenshot","exitScreenshot"] },
      { step: 2, name: "Position Details",       state: s2, init: INIT_STEP2, fields: ["instrument","pairCategory","direction","lotSize","entryPrice","stopLoss","takeProfit","riskPercent","orderType","outcome"] },
      { step: 2, name: "Timing & Duration",      state: s2, init: INIT_STEP2, fields: ["entryTime","exitTime","dayOfWeek","tradeDuration"] },
      { step: 2, name: "Timeframe Analysis",     state: s2, init: INIT_STEP2, fields: ["entryTF","analysisTF","contextTF"] },
      { step: 2, name: "Entry & Trade Management", state: s2, init: INIT_STEP2, fields: ["entryMethod","exitStrategy","managementType","riskHeat","breakEvenApplied","trailingStopApplied"] },

      // ── Step 3 ────────────────────────────────────────────────────────
      { step: 3, name: "Market Environment",     state: s3, init: INIT_STEP3, fields: ["marketRegime","trendDirection","volatilityState","liquidity","newsEnvironment","sessionName","sessionPhase","atrAtEntry"] },
      { step: 3, name: "Higher Timeframe Context", state: s3, init: INIT_STEP3, fields: ["htfBias","htfKeyLevelPresent","trendAlignment","multitimeframeAlignment","higherTFContext","analysisTFContext","entryTFContext","otherConfluences"] },
      { step: 3, name: "Technical Signals",      state: s3, init: INIT_STEP3, fields: ["timingContext","candlePattern","primarySignals","secondarySignals","indicatorState","liquidityTargets"] },
      { step: 3, name: "Key Level Analysis",     state: s3, init: INIT_STEP3, fields: ["keyLevelRespect","keyLevelType","momentumValidity","targetLogicClarity"] },
      { step: 3, name: "Setup Quality Scores",   state: s3, init: INIT_STEP3, fields: ["marketAlignment","setupClarity","entryPrecision","confluence","timingQuality","signalValidation"] },

      // ── Step 4 ────────────────────────────────────────────────────────
      { step: 4, name: "Exit Causation",         state: s4, init: INIT_STEP4, fields: ["primaryExitReason"] },
      { step: 4, name: "Performance Data",       state: s4, init: INIT_STEP4, fields: ["pipsGainedLost","profitLoss","accountBalance","commission"] },
      { step: 4, name: "Planning vs Execution",  state: s4, init: INIT_STEP4, fields: ["plannedEntry","plannedSL","plannedTP","actualEntry","actualSL","actualTP"] },
      { step: 4, name: "Trade Metrics",          state: s4, init: INIT_STEP4, fields: ["mae","mfe","monetaryRisk","potentialReward","plannedRR","achievedRR"] },
      { step: 4, name: "Psychological State",    state: s4, init: INIT_STEP4, fields: ["emotionalState","focusStressLevel","rulesFollowed","confidenceLevel","postTradeEmotion","consecutiveTradeCount","worthRepeating","recencyBiasFlag"] },
      { step: 4, name: "Trade Debrief",          state: s4, init: INIT_STEP4, fields: ["whatWorked","whatFailed","adjustments","notes"] },
    ];

    return sections
      .filter(s => untouched(s.state, s.init, s.fields))
      .map(({ step, name }) => ({ step, name }));
  };

  const handleSave = async (forceSubmit: boolean = false) => {
    // Hard requirement: every trade needs a real entry time. Without it the
    // calendar / metrics have no real date to plot the trade against
    // (especially for backtest entries that aren't logged on the same day
    // they actually happened). Cannot be bypassed by "save anyway".
    if (!s2.entryTime) {
      setSaveError("Entry Time is required — please set the date/time the trade actually occurred (Step 2 → Timing & Duration). This is what places the trade on the activity calendar and in time-based metrics.");
      setStep(2);
      return;
    }
    if (!forceSubmit) {
      const unfilled = getUnfilledSections();
      if (unfilled.length > 0) {
        setUnfilledSections(unfilled);
        return;
      }
    }
    setUnfilledSections(null);
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

      // Safety net: backfill any field that ended up empty with its INIT default.
      // This guarantees that a dropdown / radio / checkbox showing its default
      // value on screen always gets submitted as that value, even if the user
      // never touched it (or some flow accidentally cleared it).
      const fillDefaults = <T extends Record<string, any>>(state: T, init: T): T => {
        const out: Record<string, any> = { ...state };
        for (const k of Object.keys(init) as (keyof T)[]) {
          const v = out[k as string];
          if (v === undefined || v === null || v === "") {
            out[k as string] = (init as any)[k];
          }
        }
        return out as T;
      };
      const f1 = fillDefaults(s1, INIT_STEP1);
      const f2 = fillDefaults(s2, INIT_STEP2);
      const f3 = fillDefaults(s3, INIT_STEP3);
      const f4 = fillDefaults(s4, INIT_STEP4);

      const payload: Record<string, any> = {
        instrument:           f2.instrument           || null,
        pairCategory:         f2.pairCategory         || null,
        direction:            f2.direction             || null,
        orderType:            f2.orderType             || null,
        entryPrice:           f2.entryPrice            || null,
        stopLoss:             f2.stopLoss              || null,
        takeProfit:           f2.takeProfit            || null,
        stopLossDistance:     f2.stopLossDistancePips  || null,
        takeProfitDistance:   f2.takeProfitDistancePips|| null,
        lotSize:              f2.lotSize               || null,
        riskPercent:          f2.riskPercent           || null,
        spreadAtEntry:        f2.spreadAtEntry         || null,
        entryTime:            f2.entryTime             || null,
        exitTime:             f2.exitTime              || null,
        dayOfWeek:            f2.dayOfWeek             || null,
        tradeDuration:        f2.tradeDuration         || null,
        entryTF:              f2.entryTF               || null,
        analysisTF:           f2.analysisTF            || null,
        contextTF:            f2.contextTF             || null,
        outcome:              f2.outcome               || null,
        profitLoss:           f4.profitLoss !== "" ? f4.profitLoss : null,
        pipsGainedLost:       f4.pipsGainedLost !== "" ? f4.pipsGainedLost : null,
        accountBalance:       f4.accountBalance !== "" ? f4.accountBalance : null,
        commission:           f4.commission            || null,
        mae:                  f4.mae                   || null,
        mfe:                  f4.mfe                   || null,
        plannedRR:            f4.plannedRR             || null,
        achievedRR:           f4.achievedRR            || null,
        monetaryRisk:         f4.monetaryRisk          || null,
        potentialReward:      f4.potentialReward       || null,
        primaryExitReason:    f4.primaryExitReason     || null,
        riskReward:           parseRR(f4.achievedRR),
        sessionName:          f3.sessionName           || null,
        sessionPhase:         f3.sessionPhase          || null,
        sessionId:            sessionId                || null,
        timingContext:        f3.timingContext          || null,
        aiExtracted: {
          method: "ocr_v8_jforex",
          ocrConfidence: f2.ocrConfidence,
          ocrValidation: f2.ocrValidation,
          ocrFilledFields: Array.from(ocrFields),
        },
        manualFields: {
          thesis:                f1.thesis,
          trigger:               f1.trigger,
          invalidationLogic:     f1.invalidationLogic,
          expectedBehavior:      f1.expectedBehavior,
          setupTag:              f1.setupTag,
          tradeGrade:            f1.tradeGrade,
          marketRegime:          f3.marketRegime,
          trendDirection:        f3.trendDirection,
          volatilityState:       f3.volatilityState,
          liquidity:             f3.liquidity,
          newsEnvironment:       f3.newsEnvironment,
          htfBias:               f3.htfBias,
          emotionalState:        f4.emotionalState,
          focusStressLevel:      f4.focusStressLevel,
          postTradeEmotion:      f4.postTradeEmotion,
          rulesFollowed:         f4.rulesFollowed,
          confidenceLevel:       f4.confidenceLevel,
          worthRepeating:        f4.worthRepeating,
          whatWorked:            f4.whatWorked,
          whatFailed:            f4.whatFailed,
          adjustments:           f4.adjustments,
          notes:                 f4.notes,
          energyLevel:           f1.energyLevel,
          focusLevel:            f1.focusLevel,
          marketAlignment:       f3.marketAlignment,
          setupClarity:          f3.setupClarity,
          entryPrecision:        f3.entryPrecision,
          confluence:            f3.confluence,
          timingQuality:         f3.timingQuality,
          signalValidation:      f3.signalValidation,
          plannedEntry:          f4.plannedEntry         || null,
          plannedSL:             f4.plannedSL            || null,
          plannedTP:             f4.plannedTP            || null,
          actualEntry:           f4.actualEntry          || null,
          actualSL:              f4.actualSL             || null,
          actualTP:              f4.actualTP             || null,
          confidenceAtEntry:     f1.confidenceAtEntry,
          trendAlignment:        f3.trendAlignment,
          mtfAlignment:          f3.multitimeframeAlignment,
          htfKeyLevelPresent:    f3.htfKeyLevelPresent,
          keyLevelRespected:     f3.keyLevelRespect,
          keyLevelType:          f3.keyLevelType,
          targetLogic:           f3.targetLogicClarity,
          strongMomentum:        f3.momentumValidity,
          managementType:        f2.managementType,
          candlePattern:         f3.candlePattern,
          indicatorState:        f3.indicatorState       || null,
          setupFullyValid:       f1.setupFullyValid,
          anyRuleBroken:         f1.anyRuleBroken,
          ruleBroken:            f1.ruleBroken          || null,
          breakevenApplied:      f2.breakEvenApplied,
          fomoTrade:             f1.impulseCheckFOMO,
          revengeTrade:          f1.impulseCheckRevenge,
          boredomTrade:          f1.impulseCheckBored,
          emotionalTrade:        f1.impulseCheckEmotional,
          externalDistraction:   f1.externalDistraction,
          strategyVersionId:     f1.strategyVersionId,
          riskHeat:              f2.riskHeat,
          trailingStopApplied:   f2.trailingStopApplied,
          exitStrategy:          f2.exitStrategy,
          openTradesCount:       f1.openTradesCount,
          totalRiskOpen:         f1.totalRiskOpen,
          correlatedExposure:    f1.correlatedExposure,
          primarySignals:        f3.primarySignals,
          secondarySignals:      f3.secondarySignals,
          liquidityTargets:      f3.liquidityTargets,
          higherTFContext:       f3.higherTFContext,
          analysisTFContext:     f3.analysisTFContext,
          entryTFContext:        f3.entryTFContext,
          otherConfluences:      f3.otherConfluences,
          consecutiveTradeCount: f4.consecutiveTradeCount,
          recencyBiasFlag:       f4.recencyBiasFlag,
          atrAtEntry:            f3.atrAtEntry          || null,
          strategyVersion:       f2.strategyVersionId2  || null,
        },
      };
      await apiRequest("POST", "/api/journal/entries", payload);
      queryClient.invalidateQueries({ queryKey: ["/api/journal/entries"] });
      queryClient.invalidateQueries({ queryKey: ["/api/metrics/compute"] });
      queryClient.invalidateQueries({ queryKey: ["/api/calendar/compute"] });
      queryClient.invalidateQueries({ queryKey: ["/api/drawdown/compute"] });
      queryClient.invalidateQueries({ queryKey: ["/api/analytics"] });
      setSavedTrade({
        instrument: f2.instrument || "—",
        direction:  f2.direction  || "Long",
        outcome:    f2.outcome    || "Win",
        profitLoss: f4.profitLoss,
        pips:       f4.pipsGainedLost,
        grade:      f1.tradeGrade || "—",
        session:    f3.sessionName || "—",
        tf:         f2.entryTF    || "—",
        category:   f2.pairCategory || "—",
      });
      setSaved(true);
      setS1({ ...INIT_STEP1 });
      setS2({ ...INIT_STEP2 });
      setS3({ ...INIT_STEP3 });
      setS4({ ...INIT_STEP4 });
      regimeTouchedRef.current = false;
      trendTouchedRef.current  = false;
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
          {/* ── Success overlay (rendered in a portal, fully isolated from .tj-root) ── */}
          {saved && savedTrade && createPortal((() => {
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
            const outcomeColor = isWin
              ? "text-emerald-400"
              : isLoss ? "text-rose-400" : "text-amber-400";
            const OutcomeIcon = isWin ? TrendingUp : isLoss ? TrendingDown : Minus;
            const accentBar = isWin
              ? "border-l-emerald-500"
              : isLoss ? "border-l-rose-500" : "border-l-amber-500";
            const dimResultText = isWin
              ? "text-emerald-500/40"
              : isLoss ? "text-rose-500/40" : "text-amber-500/40";

            const resultSummary = hasPnl
              ? `${pnlNum >= 0 ? "+" : "−"}$${Math.abs(pnlNum).toFixed(2)}${hasPips ? ` · ${pipsNum >= 0 ? "+" : ""}${pipsNum.toFixed(1)} pips` : ""}`
              : hasPips
                ? `${pipsNum >= 0 ? "+" : ""}${pipsNum.toFixed(1)} pips`
                : "Outcome recorded";

            const tradeData = [
              { label: "Outcome",   value: savedTrade.outcome,  Icon: OutcomeIcon, iconColor: outcomeColor,    valueColor: outcomeColor },
              { label: "Grade",     value: savedTrade.grade,    Icon: BookOpen,    iconColor: "text-blue-400" },
              { label: "Session",   value: savedTrade.session,  Icon: Globe2,      iconColor: "text-purple-400" },
              { label: "Timeframe", value: savedTrade.tf,       Icon: Timer,       iconColor: "text-amber-400" },
              { label: "Category",  value: savedTrade.category, Icon: Box,         iconColor: "text-indigo-400" },
              { label: "Entries",   value: "+1 logged",         Icon: Zap,         iconColor: "text-slate-400" },
            ];

            return (
              <div
                className="tj-success-v3"
                style={{
                  position: "fixed",
                  inset: 0,
                  zIndex: 9999,
                  background: "#0a0a0b",
                  overflowY: "auto",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <style>{`
                  @import url('https://fonts.googleapis.com/css2?family=Montserrat:wght@400;500;600;700;800;900&family=Poppins:ital,wght@1,400;1,600;1,700;1,800&display=swap');

                  /* Hard reset — wipe ANY inherited / global styles from the host page.
                     The overlay is rendered in a portal at <body>, so nothing from
                     .tj-root (monospace font, zero margin/padding, etc.) reaches it. */
                  .tj-success-v3, .tj-success-v3 *, .tj-success-v3 *::before, .tj-success-v3 *::after {
                    font-family: 'Montserrat', sans-serif !important;
                    font-feature-settings: normal !important;
                    font-variant-ligatures: normal !important;
                    box-sizing: border-box;
                  }
                  .tj-success-v3 .poppins-italic,
                  .tj-success-v3 .poppins-italic * {
                    font-family: 'Poppins', sans-serif !important;
                    font-style: italic !important;
                  }

                  /* Small-screen optimization (typography untouched) */
                  @media (max-width: 480px) {
                    .tj-success-v3 .tj-pad-x { padding-left: 1.25rem !important; padding-right: 1.25rem !important; }
                    .tj-success-v3 .tj-pad-t { padding-top: 1.25rem !important; }
                    .tj-success-v3 .tj-pad-b { padding-bottom: 1.25rem !important; }
                    .tj-success-v3 .tj-mx    { margin-left: 1.25rem !important; margin-right: 1.25rem !important; }
                    .tj-success-v3 .tj-mt    { margin-top: 1.25rem !important; }
                    .tj-success-v3 .tj-outer-pad { padding: 0.75rem !important; }
                  }
                `}</style>

                <div className="tj-outer-pad min-h-full w-full flex items-center justify-center p-6 tracking-tight text-slate-200 overflow-y-auto">
                  <div className="max-w-lg w-full animate-in fade-in zoom-in-95 duration-500">

                    {/* Unified Card Container */}
                    <div className="bg-[#111114] border-2 border-white/10 rounded-md overflow-hidden shadow-[0_20px_50px_rgba(0,0,0,0.5)] relative">

                      {/* Updated Success Header: Text first, then Tick to the right */}
                      <div className="tj-pad-x tj-pad-t p-8 pb-0 flex flex-col items-center">
                        <div className="flex items-center gap-3">
                          <h1 className="poppins-italic text-sm font-bold tracking-tight text-white leading-none">
                            Trade successfully logged
                          </h1>
                          <div className="w-8 h-8 rounded-md bg-emerald-500 flex items-center justify-center shadow-[0_0_15px_rgba(16,185,129,0.2)]">
                            <CheckIcon className="w-4 h-4 text-[#0a0a0b]" strokeWidth={4} />
                          </div>
                        </div>
                        <p className="text-slate-500 text-[8px] font-semibold mt-2 uppercase tracking-wide">Entry confirmed in journal</p>
                      </div>

                      {/* Divider */}
                      <div className="tj-mx tj-mt mx-8 mt-8 border-t-2 border-white/5"></div>

                      {/* Position Meta Bar */}
                      <div className="tj-pad-x px-8 py-3 flex items-center justify-between bg-white/[0.01]">
                        <div className="flex items-center gap-1.5">
                          <div className="w-1 h-1 bg-emerald-500"></div>
                          <span className="text-[8px] font-extrabold text-slate-500 uppercase tracking-wider">
                            {savedTrade.instrument || "Position details"}
                          </span>
                        </div>
                        <span className={`px-2 py-0.5 text-[8px] font-black text-white rounded-sm uppercase tracking-wider ${
                          dirCls === "long" ? "bg-blue-600" : "bg-rose-600"
                        }`}>
                          {savedTrade.direction}
                        </span>
                      </div>

                      {/* Main Visual Display */}
                      <div className="tj-pad-x tj-pad-b px-8 pb-6">
                        <div className={`mb-4 bg-white/[0.03] border-l-2 ${accentBar} rounded-sm p-4`}>
                          <span className="text-[8px] text-slate-500 font-extrabold uppercase tracking-wider">Net result</span>
                          <div className="text-xl font-black text-white mt-0.5 flex items-baseline gap-2 tracking-tighter">
                            <span className={outcomeColor}>{savedTrade.outcome || "—"}</span>
                            <span className={`text-[9px] font-semibold tracking-tight uppercase ${dimResultText}`}>
                              {resultSummary}
                            </span>
                          </div>
                        </div>

                        {/* Grid Stats */}
                        <div className="grid grid-cols-2 gap-1.5">
                          {tradeData.map((item, idx) => {
                            const Icon = item.Icon;
                            return (
                              <div
                                key={idx}
                                className="bg-[#18181b] p-3 border border-white/5 hover:border-white/20 transition-all group"
                                data-testid={`trade-success-cell-${item.label.toLowerCase()}`}
                              >
                                <div className="flex items-center gap-2 mb-1">
                                  <div className="p-0.5 bg-white/5 rounded-sm group-hover:bg-white/10">
                                    <Icon className={`w-3 h-3 ${item.iconColor}`} />
                                  </div>
                                  <span className="text-[8px] text-slate-500 font-extrabold uppercase tracking-wider">{item.label}</span>
                                </div>
                                <div className={`text-xs font-extrabold tracking-tight leading-none ${item.valueColor || "text-white"}`}>
                                  {item.value || "—"}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>

                      {/* Card Footer Actions */}
                      <div className="flex border-t-2 border-white/10">
                        <button
                          type="button"
                          onClick={() => { setSaved(false); setSavedTrade(null); }}
                          className="flex-1 bg-blue-600 hover:bg-blue-500 text-white font-black text-[9px] py-3 transition-all active:brightness-90 flex items-center justify-center gap-2 uppercase tracking-wider"
                          data-testid="trade-success-log-another"
                        >
                          <RotateCcw className="w-3 h-3" strokeWidth={3} />
                          Log another
                        </button>
                        <button
                          type="button"
                          onClick={() => { setSaved(false); setSavedTrade(null); }}
                          className="flex-1 bg-[#1c1c21] hover:bg-[#25252b] text-white font-black text-[9px] py-3 border-l-2 border-white/10 transition-all active:brightness-90 flex items-center justify-center gap-2 uppercase tracking-wider"
                          data-testid="trade-success-done"
                        >
                          Done
                          <ArrowRight className="w-3 h-3" strokeWidth={3} />
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            );
          })(), document.body)}

          {/* ── Unfilled-sections reminder modal ── */}
          {unfilledSections && unfilledSections.length > 0 && (
            <div
              onClick={() => setUnfilledSections(null)}
              style={{
                position: "absolute", inset: 0, zIndex: 50,
                background: "rgba(4,8,14,0.78)", backdropFilter: "blur(4px)",
                display: "flex", alignItems: "center", justifyContent: "center",
                padding: 20,
              }}
            >
              <div
                onClick={e => e.stopPropagation()}
                style={{
                  width: "100%", maxWidth: 460,
                  background: "#0c1422", border: "1px solid rgba(255,255,255,0.08)",
                  borderRadius: 14, padding: "22px 22px 18px",
                  boxShadow: "0 24px 60px rgba(0,0,0,0.55)",
                  fontFamily: "var(--c-font, 'Inter', sans-serif)",
                  color: "rgba(255,255,255,0.92)",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
                  <div style={{
                    width: 28, height: 28, borderRadius: 8,
                    background: "rgba(245,158,11,0.15)",
                    border: "1px solid rgba(245,158,11,0.35)",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    color: "#fbbf24", fontWeight: 700, fontSize: 14,
                  }}>!</div>
                  <div style={{ fontSize: 15, fontWeight: 600, letterSpacing: "-0.01em" }}>
                    Some panels are still empty
                  </div>
                </div>
                <div style={{ fontSize: 12, color: "rgba(255,255,255,0.5)", lineHeight: 1.55, marginBottom: 14 }}>
                  These sections look untouched. Tap any one to jump to it, or submit the entry as-is.
                </div>

                <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 16, maxHeight: 260, overflowY: "auto" }}>
                  {unfilledSections.map((u, i) => (
                    <button
                      key={i}
                      onClick={() => { setStep(u.step); setUnfilledSections(null); setSaved(false); }}
                      style={{
                        textAlign: "left",
                        padding: "10px 12px",
                        background: "rgba(255,255,255,0.035)",
                        border: "1px solid rgba(255,255,255,0.07)",
                        borderRadius: 9,
                        color: "rgba(255,255,255,0.85)",
                        fontFamily: "inherit",
                        fontSize: 13,
                        cursor: "pointer",
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        transition: "background 0.15s, border-color 0.15s",
                      }}
                      onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = "rgba(99,102,241,0.10)"; (e.currentTarget as HTMLButtonElement).style.borderColor = "rgba(99,102,241,0.35)"; }}
                      onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = "rgba(255,255,255,0.035)"; (e.currentTarget as HTMLButtonElement).style.borderColor = "rgba(255,255,255,0.07)"; }}
                    >
                      <span>{u.name}</span>
                      <span style={{ fontSize: 10, fontWeight: 600, letterSpacing: "0.08em", color: "rgba(255,255,255,0.4)", textTransform: "uppercase" }}>
                        Step {u.step} →
                      </span>
                    </button>
                  ))}
                </div>

                <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                  <button
                    onClick={() => setUnfilledSections(null)}
                    style={{
                      padding: "9px 14px",
                      background: "transparent",
                      border: "1px solid rgba(255,255,255,0.12)",
                      borderRadius: 8,
                      color: "rgba(255,255,255,0.75)",
                      fontFamily: "inherit",
                      fontSize: 12,
                      fontWeight: 500,
                      cursor: "pointer",
                    }}
                  >
                    Go back &amp; fill
                  </button>
                  <button
                    onClick={() => { setUnfilledSections(null); handleSave(true); }}
                    style={{
                      padding: "9px 14px",
                      background: "linear-gradient(135deg, #6366f1, #8b5cf6)",
                      border: "none",
                      borderRadius: 8,
                      color: "white",
                      fontFamily: "inherit",
                      fontSize: 12,
                      fontWeight: 600,
                      cursor: "pointer",
                    }}
                  >
                    Submit anyway
                  </button>
                </div>
              </div>
            </div>
          )}

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
            {step === 3 && (
              <Step3
                d={s3}
                set={setS3}
                direction={s2.direction}
                regimeTouchedRef={regimeTouchedRef}
                trendTouchedRef={trendTouchedRef}
              />
            )}
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
                : <button className="tj-btn primary" onClick={() => handleSave(false)} disabled={saving}>
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
