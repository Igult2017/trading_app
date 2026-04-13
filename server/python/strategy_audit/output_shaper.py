"""
strategy_audit/output_shaper.py
Transforms raw level1/2/3/4 engine output into the schema expected by
StrategyAudit.tsx. No duplicate top-level keys.
"""
from __future__ import annotations
import math
from typing import Any


def _safe(v: Any, default: Any = 0) -> Any:
    if v is None or (isinstance(v, float) and math.isnan(v)):
        return default
    return v

def _pct(v: Any, default: float = 0.0) -> float:
    return round(float(_safe(v, default)), 2)

def _r2(v: Any, default: float = 0.0) -> float:
    return round(float(_safe(v, default)), 2)

def _verdict_to_confidence(verdict: str, pf: float, wr: float) -> float:
    base = 80.0 if verdict == "Confirmed" else 50.0 if verdict == "Marginal" else 20.0
    boost = min(15.0, (wr - 50) * 0.3) + min(5.0, (pf - 1.0) * 2)
    return round(min(99.0, max(1.0, base + boost)), 1)

def _build_correlations(win_fc, loss_fc, win_labels: list[str], decay_labels: list[str]):
    """Build heatmap data using separate win and decay factor labels."""
    instruments = list(win_fc.keys() | loss_fc.keys())
    instruments = instruments[:7]

    def _pad(vals, n):
        vals = [round(float(v), 1) for v in vals[:n]]
        while len(vals) < n:
            vals.append(0.0)
        return vals

    win_corr  = {i: _pad(win_fc.get(i,  []), len(win_labels))   for i in instruments}
    loss_corr = {i: _pad(loss_fc.get(i, []), len(decay_labels)) for i in instruments}
    return instruments, win_labels, decay_labels, win_corr, loss_corr

def _regime_info(l3, l2, l1):
    rt = l3.get("regimeTransition", {})
    ea = l3.get("executionAsymmetry", {})
    ce = (l2.get("conditionalEdge") or {}).get("bySession", {})

    # Best session from real data only — no hardcoded fallback
    if ce:
        best_session = max(ce, key=lambda k: ce[k].get("winRate", 0))
        session_dep = f"Dominant in {best_session} ({round(ce[best_session].get('winRate',0),1)}% win rate)"
    else:
        session_dep = "Insufficient session data"

    t_wr  = _safe(rt.get("trendingWinRate"), 0)
    rng_wr = _safe(rt.get("rangingWinRate"), 0)
    if t_wr == 0 and rng_wr == 0:
        regime = "Insufficient regime data"
    else:
        regime = "Trending / Expansion Phases" if t_wr >= rng_wr else "Ranging / Mean-Reversion"

    drivers = l1.get("edgeDrivers", [])
    if drivers:
        top = drivers[0].get("factor", "")
        entry_logic = f"{top} + confirmation — {drivers[0].get('lift', 0):+.1f}pp lift"
    else:
        entry_logic = "No significant entry driver identified yet"

    early_exit = _safe(ea.get("earlyExitRate"), 0)
    if early_exit == 0:
        exit_logic = "Exit behaviour data not yet available"
    elif early_exit > 40:
        exit_logic = f"Premature exits detected ({early_exit:.0f}%) — review TP discipline"
    else:
        exit_logic = f"Exit discipline good — early exit rate {early_exit:.0f}%"

    asym = _safe(ea.get("asymmetryScore"), 0)
    if asym == 0:
        scaling = "Execution asymmetry data not yet available"
    elif asym >= 2.0:
        scaling = f"Good asymmetry ({asym:.2f}×) — scalable with position sizing discipline"
    else:
        scaling = f"Low asymmetry ({asym:.2f}×) — review RR before scaling"

    n = (l1.get("edgeSummary") or {}).get("sampleSize", 0)
    if n >= 100:
        fwd = f"Live data verified — {n} trades"
    elif n >= 30:
        fwd = f"Preliminary edge — {n} trades (need 100+ for full certification)"
    elif n > 0:
        fwd = f"Insufficient sample ({n} trades) — paper trade first"
    else:
        fwd = "No trades recorded yet"

    return {
        "regime": regime, "entryLogic": entry_logic, "exitLogic": exit_logic,
        "scalingProperties": scaling, "sessionDependency": session_dep,
        "behavioralFit": "Autonomous — verify rules adherence monthly",
        "forwardConfirmation": fwd,
    }



