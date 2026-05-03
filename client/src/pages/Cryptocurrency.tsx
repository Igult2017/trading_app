import { useQuery } from '@tanstack/react-query';
import TradingLoader, { useDelayedLoading } from '@/components/TradingLoader';
import { TrendingUp, TrendingDown, Activity, Globe, Flame, BarChart2, DollarSign, Cpu } from 'lucide-react';

// ── Types ────────────────────────────────────────────────────────────────────
interface CoinData {
  id: string; symbol: string; name: string; image: string;
  price: number; marketCap: number; rank: number; volume24h: number;
  high24h: number; low24h: number;
  change1h: number | null; change24h: number; change7d: number | null;
  circulatingSupply: number; maxSupply: number | null;
  ath: number; athChangePercent: number;
  sparkline: number[];
}

interface GlobalData {
  totalMarketCap: number; totalVolume24h: number;
  btcDominance: number; ethDominance: number;
  activeCryptocurrencies: number; markets: number;
  marketCapChange24h: number;
}

interface FearGreedEntry { value: number; classification: string; timestamp: number; }
interface FearGreedData { current: FearGreedEntry; history: FearGreedEntry[]; }

interface TrendingCoin {
  id: string; name: string; symbol: string; rank: number;
  image: string; price: number | null; change24h: number | null; score: number;
}

interface CryptoAll {
  market: CoinData[];
  global: GlobalData;
  fearGreed: FearGreedData;
  trending: TrendingCoin[];
}

