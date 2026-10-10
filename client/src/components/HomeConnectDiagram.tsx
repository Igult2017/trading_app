import { Zap, PenLine, Camera, BookOpen, BarChart3, ClipboardCheck, Diamond } from 'lucide-react';
import Wordmark from '@/components/Wordmark';
import { display, sans, homeTokens, type HomeTokens } from '@/components/homeTokens';

/**
 * HomeConnectDiagram — "Your trades. One connected workspace." Added 2026-10-07 from the fifth and
 * sixth screenshots he sent.
 *
 * ⚠ THIS IS THE SECTION THE REFERENCE GETS MOST WRONG FOR US. Its diagram shows six trading
 * platforms — MetaTrader 4 and 5, cTrader, TradeLocker, Tradovate, Match-Trader — all feeding in as
 * equals. We integrate cTrader and NOTHING ELSE. Copying that shape would tell a MetaTrader user
 * their trades import automatically, which is the exact false promise he flagged this page for on
 * 2026-10-06: *"only include brokers that allow use of ctrader because that is what we have
 * integrated. For other traders, the users can enter them manually."*
 *
 * So the left column is not a list of platforms — it is the three ways a trade actually gets in, and
 * only one of them is automatic. Each one carries its own badge saying which.
 *
 * HOW THE CURVED CONNECTORS STAY ON THE CARDS. The SVG and the cards share ONE coordinate space:
 * a 1000x420 viewBox, and a container locked to that same 1000/420 aspect ratio, with every card
 * placed as a percentage of the same numbers. Lines cannot drift off the cards because both are
 * drawn from the same figures. Change a card's position and you MUST change its anchor below.
 *
 * ⚠ THE CURVES ARE DESKTOP-ONLY. Below `lg` the whole diagram is replaced by a plain stacked list —
 * curved connectors between three columns do not survive a 400px-wide phone, they just overlap.
 */

// x,y,w,h in the shared 1000x420 space. Anchors: left cards join at their right edge, right cards at
// their left edge, both at the card's vertical centre.
const INPUTS = [
  { icon: Zap,     title: 'cTrader',    note: 'Auto-sync',     badge: true,  box: [20, 40, 250, 62] },
  { icon: PenLine, title: 'Any broker', note: 'Manual entry',  badge: false, box: [50, 179, 250, 62] },
  { icon: Camera,  title: 'Screenshot', note: 'AI reads it',   badge: false, box: [20, 318, 250, 62] },
];

// ⚠ KEEP EVERY `desc` SHORT ENOUGH FOR ONE LINE. The card is a fixed 62px tall (its height is part
// of the shared coordinate space the connector lines are drawn from), and about 199px of that width
// is left for text after the padding and the icon. The first drafts ran to two lines and spilled out
// of the card's bottom border. If a description has to grow, grow the BOX and move the wire anchor
// with it — do not let it wrap.
const OUTPUTS = [
  { icon: BookOpen,       title: 'Journal',      desc: 'The thinking behind every trade.', box: [720, 25, 260, 62] },
  { icon: BarChart3,      title: 'Analytics',    desc: 'Where your edge actually is.',     box: [720, 120, 260, 62] },
  { icon: ClipboardCheck, title: 'Drawdown',     desc: 'Your room, before you trade.',     box: [720, 215, 260, 62] },
  { icon: Diamond,        title: 'Edge Builder', desc: 'Patterns, turned into rules.',     box: [720, 310, 260, 62] },
];

/** Paths and their midpoint dots, in the same 1000x420 space. */
const WIRES = [
  { d: 'M 270 71 C 340 71, 360 210, 420 210',   dot: [349, 141] },
  { d: 'M 300 210 L 420 210',                   dot: [360, 210] },
  { d: 'M 270 349 C 340 349, 360 210, 420 210', dot: [349, 280] },
  { d: 'M 620 210 C 670 210, 680 56, 720 56',   dot: [674, 133] },
  { d: 'M 620 210 C 670 210, 680 151, 720 151', dot: [674, 181] },
  { d: 'M 620 210 C 670 210, 680 246, 720 246', dot: [674, 228] },
  { d: 'M 620 210 C 670 210, 680 341, 720 341', dot: [674, 276] },
];

const pct = ([x, y, w, h]: number[]) => ({
  position: 'absolute' as const,
  left: `${(x / 1000) * 100}%`, top: `${(y / 420) * 100}%`,
  width: `${(w / 1000) * 100}%`, height: `${(h / 420) * 100}%`,
});

function cardStyle(t: HomeTokens) {
  return {
    display: 'flex', alignItems: 'center', gap: 11, padding: '0 16px', borderRadius: 13,
    background: t.card, border: `1px solid ${t.border}`, boxShadow: t.shadow,
  } as const;
}