def shape_output(l1: dict, l2: dict, l3: dict, l4: dict) -> dict:
    # ── L1 ──
    es      = l1.get("edgeSummary", {})
    drivers = l1.get("edgeDrivers", [])
    monitor = l1.get("monitorItems", [])
    weak    = l1.get("weaknesses", [])
    win_fc  = l1.get("winFactorCorrelation", {})
    loss_fc = l1.get("lossFactorCorrelation", {})
    psych   = _safe(l1.get("psychologyScore"), 0.0)
    disc    = _safe(l1.get("disciplineScore"),  0.0)
    kelly   = _safe(l1.get("probabilisticEdge"), 0.0)
    wr          = _pct(es.get("overallWinRate"), 0.0)
    pf          = _r2(es.get("profitFactor"), 0.0)
    exp_val     = _r2(es.get("expectancy"), 0.0)
    n           = int(_safe(es.get("sampleSize"), 0))
    verdict     = es.get("edgeVerdict", "Unconfirmed")
    conf        = _verdict_to_confidence(verdict, pf, wr)
    persistence = _r2(l1.get("edgePersistence"), 0.0)
    # ── L2 ──
    var     = l2.get("variance", {})
    dd      = l2.get("drawdown", {})
    eq_var  = l2.get("equityVariance", {})
    tq      = l2.get("tradeQuality", {})
    cond_e  = l2.get("conditionalEdge", {})
    max_dd  = abs(_pct(dd.get("maxDrawdown"), 0.0))
    rec_f   = _r2(dd.get("recoveryFactor"), 0.0)
    calmar  = _r2(dd.get("calmarRatio"), 0.0)
    ulcer   = _r2(dd.get("ulcerIndex"), 0.0)
    cons_sc = _pct(eq_var.get("consistencyScore"), 50.0)
    wl_r    = _r2(var.get("winLossRatio"), 0.0)
    skew    = _r2(var.get("skewness"), 0.0)
    pos_skew= bool(var.get("positiveSkew", False))
    std_dev = _r2(var.get("stdDev"), 0.0)
    # ── L3 ──
    lc      = l3.get("lossCluster", {})
    ea      = l3.get("executionAsymmetry", {})
    rt      = l3.get("regimeTransition", {})
    ch      = l3.get("capitalHeat", {})
    ar      = l3.get("automationRisk", {})
    cl_freq  = _r2(lc.get("clusterFrequency"), 0.0)
    avg_cl   = _r2(lc.get("avgClusterSize"), 0.0)
    cl_dates = lc.get("clusterDates", [])
    worst_dd = round(lc["worstDD"], 2) if lc.get("worstDD") is not None else None
    aw_rr   = _r2(ea.get("avgWinRR"), 0.0)
    al_rr   = _r2(ea.get("avgLossRR"), 0.0)
    asym_sc = _r2(ea.get("asymmetryScore"), 0.0)
    e_exit  = _pct(ea.get("earlyExitRate"), 0.0)
    l_entry = _pct(ea.get("lateEntryRate"), 0.0)
    t_wr    = _pct(rt.get("trendingWinRate"), 0.0)
    rng_wr  = _pct(rt.get("rangingWinRate"), 0.0)
    brk_wr  = _pct(rt.get("breakoutWinRate"), 0.0)
    r_acc   = _pct(rt.get("regimeDetectionAccuracy"), 0.0)
    avg_rsk = _r2(ch.get("avgRiskPerTrade"), 0.0)
    max_rsk = _r2(ch.get("maxRiskPerTrade"), 0.0)
    rsk_con = _pct(ch.get("riskConsistencyScore"), 0.0)
    corr_ex = ch.get("correlatedExposure", [])
    a_score = _pct(ar.get("score"), 0.0)
    a_issues= ar.get("issues", [])
    # ── L4 ──
    pols    = l4.get("aiPolicySuggestions", [])
    grails  = l4.get("guardrails", [])
    edec    = l4.get("edgeDecay", {})
    vblk    = l4.get("finalVerdict", {})
    grade   = vblk.get("overallGrade", "N/A")
    summary = vblk.get("summary", "")
    strens  = vblk.get("topStrengths", [])
    wkns    = vblk.get("topWeaknesses", [])
    nxact   = vblk.get("nextActions", [])
    dec_det = bool(edec.get("detected", False))
    dec_mag = _r2(edec.get("decayMagnitude"), 0.0)
    dec_rec = edec.get("recommendation", "")
    # ── Derived ──
    win_labels   = l1.get("winConditionLabels",   l1.get("conditionLabels", []))
    decay_labels = l1.get("decayConditionLabels", l1.get("conditionLabels", []))
    instruments, win_factors, loss_factors, win_corr, loss_corr = _build_correlations(
        win_fc, loss_fc, win_labels, decay_labels
    )
    session_edge = cond_e.get("bySession", {})
    def _session_r(sess_data: dict) -> float:
        """Use avgRR when available; fall back to profitFactor (already capped at 20)."""
        avg_rr = sess_data.get("avgRR")
        if avg_rr is not None and avg_rr > 0:
            return round(float(avg_rr), 2)
        pf = sess_data.get("profitFactor", 0.0)
        return round(float(pf), 2)

    if len(session_edge) >= 2:
        ss = sorted(session_edge.items(), key=lambda x: x[1].get("winRate",0), reverse=True)
        liq_gap  = {"label": ss[0][0],  "rMultiple": _session_r(ss[0][1]),  "samples": ss[0][1].get("trades",0),  "winRate": round(ss[0][1].get("winRate",0.0),1)}
        non_qual = {"label": ss[-1][0], "rMultiple": _session_r(ss[-1][1]), "samples": ss[-1][1].get("trades",0), "winRate": round(ss[-1][1].get("winRate",0.0),1)}
        edge_trf = round((liq_gap["winRate"]-non_qual["winRate"])/max(liq_gap["winRate"],1)*100,1)
    else:
        liq_gap  = {"label":"Qualified",   "rMultiple":0.0,"samples":0,"winRate":0.0}
        non_qual = {"label":"Unqualified", "rMultiple":0.0,"samples":0,"winRate":0.0}
        edge_trf = 0.0
    # Trade quality — real counts and win rates from level2
    high_wr  = tq.get("highQualityWinRate")   # None if < 5 samples
    mid_wr   = tq.get("midQualityWinRate")
    low_wr   = tq.get("lowQualityWinRate")
    a_cnt    = int(tq.get("highQualityCount", 0))
    b_cnt    = int(tq.get("midQualityCount",  0))
    c_cnt    = int(tq.get("lowQualityCount",  0))
    a_prof   = round(float(high_wr), 1) if high_wr is not None else None
    b_prof   = round(float(mid_wr),  1) if mid_wr  is not None else None
    c_prof   = round(float(low_wr),  1) if low_wr  is not None else None

    max_ls  = round(avg_cl) if avg_cl > 0 else 0
    lp      = 1.0-(wr/100.0)
    fl_prob = round(lp**5*100,1)   # binomial P(5 consecutive losses) — mathematically exact
    avg_dd_abs = abs(_pct(dd.get("avgDrawdown"),0.0))
    t_in_dd = round(min(99.0,avg_dd_abs/max(max_dd,0.01)*100),1) if max_dd>0 else 0.0
    # Edge component contributions: win rate share and RR quality share
    wr_con  = round(min(100, wr), 1)
    rr_con  = round(min(100, (pf-1)/pf*100), 1) if pf and pf > 1 else 0.0
    # Last-50 / last-200 expectancy from actual trade slices (not estimated)
    l50r    = edec.get("last50Expectancy")
    l200r   = edec.get("last200Expectancy")
    r_stab  = round(min(100,max(0,rsk_con)),1)
    e_adh   = round(min(100,max(0,100-e_exit)),1)
    a_lbl   = "LOW RISK" if a_score<30 else "MEDIUM RISK" if a_score<60 else "HIGH RISK"
    r_ent   = "Low" if a_score<30 else "Medium" if a_score<60 else "High"

    return {
        "success": True,
        "auditSummary": {
            "winRate": round(wr,1), "edgePersistence": round(persistence,2), "riskEntropy": r_ent,
            "aiConfidence": round(conf,1), "sampleSize": n, "edgeVerdict": verdict,
            "confidence": conf, "grade": grade, "gradeSummary": summary,
        },
        "executiveSummary": summary,
        "edgeVerdict": {"verdict":verdict,"confidence":conf,"sampleSize":n,"profitFactor":pf,"expectancy":exp_val},
        "edgeDrivers":  [{"factor":d.get("factor",""),"winRateWithFactor":round(float(_safe(d.get("winRateWithFactor"),0)),1),"winRateWithout":round(float(_safe(d.get("winRateWithout"),0)),1),"lift":round(float(_safe(d.get("lift"),0)),1)} for d in drivers],
        "monitorItems": [{"label":item,"status":"Monitor","priority":"Medium"} for item in monitor],
        "weaknesses":   [{"factor":w.get("factor",""),"winRateWithFactor":round(float(_safe(w.get("winRateWithFactor"),0)),1),"impact":round(float(_safe(w.get("impact"),0)),1)} for w in weak],
        "instruments": instruments, "winFactors": win_factors, "lossFactors": loss_factors,
        "winCorrelations": win_corr, "lossCorrelations": loss_corr,
        "variance":      {"winRate":wr,"sampleSize":n,"winLossRatio":wl_r,"positiveSkew":pos_skew,"stdDev":std_dev,"skewness":skew},
        "drawdown":      {"maxPeakToValley":max_dd,"recovery":round(rec_f,1),"stagnation":round(t_in_dd,1),"calmarRatio":calmar,"ulcerIndex":ulcer},
        "equityVariance":{"simulationConfidence":cons_sc,"varianceSkew":round(skew,2),"maxCluster":max(round(avg_cl),1),"bestMonth":_r2(eq_var.get("bestMonth"),0.0),"worstMonth":_r2(eq_var.get("worstMonth"),0.0),"mcBars":eq_var.get("mcBars",[])},
        "auditScope":    {"totalTrades":n,"statisticalSignificance":round(conf,1)},
        "tradeQuality":  {"aTrades":{"count":a_cnt,"profit":a_prof},"bTrades":{"count":b_cnt,"profit":b_prof},"cTrades":{"count":c_cnt,"profit":c_prof}},
        "conditionalEdge":{"liquidityGap":liq_gap,"nonQualified":non_qual},
        "edgeTransferability": round(edge_trf,1),
        "coreRobustness":{"ruleStability":r_stab,"executionAdherence":e_adh,"monteCarloStability":round(cons_sc,1)},
        "probabilisticEdge":{"baseRate":wr,"kelly":round(kelly,2),"avgWin":aw_rr if aw_rr>0 else es.get("avgWin"),"avgLoss":al_rr if al_rr>0 else es.get("avgLoss")},
        "riskMetrics":   {"maxLossStreak":max_ls,"fiveLossProbability":fl_prob,"timeInDrawdown":t_in_dd},
        "edgeComponents":{"winRateContribution":wr_con,"riskRewardContribution":rr_con},
        "lossCluster":   {"avgLength":avg_cl,"worstDD":worst_dd,"clusterFrequency":cl_freq,"clusterDates":cl_dates},
        "executionAsymmetry":{"avgWinRR":aw_rr,"avgLossRR":al_rr,"asymmetryScore":asym_sc,"slippageWins":None,"slippageLosses":None,"earlyExitRate":e_exit,"lateEntryRate":l_entry},
        "regimeTransition":{"trendingWinRate":t_wr,"rangingWinRate":rng_wr,"breakoutWinRate":brk_wr,"regimeDetectionAccuracy":r_acc,"avgTransitionDD":None,"recoveryTrades":None},
        "capitalHeat":   {"avgRiskPerTrade":avg_rsk,"maxRiskPerTrade":max_rsk,"riskConsistencyScore":rsk_con,"correlatedExposure":corr_ex,"peakEquityAtRisk":None,"timeAtPeak":None},
        "automationRisk":{"score":a_score,"issues":a_issues,"label":a_lbl},
        "psychologyScore": round(psych,1),
        "disciplineScore": round(disc,1),
        "edgeDecay":     {"last50":l50r if l50r is not None else None,"last200":l200r if l200r is not None else None,"detected":dec_det,"magnitude":dec_mag,"recommendation":dec_rec,"trend":"↘ DECLINING" if dec_det else "↗ STABLE"},
        "aiPolicySuggestions":[{"rule":p.get("rule",""),"rationale":p.get("rationale",""),"expectedImpact":p.get("expectedImpact","")} for p in pols],
        "guardrails":    [{"label":g.get("condition",""),"value":"","action":g.get("action",""),"status":"Active"} for g in grails],
        "finalVerdict":  {"grade":grade,"summary":summary,"strengths":strens,"weaknesses":wkns,"nextActions":nxact,"authorized":grade in("A","B")},
        "logicalVerification": _regime_info(l3,l2,l1),
        "sessionEdge": session_edge,
        "heatmapProfiles": l2.get("heatmapProfiles",[]),
    }
