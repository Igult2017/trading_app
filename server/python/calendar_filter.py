"""
calendar_filter.py — WHAT COUNTS AS AN EVENT, and what never reaches the calendar.

ONE COPY, SHARED BY EVERY SOURCE. This was inside `news_calendar.py` while ForexFactory was the only
source; MyFXBook is now a second one, and a second copy of this rule is how the two would quietly
start disagreeing about what he asked to see. Importing it also keeps the heavy dependencies out:
`news_calendar` pulls in `requests` and `bs4`, which do not exist in the scraping container, so the
MyFXBook scraper could not have imported the rule from there even if duplication were acceptable.

HIS RULE, 2026-09-07: *"I dont need crypto and stock news. You can remove and delete there sections
from the calendar. I only need commodity and forex news."*

`categorize` says what a row IS; `DROP_CATEGORY` is what the caller removes. They are deliberately
separate — folding a stock row into 'Currencies' would HIDE it in the forex list rather than remove
it.

⚠ "INDEX", "EARNINGS" AND "STOCK" ARE NOT STOCK-MARKET WORDS ON AN ECONOMIC CALENDAR. The test used
to match those bare words anywhere in a name, and against one real week it deleted SEVEN genuine
economic releases — `M2 Money Stock y/y`, `Average Cash Earnings y/y`, `Index of Services`,
`Final GDP Price Index`, `NFIB Small Business Index`, `BusinessNZ Manufacturing Index`,
`BSI Manufacturing Index`. Those seven were Low impact, so that week nothing was lost.

THE ONE THAT MATTERS IS `Core PCE Price Index`, a HIGH-impact US release. The old rule would have
deleted it before it was ever stored, and VIX.1 reads this calendar to decide when NOT to enter
(vix1.py:285,288). A guard whose event is missing looks exactly like a guard that is passing, which
is why nothing would ever have reported it. So the equity words must be unambiguous PHRASES.
"""

#: Phrases that genuinely mean the stock market, never a word that merely appears in economic data.
EQUITY_PHRASES = (
    'stock market', 'equity', 'equities', 'earnings call', 'earnings report', 'earnings season',
    'nasdaq', 's&p 500', 'dow jones', 'ftse', 'nikkei 225', 'share index',
)

#: Categories that never reach the calendar.
DROP_CATEGORY = ('Crypto', 'Stocks')


def categorize(name: str, currency: str) -> str:
    """'Commodities' | 'Currencies' | 'Crypto' | 'Stocks'.

    ⚠ COMMODITIES IS TESTED FIRST, on purpose: "Crude Oil Inventories" is judged a commodity before
    the equity test can ever look at it.
    """
    n = (name or '').lower()
    if any(w in n for w in ('oil', 'crude', 'gold', 'silver', 'gas', 'commodity', 'eia')):
        return 'Commodities'
    if (currency or '').upper() in ('BTC', 'ETH', 'XRP'):
        return 'Crypto'
    if any(w in n for w in EQUITY_PHRASES):
        return 'Stocks'
    return 'Currencies'


def keep(name: str, currency: str) -> bool:
    """True when this row belongs on his calendar."""
    return categorize(name, currency) not in DROP_CATEGORY
