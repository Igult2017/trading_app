import { useState, useEffect, CSSProperties } from "react";

const platformList = [
  {
    id: "mt5", name: "MT5",
    icon: () => (
      <svg viewBox="0 0 48 48" width="38" height="38">
        <circle cx="24" cy="24" r="22" fill="#1a3a5c" stroke="#2a5a8c" strokeWidth="1.5"/>
        <circle cx="24" cy="18" r="8" fill="#4a9eda" opacity="0.8"/>
        <circle cx="16" cy="30" r="6" fill="#3a8ecb" opacity="0.7"/>
        <circle cx="32" cy="30" r="6" fill="#2a7ebc" opacity="0.7"/>
        <text x="24" y="26" textAnchor="middle" fill="white" fontSize="10" fontWeight="bold">5</text>
      </svg>
    ),
  },
  {
    id: "mt4", name: "MT4",
    icon: () => (
      <svg viewBox="0 0 48 48" width="38" height="38">
        <circle cx="24" cy="24" r="22" fill="#1a3a5c" stroke="#2a5a8c" strokeWidth="1.5"/>
        <circle cx="24" cy="18" r="8" fill="#5aaeea" opacity="0.8"/>
        <circle cx="16" cy="30" r="6" fill="#4a9eda" opacity="0.7"/>
        <circle cx="32" cy="30" r="6" fill="#3a8ecb" opacity="0.7"/>
        <text x="24" y="26" textAnchor="middle" fill="white" fontSize="10" fontWeight="bold">4</text>
      </svg>
    ),
  },
  {
    id: "matchtrader", name: "MatchTrader",
    icon: () => (
      <svg viewBox="0 0 48 48" width="38" height="38">
        <rect width="48" height="48" rx="0" fill="#0d1b2a"/>
        <path d="M8 24 L16 14 L24 20 L32 10 L40 18" stroke="#00bcd4" strokeWidth="2.5" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
        <path d="M8 30 L16 24 L24 28 L32 20 L40 26" stroke="#0086a8" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" opacity="0.6"/>
        <circle cx="16" cy="14" r="2" fill="#00bcd4"/>
        <circle cx="32" cy="10" r="2" fill="#00bcd4"/>
      </svg>
    ),
  },
  {
    id: "bitunix", name: "Bitunix",
    icon: () => (
      <svg viewBox="0 0 48 48" width="38" height="38">
        <rect width="48" height="48" rx="0" fill="#0a1628"/>
        <path d="M24 8 L38 38 L24 32 L10 38 Z" fill="#4ade80" opacity="0.9"/>
        <path d="M24 8 L38 38 L24 32 Z" fill="#22c55e"/>
      </svg>
    ),
  },
  {
    id: "dxtrade", name: "DXTrade",
    icon: () => (
      <svg viewBox="0 0 48 48" width="38" height="38">
        <rect width="48" height="48" rx="0" fill="#0a1628"/>
        <text x="8" y="30" fill="#1d9bf0" fontSize="20" fontWeight="900" fontFamily="monospace">DX</text>
      </svg>
    ),
  },
  {
    id: "ctrader", name: "CTrader",
    icon: () => (
      <svg viewBox="0 0 48 48" width="38" height="38">
        <rect width="48" height="48" rx="0" fill="#cc0000"/>
        <circle cx="24" cy="24" r="13" fill="none" stroke="white" strokeWidth="3"/>
        <circle cx="24" cy="24" r="6" fill="white"/>
        <rect x="32" y="10" width="8" height="8" rx="0" fill="#cc0000" transform="rotate(45 36 14)"/>
      </svg>
    ),
  },
  {
    id: "tradelocker", name: "TradeLocker",
    icon: () => (
      <svg viewBox="0 0 48 48" width="38" height="38">
        <rect width="48" height="48" rx="0" fill="#0a1628"/>
        <rect x="14" y="10" width="20" height="4" rx="0" fill="#60a5fa"/>
        <rect x="14" y="18" width="20" height="4" rx="0" fill="#60a5fa" opacity="0.7"/>
        <rect x="14" y="26" width="20" height="4" rx="0" fill="#60a5fa" opacity="0.5"/>
        <rect x="14" y="34" width="20" height="4" rx="0" fill="#60a5fa" opacity="0.3"/>
      </svg>
    ),
  },
  {
    id: "binance", name: "Binance",
    icon: () => (
      <svg viewBox="0 0 48 48" width="38" height="38">
        <rect width="48" height="48" rx="0" fill="#0a1628"/>
        <path d="M24 10 L28 14 L24 18 L20 14 Z" fill="#f3ba2f"/>
        <path d="M14 20 L18 16 L22 20 L18 24 Z" fill="#f3ba2f"/>
        <path d="M26 20 L30 16 L34 20 L30 24 Z" fill="#f3ba2f"/>
        <path d="M24 22 L28 26 L24 30 L20 26 Z" fill="#f3ba2f"/>
        <path d="M24 32 L28 36 L24 40 L20 36 Z" fill="#f3ba2f"/>
      </svg>
    ),
  },
  {
    id: "bybit", name: "ByBit",
    icon: () => (
      <svg viewBox="0 0 48 48" width="38" height="38">
        <rect width="48" height="48" rx="0" fill="#1a1a2e"/>
        <text x="7" y="30" fill="#f7a600" fontSize="11" fontWeight="900" fontFamily="monospace">BYBIT</text>
      </svg>
    ),
  },
  {
    id: "bitget", name: "Bitget",
    icon: () => (
      <svg viewBox="0 0 48 48" width="38" height="38">
        <rect width="48" height="48" rx="0" fill="#00c6a2"/>
        <path d="M14 24 L24 14 L34 24" stroke="white" strokeWidth="3" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
        <path d="M14 30 L24 20 L34 30" stroke="white" strokeWidth="3" fill="none" strokeLinecap="round" strokeLinejoin="round" opacity="0.6"/>
      </svg>
    ),
  },
  {
    id: "charlesschwab", name: "Charles Schwab",
    icon: () => (
      <svg viewBox="0 0 48 48" width="38" height="38">
        <rect width="48" height="48" rx="0" fill="#0a2240"/>
        <text x="6" y="20" fill="white" fontSize="9" fontWeight="700" fontFamily="serif" fontStyle="italic">charles</text>
        <text x="6" y="32" fill="white" fontSize="9" fontWeight="700" fontFamily="serif" fontStyle="italic">schwab</text>
      </svg>
    ),
  },
  {
    id: "coinbase", name: "CoinBase",
    icon: () => (
      <svg viewBox="0 0 48 48" width="38" height="38">
        <rect width="48" height="48" rx="0" fill="#1652f0"/>
        <circle cx="24" cy="24" r="12" fill="white" opacity="0.2"/>
        <text x="24" y="29" textAnchor="middle" fill="white" fontSize="16" fontWeight="900">C</text>
      </svg>
    ),
  },
];

