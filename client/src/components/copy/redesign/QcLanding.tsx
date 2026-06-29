import { Radio, User, ArrowRight } from 'lucide-react';
import { QC_CSS } from '../qcTheme';

interface Props {
  onStart?: () => void;
}

const LAND_CSS = `
.qc-root .qc-land{max-width:1120px;margin:0 auto;padding:40px 32px 70px;}
.qc-root .qc-hero{display:grid;grid-template-columns:1.05fr .95fr;gap:48px;align-items:center;padding:36px 0 8px;}
.qc-root .qc-pillb{display:inline-flex;align-items:center;gap:7px;font-size:12px;color:var(--t2);background:var(--s1);border:1px solid var(--b1);border-radius:999px;padding:6px 13px;}
.qc-root .qc-hero h1{font-size:46px;font-weight:700;letter-spacing:-.025em;line-height:1.08;margin:18px 0 14px;}
.qc-root .qc-hero h1 .ac{color:var(--acc);}
.qc-root .qc-hero p{font-size:16px;color:var(--t2);line-height:1.7;max-width:440px;}
.qc-root .qc-cta{display:flex;gap:12px;margin-top:26px;}
.qc-root .qc-btn-lg{height:46px;padding:0 22px;font-size:15px;}
.qc-root .qc-diagram{background:var(--s1);border:1px solid var(--b1);border-radius:16px;padding:26px;}
.qc-root .qc-node{display:flex;align-items:center;gap:12px;background:var(--s2);border:1px solid var(--b1);border-radius:10px;padding:12px 14px;}
.qc-root .qc-node .ic{width:34px;height:34px;border-radius:8px;display:flex;align-items:center;justify-content:center;color:#fff;flex-shrink:0;}
.qc-root .qc-node .nm{font-size:13px;font-weight:600;}
.qc-root .qc-node .sub{font-size:11px;color:var(--t3);}
.qc-root .qc-node .tag{margin-left:auto;}
.qc-root .qc-slaves{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:14px;}
.qc-root .qc-wires{height:26px;position:relative;}
.qc-root .qc-wires:before{content:"";position:absolute;left:50%;top:0;height:13px;width:1px;background:var(--b2);}
.qc-root .qc-wires:after{content:"";position:absolute;left:25%;right:25%;top:13px;height:1px;background:var(--b2);}
.qc-root .qc-wd{position:absolute;top:13px;width:1px;height:13px;background:var(--b2);}
.qc-root .qc-how{display:grid;grid-template-columns:repeat(3,1fr);gap:16px;margin-top:56px;}
.qc-root .qc-how .c{background:var(--s1);border:1px solid var(--b1);border-radius:12px;padding:20px;}
.qc-root .qc-how .n{font-size:13px;color:var(--acc);font-weight:600;}
.qc-root .qc-how h3{font-size:15px;font-weight:600;margin:10px 0 6px;}
.qc-root .qc-how p{font-size:13px;color:var(--t3);line-height:1.55;}
@media (max-width:880px){.qc-root .qc-hero{grid-template-columns:1fr;gap:28px;}.qc-root .qc-hero h1{font-size:36px;}.qc-root .qc-how{grid-template-columns:1fr;}}
`;

const STEPS = [
  { n: '01', t: 'Connect', p: 'Link your cTrader account in seconds via secure OAuth — no passwords stored.' },
  { n: '02', t: 'Configure', p: 'Pick a role, choose a provider or accounts, and set your lot sizing + risk caps.' },
  { n: '03', t: 'Go live', p: 'Trades mirror in real time. Watch P&L, followers, and allocation from one dashboard.' },
];

/** Marketing landing page for the copy-trading product (own top bar + container). */
export default function QcLanding({ onStart }: Props) {
  return (
    <div className="qc-root">
      <style>{QC_CSS}</style>
      <style>{LAND_CSS}</style>

      <div className="qc-top">
        <div className="qc-brand">Trade<b>Sync</b></div>
        <div style={{ display: 'flex', gap: 6 }}>
          <button className="qc-toplink">Features</button>
          <button className="qc-toplink">Pricing</button>
          <button className="qc-toplink"><Radio size={14} /> Providers</button>
        </div>
      </div>

      <div className="qc-land">
        <div className="qc-hero">
          <div>
            <span className="qc-pillb"><span style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--ok)', display: 'inline-block' }} /> Automated copy trading</span>
            <h1>One engine for <span className="ac">all your accounts.</span></h1>
            <p>Mirror a pro's trades, broadcast your own, copy between your accounts, or auto-run Telegram signals — in real time, with your own risk controls.</p>
            <div className="qc-cta">
              <button className="qc-btn qc-btn-pri qc-btn-lg" onClick={onStart}>Start now <ArrowRight size={16} /></button>
              <button className="qc-btn qc-btn-sec qc-btn-lg" onClick={onStart}>See how it works</button>
            </div>
          </div>
          <div className="qc-diagram">
            <div className="qc-node">
              <div className="ic" style={{ background: 'linear-gradient(135deg,#5B6CFF,#8B5CF6)' }}><Radio size={18} /></div>
              <div><div className="nm">Master account</div><div className="sub mono">#1000001</div></div>
              <span className="qc-badge qc-b-conn tag">Master</span>
            </div>
            <div className="qc-wires"><span className="qc-wd" style={{ left: '25%' }} /><span className="qc-wd" style={{ left: '75%' }} /></div>
            <div className="qc-slaves">
              <div className="qc-node">
                <div className="ic" style={{ background: 'var(--s3)' }}><User size={18} /></div>
                <div><div className="nm">Follower A</div><div className="sub mono">1.0× lot</div></div>
              </div>
              <div className="qc-node">
                <div className="ic" style={{ background: 'var(--s3)' }}><User size={18} /></div>
                <div><div className="nm">Follower B</div><div className="sub mono">0.5× lot</div></div>
              </div>
            </div>
          </div>
        </div>

        <div className="qc-how">
          {STEPS.map(s => (
            <div className="c" key={s.n}>
              <div className="n mono">{s.n}</div>
              <h3>{s.t}</h3>
              <p>{s.p}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
