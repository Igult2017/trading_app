"""
ADX (Average Directional Index) using Wilder's smoothing.
Returns (adx, +DI, -DI) for the most recent bar.
"""
from core.types import Candle


def calc_adx(candles: list[Candle], period: int = 14) -> tuple[float, float, float]:
    """
    Returns (adx, plus_di, minus_di).
    Returns (0, 0, 0) when there are fewer than 2*period+1 candles.
    """
    if len(candles) < 2 * period + 1:
        return (0.0, 0.0, 0.0)

    tr_vals, pdm_vals, mdm_vals = [], [], []
    for i in range(1, len(candles)):
        c, p = candles[i], candles[i - 1]
        tr  = max(c.high - c.low, abs(c.high - p.close), abs(c.low - p.close))
        up  = c.high - p.high
        dn  = p.low  - c.low
        pdm = up if up > dn and up > 0 else 0.0
        mdm = dn if dn > up and dn > 0 else 0.0
        tr_vals.append(tr)
        pdm_vals.append(pdm)
        mdm_vals.append(mdm)

    def _smooth(data: list[float]) -> list[float]:
        out = [sum(data[:period])]
        for v in data[period:]:
            out.append(out[-1] - out[-1] / period + v)
        return out

    tr_s  = _smooth(tr_vals)
    pdm_s = _smooth(pdm_vals)
    mdm_s = _smooth(mdm_vals)

    dx_vals = []
    for tr_, pd_, md_ in zip(tr_s, pdm_s, mdm_s):
        if tr_ == 0:
            dx_vals.append(0.0)
            continue
        pdi   = 100 * pd_ / tr_
        mdi   = 100 * md_ / tr_
        denom = pdi + mdi
        dx_vals.append(100 * abs(pdi - mdi) / denom if denom > 0 else 0.0)

    adx_s = _smooth(dx_vals)

    last_tr  = tr_s[-1]
    last_pdi = 100 * pdm_s[-1] / last_tr if last_tr > 0 else 0.0
    last_mdi = 100 * mdm_s[-1] / last_tr if last_tr > 0 else 0.0
    return (adx_s[-1], last_pdi, last_mdi)