const defaultAccounts = [
  {
    name: "10676855",
    number: "10676855",
    server: "PoTrade-...",
    type: "DEMO",
    platform: "MT5",
    balance: "$10,000.00",
    connection: "API",
    lastSync: "Ages ago!",
  },
];

function useWindowWidth() {
  const [width, setWidth] = useState(typeof window !== "undefined" ? window.innerWidth : 1024);
  useEffect(() => {
    const handle = () => setWidth(window.innerWidth);
    window.addEventListener("resize", handle);
    return () => window.removeEventListener("resize", handle);
  }, []);
  return width;
}

interface AccountsPageProps {
  openModal?: boolean;
}

export default function AccountsPage({ openModal = false }: AccountsPageProps) {
  const [modalOpen, setModalOpen] = useState(openModal);
  const [selected, setSelected] = useState<string | null>(null);
  const [pageSize, setPageSize] = useState(10);
  const width = useWindowWidth();
  const isMobile = width < 640;
  const isTablet = width >= 640 && width < 1024;

  useEffect(() => {
    setModalOpen(openModal);
  }, [openModal]);


  return (
    <div style={s.root}>
      <style>{`
        * { box-sizing: border-box; }
        ::-webkit-scrollbar { height: 4px; width: 4px; background: #0b1220; }
        ::-webkit-scrollbar-thumb { background: #1e293b; }
      `}</style>

      {/* Top Banner */}
      <div style={{
        ...s.banner,
        fontSize: isMobile ? 12 : 14,
        padding: isMobile ? "8px 14px" : "10px 24px",
      }}>
        <span style={s.bannerIcon}>ⓘ</span>
        <span>{isMobile ? "Sync issues? Try history repair" : "Issues syncing? Try an account history repair"}</span>
        <span style={{ marginLeft: 6 }}>🔧</span>
      </div>

      {/* Main Content */}
      <div style={{
        ...s.content,
        padding: isMobile ? "0 12px 20px" : isTablet ? "0 16px 20px" : "0 24px 24px",
      }}>

        {/* Tab Row */}
        <div style={{
          ...s.tabRow,
          flexDirection: isMobile ? "column" : "row",
          alignItems: isMobile ? "flex-start" : "center",
          gap: isMobile ? 10 : 0,
        } as CSSProperties}>
          <div style={s.tabs}>
            <button style={{ ...s.tab, ...s.tabActive }}>Accounts</button>
            <button style={s.tab}>
              Portfolios <span style={s.proBadge}>Pro</span>
            </button>
          </div>
          <div style={{
            ...s.tabRowRight,
            width: isMobile ? "100%" : "auto",
            justifyContent: isMobile ? "flex-end" : "flex-start",
          } as CSSProperties}>
            <span style={s.counter}>1/20</span>
            <button
              style={{ ...s.addBtn, fontSize: isMobile ? 12 : 14, padding: isMobile ? "6px 10px" : "7px 16px" }}
              onClick={() => setModalOpen(true)}
            >
              <span style={{ fontSize: isMobile ? 15 : 18, lineHeight: 1 }}>+</span>
              {isMobile ? "Add" : "Add Account"}
            </button>
            <button style={{ ...s.syncBtn, fontSize: isMobile ? 12 : 14, padding: isMobile ? "6px 10px" : "7px 16px" }}>
              <span style={{ fontSize: 14 }}>↻</span>
              {isMobile ? "Sync" : "Sync All"}
            </button>
          </div>
        </div>

        {/* Table */}
        <div style={{ ...s.tableWrap, overflowX: "auto" }}>
          <table style={{ ...s.table, minWidth: isMobile ? 580 : "100%" }}>
            <thead>
              <tr>
                {["Name", "Number", "Server", "Type", "Platform", "Balance", "Connecti...", "Last Sync", "Actions"].map((h) => (
                  <th key={h} style={{
                    ...s.th,
                    padding: isMobile ? "10px" : "13px 16px",
                    fontSize: isMobile ? 11 : 13,
                  }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {defaultAccounts.map((a, i) => (
                <tr key={i} style={s.tr}>
                  <td style={{ ...s.td, padding: isMobile ? "10px" : "14px 16px", fontSize: isMobile ? 12 : 14 }}>{a.name}</td>
                  <td style={{ ...s.td, padding: isMobile ? "10px" : "14px 16px", fontSize: isMobile ? 12 : 14 }}>{a.number}</td>
                  <td style={{ ...s.td, padding: isMobile ? "10px" : "14px 16px", fontSize: isMobile ? 12 : 14 }}>{a.server}</td>
                  <td style={{ ...s.td, color: "#ef4444", fontWeight: 700, padding: isMobile ? "10px" : "14px 16px", fontSize: isMobile ? 12 : 14 }}>{a.type}</td>
                  <td style={{ ...s.td, padding: isMobile ? "10px" : "14px 16px", fontSize: isMobile ? 12 : 14 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <span style={s.platformIcon}>⚙</span>
                      {a.platform}
                    </div>
                  </td>
                  <td style={{ ...s.td, padding: isMobile ? "10px" : "14px 16px", fontSize: isMobile ? 12 : 14 }}>{a.balance}</td>
                  <td style={{ ...s.td, padding: isMobile ? "10px" : "14px 16px", fontSize: isMobile ? 12 : 14 }}>{a.connection}</td>
                  <td style={{ ...s.td, padding: isMobile ? "10px" : "14px 16px", fontSize: isMobile ? 12 : 14 }}>{a.lastSync}</td>
                  <td style={{ ...s.td, padding: isMobile ? "8px" : "14px 16px" }}>
                    <div style={{ ...s.actions, gap: isMobile ? 2 : 6 }}>
                      <button style={{ ...s.actionBtn, fontSize: isMobile ? 12 : 15 }} title="Settings">🔧</button>
                      <button style={{ ...s.actionBtn, fontSize: isMobile ? 12 : 15 }} title="Refresh">↻</button>
                      <button style={{ ...s.actionBtn, fontSize: isMobile ? 12 : 15 }} title="Share">⬆</button>
                      <button style={{ ...s.actionBtn, color: "#38bdf8", fontSize: isMobile ? 12 : 15 }} title="Edit">✏</button>
                      <button style={{ ...s.actionBtn, color: "#ef4444", fontSize: isMobile ? 12 : 15 }} title="Delete">🗑</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        <div style={{
          ...s.pagination,
          flexWrap: "wrap",
          gap: isMobile ? 8 : 12,
          justifyContent: isMobile ? "center" : "flex-end",
        } as CSSProperties}>
          <span style={s.pageLabel}>Page Size:</span>
          <select
            style={s.pageSelect}
            value={pageSize}
            onChange={(e) => setPageSize(Number(e.target.value))}
          >
            {[10, 25, 50].map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
          <span style={s.pageInfo}>1 to 1 of 1</span>
          <div style={s.pageNav}>
            <button style={s.pageBtn}>«</button>
            <button style={s.pageBtn}>‹</button>
            <span style={s.pageLabel}>Page <strong>1</strong> of 1</span>
            <button style={s.pageBtn}>›</button>
            <button style={s.pageBtn}>»</button>
          </div>
        </div>
      </div>

      {/* Add Account Modal */}
      {modalOpen && (
        <div
          style={{
            ...s.overlay,
            alignItems: isMobile ? "flex-end" : "center",
          } as CSSProperties}
          onClick={() => { setModalOpen(false); setSelected(null); }}
        >
          <div
            style={{
              ...s.modal,
              width: isMobile ? "100%" : isTablet ? "90vw" : 560,
              maxWidth: isMobile ? "100%" : "95vw",
              maxHeight: "90vh",
              borderLeft: isMobile ? "none" : "1px solid #1e3050",
              borderRight: isMobile ? "none" : "1px solid #1e3050",
            } as CSSProperties}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div style={s.modalHeader as CSSProperties}>
              <h2 style={{ ...s.modalTitle, fontSize: isMobile ? 15 : 18 }}>Select trading platform</h2>
              <button style={s.closeBtn} onClick={() => { setModalOpen(false); setSelected(null); }}>✕</button>
            </div>

            {/* Platform Grid */}
            <div style={{ ...s.modalBody, padding: isMobile ? "14px 12px 20px" : "18px 24px 24px" }}>
              <div style={{
                ...s.grid,
                gridTemplateColumns: isMobile ? "repeat(3, 1fr)" : "repeat(4, 1fr)",
                gap: isMobile ? 8 : 12,
              } as CSSProperties}>
                {platformList.map((p) => {
                  const Icon = p.icon;
                  return (
                    <button
                      key={p.id}
                      style={{
                        ...s.platformCard,
                        ...(selected === p.id ? s.platformCardSelected : {}),
                        padding: isMobile ? "12px 6px 10px" : "16px 8px 12px",
                      } as CSSProperties}
                      onClick={() => setSelected(p.id)}
                    >
                      <div style={s.platformIconWrap}><Icon /></div>
                      <span style={{ ...s.platformName, fontSize: isMobile ? 10 : 12 }}>{p.name}</span>
                    </button>
                  );
                })}
              </div>

              {/* Broker Banner */}
              <div style={{
                ...s.brokerBanner,
                flexDirection: isMobile ? "column" : "row",
                alignItems: isMobile ? "flex-start" : "center",
                padding: isMobile ? "14px" : "16px 20px",
              } as CSSProperties}>
                <div style={s.brokerBannerLeft}>
                  <p style={{ ...s.brokerQ, fontSize: isMobile ? 13 : 14 }}>Need a broker before connecting?</p>
                  <p style={{ ...s.brokerSub, fontSize: isMobile ? 12 : 13 }}>
                    Take our quick quiz to match with a partner that fits your region, budget, and platforms.
                  </p>
                </div>
                <button style={{
                  ...s.findBrokerBtn,
                  width: isMobile ? "100%" : "auto",
                  textAlign: "center",
                  padding: isMobile ? "10px 0" : "10px 22px",
                  fontSize: isMobile ? 13 : 14,
                }}>Find a Broker</button>
              </div>
            </div>

            {/* Nav Arrows — desktop only */}
            {!isMobile && (
              <>
                <button style={{ ...s.navArrow, left: -20 } as CSSProperties}>‹</button>
                <button style={{ ...s.navArrow, right: -20 } as CSSProperties}>›</button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

const s: Record<string, CSSProperties> = {
  root: {
    minHeight: "100%",
    background: "#070d1a",
    fontFamily: "'Montserrat', 'Segoe UI', sans-serif",
    color: "#cbd5e1",
    display: "flex",
    flexDirection: "column",
  },
  banner: {
    background: "#0c1a2e",
    borderBottom: "1px solid #1a3050",
    padding: "10px 24px",
    fontSize: 14,
    color: "#94a3b8",
    display: "flex",
    alignItems: "center",
    gap: 6,
  },
  bannerIcon: { color: "#38bdf8", fontSize: 16 },
  content: {
    padding: "0 24px 24px",
    flex: 1,
  },
  tabRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "14px 0 0",
    marginBottom: 16,
  },
  tabs: { display: "flex", gap: 28, alignItems: "center" },
  tab: {
    background: "none",
    border: "none",
    color: "#64748b",
    fontSize: 15,
    fontWeight: 500,
    cursor: "pointer",
    padding: "6px 0",
    display: "flex",
    alignItems: "center",
    gap: 6,
    fontFamily: "'Montserrat', 'Segoe UI', sans-serif",
  },
  tabActive: {
    color: "#38bdf8",
    borderBottom: "2px solid #38bdf8",
    fontWeight: 700,
  },
  proBadge: {
    background: "#1e40af",
    color: "#93c5fd",
    fontSize: 10,
    fontWeight: 700,
    padding: "2px 6px",
    borderRadius: 0,
  },
  tabRowRight: { display: "flex", gap: 10, alignItems: "center" },
  counter: {
    background: "#1e293b",
    border: "1px solid #334155",
    borderRadius: 0,
    padding: "4px 10px",
    fontSize: 13,
    color: "#94a3b8",
  },
  addBtn: {
    background: "transparent",
    border: "1.5px solid #38bdf8",
    color: "#38bdf8",
    borderRadius: 0,
    padding: "7px 16px",
    fontSize: 14,
    fontWeight: 600,
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    gap: 6,
    fontFamily: "'Montserrat', 'Segoe UI', sans-serif",
  },
  syncBtn: {
    background: "transparent",
    border: "1.5px solid #334155",
    color: "#94a3b8",
    borderRadius: 0,
    padding: "7px 16px",
    fontSize: 14,
    fontWeight: 500,
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    gap: 6,
    fontFamily: "'Montserrat', 'Segoe UI', sans-serif",
  },
  tableWrap: {
    border: "1px solid #1e293b",
    borderRadius: 0,
    overflow: "hidden",
  },
  table: {
    width: "100%",
    borderCollapse: "collapse",
    background: "#0b1220",
  },
  th: {
    padding: "13px 16px",
    textAlign: "left",
    fontSize: 13,
    fontWeight: 600,
    color: "#64748b",
    borderBottom: "1px solid #1e293b",
    borderRight: "1px solid #1a2a40",
    whiteSpace: "nowrap",
  },
  tr: { borderBottom: "1px solid #111d30" },
  td: {
    padding: "14px 16px",
    fontSize: 14,
    color: "#cbd5e1",
    borderRight: "1px solid #111d30",
    whiteSpace: "nowrap",
  },
  platformIcon: {
    width: 22,
    height: 22,
    borderRadius: 0,
    background: "#1a3a5c",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: 12,
  },
  actions: { display: "flex", gap: 6, alignItems: "center" },
  actionBtn: {
    background: "none",
    border: "none",
    color: "#94a3b8",
    cursor: "pointer",
    fontSize: 15,
    padding: "2px 4px",
  },
  pagination: {
    display: "flex",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: 12,
    padding: "14px 0 0",
    fontSize: 13,
    color: "#64748b",
  },
  pageLabel: { color: "#64748b", fontSize: 13 },
  pageSelect: {
    background: "#1e293b",
    border: "1px solid #334155",
    color: "#cbd5e1",
    borderRadius: 0,
    padding: "4px 10px",
    fontSize: 13,
    cursor: "pointer",
    fontFamily: "'Montserrat', 'Segoe UI', sans-serif",
  },
  pageInfo: { color: "#94a3b8" },
  pageNav: { display: "flex", alignItems: "center", gap: 4 },
  pageBtn: {
    background: "none",
    border: "1px solid #1e293b",
    color: "#64748b",
    borderRadius: 0,
    padding: "3px 8px",
    cursor: "pointer",
    fontSize: 13,
  },
  overlay: {
    position: "fixed",
    inset: 0,
    background: "rgba(0,0,0,0.7)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 1000,
    backdropFilter: "blur(4px)",
  },
  modal: {
    background: "#0d1827",
    border: "1px solid #1e3050",
    borderRadius: 0,
    width: 560,
    maxWidth: "95vw",
    maxHeight: "90vh",
    overflowY: "auto",
    position: "relative",
    boxShadow: "0 24px 80px rgba(0,0,0,0.7)",
  },
  modalHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "22px 24px 14px",
    position: "sticky",
    top: 0,
    background: "#0d1827",
    zIndex: 1,
    borderBottom: "1px solid #1e3050",
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: 700,
    color: "#f1f5f9",
    margin: 0,
  },
  closeBtn: {
    background: "none",
    border: "none",
    color: "#ef4444",
    fontSize: 18,
    cursor: "pointer",
    padding: "2px 6px",
    lineHeight: 1,
  },
  modalBody: { padding: "18px 24px 24px" },
  grid: {
    display: "grid",
    gridTemplateColumns: "repeat(4, 1fr)",
    gap: 12,
    marginBottom: 20,
  },
  platformCard: {
    background: "#111e30",
    border: "1.5px solid #1e3050",
    borderRadius: 0,
    padding: "16px 8px 12px",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: 8,
    cursor: "pointer",
    transition: "all 0.15s",
    color: "#e2e8f0",
    fontFamily: "'Montserrat', 'Segoe UI', sans-serif",
  },
  platformCardSelected: {
    border: "1.5px solid #38bdf8",
    background: "#0c2233",
  },
  platformIconWrap: {
    width: 48,
    height: 48,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  platformName: {
    fontSize: 12,
    fontWeight: 600,
    color: "#cbd5e1",
    textAlign: "center",
    lineHeight: 1.2,
  },
  brokerBanner: {
    background: "#0f1e30",
    border: "1px solid #1e3a55",
    borderRadius: 0,
    padding: "16px 20px",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 16,
    marginTop: 4,
  },
  brokerBannerLeft: { flex: 1 },
  brokerQ: {
    color: "#f1f5f9",
    fontWeight: 700,
    fontSize: 14,
    margin: "0 0 4px",
  },
  brokerSub: {
    color: "#64748b",
    fontSize: 13,
    margin: 0,
    lineHeight: 1.5,
  },
  findBrokerBtn: {
    background: "#1d6ed8",
    border: "none",
    color: "white",
    fontWeight: 700,
    fontSize: 14,
    borderRadius: 0,
    padding: "10px 22px",
    cursor: "pointer",
    whiteSpace: "nowrap",
    fontFamily: "'Montserrat', 'Segoe UI', sans-serif",
  },
  navArrow: {
    position: "absolute",
    top: "50%",
    transform: "translateY(-50%)",
    background: "#1e293b",
    border: "1px solid #334155",
    color: "#94a3b8",
    borderRadius: 0,
    width: 36,
    height: 36,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    cursor: "pointer",
    fontSize: 18,
    zIndex: 2,
  },
};
