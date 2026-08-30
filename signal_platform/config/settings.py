from pathlib import Path
from pydantic import field_validator
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
    #
    # QUOTES AND WHITESPACE ARE STRIPPED FROM THESE — see `_clean_ids` at the bottom of the class.
    # WATCHDOG_CHAT_ID was stored in the deployment dashboard as `'761…3'`, WITH literal single
    # quotes. There is no `.env` file in the image, so pydantic reads `os.environ` directly and a
    # dotenv-style unquoting never happens: the app passed the quotes to Telegram, which answered
    # `chat not found`, and EVERY DM-routed message was silently dropped — watch heads-ups, health
    # alerts, and any confirmed entry not exempted to the public channel. Nothing logged a failure
    # loudly enough to notice, because the send simply returned False.
    # Found 2026-08-03 while sending a sample chart. A pasted value is easy to re-break; this makes
    # it impossible to break the same way twice.
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

    # EVERY MESSAGE FROM THESE STRATEGIES GOES TO THE PUBLIC CHANNEL — his instruction, 2026-08-25:
    # *"Send everything for BX on the channel."* Comma-separated strategy ids. Env: CHANNEL_ALL.
    #
    # This OVERRIDES all three of the narrowing rules above, for the named strategies only:
    #   * `channel_entries_only`  — outcome cards (TP / SL / cancelled) now go public too
    #   * `signals_dm_only`       — the kill-switch no longer holds them back
    #   * the `_watch` rule       — heads-ups and invalidation alerts go public instead of to the DM
    #
    # NAMED, NOT GLOBAL, and that is deliberate: flipping `channel_entries_only` off would have
    # republished EVERY strategy's outcome cards and session opens to the channel, which is not what
    # he asked for and would break strategy independence — one strategy's routing must never be
    # decided by a switch another strategy shares. Set CHANNEL_ALL="" to put everything back; no code
    # change needed.
    #
    # WHAT IT DOES NOT TOUCH: session opens, scan-started and the boot heartbeat. Those are platform
    # messages, not a strategy's, so they have no strategy id to match and stay on their own routing.
    channel_all: str = "bx_sd"

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
    # AUTO-BREAKEVEN — the platform MOVING a stop on a live position, which is a different act from
    # placing a new order and so gets its own switch. Off by default; nothing is amended until this
    # is set. Demo-only is enforced at runtime the same way autotrade's is.
    auto_breakeven_enabled:   bool = False
    auto_breakeven_demo_only: bool = True
    # THE REAL-TIME WATCHER — streams prices over cTrader's FIX price session so a stop move happens
    # within a second instead of up to ~110s (60s of M1 bar + 20s of cache + the 30s poll). FIX is a
    # different protocol on a different port with its own credential, and it POLLS NOTHING, so it
    # spends none of the Open API request budget the candle fetch uses. Its own switch because it is
    # a new connection on the path that protects money; the 30s tracker keeps working without it.
    trade_watcher_enabled:    bool = False
    ctrader_fix_password:     str  = ""     # CTRADER_FIX_PASSWORD — never committed, never logged
    ctrader_fix_host:         str  = "demo-us-eqx-01.p.c-trader.com"
    ctrader_fix_quote_port:   int  = 5211
    # A DIFFERENT ACCOUNT NUMBER FROM `ctrader_account_id`, AND THAT IS NOT A TYPO. The Open API
    # identifies this account as 47535363 (a ctidTraderAccountId); FIX identifies the SAME account as
    # 5296567 (the cTrader login), which is what the SenderCompID `demo.pepperstone.5296567` carries.
    # Passing the Open API number to FIX is refused with RET_NO_SUCH_LOGIN — caught in live testing
    # 2026-08-30, and it would have failed SILENTLY in production: the watcher logs a failed connect,
    # falls back to the scheduled scan, and nothing ever says the feature is not working.
    ctrader_fix_account_id:   str  = ""
    autotrade_fixed_lots:  float = 0.0     # >0 pins the size and IGNORES risk_pct — for diagnostics,
                                           # where the point is observing fills, not sizing exposure

    @field_validator("telegram_bot_token", "telegram_chat_id", "watchdog_chat_id", mode="after")
    @classmethod
    def _clean_ids(cls, v: str) -> str:
        """Strip surrounding quotes and whitespace from Telegram credentials.

        A deployment dashboard stores whatever was pasted into it. `'761…3'` and `761…3` look
        identical in a web form and are different strings to Telegram, which answers `chat not
        found` for the first and drops the message. There is no `.env` in the image to unquote them,
        so this is the only place it can be caught. Applied to the token too: a quoted token fails
        auth on every send, which presents as "Telegram is down" rather than as a config typo.
        """
        return v.strip().strip("'\"").strip() if isinstance(v, str) else v


settings = Settings()
