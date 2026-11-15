"""
The two DMs the placer sends when an order does NOT go out — the broker refused it, or autotrade
stood down. Moved out of `placer.py` on 15 Nov 2026 to keep that file to one job; the wording is
unchanged.
"""
from shared.pip import price_digits


def rejection_message(symbol: str, side: str, strategy: str, lots: float,
                      entry: float, sl: float, tp: float | None, error: str) -> str:
    """The BROKER refused an order we did send — a different thing from our own guards refusing.

    Reported with the exact levels that were sent, because that is what the broker objected to and
    the refusal is usually about one of them. Gold, 31 Aug: the price carried three decimals and the
    symbol allows two, which is invisible unless the numbers are in front of you.
    """
    d = price_digits(symbol)
    levels = f"entry <code>{entry:.{d}f}</code> · stop <code>{sl:.{d}f}</code>"
    if tp:
        levels += f" · target <code>{tp:.{d}f}</code>"
    return (f"⛔ <b>BROKER REFUSED THE ORDER</b> · {symbol} {side} · {strategy}\n"
            f"{levels}\n"
            f"{lots} lots · <b>{error}</b>\n"
            f"<i>the signal stands — nothing is resting at the broker</i>")


def refusal_message(symbol: str, side: str, strategy: str, why: str) -> str:
    """Why a confirmed signal did NOT become an order.

    ONE PER SIGNAL, never per scan — `guards.check` runs once, when a signal is dispatched. Without
    this a signal simply arrives with no order behind it and nothing says which of the seven gates
    stopped it, which is exactly the question "how do I improve autotrading" runs into first.
    """
    return (f"🤖 <b>AUTOTRADE STOOD DOWN</b> · {symbol} {side} · {strategy}\n"
            f"{why}\n"
            f"<i>the signal stands — this only says no order was placed</i>")
