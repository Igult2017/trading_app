import { useState } from "react";

const styles = `
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

  :root {
    --ts-bg: #070b14;
    --ts-bg2: #0d1220;
    --ts-card: #111827;
    --ts-card2: #151e2e;
    --ts-border: #1e2d45;
    --ts-blue: #2d8cf0;
    --ts-blue-bright: #3d9fff;
    --ts-green: #00c896;
    --ts-red: #ef4444;
    --ts-gold: #f0a500;
    --ts-text: #e8edf5;
    --ts-muted: #8a99b3;
  }

  .ts-page {
    min-height: 100vh;
    background: var(--ts-bg);
    overflow-x: hidden;
    color: var(--ts-text);
    font-family: 'Poppins', sans-serif;
  }

  /* HERO */
  .ts-hero {
    display: grid;
    grid-template-columns: 1fr 1fr;
    align-items: center;
    gap: 48px;
    padding: 64px 48px 56px;
    max-width: 1200px;
    margin: 0 auto;
  }
  .ts-hero-badge {
    display: inline-flex; align-items: center; gap: 6px;
    background: rgba(45,140,240,0.12); border: 1px solid rgba(45,140,240,0.3);
    padding: 5px 12px;
    font-size: 0.75rem; color: var(--ts-blue); font-weight: 600;
    margin-bottom: 20px;
  }
  .ts-hero h1 {
    font-family: 'Montserrat', sans-serif;
    font-size: 3.5rem; font-weight: 800; line-height: 1.1;
    margin-bottom: 20px;
    background: linear-gradient(135deg, #fff 40%, var(--ts-blue));
    -webkit-background-clip: text; -webkit-text-fill-color: transparent;
  }
  .ts-hero p {
    font-size: 1.05rem; color: var(--ts-muted); line-height: 1.7;
    max-width: 440px; margin-bottom: 32px;
  }
  .ts-hero-actions { display: flex; gap: 14px; align-items: center; }
  .ts-btn-primary {
    background: var(--ts-blue); color: #fff;
    border: none;
    padding: 13px 28px; font-size: 1rem; font-weight: 600;
    cursor: pointer; transition: all 0.2s;
    display: flex; align-items: center; gap: 8px;
  }
  .ts-btn-primary:hover { background: var(--ts-blue-bright); transform: translateY(-1px); }
  .ts-btn-ghost {
    background: transparent; color: var(--ts-muted);
    border: 1px solid var(--ts-border);
    padding: 13px 24px; font-size: 1rem; font-weight: 500;
    cursor: pointer; transition: all 0.2s;
  }
  .ts-btn-ghost:hover { border-color: var(--ts-blue); color: var(--ts-text); }

  /* HERO DIAGRAM */
  .ts-hero-visual {
    background: var(--ts-bg2);
    border: 1px solid var(--ts-border);
    padding: 32px;
    position: relative;
    overflow: hidden;
  }
  .ts-hero-visual::before {
    content: '';
    position: absolute; inset: 0;
    background: radial-gradient(ellipse at 70% 30%, rgba(45,140,240,0.07) 0%, transparent 70%);
    pointer-events: none;
  }
  .ts-diagram { display: flex; flex-direction: column; align-items: center; gap: 0; }
  .ts-diagram-master {
    border: 2px solid var(--ts-blue);
    padding: 14px 20px; background: rgba(45,140,240,0.08);
    display: flex; align-items: center; gap: 12px;
    min-width: 220px;
  }
  .ts-diag-icon {
    width: 38px; height: 38px;
    background: rgba(45,140,240,0.2);
    display: flex; align-items: center; justify-content: center;
    font-size: 1.1rem;
  }
  .ts-diag-label { font-family: 'Montserrat', sans-serif; font-weight: 600; font-size: 0.9rem; }
  .ts-diag-id { font-size: 0.75rem; color: var(--ts-muted); }
  .ts-badge-master {
    background: var(--ts-blue); color: #fff;
    padding: 3px 10px;
    font-size: 0.72rem; font-weight: 700; margin-left: auto;
  }
  .ts-badge-slave {
    background: var(--ts-green); color: #000;
    padding: 3px 10px;
    font-size: 0.72rem; font-weight: 700; margin-left: auto;
  }

  .ts-connector { width: 260px; height: 70px; overflow: visible; }

  .ts-diagram-slaves { display: flex; gap: 20px; }
  .ts-diagram-slave {
    border: 2px solid var(--ts-green);
    padding: 14px 18px; background: rgba(0,200,150,0.06);
    display: flex; align-items: center; gap: 10px;
    min-width: 180px;
  }

  /* HOW IT WORKS */
  .ts-section { padding: 64px 48px; max-width: 1200px; margin: 0 auto; }
  .ts-section-header { text-align: center; margin-bottom: 48px; }
  .ts-section-title {
    font-family: 'Montserrat', sans-serif;
    font-size: 1.8rem; font-weight: 700;
    color: var(--ts-blue); margin-bottom: 10px;
  }
  .ts-section-sub { color: var(--ts-muted); font-size: 1rem; }

  .ts-steps { display: grid; grid-template-columns: repeat(4,1fr); gap: 20px; }
  .ts-step-card {
    background: var(--ts-card); border: 1px solid var(--ts-border);
    padding: 28px 22px;
    transition: border-color 0.2s, transform 0.2s;
  }
  .ts-step-card:hover { border-color: var(--ts-blue); transform: translateY(-3px); }
  .ts-step-num {
    width: 42px; height: 42px;
    background: var(--ts-blue); color: #fff;
    font-family: 'Montserrat', sans-serif; font-weight: 700; font-size: 1.1rem;
    display: flex; align-items: center; justify-content: center;
    margin-bottom: 18px;
  }
  .ts-step-title { font-weight: 600; font-size: 0.95rem; margin-bottom: 8px; }
  .ts-step-desc { color: var(--ts-muted); font-size: 0.85rem; line-height: 1.6; }

  /* PLATFORMS */
  .ts-platforms-section { padding: 64px 48px; background: var(--ts-bg2); }
  .ts-platforms-inner { max-width: 1200px; margin: 0 auto; }
  .ts-platforms-grid { display: grid; grid-template-columns: repeat(6,1fr); gap: 16px; margin-bottom: 16px; }
  .ts-platforms-grid-2 { display: grid; grid-template-columns: repeat(5,1fr); gap: 16px; max-width: 900px; margin: 0 auto; }
  .ts-platform-card {
    background: var(--ts-card); border: 1px solid var(--ts-border);
    padding: 20px 14px;
    text-align: center; transition: border-color 0.2s;
  }
  .ts-platform-card:hover { border-color: var(--ts-blue); }
  .ts-status-badge {
    display: inline-block;
    padding: 2px 8px; font-size: 0.68rem; font-weight: 700; margin-bottom: 14px;
  }
  .ts-status-available { background: rgba(0,200,150,0.15); color: var(--ts-green); border: 1px solid rgba(0,200,150,0.3); }
  .ts-status-soon { background: rgba(240,165,0,0.15); color: var(--ts-gold); border: 1px solid rgba(240,165,0,0.3); }
  .ts-platform-logo {
    width: 48px; height: 48px;
    background: var(--ts-card2); display: flex; align-items: center;
    justify-content: center; font-size: 1.4rem; margin: 0 auto 10px;
  }
  .ts-platform-name { font-weight: 600; font-size: 0.85rem; margin-bottom: 12px; }
  .ts-vote-row { display: flex; align-items: center; gap: 8px; justify-content: center; }
  .ts-vote-btn {
    display: flex; align-items: center; gap: 5px;
    background: var(--ts-blue); color: #fff;
    border: none; padding: 5px 12px;
    font-size: 0.75rem; font-weight: 600; cursor: pointer; transition: background 0.2s;
  }
  .ts-vote-btn:hover { background: var(--ts-blue-bright); }
  .ts-vote-btn.unvote { background: rgba(45,140,240,0.2); color: var(--ts-blue); }
  .ts-vote-btn.unvote:hover { background: rgba(45,140,240,0.35); }
  .ts-vote-count { font-size: 0.8rem; color: var(--ts-muted); font-weight: 500; }

  /* FEATURES + PRICING */
  .ts-fp-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 56px; align-items: start; }
  .ts-features-title {
    font-family: 'Montserrat', sans-serif; font-weight: 700;
    font-size: 0.9rem; color: var(--ts-blue);
    display: flex; align-items: center; gap: 8px; margin-bottom: 6px;
  }
  .ts-features-sub { color: var(--ts-muted); font-size: 0.85rem; margin-bottom: 32px; }
  .ts-feature-item { display: flex; gap: 16px; margin-bottom: 24px; }
  .ts-feat-icon {
    width: 44px; height: 44px;
    background: var(--ts-card2); display: flex; align-items: center;
    justify-content: center; font-size: 1.2rem; flex-shrink: 0;
    border: 1px solid var(--ts-border);
  }
  .ts-feat-title { font-weight: 600; font-size: 0.9rem; margin-bottom: 4px; }
  .ts-feat-desc { color: var(--ts-muted); font-size: 0.82rem; line-height: 1.6; }

  /* PRICING */
  .ts-pricing-card {
    background: var(--ts-card); border: 2px solid var(--ts-blue);
    padding: 28px;
  }
  .ts-price-toggle {
    display: flex; background: var(--ts-card2);
    padding: 4px; margin-bottom: 24px;
  }
  .ts-toggle-btn {
    flex: 1; padding: 8px; border: none;
    font-size: 0.875rem; font-weight: 600; cursor: pointer;
    transition: all 0.2s; background: transparent; color: var(--ts-muted);
  }
  .ts-toggle-btn.active { background: var(--ts-blue); color: #fff; }
  .ts-price-label { font-size: 0.78rem; color: var(--ts-muted); margin-bottom: 6px; }
  .ts-price-amount {
    font-family: 'Montserrat', sans-serif; font-weight: 800;
    font-size: 2.4rem; color: var(--ts-text); margin-bottom: 4px;
  }
  .ts-price-amount span { font-size: 0.9rem; font-weight: 400; color: var(--ts-muted); }
  .ts-price-original {
    font-size: 0.85rem; color: var(--ts-muted); text-decoration: line-through;
    display: inline-block; margin-right: 8px;
  }
  .ts-price-limited { color: var(--ts-blue); font-size: 0.8rem; font-weight: 600; }
  .ts-price-note { font-size: 0.82rem; color: var(--ts-muted); margin-top: 10px; margin-bottom: 24px; }
  .ts-checkout-card {
    background: var(--ts-card2);
    padding: 22px; margin-top: 20px;
  }
  .ts-checkout-title {
    font-family: 'Montserrat', sans-serif; font-weight: 700;
    font-size: 0.9rem; display: flex; align-items: center; gap: 8px;
    margin-bottom: 8px;
  }
  .ts-checkout-sub { color: var(--ts-muted); font-size: 0.82rem; margin-bottom: 16px; }
  .ts-btn-start {
    width: 100%; background: var(--ts-card); color: var(--ts-muted);
    border: 1px solid var(--ts-border);
    padding: 13px; font-size: 0.95rem; font-weight: 600;
    cursor: pointer; transition: all 0.2s;
  }
  .ts-btn-start:hover { background: var(--ts-blue); color: #fff; border-color: var(--ts-blue); }

  /* FAQ */
  .ts-faq-section { padding: 72px 48px; }
  .ts-faq-inner { max-width: 760px; margin: 0 auto; }
  .ts-faq-item {
    border: 1px solid var(--ts-border);
    margin-bottom: 10px; overflow: hidden;
    transition: border-color 0.2s;
  }
  .ts-faq-item.open { border-color: var(--ts-blue); }
  .ts-faq-q {
    width: 100%; background: var(--ts-card); color: var(--ts-text);
    border: none; text-align: left; padding: 18px 20px;
    font-size: 0.9rem; font-weight: 600; cursor: pointer;
    display: flex; justify-content: space-between; align-items: center;
    font-family: 'Poppins', sans-serif;
  }
  .ts-faq-chevron { transition: transform 0.25s; font-size: 0.8rem; color: var(--ts-muted); }
  .ts-faq-item.open .ts-faq-chevron { transform: rotate(180deg); }
  .ts-faq-a {
    background: var(--ts-card2); padding: 0 20px;
    color: var(--ts-muted); font-size: 0.875rem; line-height: 1.7;
    max-height: 0; overflow: hidden; transition: max-height 0.3s ease, padding 0.3s;
  }
  .ts-faq-item.open .ts-faq-a { max-height: 200px; padding: 14px 20px; }

  /* ===== COPIER UI ===== */
  .cp-wrap {
    min-height: 100vh;
    background: var(--ts-bg);
    color: var(--ts-text);
    font-family: 'Poppins', sans-serif;
    display: flex;
    flex-direction: column;
  }

  /* Top bar */
  .cp-topbar {
    background: var(--ts-bg2);
    border-bottom: 1px solid var(--ts-border);
    padding: 0 32px;
    display: flex;
    align-items: center;
    gap: 0;
    height: 56px;
    flex-shrink: 0;
  }
  .cp-topbar-logo {
    font-family: 'Montserrat', sans-serif;
    font-weight: 800;
    font-size: 1rem;
    color: var(--ts-blue);
    display: flex; align-items: center; gap: 8px;
    margin-right: 40px;
  }
  .cp-topbar-logo span { color: var(--ts-text); }
  .cp-tabs { display: flex; gap: 0; flex: 1; height: 100%; }
  .cp-tab {
    padding: 0 20px;
    height: 100%;
    background: transparent;
    border: none;
    border-bottom: 2px solid transparent;
    color: var(--ts-muted);
    font-size: 0.85rem;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.2s;
    font-family: 'Poppins', sans-serif;
    display: flex; align-items: center; gap: 7px;
  }
  .cp-tab:hover { color: var(--ts-text); }
  .cp-tab.active { color: var(--ts-blue); border-bottom-color: var(--ts-blue); }
  .cp-topbar-back {
    background: transparent;
    border: 1px solid var(--ts-border);
    color: var(--ts-muted);
    padding: 7px 16px;
    font-size: 0.8rem;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.2s;
    font-family: 'Poppins', sans-serif;
    display: flex; align-items: center; gap: 6px;
  }
  .cp-topbar-back:hover { border-color: var(--ts-blue); color: var(--ts-text); }

  /* Status bar */
  .cp-statusbar {
    background: rgba(45,140,240,0.06);
    border-bottom: 1px solid rgba(45,140,240,0.15);
    padding: 10px 32px;
    display: flex; align-items: center; gap: 32px;
  }
  .cp-stat {
    display: flex; align-items: center; gap: 8px;
    font-size: 0.8rem;
  }
  .cp-stat-dot {
    width: 8px; height: 8px; border-radius: 50%;
    background: var(--ts-green);
    box-shadow: 0 0 6px var(--ts-green);
    animation: cp-pulse 2s infinite;
  }
  .cp-stat-dot.inactive { background: var(--ts-muted); box-shadow: none; animation: none; }
  @keyframes cp-pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.4; }
  }
  .cp-stat-label { color: var(--ts-muted); }
  .cp-stat-val { font-weight: 700; color: var(--ts-text); }
  .cp-stat-val.green { color: var(--ts-green); }
  .cp-stat-val.red { color: var(--ts-red); }
  .cp-stat-sep { width: 1px; height: 20px; background: var(--ts-border); }

  /* Main layout */
  .cp-body {
    display: grid;
    grid-template-columns: 280px 1fr;
    flex: 1;
    min-height: 0;
    overflow: hidden;
  }

  /* Sidebar */
  .cp-sidebar {
    background: var(--ts-bg2);
    border-right: 1px solid var(--ts-border);
    overflow-y: auto;
    padding: 24px 0;
  }
  .cp-sidebar-section { margin-bottom: 28px; }
  .cp-sidebar-label {
    font-size: 0.68rem;
    font-weight: 700;
    color: var(--ts-muted);
    letter-spacing: 0.1em;
    text-transform: uppercase;
    padding: 0 20px;
    margin-bottom: 10px;
  }

  /* Master account card in sidebar */
  .cp-master-card {
    margin: 0 12px 10px;
    background: rgba(45,140,240,0.08);
    border: 1px solid rgba(45,140,240,0.25);
    padding: 14px 16px;
    cursor: pointer;
    transition: border-color 0.2s, background 0.2s;
    position: relative;
  }
  .cp-master-card:hover, .cp-master-card.selected {
    border-color: var(--ts-blue);
    background: rgba(45,140,240,0.14);
  }
  .cp-master-card-top { display: flex; align-items: center; gap: 10px; margin-bottom: 10px; }
  .cp-acct-avatar {
    width: 34px; height: 34px;
    background: rgba(45,140,240,0.2);
    border: 1px solid rgba(45,140,240,0.4);
    display: flex; align-items: center; justify-content: center;
    font-size: 0.85rem; font-weight: 700; color: var(--ts-blue);
    flex-shrink: 0;
  }
  .cp-acct-avatar.slave-avatar {
    background: rgba(0,200,150,0.15);
    border-color: rgba(0,200,150,0.35);
    color: var(--ts-green);
  }
  .cp-acct-name { font-weight: 600; font-size: 0.85rem; line-height: 1.2; }
  .cp-acct-id { font-size: 0.72rem; color: var(--ts-muted); }
  .cp-acct-badge {
    margin-left: auto;
    padding: 2px 8px;
    font-size: 0.65rem; font-weight: 700;
    background: var(--ts-blue); color: #fff;
    flex-shrink: 0;
  }
  .cp-acct-badge.slave { background: var(--ts-green); color: #000; }
  .cp-master-stats { display: flex; gap: 12px; }
  .cp-ms-item { flex: 1; }
  .cp-ms-lbl { font-size: 0.65rem; color: var(--ts-muted); margin-bottom: 2px; }
  .cp-ms-val { font-size: 0.8rem; font-weight: 700; }
  .cp-ms-val.green { color: var(--ts-green); }
  .cp-ms-val.red { color: var(--ts-red); }
  .cp-master-status {
    position: absolute;
    top: 10px; right: 10px;
    width: 7px; height: 7px; border-radius: 50%;
    background: var(--ts-green);
    box-shadow: 0 0 5px var(--ts-green);
  }

  /* Slave cards in sidebar */
  .cp-slave-item {
    margin: 0 12px 6px;
    background: var(--ts-card);
    border: 1px solid var(--ts-border);
    padding: 12px 14px;
    cursor: pointer;
    transition: border-color 0.2s;
    display: flex; align-items: center; gap: 10px;
  }
  .cp-slave-item:hover, .cp-slave-item.selected { border-color: var(--ts-green); }
  .cp-slave-info { flex: 1; min-width: 0; }
  .cp-slave-name { font-size: 0.82rem; font-weight: 600; }
  .cp-slave-id { font-size: 0.7rem; color: var(--ts-muted); }
  .cp-slave-mult {
    font-size: 0.72rem; font-weight: 700;
    background: rgba(45,140,240,0.15);
    color: var(--ts-blue);
    padding: 2px 7px;
    border: 1px solid rgba(45,140,240,0.25);
  }
  .cp-slave-status-dot {
    width: 7px; height: 7px; border-radius: 50%;
    background: var(--ts-green);
    flex-shrink: 0;
  }
  .cp-slave-status-dot.paused { background: var(--ts-gold); }

  .cp-add-btn {
    display: flex; align-items: center; gap: 8px;
    margin: 0 12px;
    padding: 10px 14px;
    background: transparent;
    border: 1px dashed var(--ts-border);
    color: var(--ts-muted);
    font-size: 0.8rem; font-weight: 600;
    cursor: pointer; transition: all 0.2s;
    width: calc(100% - 24px);
    font-family: 'Poppins', sans-serif;
  }
  .cp-add-btn:hover { border-color: var(--ts-blue); color: var(--ts-blue); }

  /* Main content */
  .cp-main {
    overflow-y: auto;
    padding: 28px 32px;
    background: var(--ts-bg);
  }

  /* Panel header */
  .cp-panel-header {
    display: flex; align-items: center; justify-content: space-between;
    margin-bottom: 24px;
  }
  .cp-panel-title {
    font-family: 'Montserrat', sans-serif;
    font-size: 1.2rem; font-weight: 700;
    display: flex; align-items: center; gap: 10px;
  }
  .cp-panel-subtitle { color: var(--ts-muted); font-size: 0.82rem; margin-top: 3px; }
  .cp-header-actions { display: flex; gap: 10px; }
  .cp-btn-sm {
    padding: 8px 16px;
    font-size: 0.8rem; font-weight: 600;
    border: none; cursor: pointer;
    transition: all 0.2s;
    font-family: 'Poppins', sans-serif;
    display: flex; align-items: center; gap: 6px;
  }
  .cp-btn-sm.primary { background: var(--ts-blue); color: #fff; }
  .cp-btn-sm.primary:hover { background: var(--ts-blue-bright); }
  .cp-btn-sm.ghost { background: transparent; border: 1px solid var(--ts-border); color: var(--ts-muted); }
  .cp-btn-sm.ghost:hover { border-color: var(--ts-blue); color: var(--ts-text); }
  .cp-btn-sm.danger { background: rgba(239,68,68,0.1); border: 1px solid rgba(239,68,68,0.25); color: var(--ts-red); }
  .cp-btn-sm.danger:hover { background: rgba(239,68,68,0.2); }

  /* Stats row */
  .cp-stats-row {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 16px;
    margin-bottom: 24px;
  }
  .cp-stat-card {
    background: var(--ts-card);
    border: 1px solid var(--ts-border);
    padding: 18px 20px;
    transition: border-color 0.2s;
  }
  .cp-stat-card:hover { border-color: rgba(45,140,240,0.4); }
  .cp-sc-label { font-size: 0.72rem; color: var(--ts-muted); margin-bottom: 8px; text-transform: uppercase; letter-spacing: 0.05em; }
  .cp-sc-value {
    font-family: 'Montserrat', sans-serif;
    font-size: 1.6rem; font-weight: 800;
    line-height: 1;
    margin-bottom: 6px;
  }
  .cp-sc-value.green { color: var(--ts-green); }
  .cp-sc-value.red { color: var(--ts-red); }
  .cp-sc-value.blue { color: var(--ts-blue); }
  .cp-sc-sub { font-size: 0.72rem; color: var(--ts-muted); }

  /* Connection diagram */
  .cp-diagram-section {
    background: var(--ts-card);
    border: 1px solid var(--ts-border);
    padding: 24px;
    margin-bottom: 24px;
  }
  .cp-diagram-title {
    font-size: 0.8rem; font-weight: 700;
    color: var(--ts-muted); text-transform: uppercase; letter-spacing: 0.08em;
    margin-bottom: 24px; display: flex; align-items: center; gap: 8px;
  }
  .cp-diagram-inner {
    display: flex;
    align-items: flex-start;
    gap: 0;
    overflow-x: auto;
    padding-bottom: 8px;
  }
  .cp-diag-master {
    background: rgba(45,140,240,0.08);
    border: 2px solid var(--ts-blue);
    padding: 16px 20px;
    min-width: 200px;
    flex-shrink: 0;
    position: relative;
  }
  .cp-diag-master-top { display: flex; align-items: center; gap: 10px; margin-bottom: 14px; }
  .cp-diag-acct-icon {
    width: 36px; height: 36px;
    background: rgba(45,140,240,0.2);
    display: flex; align-items: center; justify-content: center;
    font-size: 1rem;
  }
  .cp-diag-acct-name { font-weight: 700; font-size: 0.88rem; }
  .cp-diag-acct-id { font-size: 0.7rem; color: var(--ts-muted); }
  .cp-diag-badge {
    padding: 2px 9px;
    font-size: 0.65rem; font-weight: 800;
    letter-spacing: 0.05em;
  }
  .cp-diag-badge.master { background: var(--ts-blue); color: #fff; }
  .cp-diag-badge.slave { background: var(--ts-green); color: #000; }
  .cp-diag-row { display: flex; align-items: center; gap: 6px; margin-bottom: 6px; }
  .cp-diag-row:last-child { margin-bottom: 0; }
  .cp-diag-row-lbl { font-size: 0.7rem; color: var(--ts-muted); min-width: 50px; }
  .cp-diag-row-val { font-size: 0.75rem; font-weight: 600; }
  .cp-diag-row-val.green { color: var(--ts-green); }
  .cp-diag-row-val.red { color: var(--ts-red); }

  .cp-diag-lines {
    display: flex;
    align-items: center;
    flex-direction: column;
    justify-content: center;
    padding: 0 4px;
    align-self: stretch;
    flex-shrink: 0;
  }
  .cp-diag-conn-wrap {
    display: flex;
    flex-direction: column;
    gap: 12px;
    padding-top: 20px;
  }
  .cp-diag-conn-row {
    display: flex;
    align-items: center;
    gap: 0;
  }
  .cp-diag-arrow {
    display: flex; align-items: center;
  }
  .cp-diag-arrow-line {
    width: 48px; height: 2px;
    background: linear-gradient(90deg, var(--ts-blue), rgba(45,140,240,0.3));
    position: relative;
  }
  .cp-diag-arrow-head {
    width: 0; height: 0;
    border-top: 5px solid transparent;
    border-bottom: 5px solid transparent;
    border-left: 8px solid rgba(45,140,240,0.3);
    flex-shrink: 0;
  }
  .cp-diag-mult-badge {
    font-size: 0.65rem; font-weight: 700;
    color: var(--ts-blue);
    background: rgba(45,140,240,0.1);
    border: 1px solid rgba(45,140,240,0.2);
    padding: 1px 6px;
    margin: 0 8px;
    white-space: nowrap;
  }
  .cp-diag-slave {
    background: rgba(0,200,150,0.06);
    border: 1px solid rgba(0,200,150,0.3);
    padding: 14px 18px;
    min-width: 180px;
    flex-shrink: 0;
  }
  .cp-diag-slave-top { display: flex; align-items: center; gap: 8px; margin-bottom: 10px; }
  .cp-diag-slave-icon {
    width: 30px; height: 30px;
    background: rgba(0,200,150,0.15);
    display: flex; align-items: center; justify-content: center;
    font-size: 0.85rem;
  }

  /* Slave table */
  .cp-slave-table-wrap {
    background: var(--ts-card);
    border: 1px solid var(--ts-border);
    margin-bottom: 24px;
    overflow: hidden;
  }
  .cp-table-header {
    display: flex; align-items: center; justify-content: space-between;
    padding: 16px 20px;
    border-bottom: 1px solid var(--ts-border);
  }
  .cp-table-title {
    font-size: 0.85rem; font-weight: 700;
    display: flex; align-items: center; gap: 8px;
  }
  .cp-count-badge {
    background: rgba(45,140,240,0.15);
    color: var(--ts-blue);
    font-size: 0.7rem; font-weight: 700;
    padding: 1px 8px;
  }
  table.cp-table { width: 100%; border-collapse: collapse; }
  .cp-table th {
    font-size: 0.7rem; font-weight: 700; color: var(--ts-muted);
    text-transform: uppercase; letter-spacing: 0.07em;
    padding: 12px 20px; text-align: left;
    border-bottom: 1px solid var(--ts-border);
    background: var(--ts-card2);
  }
  .cp-table td {
    padding: 14px 20px;
    font-size: 0.83rem;
    border-bottom: 1px solid rgba(30,45,69,0.5);
    vertical-align: middle;
  }
  .cp-table tr:last-child td { border-bottom: none; }
  .cp-table tr:hover td { background: rgba(45,140,240,0.04); }
  .cp-acct-cell { display: flex; align-items: center; gap: 10px; }
  .cp-cell-avatar {
    width: 30px; height: 30px;
    background: rgba(0,200,150,0.15);
    border: 1px solid rgba(0,200,150,0.3);
    display: flex; align-items: center; justify-content: center;
    font-size: 0.75rem; font-weight: 700; color: var(--ts-green);
    flex-shrink: 0;
  }
  .cp-cell-name { font-weight: 600; font-size: 0.83rem; }
  .cp-cell-id { font-size: 0.7rem; color: var(--ts-muted); }
  .cp-pill {
    display: inline-flex; align-items: center; gap: 5px;
    padding: 3px 10px; font-size: 0.72rem; font-weight: 700;
  }
  .cp-pill.active { background: rgba(0,200,150,0.12); color: var(--ts-green); border: 1px solid rgba(0,200,150,0.25); }
  .cp-pill.paused { background: rgba(240,165,0,0.12); color: var(--ts-gold); border: 1px solid rgba(240,165,0,0.25); }
  .cp-pill.dot::before {
    content: '';
    display: inline-block; width: 6px; height: 6px; border-radius: 50%;
    background: currentColor;
  }
  .cp-mult-input {
    background: var(--ts-card2);
    border: 1px solid var(--ts-border);
    color: var(--ts-text);
    padding: 5px 10px;
    font-size: 0.82rem; font-weight: 600;
    width: 70px;
    text-align: center;
    outline: none;
    font-family: 'Poppins', sans-serif;
  }
  .cp-mult-input:focus { border-color: var(--ts-blue); }
  .cp-row-actions { display: flex; gap: 6px; }
  .cp-icon-btn {
    width: 28px; height: 28px;
    background: var(--ts-card2);
    border: 1px solid var(--ts-border);
    color: var(--ts-muted);
    display: flex; align-items: center; justify-content: center;
    font-size: 0.8rem;
    cursor: pointer; transition: all 0.2s;
  }
  .cp-icon-btn:hover { border-color: var(--ts-blue); color: var(--ts-blue); }
  .cp-icon-btn.red:hover { border-color: var(--ts-red); color: var(--ts-red); }

  /* Activity feed */
  .cp-activity {
    background: var(--ts-card);
    border: 1px solid var(--ts-border);
    margin-bottom: 24px;
  }
  .cp-activity-list { max-height: 280px; overflow-y: auto; }
  .cp-activity-item {
    display: flex; align-items: flex-start; gap: 14px;
    padding: 14px 20px;
    border-bottom: 1px solid rgba(30,45,69,0.5);
    transition: background 0.15s;
  }
  .cp-activity-item:last-child { border-bottom: none; }
  .cp-activity-item:hover { background: rgba(45,140,240,0.03); }
  .cp-act-icon {
    width: 32px; height: 32px;
    border-radius: 50%;
    display: flex; align-items: center; justify-content: center;
    font-size: 0.85rem;
    flex-shrink: 0;
    margin-top: 1px;
  }
  .cp-act-icon.buy { background: rgba(0,200,150,0.15); }
  .cp-act-icon.sell { background: rgba(239,68,68,0.12); }
  .cp-act-icon.info { background: rgba(45,140,240,0.12); }
  .cp-act-body { flex: 1; min-width: 0; }
  .cp-act-title { font-size: 0.83rem; font-weight: 600; margin-bottom: 2px; }
  .cp-act-sub { font-size: 0.72rem; color: var(--ts-muted); }
  .cp-act-time { font-size: 0.7rem; color: var(--ts-muted); white-space: nowrap; flex-shrink: 0; margin-top: 3px; }
  .cp-act-pnl { font-size: 0.8rem; font-weight: 700; white-space: nowrap; flex-shrink: 0; }
  .cp-act-pnl.green { color: var(--ts-green); }
  .cp-act-pnl.red { color: var(--ts-red); }

  /* Settings panel */
  .cp-settings-section {
    background: var(--ts-card);
    border: 1px solid var(--ts-border);
    padding: 24px;
    margin-bottom: 20px;
  }
  .cp-settings-title {
    font-size: 0.8rem; font-weight: 700; color: var(--ts-muted);
    text-transform: uppercase; letter-spacing: 0.08em;
    margin-bottom: 20px; display: flex; align-items: center; gap: 8px;
  }
  .cp-form-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
  .cp-form-group { display: flex; flex-direction: column; gap: 6px; }
  .cp-form-group.full { grid-column: 1 / -1; }
  .cp-form-label { font-size: 0.75rem; font-weight: 600; color: var(--ts-muted); }
  .cp-form-input, .cp-form-select {
    background: var(--ts-card2);
    border: 1px solid var(--ts-border);
    color: var(--ts-text);
    padding: 9px 12px;
    font-size: 0.85rem;
    outline: none;
    font-family: 'Poppins', sans-serif;
    transition: border-color 0.2s;
  }
  .cp-form-input:focus, .cp-form-select:focus { border-color: var(--ts-blue); }
  .cp-form-select option { background: var(--ts-card2); }
  .cp-toggle-row {
    display: flex; align-items: center; justify-content: space-between;
    padding: 12px 0;
    border-bottom: 1px solid rgba(30,45,69,0.5);
  }
  .cp-toggle-row:last-child { border-bottom: none; }
  .cp-toggle-info { flex: 1; }
  .cp-toggle-title { font-size: 0.85rem; font-weight: 600; margin-bottom: 2px; }
  .cp-toggle-desc { font-size: 0.75rem; color: var(--ts-muted); }
  .cp-toggle {
    position: relative; width: 40px; height: 22px;
    cursor: pointer; flex-shrink: 0;
  }
  .cp-toggle input { opacity: 0; width: 0; height: 0; }
  .cp-toggle-slider {
    position: absolute; inset: 0;
    background: var(--ts-card2);
    border: 1px solid var(--ts-border);
    border-radius: 22px;
    transition: 0.25s;
  }
  .cp-toggle-slider::before {
    content: '';
    position: absolute;
    left: 3px; top: 2px;
    width: 16px; height: 16px;
    background: var(--ts-muted);
    border-radius: 50%;
    transition: 0.25s;
  }
  .cp-toggle input:checked + .cp-toggle-slider { background: rgba(45,140,240,0.2); border-color: var(--ts-blue); }
  .cp-toggle input:checked + .cp-toggle-slider::before { background: var(--ts-blue); transform: translateX(18px); }

  /* Add account modal */
  .cp-modal-overlay {
    position: fixed; inset: 0;
    background: rgba(0,0,0,0.7);
    z-index: 1000;
    display: flex; align-items: center; justify-content: center;
    padding: 20px;
  }
  .cp-modal {
    background: var(--ts-card);
    border: 1px solid var(--ts-border);
    width: 100%; max-width: 500px;
    position: relative;
    animation: cp-modal-in 0.2s ease;
  }
  @keyframes cp-modal-in {
    from { opacity: 0; transform: scale(0.96) translateY(8px); }
    to { opacity: 1; transform: none; }
  }
  .cp-modal-header {
    display: flex; align-items: center; justify-content: space-between;
    padding: 20px 24px;
    border-bottom: 1px solid var(--ts-border);
  }
  .cp-modal-title {
    font-family: 'Montserrat', sans-serif;
    font-weight: 700; font-size: 1rem;
    display: flex; align-items: center; gap: 10px;
  }
  .cp-modal-close {
    background: transparent; border: none;
    color: var(--ts-muted); font-size: 1.2rem;
    cursor: pointer; transition: color 0.2s; line-height: 1;
  }
  .cp-modal-close:hover { color: var(--ts-text); }
  .cp-modal-body { padding: 24px; }
  .cp-modal-footer {
    display: flex; gap: 10px; justify-content: flex-end;
    padding: 16px 24px;
    border-top: 1px solid var(--ts-border);
  }
  .cp-type-select-row { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 20px; }
  .cp-type-card {
    border: 2px solid var(--ts-border);
    padding: 16px; cursor: pointer; transition: all 0.2s;
    text-align: center;
  }
  .cp-type-card:hover { border-color: rgba(45,140,240,0.5); }
  .cp-type-card.selected-master { border-color: var(--ts-blue); background: rgba(45,140,240,0.08); }
  .cp-type-card.selected-slave { border-color: var(--ts-green); background: rgba(0,200,150,0.06); }
  .cp-type-icon { font-size: 1.6rem; margin-bottom: 8px; }
  .cp-type-name { font-weight: 700; font-size: 0.88rem; margin-bottom: 4px; }
  .cp-type-desc { font-size: 0.75rem; color: var(--ts-muted); }

  /* Empty state */
  .cp-empty {
    display: flex; flex-direction: column; align-items: center;
    justify-content: center; text-align: center;
    padding: 60px 20px;
    color: var(--ts-muted);
  }
  .cp-empty-icon { font-size: 2.5rem; margin-bottom: 16px; opacity: 0.5; }
  .cp-empty-title { font-size: 0.95rem; font-weight: 600; margin-bottom: 6px; color: var(--ts-text); }
  .cp-empty-sub { font-size: 0.82rem; max-width: 260px; line-height: 1.6; }

  @media (max-width: 900px) {
    .ts-hero { grid-template-columns: 1fr; padding: 40px 20px 36px; }
    .ts-steps { grid-template-columns: 1fr 1fr; }
    .ts-platforms-grid { grid-template-columns: repeat(3,1fr); }
    .ts-fp-grid { grid-template-columns: 1fr; }
    .ts-section { padding: 48px 20px; }
    .ts-platforms-section { padding: 48px 20px; }
    .ts-faq-section { padding: 48px 20px; }
    .cp-body { grid-template-columns: 1fr; }
    .cp-sidebar { display: none; }
    .cp-stats-row { grid-template-columns: 1fr 1fr; }
    .cp-form-grid { grid-template-columns: 1fr; }
  }
`;

