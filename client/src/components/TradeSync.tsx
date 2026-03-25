import { useState } from "react";

const styles = `
  @import url('https://fonts.googleapis.com/css2?family=Montserrat:wght@400;600;700;800&family=Poppins:wght@300;400;500;600&display=swap');

  *, *::before, *::after { box-sizing: border-box; }

  .ts-page {
    min-height: 100%;
    background: #070b14;
    color: #e8edf5;
    font-family: 'Poppins', sans-serif;
    overflow-x: hidden;
  }

  .ts-hero {
    display: grid;
    grid-template-columns: 1fr 1fr;
    align-items: center;
    gap: 48px;
    padding: 80px 48px 64px;
    max-width: 1200px;
    margin: 0 auto;
  }
  .ts-hero-badge {
    display: inline-flex; align-items: center; gap: 6px;
    background: rgba(45,140,240,0.12); border: 1px solid rgba(45,140,240,0.3);
    padding: 5px 12px;
    font-size: 0.75rem; color: #2d8cf0; font-weight: 600;
    margin-bottom: 20px;
  }
  .ts-hero h1 {
    font-family: 'Montserrat', sans-serif !important;
    font-size: 3.5rem !important; font-weight: 800 !important; line-height: 1.1 !important;
    margin-bottom: 20px !important;
    background: linear-gradient(135deg, #fff 40%, #2d8cf0) !important;
    -webkit-background-clip: text !important; -webkit-text-fill-color: transparent !important;
    letter-spacing: normal !important;
  }
  .ts-hero p {
    font-size: 1.05rem; color: #8a99b3; line-height: 1.7;
    max-width: 440px; margin-bottom: 32px;
    font-weight: 400 !important;
  }
  .ts-hero-actions { display: flex; gap: 14px; align-items: center; }
  .ts-btn-primary {
    background: #2d8cf0; color: #fff;
    border: none;
    padding: 13px 28px; font-size: 1rem; font-weight: 600;
    cursor: pointer; transition: all 0.2s;
    display: flex; align-items: center; gap: 8px;
  }
  .ts-btn-primary:hover { background: #3d9fff; transform: translateY(-1px); }
  .ts-btn-ghost {
    background: transparent; color: #8a99b3;
    border: 1px solid #1e2d45;
    padding: 13px 24px; font-size: 1rem; font-weight: 500;
    cursor: pointer; transition: all 0.2s;
  }
  .ts-btn-ghost:hover { border-color: #2d8cf0; color: #e8edf5; }

  .ts-hero-visual {
    background: #0d1220;
    border: 1px solid #1e2d45;
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
    border: 2px solid #2d8cf0;
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
  .ts-diag-label { font-family: 'Montserrat', sans-serif !important; font-weight: 600 !important; font-size: 0.9rem !important; letter-spacing: normal !important; }
  .ts-diag-id { font-size: 0.75rem; color: #8a99b3; font-weight: 400 !important; }
  .ts-badge-master {
    background: #2d8cf0; color: #fff;
    padding: 3px 10px;
    font-size: 0.72rem; font-weight: 700 !important; margin-left: auto;
    letter-spacing: normal !important;
  }
  .ts-badge-slave {
    background: #00c896; color: #000;
    padding: 3px 10px;
    font-size: 0.72rem; font-weight: 700 !important; margin-left: auto;
    letter-spacing: normal !important;
  }

  .ts-connector { width: 260px; height: 70px; overflow: visible; }

  .ts-diagram-slaves { display: flex; gap: 20px; }
  .ts-diagram-slave {
    border: 2px solid #00c896;
    padding: 14px 18px; background: rgba(0,200,150,0.06);
    display: flex; align-items: center; gap: 10px;
    min-width: 180px;
  }

  .ts-section { padding: 72px 48px; max-width: 1200px; margin: 0 auto; }
  .ts-section-header { text-align: center; margin-bottom: 48px; }
  .ts-section-title {
    font-family: 'Montserrat', sans-serif !important;
    font-size: 1.8rem !important; font-weight: 700 !important;
    color: #2d8cf0; margin-bottom: 10px;
    letter-spacing: normal !important;
  }
  .ts-section-sub { color: #8a99b3; font-size: 1rem; font-weight: 400 !important; }

  .ts-steps { display: grid; grid-template-columns: repeat(4,1fr); gap: 20px; }
  .ts-step-card {
    background: #111827; border: 1px solid #1e2d45;
    padding: 28px 22px;
    transition: border-color 0.2s, transform 0.2s;
  }
  .ts-step-card:hover { border-color: #2d8cf0; transform: translateY(-3px); }
  .ts-step-num {
    width: 42px; height: 42px;
    background: #2d8cf0; color: #fff;
    font-family: 'Montserrat', sans-serif !important; font-weight: 700 !important; font-size: 1.1rem !important;
    display: flex; align-items: center; justify-content: center;
    margin-bottom: 18px; letter-spacing: normal !important;
  }
  .ts-step-title { font-weight: 600 !important; font-size: 0.95rem; margin-bottom: 8px; }
  .ts-step-desc { color: #8a99b3; font-size: 0.85rem; line-height: 1.6; font-weight: 400 !important; }

  .ts-platforms-section { padding: 64px 48px; background: #0d1220; }
  .ts-platforms-inner { max-width: 1200px; margin: 0 auto; }
  .ts-platforms-grid { display: grid; grid-template-columns: repeat(6,1fr); gap: 16px; margin-bottom: 16px; }
  .ts-platforms-grid-2 { display: grid; grid-template-columns: repeat(5,1fr); gap: 16px; max-width: 900px; margin: 0 auto; }
  .ts-platform-card {
    background: #111827; border: 1px solid #1e2d45;
    padding: 20px 14px;
    text-align: center; transition: border-color 0.2s;
  }
  .ts-platform-card:hover { border-color: #2d8cf0; }
  .ts-status-badge {
    display: inline-block;
    padding: 2px 8px; font-size: 0.68rem; font-weight: 700 !important; margin-bottom: 14px;
    letter-spacing: normal !important;
  }
  .ts-status-available { background: rgba(0,200,150,0.15); color: #00c896; border: 1px solid rgba(0,200,150,0.3); }
  .ts-status-soon { background: rgba(240,165,0,0.15); color: #f0a500; border: 1px solid rgba(240,165,0,0.3); }
  .ts-platform-logo {
    width: 48px; height: 48px;
    background: #151e2e; display: flex; align-items: center;
    justify-content: center; font-size: 1.4rem; margin: 0 auto 10px;
  }
  .ts-platform-name { font-weight: 600 !important; font-size: 0.85rem; margin-bottom: 12px; }
  .ts-vote-row { display: flex; align-items: center; gap: 8px; justify-content: center; }
  .ts-vote-btn {
    display: flex; align-items: center; gap: 5px;
    background: #2d8cf0; color: #fff;
    border: none; padding: 5px 12px;
    font-size: 0.75rem; font-weight: 600 !important; cursor: pointer; transition: background 0.2s;
    letter-spacing: normal !important;
  }
  .ts-vote-btn:hover { background: #3d9fff; }
  .ts-vote-btn.unvote { background: rgba(45,140,240,0.2); color: #2d8cf0; }
  .ts-vote-btn.unvote:hover { background: rgba(45,140,240,0.35); }
  .ts-vote-count { font-size: 0.8rem; color: #8a99b3; font-weight: 500 !important; }

  .ts-fp-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 56px; align-items: start; }
  .ts-features-title {
    font-family: 'Montserrat', sans-serif !important; font-weight: 700 !important;
    font-size: 0.9rem !important; color: #2d8cf0;
    display: flex; align-items: center; gap: 8px; margin-bottom: 6px;
    letter-spacing: normal !important;
  }
  .ts-features-sub { color: #8a99b3; font-size: 0.85rem; margin-bottom: 32px; font-weight: 400 !important; }
  .ts-feature-item { display: flex; gap: 16px; margin-bottom: 24px; }
  .ts-feat-icon {
    width: 44px; height: 44px;
    background: #151e2e; display: flex; align-items: center;
    justify-content: center; font-size: 1.2rem; flex-shrink: 0;
    border: 1px solid #1e2d45;
  }
  .ts-feat-title { font-weight: 600 !important; font-size: 0.9rem; margin-bottom: 4px; }
  .ts-feat-desc { color: #8a99b3; font-size: 0.82rem; line-height: 1.6; font-weight: 400 !important; }

  .ts-pricing-card {
    background: #111827; border: 2px solid #2d8cf0;
    padding: 28px;
  }
  .ts-price-toggle {
    display: flex; background: #151e2e;
    padding: 4px; margin-bottom: 24px;
  }
  .ts-toggle-btn {
    flex: 1; padding: 8px; border: none;
    font-size: 0.875rem; font-weight: 600 !important; cursor: pointer;
    transition: all 0.2s; background: transparent; color: #8a99b3;
    letter-spacing: normal !important;
  }
  .ts-toggle-btn.active { background: #2d8cf0; color: #fff; }
  .ts-price-label { font-size: 0.78rem; color: #8a99b3; margin-bottom: 6px; font-weight: 400 !important; }
  .ts-price-amount {
    font-family: 'Montserrat', sans-serif !important; font-weight: 800 !important;
    font-size: 2.4rem !important; color: #e8edf5; margin-bottom: 4px;
    letter-spacing: normal !important;
  }
  .ts-price-amount span { font-size: 0.9rem !important; font-weight: 400 !important; color: #8a99b3; }
  .ts-price-original {
    font-size: 0.85rem; color: #8a99b3; text-decoration: line-through;
    display: inline-block; margin-right: 8px; font-weight: 400 !important;
  }
  .ts-price-limited { color: #2d8cf0; font-size: 0.8rem; font-weight: 600 !important; }
  .ts-price-note { font-size: 0.82rem; color: #8a99b3; margin-top: 10px; margin-bottom: 24px; font-weight: 400 !important; }
  .ts-checkout-card {
    background: #151e2e;
    padding: 22px; margin-top: 20px;
  }
  .ts-checkout-title {
    font-family: 'Montserrat', sans-serif !important; font-weight: 700 !important;
    font-size: 0.9rem !important; display: flex; align-items: center; gap: 8px;
    margin-bottom: 8px; letter-spacing: normal !important;
  }
  .ts-checkout-sub { color: #8a99b3; font-size: 0.82rem; margin-bottom: 16px; font-weight: 400 !important; }
  .ts-btn-start {
    width: 100%; background: #111827; color: #8a99b3;
    border: 1px solid #1e2d45;
    padding: 13px; font-size: 0.95rem; font-weight: 600 !important;
    cursor: pointer; transition: all 0.2s; letter-spacing: normal !important;
  }
  .ts-btn-start:hover { background: #2d8cf0; color: #fff; border-color: #2d8cf0; }

  .ts-faq-section { padding: 72px 48px; }
  .ts-faq-inner { max-width: 760px; margin: 0 auto; }
  .ts-faq-item {
    border: 1px solid #1e2d45;
    margin-bottom: 10px; overflow: hidden;
    transition: border-color 0.2s;
  }
  .ts-faq-item.open { border-color: #2d8cf0; }
  .ts-faq-q {
    width: 100%; background: #111827; color: #e8edf5;
    border: none; text-align: left; padding: 18px 20px;
    font-size: 0.9rem; font-weight: 600 !important; cursor: pointer;
    display: flex; justify-content: space-between; align-items: center;
    font-family: 'Poppins', sans-serif !important; letter-spacing: normal !important;
  }
  .ts-faq-chevron { transition: transform 0.25s; font-size: 0.8rem; color: #8a99b3; }
  .ts-faq-item.open .ts-faq-chevron { transform: rotate(180deg); }
  .ts-faq-a {
    background: #151e2e; padding: 0 20px;
    color: #8a99b3; font-size: 0.875rem; line-height: 1.7;
    max-height: 0; overflow: hidden; transition: max-height 0.3s ease, padding 0.3s;
    font-weight: 400 !important;
  }
  .ts-faq-item.open .ts-faq-a { max-height: 200px; padding: 14px 20px; }

  @media (max-width: 900px) {
    .ts-hero { grid-template-columns: 1fr; padding: 48px 24px 40px; }
    .ts-steps { grid-template-columns: 1fr 1fr; }
    .ts-platforms-grid { grid-template-columns: repeat(3,1fr); }
    .ts-fp-grid { grid-template-columns: 1fr; }
    .ts-section { padding: 48px 24px; }
    .ts-platforms-section { padding: 40px 24px; }
    .ts-faq-section { padding: 48px 24px; }
  }
`;

