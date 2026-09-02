"""
Which account do we trade, with what credentials, and how much equity does it have?

CREDENTIALS COME FROM NODE, NEVER FROM ENV. `broker_accounts` is the single source of truth for the
cTrader token — it rotates on refresh, and Node is the only writer. Reading a token from
CTRADER_ACCESS_TOKEN gets you a stale one the moment it rotates, and a stale token does not fail
politely: it returns CH_ACCESS_TOKEN_INVALID and crash-loops whatever is holding it. The scanner
already learned this (core/startup_helpers.bootstrap_ctrader_tokens); autotrade reuses that same
bridge rather than opening a second, divergent path to the same credential.

EQUITY is fetched live and is never assumed. If it cannot be read, `equity` is 0.0 and
`guards.check` refuses the trade — an unsized order is worse than no order.
"""
import logging
from dataclasses import dataclass

import httpx

from config.settings import settings

log = logging.getLogger(__name__)

_TIMEOUT = 5


@dataclass
class Account:
    creds:        dict            # {"ctraderId": int, "accessToken": str}
    account_type: str             # "demo" | "live" — guards refuse non-demo unless told otherwise
    equity:       float           # LIVE — what the account is worth right now
    # THE BALANCE RISK IS SIZED AGAINST, and it is deliberately NOT the live one. His instruction,
    # 2026-09-03: *"static 2% of the starting account balance."* 0.0 means unknown, which means
    # refuse — see the _risk_base function below.
    risk_base:    float = 0.0


async def load_account() -> Account | None:
    """The account autotrade should use, or None if it cannot be established honestly.

    None is always safe: the caller places nothing. Every failure here returns None rather than a
    partially-populated Account, because a half-known account is how an order lands somewhere
    nobody intended.
    """
    if not settings.admin_secret or not settings.node_api_url:
        log.warning("[execution] no admin_secret/node_api_url — cannot resolve the trading account")
        return None
    url = f"{settings.node_api_url}/api/internal/ctrader-credentials"
    try:
        # THE PIN GOES HERE TOO. This decides which account autotrade PLACES ON, so an unpinned read
        # could put a real order on whichever account some other user last synced.
        from data.node_bridge import signal_account_param
        async with httpx.AsyncClient(timeout=_TIMEOUT) as http:
            r = await http.get(url, headers={"x-admin-secret": settings.admin_secret},
                               params=signal_account_param())
        if r.status_code != 200:
            log.warning(f"[execution] credential bridge returned {r.status_code} — not trading")
            return None
        data = r.json()
        ctid = data.get("ctrader_id")
        token = data.get("access_token")
        if not ctid or not token:
            log.warning("[execution] credential bridge gave no ctrader_id/access_token")
            return None
        # The bridge tells us which environment the account lives in. Default to "live" when it is
        # silent: guards refuse non-demo by default, so an UNKNOWN environment must fail CLOSED.
        acct_type = (data.get("environment") or data.get("account_type") or "live").lower()
        equity = await _equity(data)
        return Account(creds={"ctraderId": int(ctid), "accessToken": token},
                       account_type=acct_type, equity=equity,
                       risk_base=await _risk_base(data))
    except Exception as exc:
        log.warning(f"[execution] could not load the trading account: {exc}")
        return None


async def _equity(data: dict) -> float:
    """Account equity in the account currency.

    Prefers whatever the bridge already knows (it syncs balances for the journal UI) over opening a
    second broker connection just to read a number. Returns 0.0 when unknown, which guards treats
    as "cannot size" and refuses — never as "assume something".
    """
    for key in ("equity", "balance", "account_equity", "accountBalance"):
        raw = data.get(key)
        if raw in (None, ""):
            continue
        try:
            value = float(raw)
        except (TypeError, ValueError):
            continue
        if value > 0:
            return value
    log.info("[execution] equity unknown from the credential bridge — sizing will refuse "
             "unless autotrade_fixed_lots is set")
    return 0.0

async def _risk_base(data: dict) -> float:
    """The balance autotrade sizes its risk against — STATIC, not the live one.

    His instruction, 2026-09-03: *"change our risk to static 2% of the starting account balance."*
    Static is the whole point: sizing off the live balance means the money at risk drifts with every
    win and loss, so the same setup is a different bet a month later.

    Two sources, in order:
      1. `autotrade_risk_base` in settings — an explicit override, for pinning the number by hand.
      2. `starting_balance` from the bridge — the account's own session, seeded once when it was
         connected and never overwritten.

    RETURNS 0.0 WHEN NEITHER IS KNOWN, and 0.0 means REFUSE. It deliberately does NOT fall back to
    the live balance: that would risk 2% of a different number and look identical in every log — the
    exact shape of failure that has been expensive here twice this week. No base, no order.
    """
    override = float(getattr(settings, "autotrade_risk_base", 0.0) or 0.0)
    if override > 0:
        return override
    raw = data.get("starting_balance")
    if raw not in (None, ""):
        try:
            value = float(raw)
            if value > 0:
                return value
        except (TypeError, ValueError):
            pass
    log.warning("[execution] no STARTING balance from the bridge and no autotrade_risk_base set — "
                "sizing will refuse. Set AUTOTRADE_RISK_BASE, or check the account's session has a "
                "starting balance. Falling back to the live balance is deliberately NOT done: it "
                "would risk the right percentage of the wrong number.")
    return 0.0