const platformsRow1 = [
  { name: "MT5", icon: "5️⃣", status: "available", votes: 2061, voted: true },
  { name: "MT4", icon: "4️⃣", status: "available", votes: 419, voted: true },
  { name: "MatchTrader", icon: "🔗", status: "available", votes: 182, voted: false },
  { name: "Bitunix", icon: "🟢", status: "soon", votes: 19, voted: false },
  { name: "DXTrade", icon: "DX", status: "soon", votes: 85, voted: false },
  { name: "cTrader", icon: "🔴", status: "soon", votes: 370, voted: false },
];

const platformsRow2 = [
  { name: "TradeLocker", icon: "🔒", status: "soon", votes: 289, voted: false },
  { name: "Binance", icon: "🔶", status: "soon", votes: 170, voted: false },
  { name: "Tradovate", icon: "💎", status: "soon", votes: 231, voted: false },
  { name: "NinjaTrader", icon: "🥷", status: "soon", votes: 124, voted: false },
  { name: "ProjectX", icon: "✖", status: "soon", votes: 88, voted: false },
];

const features = [
  { icon: "⚡", title: "Instant Trade Mirroring", desc: "Trades copied with extremely low latency. Never miss a market move." },
  { icon: "🔔", title: "Telegram Notifications", desc: "Get notified via Telegram or email whenever a trading event occurs." },
  { icon: "☁️", title: "Cloud-Based Copying", desc: "No need to install any software on your computer. All copying is done in the cloud." },
  { icon: "⚖️", title: "Flexible Risk Allocation", desc: "Customize risk scaling per slave account, adjust on the fly." },
  { icon: "🎯", title: "Priority Support & Onboarding", desc: "Get one-on-one onboarding & dedicated troubleshooting." },
];