interface PlatformEntry {
  name: string;
  icon: string;
  status: "available" | "soon";
  votes: number;
  voted: boolean;
}

interface VoteState {
  [key: string]: { count: number; voted: boolean };
}

const platforms: PlatformEntry[] = [
  { name: "MT5", icon: "5️⃣", status: "available", votes: 2061, voted: true },
  { name: "MT4", icon: "4️⃣", status: "available", votes: 419, voted: true },
  { name: "MatchTrader", icon: "🔗", status: "available", votes: 182, voted: false },
  { name: "Bitunix", icon: "🟢", status: "soon", votes: 19, voted: false },
  { name: "DXTrade", icon: "DX", status: "soon", votes: 85, voted: false },
  { name: "cTrader", icon: "🔴", status: "soon", votes: 370, voted: false },
];

const platforms2: PlatformEntry[] = [
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
  { q: "Does TraderWaves trade for me?", a: "No. Trade Sync is a copy trading tool that mirrors your own trades from a master account to one or more slave accounts. You remain in full control of all trading decisions." },
  { q: "Is this for accounts I own?", a: "Yes. Trade Sync is designed for traders who manage multiple accounts of their own. You must have authorized access to all accounts you connect to the platform." },
  { q: "Which platforms are supported?", a: "Currently MT4 and MT5 are fully supported. MatchTrader is also available. More platforms including cTrader, Binance, TradeLocker, and others are coming soon — you can vote for your favorites." },
  { q: "Do you provide signals or advice?", a: "No. Trade Sync does not provide trading signals, advice, or recommendations. It solely syncs trades between accounts you control." },
  { q: "How are my credentials handled?", a: "Your account credentials are encrypted and stored securely. We use industry-standard encryption and never share your data with third parties." },
  { q: "Are alerts available?", a: "Yes! You can receive real-time alerts via Telegram or email whenever a trade is copied, modified, or closed across your accounts." },
];

