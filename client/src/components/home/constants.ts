export const FEATURES = [
  { icon: "📓", title: "Trade Journal",         desc: "Log every trade with entry, exit, risk, psychology, and confluence factors in a structured multi-step form." },
  { icon: "📸", title: "Screenshot & OCR",      desc: "Upload a chart screenshot and let AI extract price, SL, TP, and symbol automatically." },
  { icon: "📊", title: "Performance Analytics", desc: "Track P&L, win rate, profit factor, R-expectancy, and drawdown across sessions and timeframes." },
  { icon: "📉", title: "Drawdown Analysis",     desc: "Visualise peak-to-valley declines, recovery time, and ulcer index to manage risk precisely." },
  { icon: "🔬", title: "Strategy Audit Engine", desc: "Grade your system on edge persistence, risk entropy, and Monte Carlo simulation." },
  { icon: "🤖", title: "Trader AI Coach",       desc: "Ask your AI coach to analyse drawdown, identify worst setups, or build a strategy from your own data." },
];

export const PRICING_PLANS = [
  { name: "Free",    price: "$0",   period: "forever",  badge: null,                 highlight: false, cta: "Get Started Free",  features: ["Core trade stats", "Trade calendar view", "MT4/MT5 integration", "Basic P&L tracking", "Up to 50 trades/month"] },
  { name: "Weekly",  price: "$7",   period: "/ week",   badge: null,                 highlight: false, cta: "Start Weekly",       features: ["Everything in Free", "Full trade journal", "Detailed analytics", "Strategy audit", "Unlimited trades"] },
  { name: "Monthly", price: "$20",  period: "/ month",  badge: "Most Popular",        highlight: true,  cta: "Start Monthly",      features: ["Everything in Weekly", "AI Coach (Trader AI)", "Behaviour analysis", "Export reports (PDF/CSV)", "TradeSync Copier add-on"] },
  { name: "Yearly",  price: "$180", period: "/ year",   badge: "Best Value — $15/mo", highlight: false, cta: "Start Yearly",       features: ["Everything in Monthly", "SMC Signal Scanner", "Priority support", "Onboarding session", "TradeSync Copier add-on"] },
];

export const TESTIMONIALS = [
  { name: "James O.",  flag: "🇬🇧", role: "Forex Trader · 3 yrs",   quote: "The drawdown analysis alone is worth the subscription. I cut my max DD from 14% to 6% in two months just by following the AI recommendations." },
  { name: "Amara K.",  flag: "🇿🇦", role: "Crypto Trader · 1 yr",   quote: "Finally a journal that doesn't feel like a spreadsheet. The strategy audit gave me an A- grade after cleaning up my late entries." },
  { name: "Lucas M.",  flag: "🇧🇷", role: "Swing Trader · 5 yrs",   quote: "The timeframe matrix showed me I was losing money trading M15 when 80% of my profitable trades were on H4. Game changer." },
  { name: "Fatima R.", flag: "🇳🇬", role: "SMC Trader · 2 yrs",     quote: "TradeSync lets me share my trades with my students automatically. The signal provider mode is exactly what I needed to monetise my edge." },
  { name: "Chen W.",   flag: "🇨🇳", role: "Day Trader · 4 yrs",     quote: "I was sceptical about the AI coach but it pinpointed a pattern I had missed for 2 years — I was overtrading on Friday afternoons consistently." },
  { name: "Sophie D.", flag: "🇫🇷", role: "Options Trader · 2 yrs", quote: "The economic calendar integration means I never trade into a news event unaware. The sentiment overlay is a feature I didn't know I needed." },
];

export const AI_CHATS = [
  {
    prompt: "Analyse my drawdown from last month",
    metrics: [
      { label: "Max Drawdown", value: "-8.2%",    sub: "vs -12.5% limit", danger: true  },
      { label: "Avg Drawdown", value: "-3.1%",    sub: "below threshold", danger: false },
      { label: "Recovery",     value: "4.2 days", sub: "within target",   danger: false },
    ],
    analysis: "Your worst drawdown occurred during the NY session on days with high-impact news. 6 of your 8 losing streaks started within 30 minutes of a red news event.",
    recommendation: "Avoid trading 1 hour before and after high-impact USD/GBP news. This single rule would have prevented 73% of your worst drawdowns.",
  },
  {
    prompt: "What are my worst-performing setups?",
    metrics: [
      { label: "Worst Setup", value: "FOMO Entry",  sub: "-42% win rate",      danger: true  },
      { label: "Avg Loss",    value: "-$183",        sub: "on reactive trades", danger: true  },
      { label: "Best Setup",  value: "Structure BO", sub: "+71% win rate",      danger: false },
    ],
    analysis: "Trades entered more than 5 minutes after your original signal fire at a 38% win rate vs 71% for on-plan entries. Late entries are costing you significantly.",
    recommendation: "If you missed your original entry, skip the trade entirely. Late-entry trades have a negative expectancy of -0.4R vs +0.84R for on-time entries.",
  },
  {
    prompt: "Build a strategy from my best conditions",
    metrics: [
      { label: "Best Session", value: "London", sub: "+72% win rate",    danger: false },
      { label: "Best TF",      value: "H1/H4",  sub: "confluence stack", danger: false },
      { label: "Projected R",  value: "+1.2R",  sub: "per trade avg",    danger: false },
    ],
    analysis: "Your edge is concentrated in the London open (08:00–10:30 GMT) on H1 with H4 confirmation. Breakouts in this window achieve 72% win rate vs 51% otherwise.",
    recommendation: "Restrict trading to the London open window. With H1/H4 confluence, target 2:1 RR minimum. This would have produced your best 3 months on record.",
  },
];

export const BROKERS = ["InstaForex", "LMAX Exchange", "Pepperstone", "TICKMILL", "Admirals", "AXITRADER", "MetaTrader 4", "MetaTrader 5", "cTrader"];