const faqs = [
  { q: "Does Sync Trade trade for me?", a: "No. Sync Trade is a copy trading tool that mirrors your own trades from a master account to one or more slave accounts. You remain in full control of all trading decisions." },
  { q: "Is this for accounts I own?", a: "Yes. Trade Sync is designed for traders who manage multiple accounts of their own. You must have authorized access to all accounts you connect to the platform." },
  { q: "Which platforms are supported?", a: "Currently MT4 and MT5 are fully supported. MatchTrader is also available. More platforms including cTrader, Binance, TradeLocker, and others are coming soon — you can vote for your favorites." },
  { q: "Do you provide signals or advice?", a: "No. Trade Sync does not provide trading signals, advice, or recommendations. It solely syncs trades between accounts you control." },
  { q: "How are my credentials handled?", a: "Your account credentials are encrypted and stored securely. We use industry-standard encryption and never share your data with third parties." },
  { q: "Are alerts available?", a: "Yes! You can receive real-time alerts via Telegram or email whenever a trade is copied, modified, or closed across your accounts." },
];

type AccountType = "master" | "slave";
interface Account {
  id: string;
  name: string;
  login: string;
  broker: string;
  platform: string;
  type: AccountType;
  balance: number;
  equity: number;
  pnl: number;
  pnlPct: number;
  multiplier: number;
  status: "active" | "paused";
  trades: number;
}

