"""HIS ✅ TRADEABLE / ⛔ UNTRADEABLE PRESS on a momentum-candle announcement (16 Nov 2026).

His ask: *"Whenever momentum candle closure is sent it should contain a button that asks if a trade should
be taken there, then the system starts waiting for entry and once entry is ready it takes a trade there."*
His answers: the press overrides the SETUP checks; the entry rule, news and the safety checks still apply;
the 7pm cut-off does not; his DM only; placed whatever the switches say.

DRIVES THE REAL `analyze` (the fixture of test_news_unknown_refuses.py): the 1M entry is granted, so only
his mark and the strategy's own setup decide whether an entry comes out.
"""
import asyncio
from types import SimpleNamespace

from _harness import Suite, body, flat_series, trade_mode_is

from core.types import MTFCandles, NewsContext, Session, TF
from core.strategy_context import StrategyContext
from core.indicator_types import IndicatorBundle
from core.pattern_types import PatternBundle
from storage import candle_marks
from strategies import vix1 as vix1_mod, vix1_marked
from strategies.vix1 import Vix1Strategy
from strategies.vix1_state import Bias

s = Suite("VIX.1 — his Tradeable / Untradeable press")
SYM = "EUR/USD"
h1 = flat_series(300, tf="H1") + [body(1.1000, 1.1070, tf="H1", t=300)]
h4, m1 = flat_series(300, tf="H4"), flat_series(400, tf="M1")
MC = h1[-1].time
OWN = Bias(bullish=True, mc_idx=len(h1) - 1, origin="trend", run_len=1, reason="test leg")
ENTRY = [{"kind": "pullback", "entry": 1.1075, "sl": 1.1055}]
used = []
candle_marks.mark_used = lambda mid: used.append(mid) or True


def entries(own_bias, marks):
    vix1_mod.detect_bias = lambda *a, **k: own_bias
    candle_marks.marks_for = lambda sym: list(marks)
    vix1_mod.m1_signals = lambda *a, **k: list(ENTRY)
    vix1_mod.vix1_spacing.check = lambda *a, **k: (True, "")
    vix1_mod.is_news_candle = lambda *a, **k: False
    vix1_mod.in_news_window = lambda *a, **k: False
    st = Vix1Strategy()
    st._debut.note(SYM, h1[-1].time - 10 * 3600)
    ctx = StrategyContext(symbol=SYM, candles=MTFCandles(_data={TF.M1: list(m1), TF.H1: list(h1),
                                                                TF.H4: list(h4)}),
                          indicators=IndicatorBundle(), patterns=PatternBundle(),
                          session=[Session.LONDON], news=NewsContext(events=[]))
    return [x for x in asyncio.run(st.analyze(ctx)).signals if x.stage == "ready"]


T = dict(id="m1", bar_time=MC, bullish=True, status="tradeable", chat_id="7", message_id=9)

# ── 1. the strategy REFUSED the candle; he marked it Tradeable ──────────────
got = entries(None, [T])
s.check("a candle the strategy refused + his TRADEABLE → the entry goes out", len(got), 1)
s.check("...stamped as HIS trade (DM only, placed whatever the switches)",
        (got[0].manual, got[0].confirmed, got[0].mark_id) if got else None, (True, True, "m1"))
s.check("...and the mark is used up — one trade per marked candle", used, ["m1"])
s.teeth("without his mark the refused candle gives NOTHING", len(entries(None, [])) == 0)

# ── 2. the strategy WOULD trade; he marked it Untradeable ───────────────────
s.check("a candle the strategy would trade + his UNTRADEABLE → NO entry",
        len(entries(OWN, [dict(T, status="untradeable")])), 0)
plain = entries(OWN, [])
s.check("no mark → exactly the strategy's own entry, not his", (len(plain), plain[0].manual), (1, False))

# ── 3. the helper on its own ──────────────────────────────────────────────────
candle_marks.marks_for = lambda sym: []
s.check("no marks → the strategy's answer is returned unchanged",
        vix1_marked.apply(h1, SYM, OWN), (OWN, None, None))
candle_marks.marks_for = lambda sym: [dict(T, bar_time=MC - 7200)]
s.check("a mark older than the strategy's own newer candle is NOT used",
        vix1_marked.apply(h1, SYM, OWN)[1], None)
