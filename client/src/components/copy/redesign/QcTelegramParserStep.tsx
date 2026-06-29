interface Props {
  buyKeywords: string;
  onBuyKeywords: (v: string) => void;
  sellKeywords: string;
  onSellKeywords: (v: string) => void;
  symbolKeyword: string;
  onSymbolKeyword: (v: string) => void;
  slKeyword: string;
  onSlKeyword: (v: string) => void;
  tpKeyword: string;
  onTpKeyword: (v: string) => void;
}

const labelStyle = { display: 'block', fontSize: 12, fontWeight: 500, color: 'var(--t2)', marginBottom: 7 };

/** Step — map a channel's signal vocabulary to TradeSync fields. */
export default function QcTelegramParserStep({
  buyKeywords, onBuyKeywords,
  sellKeywords, onSellKeywords,
  symbolKeyword, onSymbolKeyword,
  slKeyword, onSlKeyword,
  tpKeyword, onTpKeyword,
}: Props) {
  const field = (label: string, value: string, on: (v: string) => void, hint: string, ph?: string) => (
    <div>
      <label style={labelStyle}>{label}</label>
      <input className="qc-inp mono" value={value} onChange={e => on(e.target.value)} placeholder={ph} />
      <div className="qc-hint">{hint}</div>
    </div>
  );

  return (
    <>
      <div className="qc-eyebrow">Step 04 · Parser</div>
      <h1 className="qc-h1" style={{ marginTop: 10, marginBottom: 6 }}>Teach the parser this channel's format</h1>
      <div className="qc-sub">Map the keywords this channel uses so every message is read correctly.</div>

      <div style={{ marginTop: 22 }}>
        <label style={{ display: 'block', fontSize: 12, fontWeight: 500, color: 'var(--t2)', marginBottom: 7 }}>Sample signal</label>
        <div className="mono" style={{ background: 'var(--inset)', border: '1px solid var(--b1)', borderRadius: 10, padding: '14px 16px', fontSize: 13, color: 'var(--t2)', lineHeight: 1.7 }}>
          🟢 BUY GOLD @ 2318.4<br />SL: 2310.0<br />TP1: 2336.0
        </div>
      </div>

      <div style={{ marginTop: 18, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        {field('Buy keywords', buyKeywords, onBuyKeywords, 'Comma-separated. Matched case-insensitively.', 'BUY, LONG, 🟢')}
        {field('Sell keywords', sellKeywords, onSellKeywords, 'Comma-separated. Matched case-insensitively.', 'SELL, SHORT, 🔴')}
        {field('Symbol keyword', symbolKeyword, onSymbolKeyword, 'Token preceding the instrument.', 'after side')}
        {field('Stop-loss keyword', slKeyword, onSlKeyword, 'Label that prefixes the SL price.', 'SL, STOP')}
        {field('Take-profit keyword', tpKeyword, onTpKeyword, 'Label that prefixes the TP price.', 'TP, TP1, TARGET')}
      </div>
    </>
  );
}