const defaultMaster: Account = {
  id: "m1", name: "Master Account 1", login: "1000001",
  broker: "IC Markets", platform: "MT5", type: "master",
  balance: 25000, equity: 25480, pnl: 480, pnlPct: 1.92,
  multiplier: 1, status: "active", trades: 14,
};
const defaultSlaves: Account[] = [
  {
    id: "s1", name: "Slave Account 5", login: "1000005",
    broker: "IC Markets", platform: "MT5", type: "slave",
    balance: 10000, equity: 10192, pnl: 192, pnlPct: 1.92,
    multiplier: 1, status: "active", trades: 14,
  },
  {
    id: "s2", name: "Slave Account 6", login: "1000006",
    broker: "Pepperstone", platform: "MT4", type: "slave",
    balance: 5000, equity: 5096, pnl: 96, pnlPct: 1.92,
    multiplier: 0.5, status: "active", trades: 14,
  },
];

const activityFeed = [
  { type: "buy", symbol: "EUR/USD", action: "BUY copied", detail: "0.50 lot → 3 accounts", time: "2 min ago", pnl: "+$42.00" },
  { type: "sell", symbol: "GBP/USD", action: "SELL copied", detail: "0.30 lot → 3 accounts", time: "15 min ago", pnl: "-$18.50" },
  { type: "buy", symbol: "XAU/USD", action: "BUY closed", detail: "0.10 lot → 3 accounts", time: "1 hr ago", pnl: "+$125.00" },
  { type: "info", symbol: "System", action: "Connection established", detail: "Master Account 1 connected", time: "2 hr ago", pnl: "" },
  { type: "sell", symbol: "USD/JPY", action: "SELL copied", detail: "0.20 lot → 3 accounts", time: "3 hr ago", pnl: "+$67.20" },
  { type: "buy", symbol: "EUR/GBP", action: "BUY copied", detail: "0.15 lot → 3 accounts", time: "5 hr ago", pnl: "-$12.00" },
];