candle_marks.marks_for = lambda sym: [dict(T, bar_time=12345)]
s.check("a mark whose candle is not in the window is ignored", vix1_marked.apply(h1, SYM, None),
        (None, None, None))
candle_marks.marks_for = lambda sym: [dict(T, bullish=False)]
s.check("the setup takes HIS candle's direction", vix1_marked.apply(h1, SYM, None)[0].bullish, False)

# ── 4. the safety checks: only the switch and the 7pm cut-off are lifted ─────
from config.settings import settings                              # noqa: E402
from execution import guards                                      # noqa: E402
from storage import autotrade_repo                                # noqa: E402
autotrade_repo.fills_since = lambda hours=24: 0
for k, v in dict(autotrade_demo_only=True, autotrade_strategies="vix1", autotrade_symbols="",
                 autotrade_sessions="", autotrade_max_per_day=6, autotrade_cutoff_utc="00:00").items():
    object.__setattr__(settings, k, v)
guards._placed.clear()
trade_mode_is("off")
ARGS = ("EUR/USD", "BUY", "vix1", "demo", 10_000.0, 0.5)
s.check("both switches OFF + past the cut-off → his trade is still allowed",
        guards.check(*ARGS, book=([], set()), manual=True), None)
s.check("...the same order NOT his is refused by the switch", guards.check(*ARGS, book=([], set()))
        is not None, True)
trade_mode_is("auto")
s.check("...and by the cut-off", "cut-off" in (guards.check(*ARGS, book=([], set())) or ""), True)
object.__setattr__(settings, "autotrade_sessions", "no_such_session")
s.check("his trade outside the permitted sessions → still REFUSED",
        "sessions" in (guards.check(*ARGS, book=([], set()), manual=True) or ""), True)
object.__setattr__(settings, "autotrade_sessions", "")
s.check("his trade on a LIVE account → still REFUSED",
        guards.check("EUR/USD", "BUY", "vix1", "live", 10_000.0, 0.5, book=([], set()), manual=True)
        is not None, True)
busy = SimpleNamespace(symbol="GBP/USD", bullish=True, volume=1, opened_at=0, label="auto-vix1-x")
s.teeth("his trade while another autotrade trade is open → still REFUSED (one at a time)",
        guards.check(*ARGS, book=([busy], set()), manual=True) is not None)

# ── 5. delivery: his DM only, placed whatever the switches ───────────────────
import notifications.dispatcher as disp                           # noqa: E402
src = open(disp.__file__, encoding="utf-8").read()
s.teeth("a manual trade is routed to his DM before any channel rule",
        src.index('if getattr(signal, "manual", False):') < src.index("elif _channel_all(signal.strategy_id):"))
placed = []
from execution import account                                     # noqa: E402
import execution.placer as placer_mod                             # noqa: E402
account.load_account = lambda: asyncio.sleep(0, result=SimpleNamespace(
    creds={}, account_type="demo", equity=1.0, risk_base=1.0))
placer_mod.place_for_signal = lambda sig, *a, **k: asyncio.sleep(0, result=placed.append(sig.symbol))
trade_mode_is("off")
asyncio.run(disp._autotrade(SimpleNamespace(symbol="EUR/USD", manual=True, mark_id="")))
s.check("switches OFF: HIS trade still reaches the placer", placed, ["EUR/USD"])

# ── 6. the announcement asks for the buttons ─────────────────────────────────
v1 = open(vix1_mod.__file__, encoding="utf-8").read()
s.teeth("the momentum announcement card asks for the two buttons",
        "anote.mark_candle = (sym, abar.time, a_bull)" in v1)
from notifications import mark_buttons                            # noqa: E402
candle_marks.create = lambda sym, t, b: "1a2b3c4d-5e6f-7890-abcd-ef1234567890"
markup, mid = mark_buttons.prepare(SimpleNamespace(mark_candle=("EUR/USD", MC, True)))
data = [b.callback_data for b in markup.inline_keyboard[0]] if markup else []
s.check("...Tradeable and Untradeable, carrying only the mark id", data,
        [f"mc:t:{mid}", f"mc:u:{mid}"])
s.check("...within Telegram's 64-byte limit", all(len(d.encode()) <= 64 for d in data), True)
s.check("a card that did not ask gets no buttons", mark_buttons.prepare(SimpleNamespace()), (None, None))
s.done()
