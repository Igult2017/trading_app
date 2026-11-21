"""
barchart_parse.py — turn Barchart's own futures-options response into rows. Pure: no browser, no network, so it is
tested on a VERBATIM slice of a real response (fixtures/barchart_gc_sample.json, taken 19 Nov 2026).

The page https://www.barchart.com/futures/quotes/GC*0/volatility-greeks loads its table from its own request
`/proxies/core-api/v1/quotes/get?...&list=futures.options&...&groupBy=optionType&raw=1`, which answers
{"data": {"Call": [...], "Put": [...]}} — each entry has display strings AND a `raw` block of real numbers. Only the
`raw` numbers are used (the display strings carry commas and percent signs). IV and IV skew are as Barchart gives them
(IV in percent, e.g. 45.03; skew as a fraction, e.g. 0.187).
"""
from __future__ import annotations


FIELDS = {"strike": "strikePrice", "last": "lastPrice", "iv": "optImpliedVolatility", "delta": "delta",
          "gamma": "gamma", "theta": "theta", "vega": "vega", "ivSkew": "impliedVolatilitySkew",
          "tradeTime": "tradeTime"}


def _num(v):
    return float(v) if isinstance(v, (int, float)) and v == v else None    # v == v drops NaN


def parse_options(payload: dict) -> list[dict]:
    """[{strike, type, last, iv, delta, gamma, theta, vega, ivSkew, tradeTime}] — a row needs a strike and a side."""
    data = (payload or {}).get("data") or {}
    out = []
    for side in ("Call", "Put"):
        for item in data.get(side) or []:
            raw = item.get("raw") or {}
            row = {k: _num(raw.get(v)) for k, v in FIELDS.items()}
            if row["strike"] is None:
                continue
            row["type"] = side
            out.append(row)
    return out


_CHALLENGE = ("just a moment", "cf_chl_opt", "challenge-platform", "cdn-cgi/challenge", "access denied")


def is_blocked(title: str, html: str) -> bool:
    """A challenge or refusal page is NOT data — reported as BLOCKED so the app backs off, never fought."""
    low = (title or "").lower()
    return any(m in low for m in ("just a moment", "access denied", "attention required")) or (
        len(html or "") < 50_000 and any(m in (html or "").lower() for m in _CHALLENGE))