type CopierTab = "dashboard" | "accounts" | "settings";

function CopierUI({ onBack }: { onBack: () => void }) {
  const [activeTab, setActiveTab] = useState<CopierTab>("dashboard");
  const [master] = useState<Account>(defaultMaster);
  const [slaves, setSlaves] = useState<Account[]>(defaultSlaves);
  const [selectedAccount, setSelectedAccount] = useState<string>(master.id);
  const [showModal, setShowModal] = useState(false);
  const [modalType, setModalType] = useState<AccountType>("slave");
  const [newAcct, setNewAcct] = useState({ name: "", login: "", broker: "", platform: "MT5", server: "", password: "" });
  const [settings, setSettings] = useState({
    copyMode: "fixed-lot",
    defaultMultiplier: "1.0",
    maxLot: "5.0",
    slippage: "3",
    reverseMode: false,
    copyPending: true,
    copySL: true,
    copyTP: true,
    closeMirror: true,
    telegramAlerts: false,
  });

  const toggleSlaveStatus = (id: string) => {
    setSlaves(prev => prev.map(s =>
      s.id === id ? { ...s, status: s.status === "active" ? "paused" : "active" } : s
    ));
  };
  const updateMultiplier = (id: string, val: string) => {
    setSlaves(prev => prev.map(s =>
      s.id === id ? { ...s, multiplier: parseFloat(val) || 1 } : s
    ));
  };
  const removeSlave = (id: string) => {
    setSlaves(prev => prev.filter(s => s.id !== id));
  };
  const addAccount = () => {
    if (!newAcct.login || !newAcct.broker) return;
    const id = `s${Date.now()}`;
    const acct: Account = {
      id, name: newAcct.name || `Account ${newAcct.login}`,
      login: newAcct.login, broker: newAcct.broker,
      platform: newAcct.platform as any, type: modalType,
      balance: 0, equity: 0, pnl: 0, pnlPct: 0,
      multiplier: 1, status: "active", trades: 0,
    };
    if (modalType === "slave") setSlaves(prev => [...prev, acct]);
    setNewAcct({ name: "", login: "", broker: "", platform: "MT5", server: "", password: "" });
    setShowModal(false);
  };

  const totalEquity = master.equity + slaves.reduce((a, s) => a + s.equity, 0);
  const totalPnl = master.pnl + slaves.reduce((a, s) => a + s.pnl, 0);
  const activeSlaves = slaves.filter(s => s.status === "active").length;

  return (
    <div className="cp-wrap">
      {/* Top bar */}
      <div className="cp-topbar">
        <div className="cp-topbar-logo">⚡ <span>Trade</span>Copier</div>
        <div className="cp-tabs">
          {(["dashboard", "accounts", "settings"] as CopierTab[]).map(t => (
            <button key={t} className={`cp-tab ${activeTab === t ? "active" : ""}`} onClick={() => setActiveTab(t)}>
              {t === "dashboard" && "📊"}{t === "accounts" && "👥"}{t === "settings" && "⚙️"}
              {t.charAt(0).toUpperCase() + t.slice(1)}
            </button>
          ))}
        </div>
        <button className="cp-topbar-back" onClick={onBack}>← Back to Overview</button>
      </div>

      {/* Status bar */}
      <div className="cp-statusbar">
        <div className="cp-stat">
          <div className="cp-stat-dot" />
          <span className="cp-stat-label">Status:</span>
          <span className="cp-stat-val green">Live Copying</span>
        </div>
        <div className="cp-stat-sep" />
        <div className="cp-stat">
          <span className="cp-stat-label">Master:</span>
          <span className="cp-stat-val">{master.name}</span>
        </div>
        <div className="cp-stat-sep" />
        <div className="cp-stat">
          <span className="cp-stat-label">Active Slaves:</span>
          <span className="cp-stat-val blue">{activeSlaves} / {slaves.length}</span>
        </div>
        <div className="cp-stat-sep" />
        <div className="cp-stat">
          <span className="cp-stat-label">Total PnL:</span>
          <span className={`cp-stat-val ${totalPnl >= 0 ? "green" : "red"}`}>
            {totalPnl >= 0 ? "+" : ""}${totalPnl.toFixed(2)}
          </span>
        </div>
        <div className="cp-stat-sep" />
        <div className="cp-stat">
          <span className="cp-stat-label">Trades Today:</span>
          <span className="cp-stat-val">{master.trades}</span>
        </div>
      </div>

      {/* Body */}
      <div className="cp-body">
        {/* Sidebar */}
        <div className="cp-sidebar">
          <div className="cp-sidebar-section">
            <div className="cp-sidebar-label">Master Account</div>
            <div
              className={`cp-master-card ${selectedAccount === master.id ? "selected" : ""}`}
              onClick={() => setSelectedAccount(master.id)}
            >
              <div className="cp-master-status" />
              <div className="cp-master-card-top">
                <div className="cp-acct-avatar">M</div>
                <div>
                  <div className="cp-acct-name">{master.name}</div>
                  <div className="cp-acct-id">{master.login}</div>
                </div>
                <div className="cp-acct-badge">Master</div>
              </div>
              <div className="cp-master-stats">
                <div className="cp-ms-item">
                  <div className="cp-ms-lbl">Balance</div>
                  <div className="cp-ms-val">${master.balance.toLocaleString()}</div>
                </div>
                <div className="cp-ms-item">
                  <div className="cp-ms-lbl">PnL</div>
                  <div className={`cp-ms-val ${master.pnl >= 0 ? "green" : "red"}`}>
                    {master.pnl >= 0 ? "+" : ""}${master.pnl}
                  </div>
                </div>
                <div className="cp-ms-item">
                  <div className="cp-ms-lbl">Platform</div>
                  <div className="cp-ms-val">{master.platform}</div>
                </div>
              </div>
            </div>
          </div>

          <div className="cp-sidebar-section">
            <div className="cp-sidebar-label">Slave Accounts ({slaves.length})</div>
            {slaves.map(s => (
              <div
                key={s.id}
                className={`cp-slave-item ${selectedAccount === s.id ? "selected" : ""}`}
                onClick={() => setSelectedAccount(s.id)}
              >
                <div className="cp-acct-avatar slave-avatar">S</div>
                <div className="cp-slave-info">
                  <div className="cp-slave-name">{s.name}</div>
                  <div className="cp-slave-id">{s.login} · {s.broker}</div>
                </div>
                <div className="cp-slave-mult">{s.multiplier}x</div>
                <div className={`cp-slave-status-dot ${s.status === "paused" ? "paused" : ""}`} />
              </div>
            ))}
            <button
              className="cp-add-btn"
              onClick={() => { setModalType("slave"); setShowModal(true); }}
            >
              + Add Slave Account
            </button>
          </div>
        </div>

        {/* Main */}
        <div className="cp-main">

          {/* ── DASHBOARD TAB ── */}
          {activeTab === "dashboard" && (
            <>
              <div className="cp-panel-header">
                <div>
                  <div className="cp-panel-title">📊 Dashboard</div>
                  <div className="cp-panel-subtitle">Live overview of your copy trading session</div>
                </div>
                <div className="cp-header-actions">
                  <button className="cp-btn-sm ghost">⏸ Pause All</button>
                  <button className="cp-btn-sm primary">▶ Resume All</button>
                </div>
              </div>

              {/* Stats */}
              <div className="cp-stats-row">
                <div className="cp-stat-card">
                  <div className="cp-sc-label">Total Equity</div>
                  <div className="cp-sc-value blue">${totalEquity.toLocaleString()}</div>
                  <div className="cp-sc-sub">{slaves.length + 1} accounts combined</div>
                </div>
                <div className="cp-stat-card">
                  <div className="cp-sc-label">Total PnL</div>
                  <div className={`cp-sc-value ${totalPnl >= 0 ? "green" : "red"}`}>
                    {totalPnl >= 0 ? "+" : ""}${totalPnl.toFixed(2)}
                  </div>
                  <div className="cp-sc-sub">All accounts</div>
                </div>
                <div className="cp-stat-card">
                  <div className="cp-sc-label">Active Slaves</div>
                  <div className="cp-sc-value blue">{activeSlaves}</div>
                  <div className="cp-sc-sub">{slaves.length - activeSlaves} paused</div>
                </div>
                <div className="cp-stat-card">
                  <div className="cp-sc-label">Trades Copied</div>
                  <div className="cp-sc-value">{master.trades}</div>
                  <div className="cp-sc-sub">Today</div>
                </div>
              </div>

              {/* Connection diagram */}
              <div className="cp-diagram-section">
                <div className="cp-diagram-title">⚡ Live Account Connections</div>
                <div className="cp-diagram-inner">
                  {/* Master */}
                  <div className="cp-diag-master">
                    <div className="cp-diag-master-top">
                      <div className="cp-diag-acct-icon">⚙️</div>
                      <div style={{ flex: 1 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 2 }}>
                          <div className="cp-diag-acct-name">{master.name}</div>
                          <div className="cp-diag-badge master">Master</div>
                        </div>
                        <div className="cp-diag-acct-id">{master.login} · {master.broker}</div>
                      </div>
                    </div>
                    <div className="cp-diag-row">
                      <div className="cp-diag-row-lbl">Balance</div>
                      <div className="cp-diag-row-val">${master.balance.toLocaleString()}</div>
                    </div>
                    <div className="cp-diag-row">
                      <div className="cp-diag-row-lbl">PnL</div>
                      <div className={`cp-diag-row-val ${master.pnl >= 0 ? "green" : "red"}`}>
                        {master.pnl >= 0 ? "+" : ""}${master.pnl} ({master.pnlPct}%)
                      </div>
                    </div>
                    <div className="cp-diag-row">
                      <div className="cp-diag-row-lbl">Platform</div>
                      <div className="cp-diag-row-val">{master.platform}</div>
                    </div>
                  </div>

                  {/* Arrows + slaves */}
                  <div className="cp-diag-conn-wrap">
                    {slaves.map(s => (
                      <div key={s.id} className="cp-diag-conn-row">
                        <div className="cp-diag-arrow">
                          <div className="cp-diag-arrow-line" />
                          <div className="cp-diag-mult-badge">{s.multiplier}x</div>
                          <div className="cp-diag-arrow-head" />
                        </div>
                        <div className="cp-diag-slave">
                          <div className="cp-diag-slave-top">
                            <div className="cp-diag-slave-icon">👤</div>
                            <div style={{ flex: 1 }}>
                              <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 2 }}>
                                <div className="cp-diag-acct-name" style={{ fontSize: "0.82rem" }}>{s.name}</div>
                                <div className="cp-diag-badge slave">Slave</div>
                              </div>
                              <div className="cp-diag-acct-id">{s.login} · {s.broker}</div>
                            </div>
                          </div>
                          <div className="cp-diag-row">
                            <div className="cp-diag-row-lbl">Balance</div>
                            <div className="cp-diag-row-val">${s.balance.toLocaleString()}</div>
                          </div>
                          <div className="cp-diag-row">
                            <div className="cp-diag-row-lbl">PnL</div>
                            <div className={`cp-diag-row-val ${s.pnl >= 0 ? "green" : "red"}`}>
                              {s.pnl >= 0 ? "+" : ""}${s.pnl}
                            </div>
                          </div>
                          <div className="cp-diag-row">
                            <div className="cp-diag-row-lbl">Status</div>
                            <div className={`cp-diag-row-val ${s.status === "active" ? "green" : ""}`}>
                              {s.status === "active" ? "● Active" : "⏸ Paused"}
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                    {slaves.length === 0 && (
                      <div style={{ display: "flex", alignItems: "center", gap: 0 }}>
                        <div className="cp-diag-arrow">
                          <div className="cp-diag-arrow-line" style={{ background: "var(--ts-border)" }} />
                          <div className="cp-diag-arrow-head" style={{ borderLeftColor: "var(--ts-border)" }} />
                        </div>
                        <div className="cp-diag-slave" style={{ opacity: 0.4, minWidth: 160, textAlign: "center", padding: "20px" }}>
                          <div style={{ fontSize: "0.78rem", color: "var(--ts-muted)" }}>No slave accounts</div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Activity feed */}
              <div className="cp-activity">
                <div className="cp-table-header">
                  <div className="cp-table-title">⚡ Recent Activity</div>
                  <button className="cp-btn-sm ghost" style={{ fontSize: "0.72rem", padding: "5px 12px" }}>View All</button>
                </div>
                <div className="cp-activity-list">
                  {activityFeed.map((a, i) => (
                    <div key={i} className="cp-activity-item">
                      <div className={`cp-act-icon ${a.type}`}>
                        {a.type === "buy" ? "📈" : a.type === "sell" ? "📉" : "ℹ️"}
                      </div>
                      <div className="cp-act-body">
                        <div className="cp-act-title">{a.symbol} — {a.action}</div>
                        <div className="cp-act-sub">{a.detail}</div>
                      </div>
                      <div className="cp-act-time">{a.time}</div>
                      {a.pnl && (
                        <div className={`cp-act-pnl ${a.pnl.startsWith("+") ? "green" : "red"}`}>{a.pnl}</div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}

          {/* ── ACCOUNTS TAB ── */}
          {activeTab === "accounts" && (
            <>
              <div className="cp-panel-header">
                <div>
                  <div className="cp-panel-title">👥 Accounts</div>
                  <div className="cp-panel-subtitle">Manage your master and slave trading accounts</div>
                </div>
                <div className="cp-header-actions">
                  <button className="cp-btn-sm primary" onClick={() => { setModalType("slave"); setShowModal(true); }}>
                    + Add Slave Account
                  </button>
                </div>
              </div>

              {/* Master account card */}
              <div className="cp-slave-table-wrap" style={{ marginBottom: 20 }}>
                <div className="cp-table-header">
                  <div className="cp-table-title">⚙️ Master Account <span className="cp-count-badge">1</span></div>
                </div>
                <table className="cp-table">
                  <thead>
                    <tr>
                      <th>Account</th>
                      <th>Platform</th>
                      <th>Balance</th>
                      <th>Equity</th>
                      <th>PnL</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td>
                        <div className="cp-acct-cell">
                          <div className="cp-cell-avatar" style={{ background: "rgba(45,140,240,0.15)", borderColor: "rgba(45,140,240,0.3)", color: "var(--ts-blue)" }}>M</div>
                          <div>
                            <div className="cp-cell-name">{master.name}</div>
                            <div className="cp-cell-id">{master.login} · {master.broker}</div>
                          </div>
                        </div>
                      </td>
                      <td>{master.platform}</td>
                      <td>${master.balance.toLocaleString()}</td>
                      <td>${master.equity.toLocaleString()}</td>
                      <td style={{ color: master.pnl >= 0 ? "var(--ts-green)" : "var(--ts-red)", fontWeight: 700 }}>
                        {master.pnl >= 0 ? "+" : ""}${master.pnl} ({master.pnlPct}%)
                      </td>
                      <td><span className="cp-pill active dot">Active</span></td>
                    </tr>
                  </tbody>
                </table>
              </div>

              {/* Slave accounts table */}
              <div className="cp-slave-table-wrap">
                <div className="cp-table-header">
                  <div className="cp-table-title">👥 Slave Accounts <span className="cp-count-badge">{slaves.length}</span></div>
                </div>
                {slaves.length === 0 ? (
                  <div className="cp-empty">
                    <div className="cp-empty-icon">👥</div>
                    <div className="cp-empty-title">No slave accounts yet</div>
                    <div className="cp-empty-sub">Add a slave account to start copying trades from your master account.</div>
                    <button className="cp-btn-sm primary" style={{ marginTop: 20 }} onClick={() => { setModalType("slave"); setShowModal(true); }}>
                      + Add First Slave
                    </button>
                  </div>
                ) : (
                  <table className="cp-table">
                    <thead>
                      <tr>
                        <th>Account</th>
                        <th>Platform</th>
                        <th>Balance</th>
                        <th>PnL</th>
                        <th>Multiplier</th>
                        <th>Status</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {slaves.map(s => (
                        <tr key={s.id}>
                          <td>
                            <div className="cp-acct-cell">
                              <div className="cp-cell-avatar">S</div>
                              <div>
                                <div className="cp-cell-name">{s.name}</div>
                                <div className="cp-cell-id">{s.login} · {s.broker}</div>
                              </div>
                            </div>
                          </td>
                          <td>{s.platform}</td>
                          <td>${s.balance.toLocaleString()}</td>
                          <td style={{ color: s.pnl >= 0 ? "var(--ts-green)" : "var(--ts-red)", fontWeight: 700 }}>
                            {s.pnl >= 0 ? "+" : ""}${s.pnl}
                          </td>
                          <td>
                            <input
                              className="cp-mult-input"
                              type="number"
                              step="0.1"
                              min="0.1"
                              max="10"
                              value={s.multiplier}
                              onChange={e => updateMultiplier(s.id, e.target.value)}
                            />
                          </td>
                          <td>
                            <span className={`cp-pill dot ${s.status === "active" ? "active" : "paused"}`}>
                              {s.status === "active" ? "Active" : "Paused"}
                            </span>
                          </td>
                          <td>
                            <div className="cp-row-actions">
                              <button
                                className="cp-icon-btn"
                                title={s.status === "active" ? "Pause" : "Resume"}
                                onClick={() => toggleSlaveStatus(s.id)}
                              >
                                {s.status === "active" ? "⏸" : "▶"}
                              </button>
                              <button className="cp-icon-btn" title="Edit">✏️</button>
                              <button
                                className="cp-icon-btn red"
                                title="Remove"
                                onClick={() => removeSlave(s.id)}
                              >
                                🗑
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </>
          )}

          {/* ── SETTINGS TAB ── */}
          {activeTab === "settings" && (
            <>
              <div className="cp-panel-header">
                <div>
                  <div className="cp-panel-title">⚙️ Copy Settings</div>
                  <div className="cp-panel-subtitle">Configure how trades are copied across your accounts</div>
                </div>
                <div className="cp-header-actions">
                  <button className="cp-btn-sm primary">💾 Save Changes</button>
                </div>
              </div>

              {/* Copy mode */}
              <div className="cp-settings-section">
                <div className="cp-settings-title">⚡ Copy Mode & Risk</div>
                <div className="cp-form-grid">
                  <div className="cp-form-group">
                    <div className="cp-form-label">Copy Mode</div>
                    <select
                      className="cp-form-select"
                      value={settings.copyMode}
                      onChange={e => setSettings(s => ({ ...s, copyMode: e.target.value }))}
                    >
                      <option value="fixed-lot">Fixed Lot Size</option>
                      <option value="multiplier">Multiplier (% of master)</option>
                      <option value="fixed-risk">Fixed Risk %</option>
                      <option value="equity-pct">Equity Percentage</option>
                    </select>
                  </div>
                  <div className="cp-form-group">
                    <div className="cp-form-label">Default Multiplier</div>
                    <input
                      className="cp-form-input"
                      type="number"
                      step="0.1"
                      value={settings.defaultMultiplier}
                      onChange={e => setSettings(s => ({ ...s, defaultMultiplier: e.target.value }))}
                    />
                  </div>
                  <div className="cp-form-group">
                    <div className="cp-form-label">Max Lot Size (per slave)</div>
                    <input
                      className="cp-form-input"
                      type="number"
                      step="0.1"
                      value={settings.maxLot}
                      onChange={e => setSettings(s => ({ ...s, maxLot: e.target.value }))}
                    />
                  </div>
                  <div className="cp-form-group">
                    <div className="cp-form-label">Max Slippage (pips)</div>
                    <input
                      className="cp-form-input"
                      type="number"
                      value={settings.slippage}
                      onChange={e => setSettings(s => ({ ...s, slippage: e.target.value }))}
                    />
                  </div>
                </div>
              </div>

              {/* Copy options */}
              <div className="cp-settings-section">
                <div className="cp-settings-title">🔧 Copy Options</div>
                {[
                  { key: "reverseMode", title: "Reverse Mode", desc: "Copy trades in the opposite direction (BUY → SELL)" },
                  { key: "copyPending", title: "Copy Pending Orders", desc: "Also copy limit and stop orders from the master" },
                  { key: "copySL", title: "Copy Stop Loss", desc: "Mirror the master's stop loss on all slave accounts" },
                  { key: "copyTP", title: "Copy Take Profit", desc: "Mirror the master's take profit on all slave accounts" },
                  { key: "closeMirror", title: "Mirror Close Orders", desc: "Close trades on slaves when master closes them" },
                ].map(opt => (
                  <div key={opt.key} className="cp-toggle-row">
                    <div className="cp-toggle-info">
                      <div className="cp-toggle-title">{opt.title}</div>
                      <div className="cp-toggle-desc">{opt.desc}</div>
                    </div>
                    <label className="cp-toggle">
                      <input
                        type="checkbox"
                        checked={settings[opt.key as keyof typeof settings] as boolean}
                        onChange={e => setSettings(s => ({ ...s, [opt.key]: e.target.checked }))}
                      />
                      <div className="cp-toggle-slider" />
                    </label>
                  </div>
                ))}
              </div>

              {/* Notifications */}
              <div className="cp-settings-section">
                <div className="cp-settings-title">🔔 Notifications</div>
                <div className="cp-toggle-row">
                  <div className="cp-toggle-info">
                    <div className="cp-toggle-title">Telegram Alerts</div>
                    <div className="cp-toggle-desc">Receive alerts when trades are copied, closed, or errors occur</div>
                  </div>
                  <label className="cp-toggle">
                    <input
                      type="checkbox"
                      checked={settings.telegramAlerts}
                      onChange={e => setSettings(s => ({ ...s, telegramAlerts: e.target.checked }))}
                    />
                    <div className="cp-toggle-slider" />
                  </label>
                </div>
                {settings.telegramAlerts && (
                  <div className="cp-form-group" style={{ marginTop: 16 }}>
                    <div className="cp-form-label">Telegram Bot Token</div>
                    <input className="cp-form-input" type="text" placeholder="Enter your bot token..." />
                  </div>
                )}
              </div>

              {/* Danger zone */}
              <div className="cp-settings-section" style={{ borderColor: "rgba(239,68,68,0.25)" }}>
                <div className="cp-settings-title" style={{ color: "var(--ts-red)" }}>⚠️ Danger Zone</div>
                <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                  <button className="cp-btn-sm danger">⏹ Stop All Copying</button>
                  <button className="cp-btn-sm danger">🔌 Disconnect All Accounts</button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Add account modal */}
      {showModal && (
        <div className="cp-modal-overlay" onClick={e => { if (e.target === e.currentTarget) setShowModal(false); }}>
          <div className="cp-modal">
            <div className="cp-modal-header">
              <div className="cp-modal-title">
                {modalType === "slave" ? "👥" : "⚙️"} Add {modalType === "slave" ? "Slave" : "Master"} Account
              </div>
              <button className="cp-modal-close" onClick={() => setShowModal(false)}>✕</button>
            </div>
            <div className="cp-modal-body">
              <div className="cp-type-select-row">
                <div
                  className={`cp-type-card ${modalType === "master" ? "selected-master" : ""}`}
                  onClick={() => setModalType("master")}
                >
                  <div className="cp-type-icon">⚙️</div>
                  <div className="cp-type-name">Master</div>
                  <div className="cp-type-desc">Source account that originates trades</div>
                </div>
                <div
                  className={`cp-type-card ${modalType === "slave" ? "selected-slave" : ""}`}
                  onClick={() => setModalType("slave")}
                >
                  <div className="cp-type-icon">👤</div>
                  <div className="cp-type-name">Slave</div>
                  <div className="cp-type-desc">Receiving account that copies trades</div>
                </div>
              </div>
              <div className="cp-form-grid">
                <div className="cp-form-group full">
                  <div className="cp-form-label">Account Name (optional)</div>
                  <input
                    className="cp-form-input"
                    placeholder="e.g. My IC Markets Account"
                    value={newAcct.name}
                    onChange={e => setNewAcct(a => ({ ...a, name: e.target.value }))}
                  />
                </div>
                <div className="cp-form-group">
                  <div className="cp-form-label">Login Number *</div>
                  <input
                    className="cp-form-input"
                    placeholder="e.g. 1000001"
                    value={newAcct.login}
                    onChange={e => setNewAcct(a => ({ ...a, login: e.target.value }))}
                  />
                </div>
                <div className="cp-form-group">
                  <div className="cp-form-label">Broker Name *</div>
                  <input
                    className="cp-form-input"
                    placeholder="e.g. IC Markets"
                    value={newAcct.broker}
                    onChange={e => setNewAcct(a => ({ ...a, broker: e.target.value }))}
                  />
                </div>
                <div className="cp-form-group">
                  <div className="cp-form-label">Platform</div>
                  <select
                    className="cp-form-select"
                    value={newAcct.platform}
                    onChange={e => setNewAcct(a => ({ ...a, platform: e.target.value }))}
                  >
                    <option value="MT5">MT5</option>
                    <option value="MT4">MT4</option>
                    <option value="MatchTrader">MatchTrader</option>
                  </select>
                </div>
                <div className="cp-form-group">
                  <div className="cp-form-label">Server</div>
                  <input
                    className="cp-form-input"
                    placeholder="e.g. ICMarkets-Live01"
                    value={newAcct.server}
                    onChange={e => setNewAcct(a => ({ ...a, server: e.target.value }))}
                  />
                </div>
                <div className="cp-form-group full">
                  <div className="cp-form-label">Investor Password</div>
                  <input
                    className="cp-form-input"
                    type="password"
                    placeholder="Read-only investor password"
                    value={newAcct.password}
                    onChange={e => setNewAcct(a => ({ ...a, password: e.target.value }))}
                  />
                </div>
              </div>
            </div>
            <div className="cp-modal-footer">
              <button className="cp-btn-sm ghost" onClick={() => setShowModal(false)}>Cancel</button>
              <button className="cp-btn-sm primary" onClick={addAccount}>
                + Connect Account
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function TradeSyncPage() {
  const [showCopier, setShowCopier] = useState(false);
  const [billing, setBilling] = useState<"monthly" | "yearly">("monthly");
  const [openFaq, setOpenFaq] = useState<number | null>(null);
  const [votes, setVotes] = useState<Record<string, { count: number; voted: boolean }>>(() => {
    const v: Record<string, { count: number; voted: boolean }> = {};
    [...platformsRow1, ...platformsRow2].forEach(p => { v[p.name] = { count: p.votes, voted: p.voted }; });
    return v;
  });

  const toggleVote = (name: string) => {
    setVotes(prev => ({
      ...prev,
      [name]: {
        count: prev[name].voted ? prev[name].count - 1 : prev[name].count + 1,
        voted: !prev[name].voted,
      },
    }));
  };

  const PlatformCard = ({ p }: { p: typeof platformsRow1[0] }) => (
    <div className="ts-platform-card">
      <div className={`ts-status-badge ${p.status === "available" ? "ts-status-available" : "ts-status-soon"}`}>
        {p.status === "available" ? "Available" : "Coming Soon"}
      </div>
      <div className="ts-platform-logo">{p.icon}</div>
      <div className="ts-platform-name">{p.name}</div>
      <div className="ts-vote-row">
        <button
          className={`ts-vote-btn ${votes[p.name]?.voted ? "unvote" : ""}`}
          onClick={() => toggleVote(p.name)}
        >
          ↑ {votes[p.name]?.voted ? "Unvote" : "Vote"}
        </button>
        <span className="ts-vote-count">{votes[p.name]?.count}</span>
      </div>
    </div>
  );

  if (showCopier) {
    return (
      <>
        <style>{styles}</style>
        <CopierUI onBack={() => setShowCopier(false)} />
      </>
    );
  }

  return (
    <>
      <style>{styles}</style>
      <div className="ts-page">

        {/* HERO */}
        <div className="ts-hero">
          <div>
            <div className="ts-hero-badge">⚡ Automated Trade Copying</div>
            <h1>Trade Sync</h1>
            <p>Control all your trading accounts from one place—automatically and in real time.</p>
            <div className="ts-hero-actions">
              <button className="ts-btn-primary" onClick={() => setShowCopier(true)}>Start Now →</button>
              <button className="ts-btn-ghost">Learn More</button>
            </div>
          </div>

          {/* Diagram */}
          <div className="ts-hero-visual">
            <div className="ts-diagram">
              <div className="ts-diagram-master">
                <div className="ts-diag-icon">⚙️</div>
                <div>
                  <div className="ts-diag-label">Master Account 1</div>
                  <div className="ts-diag-id">1000001</div>
                </div>
                <span className="ts-badge-master">Master</span>
              </div>

              <svg className="ts-connector" viewBox="0 0 260 70">
                <defs>
                  <marker id="ts-dot" markerWidth="6" markerHeight="6" refX="3" refY="3">
                    <circle cx="3" cy="3" r="2.5" fill="#2d8cf0"/>
                  </marker>
                </defs>
                <line x1="130" y1="0" x2="130" y2="20" stroke="#2d8cf0" strokeWidth="2" strokeDasharray="5,3"/>
                <line x1="130" y1="20" x2="50" y2="20" stroke="#2d8cf0" strokeWidth="2" strokeDasharray="5,3"/>
                <line x1="130" y1="20" x2="210" y2="20" stroke="#2d8cf0" strokeWidth="2" strokeDasharray="5,3"/>
                <line x1="50" y1="20" x2="50" y2="62" stroke="#2d8cf0" strokeWidth="2" strokeDasharray="5,3" markerEnd="url(#ts-dot)"/>
                <line x1="210" y1="20" x2="210" y2="62" stroke="#2d8cf0" strokeWidth="2" strokeDasharray="5,3" markerEnd="url(#ts-dot)"/>
                <text x="78" y="17" fill="#8a99b3" fontSize="10">1x</text>
                <text x="158" y="17" fill="#8a99b3" fontSize="10">1x</text>
              </svg>

              <div className="ts-diagram-slaves">
                <div className="ts-diagram-slave">
                  <div className="ts-diag-icon">👤</div>
                  <div>
                    <div className="ts-diag-label">Slave Account 5</div>
                    <div className="ts-diag-id">1000005</div>
                  </div>
                  <span className="ts-badge-slave">Slave</span>
                </div>
                <div className="ts-diagram-slave">
                  <div className="ts-diag-icon">👤</div>
                  <div>
                    <div className="ts-diag-label">Slave Account 6</div>
                    <div className="ts-diag-id">1000006</div>
                  </div>
                  <span className="ts-badge-slave">Slave</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* HOW IT WORKS */}
        <div style={{ background: "var(--ts-bg2)", padding: "1px 0" }}>
          <div className="ts-section">
            <div className="ts-section-header">
              <div className="ts-section-title">How Trade Sync Works</div>
              <div className="ts-section-sub">Easily manage multiple accounts from one master—everything stays synced in real time:</div>
            </div>
            <div className="ts-steps">
              {[
                { n: 1, t: "Connect Master Account", d: "Link your source trading account" },
                { n: 2, t: "Choose Slave Accounts & Allocation", d: "Select accounts to copy to and set risk ratios" },
                { n: 3, t: "Start Copying—Automated & Real-Time", d: "Trades execute automatically across all accounts" },
                { n: 4, t: "Monitor & Adjust as You Go", d: "Track performance and modify settings anytime" },
              ].map(s => (
                <div key={s.n} className="ts-step-card">
                  <div className="ts-step-num">{s.n}</div>
                  <div className="ts-step-title">{s.t}</div>
                  <div className="ts-step-desc">{s.d}</div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* PLATFORMS */}
        <div className="ts-platforms-section">
          <div className="ts-platforms-inner">
            <div className="ts-section-header">
              <div className="ts-section-title">Supported Trading Platforms</div>
              <div className="ts-section-sub">Launch with MT4 & MT5 support, with additional platforms coming soon. Vote for your favorite platforms below.</div>
            </div>
            <div className="ts-platforms-grid">
              {platformsRow1.map(p => <PlatformCard key={p.name} p={p} />)}
            </div>
            <div className="ts-platforms-grid-2">
              {platformsRow2.map(p => <PlatformCard key={p.name} p={p} />)}
            </div>
          </div>
        </div>

        {/* FEATURES + PRICING */}
        <div className="ts-section">
          <div className="ts-fp-grid">
            <div>
              <div className="ts-features-title">⚡ Key Features & Benefits</div>
              <div className="ts-features-sub">Everything you need for professional-grade trade copying</div>
              {features.map(f => (
                <div key={f.title} className="ts-feature-item">
                  <div className="ts-feat-icon">{f.icon}</div>
                  <div>
                    <div className="ts-feat-title">{f.title}</div>
                    <div className="ts-feat-desc">{f.desc}</div>
                  </div>
                </div>
              ))}
            </div>
            <div>
              <div className="ts-pricing-card">
                <div className="ts-price-toggle">
                  <button
                    className={`ts-toggle-btn ${billing === "monthly" ? "active" : ""}`}
                    onClick={() => setBilling("monthly")}
                  >Monthly</button>
                  <button
                    className={`ts-toggle-btn ${billing === "yearly" ? "active" : ""}`}
                    onClick={() => setBilling("yearly")}
                  >Yearly</button>
                </div>
                <div className="ts-price-label">Early Bird Pricing</div>
                <div className="ts-price-amount">
                  {billing === "monthly" ? "$7.50" : "$64.99"}{" "}
                  <span>per account/{billing === "monthly" ? "month" : "year"}</span>
                </div>
                <div style={{ marginTop: 6 }}>
                  <span className="ts-price-original">{billing === "monthly" ? "$10.00" : "$90.00"}</span>
                  <span className="ts-price-limited">Limited-time pricing</span>
                </div>
                <div className="ts-price-note">Unlimited trade copying on supported platforms</div>
                <div className="ts-checkout-card">
                  <div className="ts-checkout-title">⚡ Start Trade Sync</div>
                  <div className="ts-checkout-sub">Choose your plan and number of accounts, then proceed to secure checkout.</div>
                  <button className="ts-btn-start" onClick={() => setShowCopier(true)}>Start Now</button>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* FAQ */}
        <div className="ts-faq-section">
          <div className="ts-faq-inner">
            <div className="ts-section-header">
              <div className="ts-section-title">Frequently Asked Questions</div>
              <div className="ts-section-sub">Everything you need to know about Sync Trade</div>
            </div>
            {faqs.map((f, i) => (
              <div key={i} className={`ts-faq-item ${openFaq === i ? "open" : ""}`}>
                <button className="ts-faq-q" onClick={() => setOpenFaq(openFaq === i ? null : i)}>
                  {f.q}
                  <span className="ts-faq-chevron">▼</span>
                </button>
                <div className="ts-faq-a">{f.a}</div>
              </div>
            ))}
          </div>
        </div>

      </div>
    </>
  );
}