export default function HomeConnectDiagram({ darkMode, brokers }: { darkMode: boolean; brokers: string[] }) {
  const t = homeTokens(darkMode);
  const cs = cardStyle(t);

  const InputCard = ({ icon: Icon, title, note, badge }: typeof INPUTS[number]) => (
    <>
      <Icon size={18} color={badge ? t.accent : t.muted} strokeWidth={2} aria-hidden />
      <span style={{ ...sans, fontSize: 14, fontWeight: 700, color: t.text }}>{title}</span>
      {/* 11px, not 10.5 — the readability sweep flags anything under 11px, and these three badges
          were the only text on the page below it. `accentInk`, not `accent`: accent on its own wash
          measures 4.01:1 light / 3.61:1 dark, both under the floor. */}
      <span style={{
        ...sans, marginLeft: 'auto', fontSize: 11, fontWeight: 700, padding: '3px 9px', borderRadius: 999,
        letterSpacing: '0.04em', whiteSpace: 'nowrap',
        color: badge ? t.accentInk : t.muted,
        background: badge ? t.accentSoft : 'transparent',
        border: badge ? 'none' : `1px solid ${t.border}`,
      }}>{note}</span>
    </>
  );

  const OutputCard = ({ icon: Icon, title, desc }: typeof OUTPUTS[number]) => (
    <>
      <Icon size={18} color={t.accent} strokeWidth={2} aria-hidden style={{ flexShrink: 0 }} />
      <span style={{ minWidth: 0 }}>
        <span style={{ ...sans, display: 'block', fontSize: 14, fontWeight: 700, color: t.text }}>{title}</span>
        <span style={{ ...sans, display: 'block', fontSize: 11.5, color: t.muted, marginTop: 1 }}>{desc}</span>
      </span>
    </>
  );

  return (
    <section style={{ background: t.bg, padding: '88px 0 0', transition: 'background 0.4s ease' }}>
      <div className="max-w-[1180px] mx-auto px-6">
        <h2 style={{ ...display, fontSize: 'clamp(1.8rem,3.4vw,2.9rem)', fontWeight: 800, textAlign: 'center',
                     color: t.text, margin: '0 0 14px', lineHeight: 1.15, letterSpacing: '-0.02em' }}>
          Your trades.<br />One connected workspace.
        </h2>
        <p style={{ ...sans, textAlign: 'center', fontSize: 15, color: t.muted, lineHeight: 1.75,
                    maxWidth: 520, margin: '0 auto 56px' }}>
          Automatically from cTrader, by hand from anywhere else &mdash; then everything downstream works
          off the same record.
        </p>

        {/* ── Desktop: the wired diagram ─────────────────────────────── */}
        <div className="hidden lg:block" style={{ position: 'relative', maxWidth: 1000, margin: '0 auto',
                                                  aspectRatio: '1000 / 420' }}>
          <svg viewBox="0 0 1000 420" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}
               aria-hidden focusable="false">
            {WIRES.map((w, i) => (
              <g key={i}>
                <path d={w.d} fill="none" stroke={t.accent} strokeWidth={1.4} opacity={0.32} />
                <circle cx={w.dot[0]} cy={w.dot[1]} r={4} fill={t.accent} />
              </g>
            ))}
          </svg>

          {INPUTS.map(c => (
            <div key={c.title} style={{ ...pct(c.box), ...cs }}><InputCard {...c} /></div>
          ))}

          {/* Centre node. The reference uses a square app icon; our artwork is a WIDE lockup (5.86:1)
              and there is no square mark — he has said the new logo comes later, so this is it. */}
          <div style={{ ...pct([420, 170, 200, 80]), ...cs, justifyContent: 'center', padding: 0,
                        borderColor: t.accent, borderWidth: 1.5 }}>
            <Wordmark height="26px" dark={darkMode} />
          </div>

          {OUTPUTS.map(c => (
            <div key={c.title} style={{ ...pct(c.box), ...cs }}><OutputCard {...c} /></div>
          ))}
        </div>

        {/* ── Phone and tablet: the same content, stacked, no curves ────
            ⚠ `grid` IS A CLASS HERE, NOT AN INLINE STYLE, AND THAT IS THE WHOLE BUG THIS COMMENT
            EXISTS FOR. Written as `style={{ display: 'grid' }}` the inline rule beats `lg:hidden`
            (which only sets `display:none` from a stylesheet), so this stacked copy rendered on
            desktop UNDERNEATH the wired diagram — every card appeared twice. Never set `display`
            inline on an element whose visibility is controlled by a responsive class. */}
        <div className="lg:hidden grid" style={{ gap: 10, maxWidth: 420, margin: '0 auto' }}>
          {INPUTS.map(c => (
            <div key={c.title} style={{ ...cs, height: 58 }}><InputCard {...c} /></div>
          ))}
          <div style={{ ...cs, height: 66, justifyContent: 'center', borderColor: t.accent, borderWidth: 1.5 }}>
            <Wordmark height="24px" dark={darkMode} />
          </div>
          {OUTPUTS.map(c => (
            <div key={c.title} style={{ ...cs, height: 58 }}><OutputCard {...c} /></div>
          ))}
        </div>

        {/* The broker strip, folded in here rather than standing as its own section — it is the
            evidence for the "cTrader" card directly above it, so it belongs with it. */}
        <p style={{ ...sans, textAlign: 'center', fontSize: 11, color: t.muted, fontWeight: 600,
                    letterSpacing: '0.1em', textTransform: 'uppercase', margin: '72px 0 24px' }}>
          Compatible with 50+ brokers
        </p>
      </div>
      <div style={{ maxWidth: 1280, margin: '0 auto', overflow: 'hidden', paddingBottom: 88 }}>
        <div className="hp-mq" style={{ gap: 10, alignItems: 'center', animationDuration: '36s' }}>
          {[...brokers, ...brokers].map((name, i) => (
            <span key={i} style={{
              display: 'inline-flex', alignItems: 'center', gap: 7, padding: '6px 16px', borderRadius: 999,
              border: `1px solid ${t.border}`, background: t.card, fontSize: 12.5, fontWeight: 600,
              color: t.muted, whiteSpace: 'nowrap', flexShrink: 0, ...sans,
            }}>
              <span style={{ width: 5, height: 5, borderRadius: '50%', background: '#94a3b8', flexShrink: 0 }} />
              {name}
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}
