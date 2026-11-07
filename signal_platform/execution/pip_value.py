"""
What one pip of one lot is actually worth, in the account's currency.

WHY THIS EXISTS. `sizing.size_lots` priced a pip at **$10 for every instrument** — a default
parameter (`pip_value_per_lot: float = 10.0`, `conversion_rate: float = 1.0`) that **nothing in the
platform ever computed**. The only production caller (`placer.py` -> `plan_size` -> `size_lots`)
passed neither, so the default stood for all five traded symbols.

It is right for three of them and wrong for two:

    EUR/USD  100,000 x 0.0001          = $10.00   correct
    GBP/USD  100,000 x 0.0001          = $10.00   correct
    XAU/USD      100 x 0.1             = $10.00   correct  (100 oz, pip 0.1 at 2 price digits)
    GBP/JPY  100,000 x 0.01   = Y1,000 = ~$6.62   WRONG — priced as $10
    USD/JPY  100,000 x 0.01   = Y1,000 = ~$6.62   WRONG — priced as $10

A yen pair is quoted in YEN, so a pip is worth a thousand yen per lot and has to be converted. At
$10 the sizing asks for too few lots, and a trade meant to risk $200 risks about **$132** — 34%
under. Both strategies trade a yen pair (VIX.1 has GBP/JPY; BX-S/D has USD/JPY and GBP/JPY).

⚠ THE VIX.1 DOC PREDICTED THIS when GBP/JPY was added on 2026-10-05: *"FOR WHEN AUTOTRADE RETURNS:
sizing IS pip-denominated, so the first real GBP/JPY order wants checking by hand."* Nobody checked
it by hand; this module is that check, written down.

⚠ IT LIVES APART FROM `sizing.py` because that file is already 211 lines, over the project's limit,
and because this is the part worth testing on its own: pure arithmetic, no broker, no socket.

⚠ AND IT REFUSES RATHER THAN GUESSING. `None` means "I cannot price this honestly" and the caller
must skip the trade — the same contract `sizing.contract_size_for` already states in its own words:
*"NONE IS THE POINT OF THIS FUNCTION. A caller that gets None must refuse the order, not reach for a
default."* Reaching for a default is precisely the bug above.
"""

import logging

from execution.sizing import contract_size_for
from shared.pip import pip_size

log = logging.getLogger(__name__)

ACCOUNT_CCY = "USD"      # verified against the live account: depositAssetId 15 = USD


def quote_currency(symbol: str) -> str | None:
    """The currency a price move is denominated in — the second half of the pair.

    For every instrument this platform trades the name is six letters ("EURUSD", "XAUUSD",
    "GBPJPY"), so the quote currency is the last three. Anything else — an index like "US30", a
    broker's odd spelling — returns None, which refuses the trade rather than inventing a currency.
    """
    s = "".join(ch for ch in (symbol or "").upper() if ch.isalnum())
    if len(s) == 6 and s.isalpha():
        return s[3:]
    return None


def pip_value_per_lot(symbol: str, usd_jpy: float | None = None) -> float | None:
    """What one pip of one lot costs, in the ACCOUNT's currency — or None if it cannot be said.

    `usd_jpy` is the live USD/JPY price, needed ONLY for yen-quoted pairs. It is fetched from the
    FIX stream that already carries it (`data/fix_wire.SYMBOL_IDS` includes "USD/JPY"), so this
    needs no broker request of its own.
    """
    contract = contract_size_for(symbol)
    if contract is None:
        return None                      # unknown instrument — contract_size_for already refused
    pip = pip_size(symbol)
    if not pip or pip <= 0:
        return None
    in_quote = contract * pip            # the value of a pip, in the QUOTE currency

    quote = quote_currency(symbol)
    if quote is None:
        return None
    if quote == ACCOUNT_CCY:
        return in_quote                  # already in dollars; no rate is consulted at all
    if quote == "JPY":
        # USD/JPY is "yen per dollar", so dividing converts yen -> dollars.
        if not usd_jpy or usd_jpy <= 0:
            log.warning("[pip_value] %s is quoted in JPY and no USD/JPY rate was available — "
                        "refusing to size rather than pricing a pip at the dollar default", symbol)
            return None
        return in_quote / usd_jpy
    # A quote currency we have no rate for. Refuse: a plausible-looking number at the wrong scale
    # is how this defect existed in the first place.
    log.warning("[pip_value] %s is quoted in %s and there is no rate for it — refusing to size",
                symbol, quote)
    return None


def needs_rate(symbol: str) -> bool:
    """True when pricing this symbol needs a conversion rate fetched. Lets the caller skip the
    lookup entirely for dollar-quoted pairs, so a silent feed can never hold up EUR/USD."""
    return quote_currency(symbol) not in (None, ACCOUNT_CCY)