export default function TradeSync() {
  const [billing, setBilling] = useState<"monthly" | "yearly">("monthly");
  const [openFaq, setOpenFaq] = useState<number | null>(null);
  const [votes, setVotes] = useState<VoteState>(() => {
    const v: VoteState = {};
    [...platforms, ...platforms2].forEach(p => { v[p.name] = { count: p.votes, voted: p.voted }; });
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

  const PlatformCard = ({ p }: { p: PlatformEntry }) => (
    <div className="ts-platform-card">
      <div className={`ts-status-badge ${p.status === "available" ? "ts-status-available" : "ts-status-soon"}`}>
        {p.status === "available" ? "Available" : "Coming Soon"}
      </div>
      <div className="ts-platform-logo">{p.icon}</div>
      <div className="ts-platform-name">{p.name}</div>
      <div className="ts-vote-row">
        <button
          className={`ts-vote-btn ${votes[p.name].voted ? "unvote" : ""}`}
          onClick={() => toggleVote(p.name)}
        >
          ↑ {votes[p.name].voted ? "Unvote" : "Vote"}
        </button>
        <span className="ts-vote-count">{votes[p.name].count}</span>
      </div>
    </div>
  );

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
              <button className="ts-btn-primary">Start Now →</button>
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
        <div style={{ background: "#0d1220", padding: "1px 0" }}>
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
              <div className="ts-section-sub">Launch with MT4 &amp; MT5 support, with additional platforms coming soon. Vote for your favorite platforms below.</div>
            </div>
            <div className="ts-platforms-grid">
              {platforms.map(p => <PlatformCard key={p.name} p={p} />)}
            </div>
            <div className="ts-platforms-grid-2">
              {platforms2.map(p => <PlatformCard key={p.name} p={p} />)}
            </div>
          </div>
        </div>

        {/* FEATURES + PRICING */}
        <div className="ts-section">
          <div className="ts-fp-grid">
            <div>
              <div className="ts-features-title">⚡ Key Features &amp; Benefits</div>
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
                  <button className={`ts-toggle-btn ${billing === "monthly" ? "active" : ""}`} onClick={() => setBilling("monthly")}>Monthly</button>
                  <button className={`ts-toggle-btn ${billing === "yearly" ? "active" : ""}`} onClick={() => setBilling("yearly")}>Yearly</button>
                </div>
                <div className="ts-price-label">Early Bird Pricing</div>
                <div className="ts-price-amount">
                  {billing === "monthly" ? "$7.50" : "$64.99"} <span>per account/{billing === "monthly" ? "month" : "year"}</span>
                </div>
                <div style={{ marginTop: 6 }}>
                  <span className="ts-price-original">{billing === "monthly" ? "$10.00" : "$90.00"}</span>
                  <span className="ts-price-limited">Limited-time pricing</span>
                </div>
                <div className="ts-price-note">Unlimited trade copying on supported platforms</div>
                <div className="ts-checkout-card">
                  <div className="ts-checkout-title">⚡ Start Trade Sync</div>
                  <div className="ts-checkout-sub">Choose your plan and number of accounts, then proceed to secure checkout.</div>
                  <button className="ts-btn-start">Start Now</button>
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
              <div className="ts-section-sub">Everything you need to know about TradeWaves Trade Sync</div>
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
