from pathlib import Path
from pydantic_settings import BaseSettings, SettingsConfigDict

# Resolved once at import time — CWD-independent regardless of where python is invoked from
_PLATFORM_ROOT = Path(__file__).resolve().parent.parent


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    # ── Database ──────────────────────────────────────────────────────────────
    # Must point at the same PostgreSQL as the Node.js app so signals appear
    # in AssetPage via /api/trading-signals.
    # Set DATABASE_URL in signal_platform/.env — e.g.:
    #   DATABASE_URL=postgresql://user:pass@localhost/trading_app
    database_url: str

    # ── Scanner ───────────────────────────────────────────────────────────────
    scan_enabled: bool = True
    min_rr: float = 2.0
    min_confidence: float = 0.70
    # Per-strategy overrides of min_confidence, "id:floor" comma-separated. VIX.1 GRADES its
    # momentum candle by shape (A=0.85 down to C=0.60) — the grade is information, not a filter,
    # so its floor sits at the bottom of the grading scale or the global 0.70 gate would silently
    # eat every B/C signal and the grading system would look like a detection bug. (2026-07-21)
    min_confidence_overrides: str = "vix1:0.60"

    # Runtime pause: create .scan_paused in the signal_platform/ directory to
    # stop scanning without restarting. Delete the file to resume.
    # Path is absolute so it works regardless of CWD at launch.
    scan_pause_file: str = str(_PLATFORM_ROOT / ".scan_paused")

    # ── News filter ───────────────────────────────────────────────────────────
    news_pre_window_mins: int = 15
    news_post_window_mins: int = 15
    news_calendar_api_key: str = ""

    # ── Notifications ─────────────────────────────────────────────────────────
    telegram_bot_token: str = ""
    telegram_chat_id: str = ""      # public signal channel — signal cards only
    # Private admin DM for SYSTEM/STATUS telemetry (scanner active, platform online,
    # session open) so it never spams the public channel. Same chat the Node health
    # watchdog uses (env WATCHDOG_CHAT_ID). If unset, those system messages are dropped.
    watchdog_chat_id: str = ""
    # KILL-SWITCH: route ALL strategy signals (confirmed included) to the admin DM instead of the
    # public channel. Set SIGNALS_DM_ONLY=true to hold every strategy's output back from subscribers
    # while a bug is being fixed, without disabling the scanner. Reversible via env, no code change.
    signals_dm_only: bool = False
    # EXEMPTIONS from the kill-switch: comma-separated strategy ids whose CONFIRMED signals still go to
    # the PUBLIC channel even while SIGNALS_DM_ONLY holds everyone else in the DM. Lets a trusted,
    # fixed strategy go live while a still-in-refinement one stays held. (2026-07-21: BX-S/D is
    # trusted post-fix and goes public; VIX.1 stays DM until the 100-trade selection pass.) Env:
    # DM_ONLY_EXEMPT="bx_sd,other". Their _watch heads-ups still go to the DM (unconfirmed).
    # Positive ALLOWLIST for the public channel while `channel_entries_only` is on: a strategy's
    # CONFIRMED ENTRIES reach subscribers only if it is named here. VIX.1 added 2026-08-01 on the
    # user's instruction ("take confirmed entry VIX1 signals to the channel").
    #
    # This widens ENTRIES ONLY. It cannot leak anything else:
    #   * _watch heads-ups   — routed to the DM before this list is consulted (dispatcher: is_watch)
    #   * TP/SL close cards  — `on_signal_closed` sends privately whenever channel_entries_only is
    #                          on, regardless of this list
    #   * session opens / scan status — never touch this path at all
    dm_only_exempt: str = "bx_sd,vix1"
    # THE PUBLIC CHANNEL CARRIES ENTRY SIGNALS AND NOTHING ELSE.
    # User, 2026-07-27: "take those TP HIT and other unnecessary messages to DM for now. Only send BX
    # entry signals to the channel." So outcome cards (TP hit / SL / cancelled) and session-open
    # announcements go to the admin DM, leaving the channel as a clean feed of tradeable entries only.
    # Which STRATEGY may reach the channel is still DM_ONLY_EXEMPT's job — this flag only decides
    # which KINDS of message are eligible at all. Set CHANNEL_ENTRIES_ONLY=false to put outcomes and
    # session opens back on the channel; no code change needed ("for now").
    channel_entries_only: bool = True

    # ── Data source 1: cTrader Open API (primary, run auth_setup.py once) ────
    # Credentials: https://ctrader.com/your-app-portal → Applications
    # Account ID: cTrader platform → Settings → Account Info
    ctrader_client_id:     str = ""
    ctrader_client_secret: str = ""
    ctrader_account_id:    int = 0      # numeric ID — MUST be set
    ctrader_env:           str = "demo" # "demo" or "live"

    # OAuth tokens — set in Coolify env vars instead of running auth_setup.py.
    # auth_setup.py prints these values after the one-time local OAuth flow.
    # If the refresh token rotates the platform logs a WARNING with the new value.
    ctrader_access_token:  str = ""
    ctrader_refresh_token: str = ""

    # ── Node.js token bridge ───────────────────────────────────────────────────
    # When both are set, tokens are fetched from broker_accounts (always current)
    # instead of relying on potentially-stale env vars.
    # In Docker the default URL is correct (same container, port 5000).
    admin_secret:   str = ""
    node_api_url:   str = "http://localhost:5000"

    # ── AUTOTRADE — real pending stop orders (VIX.1) ──────────────────────────
    # OFF by default and it must stay that way. The purpose is DIAGNOSTIC: place the order the
    # strategy actually computed, then report where it really filled against where the model said
    # it would, so entry quality is measured instead of argued about. Every backtest number this
    # platform has produced is gross of spread and assumes a fill exactly at the stop price;
    # neither survives contact with a broker, and this is how we find out by how much.
    autotrade_enabled:     bool  = False   # THE KILL SWITCH. Nothing is placed while this is False.
    autotrade_demo_only:   bool  = True    # refuse to place on a live account, checked at runtime
    autotrade_risk_pct:    float = 0.5     # % of equity risked per trade
    autotrade_max_per_day: int   = 6       # hard cap on orders placed in a rolling 24h
    autotrade_symbols:     str   = ""      # CSV allow-list; empty = every symbol the strategy fires
    autotrade_strategies:  str   = "vix1"  # CSV of strategy ids allowed to place. VIX.1 only for now
    autotrade_fixed_lots:  float = 0.0     # >0 pins the size and IGNORES risk_pct — for diagnostics,
                                           # where the point is observing fills, not sizing exposure


settings = Settings()
