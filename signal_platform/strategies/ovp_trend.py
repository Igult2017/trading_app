"""OVP — is the 4H trending? +1 up, -1 down, 0 ranging. READ FROM CLOSED 4H CANDLES ONLY.

His skeleton (18 Nov 2026): *"In 4 hours, we want to confirm if we are trending or not. If we are trending, we look for
zones in the direction of the trend not against."* The 1H does not vote: *"The whole point is not to go against 4H
trend."* A 1H move against the 4H is the pullback that brings price back to the zone, which is the trade.

Uses the platform's shared trend reader (`shared/trend_detector.detect`, swing highs and lows) — platform
infrastructure, not another strategy's logic. Moved here from the deleted BX-copy cascade (`ovp_setup.regime`),
unchanged except that its unused Daily argument is gone.
"""
from core.types import Candle, Trend
from shared.mtf_utils import closed_only
from shared.trend_detector import detect


def regime(h4: list[Candle]) -> int:
    t4 = detect(closed_only(h4))
    if t4 == Trend.UPTREND:
        return 1
    if t4 == Trend.DOWNTREND:
        return -1
    return 0
