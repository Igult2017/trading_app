# Security — 1H CVD divergence alerts (23 Nov 2026)

**Scope:** `signal_platform/alerts/cvd_divergence/` (new), one scheduler job, one admin switch (`cvd_divergence_alerts`,
default OFF), docs. Plan: `.claude/plans/declarative-roaming-bentley.md`.

**Outside surface:** none added — no web address, no input from users, no new Telegram command. It only READS broker
candles the engine already fetches and SENDS text to his own DM through the existing copy-bot route (`copy_dm.send`,
fixed recipient `WATCHDOG_CHAT_ID`). ZAP not re-run: nothing it can reach changed (stated, not skipped silently).

**Review:**
- *Money:* places, amends and cancels nothing; no order code is imported.
- *Who receives it:* only his DM (fixed in settings); no user-supplied chat id.
- *Load on the broker:* 1H + 1M for four markets, cache-first (`candle_fetcher`); at most a new 1M fetch a minute per
  market when no other part of the engine already holds it — far inside the per-second limit.
- *Storage:* one JSON row in `strategy_state` (bounded: at most 8 open watches + the last 200 swing tags); the ORM only.
- *Secrets:* the change was scanned — none. The V3 data pull ran on this machine with the read-only cTrader feed; its
  token stays outside the repo (`trading_app_data`).

**Findings:** none.