// ── Helpers ──────────────────────────────────────────────────────────────────
function fmt(n: number | null | undefined, decimals = 2): string {
  if (n == null || isNaN(n)) return '—';
  return n.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

function fmtPrice(n: number | null | undefined): string {
  if (n == null || isNaN(n)) return '—';
  if (n >= 1000) return '$' + n.toLocaleString('en-US', { maximumFractionDigits: 0 });
  if (n >= 1) return '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 4 });
  return '$' + n.toLocaleString('en-US', { minimumFractionDigits: 4, maximumFractionDigits: 8 });
}

function fmtBig(n: number | null | undefined): string {
  if (n == null || isNaN(n)) return '—';
  if (n >= 1e12) return '$' + (n / 1e12).toFixed(2) + 'T';
  if (n >= 1e9)  return '$' + (n / 1e9).toFixed(2) + 'B';
  if (n >= 1e6)  return '$' + (n / 1e6).toFixed(2) + 'M';
  return '$' + n.toLocaleString('en-US', { maximumFractionDigits: 0 });
}

function fmtSupply(n: number | null | undefined): string {
  if (n == null || isNaN(n)) return '∞';
  if (n >= 1e9) return (n / 1e9).toFixed(2) + 'B';
  if (n >= 1e6) return (n / 1e6).toFixed(2) + 'M';
  return n.toLocaleString('en-US', { maximumFractionDigits: 0 });
}

function pct(n: number | null | undefined, showPlus = true): React.ReactNode {
  if (n == null || isNaN(n)) return <span className="text-muted-foreground">—</span>;
  const pos = n >= 0;
  return (
    <span className={pos ? 'text-green-400' : 'text-red-400'}>
      {pos && showPlus ? '+' : ''}{fmt(n)}%
    </span>
  );
}

// Tiny inline sparkline (SVG path, ~40 points)
function Sparkline({ data, up }: { data: number[]; up: boolean }) {
  if (!data || data.length < 2) return <div className="w-20 h-8" />;
  const min = Math.min(...data), max = Math.max(...data);
  const range = max - min || 1;
  const W = 80, H = 32;
  const pts = data.map((v, i) => {
    const x = (i / (data.length - 1)) * W;
    const y = H - ((v - min) / range) * H;
    return `${x},${y}`;
  }).join(' ');
  const color = up ? '#4ade80' : '#f87171';
  return (
    <svg width={W} height={H} className="overflow-visible">
      <polyline points={pts} fill="none" stroke={color} strokeWidth="1.5" strokeLinejoin="round" />
    </svg>
  );
}

// Fear & Greed gauge
function FearGreedGauge({ value, classification }: { value: number; classification: string }) {
  const color =
    value <= 25 ? '#ef4444' :
    value <= 45 ? '#f97316' :
    value <= 55 ? '#eab308' :
    value <= 75 ? '#84cc16' : '#22c55e';

  const labels = ['Extreme Fear', 'Fear', 'Neutral', 'Greed', 'Extreme Greed'];
  const angle = (value / 100) * 180 - 90; // -90 to +90

  return (
    <div className="flex flex-col items-center gap-2">
      <div className="relative w-36 h-20 overflow-hidden">
        <svg viewBox="0 0 120 65" className="w-full h-full">
          {/* Background arc */}
          <path d="M 10 60 A 50 50 0 0 1 110 60" fill="none" stroke="#1f2937" strokeWidth="10" strokeLinecap="round" />
          {/* Colored arc */}
          <path d="M 10 60 A 50 50 0 0 1 110 60" fill="none"
            stroke={color} strokeWidth="10" strokeLinecap="round"
            strokeDasharray={`${(value / 100) * 157} 157`} />
          {/* Needle */}
          <line
            x1="60" y1="60"
            x2={60 + 40 * Math.cos((angle * Math.PI) / 180)}
            y2={60 + 40 * Math.sin((angle * Math.PI) / 180)}
            stroke="white" strokeWidth="2" strokeLinecap="round" />
          <circle cx="60" cy="60" r="4" fill="white" />
          {/* Value */}
          <text x="60" y="52" textAnchor="middle" fontSize="14" fontWeight="bold" fill="white">{value}</text>
        </svg>
      </div>
      <span className="text-sm font-semibold" style={{ color }}>{classification}</span>
    </div>
  );
}

// Fear & Greed history bar
function FgHistoryBar({ entries }: { entries: FearGreedEntry[] }) {
  const days = ['7d', '6d', '5d', '4d', '3d', '2d', '1d'];
  return (
    <div className="flex items-end gap-1 h-12">
      {entries.slice(0, 7).reverse().map((e, i) => {
        const h = Math.max(8, (e.value / 100) * 40);
        const color =
          e.value <= 25 ? '#ef4444' :
          e.value <= 45 ? '#f97316' :
          e.value <= 55 ? '#eab308' :
          e.value <= 75 ? '#84cc16' : '#22c55e';
        return (
          <div key={i} className="flex flex-col items-center gap-0.5" title={`${days[i]}: ${e.value} (${e.classification})`}>
            <div className="rounded-sm w-6" style={{ height: h, backgroundColor: color }} />
            <span className="text-[9px] text-muted-foreground">{days[i]}</span>
          </div>
        );
      })}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function Cryptocurrency() {
  const { data, isLoading, error } = useQuery<CryptoAll>({
    queryKey: ['/api/crypto/all'],
    refetchInterval: 5 * 60 * 1000, // 5-minute refresh (matches cache TTL)
    staleTime:       5 * 60 * 1000,
  });

  const coins    = data?.market    ?? [];
  const global   = data?.global    ?? ({} as GlobalData);
  const fg       = data?.fearGreed ?? ({} as FearGreedData);
  const trending = data?.trending  ?? [];

  const showLoading = useDelayedLoading(isLoading);

  return (
    <div className="min-h-screen bg-background text-foreground p-4 md:p-6">
      <div className="max-w-[1600px] mx-auto space-y-6">

        {/* ── Header ─────────────────────────────────────────────────────── */}
        <div className="flex items-center gap-3">
          <div className="p-2 bg-orange-500/10 rounded-md">
            <BarChart2 className="w-5 h-5 text-orange-400" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight">Crypto Market</h1>
            <p className="text-xs text-muted-foreground">Live data · refreshes every 5 min</p>
          </div>
        </div>

        {showLoading ? (
          <div className="py-12 flex justify-center">
            <TradingLoader message="Fetching live crypto data…" />
          </div>
        ) : (
          <>
            {/* ── Global Stats Row ─────────────────────────────────────── */}
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
              {[
                { label: 'Market Cap', value: fmtBig(global.totalMarketCap), sub: global.marketCapChange24h != null ? pct(global.marketCapChange24h) : null, icon: Globe },
                { label: '24h Volume', value: fmtBig(global.totalVolume24h), icon: BarChart2 },
                { label: 'BTC Dominance', value: global.btcDominance != null ? `${fmt(global.btcDominance)}%` : '—', icon: DollarSign },
                { label: 'ETH Dominance', value: global.ethDominance != null ? `${fmt(global.ethDominance)}%` : '—', icon: DollarSign },
                { label: 'Active Coins', value: global.activeCryptocurrencies?.toLocaleString() ?? '—', icon: Cpu },
                { label: 'Markets', value: global.markets?.toLocaleString() ?? '—', icon: Activity },
              ].map(({ label, value, sub, icon: Icon }) => (
                <div key={label} className="bg-card border border-border rounded-md p-3 flex flex-col gap-1">
                  <div className="flex items-center gap-1.5 text-muted-foreground">
                    <Icon className="w-3.5 h-3.5" />
                    <span className="text-[11px] uppercase tracking-wide">{label}</span>
                  </div>
                  <div className="text-base font-bold">{value}</div>
                  {sub && <div className="text-xs">{sub}</div>}
                </div>
              ))}

              {/* Fear & Greed mini card */}
              <div className="bg-card border border-border rounded-md p-3 flex flex-col items-center justify-center gap-1">
                <span className="text-[11px] uppercase tracking-wide text-muted-foreground">Fear & Greed</span>
                {fg.current ? (
                  <FearGreedGauge value={fg.current.value} classification={fg.current.classification} />
                ) : <span className="text-muted-foreground text-sm">—</span>}
              </div>
            </div>

            {/* ── Main Grid ───────────────────────────────────────────────── */}
            <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">

              {/* ── Coin Table ─────────────────────────────────────────────── */}
              <div className="xl:col-span-9">
                <div className="bg-card border border-border rounded-md overflow-hidden">
                  <div className="flex items-center gap-2 px-4 py-3 border-b border-border">
                    <BarChart2 className="w-4 h-4 text-orange-400" />
                    <span className="font-semibold text-sm">Top Cryptocurrencies</span>
                    <span className="ml-auto text-xs text-muted-foreground">{coins.length} coins</span>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-[11px] uppercase text-muted-foreground border-b border-border">
                          <th className="px-4 py-2.5 text-left w-8">#</th>
                          <th className="px-2 py-2.5 text-left">Coin</th>
                          <th className="px-3 py-2.5 text-right">Price</th>
                          <th className="px-3 py-2.5 text-right">1h</th>
                          <th className="px-3 py-2.5 text-right">24h</th>
                          <th className="px-3 py-2.5 text-right">7d</th>
                          <th className="px-3 py-2.5 text-right hidden md:table-cell">Market Cap</th>
                          <th className="px-3 py-2.5 text-right hidden lg:table-cell">24h Volume</th>
                          <th className="px-3 py-2.5 text-right hidden lg:table-cell">Supply</th>
                          <th className="px-3 py-2.5 text-right hidden xl:table-cell">7d Chart</th>
                        </tr>
                      </thead>
                      <tbody>
                        {coins.map((c, i) => {
                          const up7d = (c.change7d ?? 0) >= 0;
                          return (
                            <tr key={c.id} className="border-b border-border/50 hover:bg-muted/30 transition-colors">
                              <td className="px-4 py-3 text-muted-foreground text-xs">{c.rank}</td>
                              <td className="px-2 py-3">
                                <div className="flex items-center gap-2">
                                  {c.image && (
                                    <img src={c.image} alt={c.name} className="w-6 h-6 rounded-full" />
                                  )}
                                  <div>
                                    <div className="font-semibold text-xs leading-tight">{c.symbol}</div>
                                    <div className="text-[10px] text-muted-foreground leading-tight hidden sm:block">{c.name}</div>
                                  </div>
                                </div>
                              </td>
                              <td className="px-3 py-3 text-right font-mono font-semibold text-xs">{fmtPrice(c.price)}</td>
                              <td className="px-3 py-3 text-right text-xs">{pct(c.change1h)}</td>
                              <td className="px-3 py-3 text-right text-xs">{pct(c.change24h)}</td>
                              <td className="px-3 py-3 text-right text-xs">{pct(c.change7d)}</td>
                              <td className="px-3 py-3 text-right text-xs hidden md:table-cell">{fmtBig(c.marketCap)}</td>
                              <td className="px-3 py-3 text-right text-xs hidden lg:table-cell">{fmtBig(c.volume24h)}</td>
                              <td className="px-3 py-3 text-right text-xs hidden lg:table-cell text-muted-foreground">{fmtSupply(c.circulatingSupply)}</td>
                              <td className="px-3 py-3 text-right hidden xl:table-cell">
                                <Sparkline data={c.sparkline} up={up7d} />
                              </td>
                            </tr>
                          );
                        })}
                        {coins.length === 0 && (
                          <tr>
                            <td colSpan={10} className="px-4 py-12 text-center text-muted-foreground">
                              No market data available
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>

              {/* ── Right column ─────────────────────────────────────────── */}
              <div className="xl:col-span-3 flex flex-col gap-4">

                {/* Fear & Greed Extended */}
                {fg.current && (
                  <div className="bg-card border border-border rounded-md p-4">
                    <div className="flex items-center gap-2 mb-4">
                      <Activity className="w-4 h-4 text-orange-400" />
                      <span className="font-semibold text-sm">Fear & Greed Index</span>
                    </div>
                    <div className="flex justify-center mb-4">
                      <FearGreedGauge value={fg.current.value} classification={fg.current.classification} />
                    </div>
                    {fg.history?.length > 0 && (
                      <>
                        <div className="text-[11px] text-muted-foreground mb-2 uppercase tracking-wide">7-day history</div>
                        <FgHistoryBar entries={fg.history} />
                      </>
                    )}
                    <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                      {[
                        { label: 'Extreme Fear', range: '0–24', color: 'text-red-400' },
                        { label: 'Fear', range: '25–44', color: 'text-orange-400' },
                        { label: 'Neutral', range: '45–55', color: 'text-yellow-400' },
                        { label: 'Greed', range: '56–75', color: 'text-lime-400' },
                        { label: 'Extreme Greed', range: '76–100', color: 'text-green-400' },
                      ].map(({ label, range, color }) => (
                        <div key={label} className="flex items-center gap-1.5">
                          <div className={`w-1.5 h-1.5 rounded-full ${color.replace('text-', 'bg-')}`} />
                          <span className="text-muted-foreground">{label}</span>
                          <span className="ml-auto text-[10px] text-muted-foreground/60">{range}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Trending Coins */}
                {trending.length > 0 && (
                  <div className="bg-card border border-border rounded-md p-4">
                    <div className="flex items-center gap-2 mb-3">
                      <Flame className="w-4 h-4 text-orange-400" />
                      <span className="font-semibold text-sm">Trending</span>
                      <span className="text-[10px] text-muted-foreground ml-auto">top search · 24h</span>
                    </div>
                    <div className="flex flex-col gap-2">
                      {trending.map((c, i) => (
                        <div key={c.id} className="flex items-center gap-2 py-1.5 border-b border-border/40 last:border-0">
                          <span className="text-xs text-muted-foreground w-4">{i + 1}</span>
                          {c.image && (
                            <img src={c.image} alt={c.name} className="w-5 h-5 rounded-full" />
                          )}
                          <div className="flex-1 min-w-0">
                            <div className="text-xs font-semibold truncate">{c.symbol}</div>
                            <div className="text-[10px] text-muted-foreground truncate">{c.name}</div>
                          </div>
                          <div className="text-right shrink-0">
                            {c.price != null && (
                              <div className="text-xs font-mono">{fmtPrice(c.price)}</div>
                            )}
                            {c.change24h != null && (
                              <div className="text-[10px]">{pct(c.change24h)}</div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Market Dominance */}
                {global.btcDominance != null && (
                  <div className="bg-card border border-border rounded-md p-4">
                    <div className="flex items-center gap-2 mb-3">
                      <Globe className="w-4 h-4 text-orange-400" />
                      <span className="font-semibold text-sm">Dominance</span>
                    </div>
                    {[
                      { label: 'Bitcoin', pct: global.btcDominance, color: '#f97316' },
                      { label: 'Ethereum', pct: global.ethDominance, color: '#818cf8' },
                      { label: 'Others', pct: Math.max(0, 100 - global.btcDominance - global.ethDominance), color: '#6b7280' },
                    ].map(({ label, pct: p, color }) => (
                      <div key={label} className="mb-2.5">
                        <div className="flex justify-between text-xs mb-1">
                          <span>{label}</span>
                          <span className="font-mono">{fmt(p)}%</span>
                        </div>
                        <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                          <div className="h-full rounded-full" style={{ width: `${Math.min(100, p)}%`, backgroundColor: color }} />
                        </div>
                      </div>
                    ))}
                  </div>
                )}

              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
