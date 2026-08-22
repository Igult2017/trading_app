"""
BX-S/D — 4H setup gate (Phase 5). First assembly of Phases 1-4.

The book confirms the SETUP on the 4H only, then drops to the LTF. This answers the one
question: is there a VALID, CONFIRMED 4H setup that price is tapping RIGHT NOW — in EITHER direction?

DIRECTION IS NOT GATED BY A TREND. The book has no swing-structure "trend": it asks who is IN
CONTROL (Ch.7), and control never forbids a side — it only forbids the unconfirmed RISK entry
("We do not place a limit order here!", p38). The book itself takes the against-control trade:
"supply is in control, but we expect a Flip or CHoCH after we tapped in H4 demand" (p57). Every BX
signal is 1M/5M-confirmed (bx_sd.py STAGE 2-3), so BX always pays that price and may trade both
sides. The old unconditional `pro_trend()` gate was a foreign filter, and it discarded 70-78% of
book-valid zones — measured over 27 months on five instruments, 1.2 -> ~5.0 setups/month.
Control is still computed and REPORTED (bx_sd_control), never used to reject.

**Direction is gated again as of 2026-08-01, but only while the 4H is TRENDING** (`regime()` below):
the user's revision — pro-trend in a trend, either direction in a range. That is narrower than the
gate removed above, which applied always.

**THE TRIGGER IS THE TAP, as of 2026-08-15** (the Smart Risk entry model). This paragraph used to end
"the cascade requires `respected` plus a retap or a 4H pullback" — all three of those requirements
are gone. What the cascade asks now: the zone is LIVE, its `role` is not `decisional`, and the
FORMING bar is tapping it. Everything else the document grades is confluence, scored in
`bx_sd_strength`, never a refusal.

ZONES ARE NOT FOUND HERE. They are marked ONCE when they qualify and kept in bx_sd_registry; this
function only asks which marked zone price is working right now. That ordering is the point: a zone
judged later, against a window that has since moved, can be validated by a break that happened BEFORE
it existed — which is exactly how a mid-waterfall candle was sold as a zone on 27 Jul 2026.

  1. registry   the zone was marked when it qualified (IFC + its impulse broke structure + fuel)
  2. tapped     the FORMING bar is in the zone RIGHT NOW, and the zone is not broken. Not "within
                the last N bars" — that window existed, was 24 hours wide, and fired signals for
                taps that had already come and gone
  3. priced     discount for buys / premium for sells                      (confluence)
  4. the 1M/5M confirmation downstream is what proves the zone was RESPECTED

WHAT REFUSES A SETUP HERE (settled 2026-08-19, after I got it wrong twice):

  * the zone is UNMITIGATED (or wick-only — a wick leaves the orders unfilled)
  * its move BROKE AN OPPOSITE ZONE — the CHoCH. One is the rule, two is the bonus.

AND NOTHING ELSE. Two gates were added and removed the same day, both my inventions:

  D1/W1/MN BACKING AS A REQUIREMENT. His correction: *"HTF is not D/W/Monthly, it only means the
  extreme and sometimes it can be 4HR. W/D/M are a strong confluence supporting the HTF zone... So
  in other words D/W/Monthly are confluences and not rules. HTF can be 4HR so long as it
  qualifies."* `htf_backing` stays exactly where it was — scoring in `bx_sd_strength` and grading in
  `bx_sd_confirm` — and must never gate. It was costing 84 -> 71 and 60 -> 45 setups.

  A SECOND LIQUIDITY SWEEP AT THE RETURN TAP. The sweep belongs BEFORE PRICE TAPS THE HTF ZONE —
  the move that BIRTHS the zone — not before the return visit that trades it: *"there is no valid
  CHOCH if no liquidity was swept on the way to tapping the HTF zone."* `bx_sd_registry` has
  required exactly that at formation all along (`swept_before` at the IFC), so re-asking it here was
  a different, later question wearing the same name. It was costing 84 -> 51 and 60 -> 48.

HIS SEQUENCE, kept here because these two errors both came from blurring it: liquidity is swept ->
price taps the HTF zone -> it REACTS there, and that reaction leaves an unmitigated zone -> the CHoCH
completes when price breaks through the opposite zone(s) -> price returns to that unmitigated zone ->
1M/5M confirmation -> entry. The HTF zone and the CHoCH are two different things.
"""
from dataclasses import dataclass, field

from core.types import Candle, Trend
from shared.swing_points import find_swing_points
from shared.trend_detector import detect
from strategies.bx_sd_structure import map_structure
from strategies.bx_sd_zones import Zone
from strategies.bx_sd_confluence import premium_discount, fib_target, rsi_divergence
from strategies.bx_sd_control import control, describe, phrase
from strategies.bx_sd_entry_type import classify, phrase as et_phrase
from strategies.bx_sd_liquidity import find_liquidity, swept_within
from strategies.bx_sd_lineage import entry_refusal, choch_complete
from strategies.bx_sd_registry import build, to_zone, LIQ_WINDOW
from strategies.bx_sd_strength import mitigation_note, score as zone_strength
from shared.mtf_utils import closed_only


_SL_BUFFER_PIPS = 6.0  # the stop sits this far BEYOND the 4H zone's distal edge — the user's
                       # "5 to 6 pips behind the 4H zone", so a wick cannot take us out.
                       # Lives here because bx_sd_entry imports from this module.
_TP_R           = 3.0  # fixed 3R target (user: "just leave TP at 3R")
_RESPECT_BUFFER = 0.25 # the confirming close must sit this fraction of the 4H zone height
                       # INSIDE the zone from the distal — the user's "moved away from it a
                       # little, not struggling to break it". One constant, tune on evidence.
# NOTE: no `_RECENT` window here. It was 6 bars and became dead when the tap rule moved to the
# FORMING bar; it sat unread for three days while the docstring above still described it as the rule.
_MIN_PIPS   = 3.0  # ignore micro-FVG zones — same noise floor the 3 report paths already apply
                   # (bx_sd_reports._MIN_PIPS); the core cascade lacked it, so a sub-3-pip candidate
                   # could drive a real channel entry the reports would have skipped as noise


@dataclass
class SetupResult:
    active:      bool = False
    direction:   str  = ""        # "buy" | "sell"
    zone:        Zone | None = None
    entry:       float = 0.0
    sl:          float = 0.0
    tp1:         float = 0.0
    tp2:         float = 0.0
    confluences: dict = field(default_factory=dict)
    reason:      str  = ""        # diagnostics — why inactive
    entry_via:   str  = ""        # "tap" — HOW we got in. The pullback/retap pair went with the
                                  # pre-2026-08-15 model; the trigger is now the tap itself.


def regime(h4: list[Candle], d1: list[Candle] | None = None) -> int:
    """+1 uptrend, -1 downtrend, 0 ranging — READ FROM THE 4H, AND ONLY THE 4H.

    The book takes direction from who is in control — *"demand is in control now, so we can look for
    long entries"* (p58) — and names the main vs counter trend explicitly (p57). Gating on it is the
    book applied, not abandoned.

    THE DAILY IS THE POINT. A 4H uptrend inside a 1D downtrend is itself a pullback, and treating it
    as a trend is how BX came to buy GBP/JPY demand five times across 30-31 Jul while it fell ~580
    pips. All five failed. Requiring agreement makes that case RANGING, which lifts the gate and
    lets both directions through on a respected zone — deliberately permissive, because a
    disagreement is genuinely ambiguous and not a licence to pick a side.

    THE HIGHER TIMEFRAMES DO NOT VOTE ON TREND. User's rule, 2026-08-01: pro-trend and ranging are
    BOTH decided on the 4H. D1/W1/MN earn their place through ZONE CONFLUENCE — a higher-timeframe
    zone sitting over the 4H zone is what makes an A-grade setup (`bx_sd_htf.htf_backing`, applied
    in `bx_sd_confirm.grade_of`), and one sitting against it is a conflict worth reporting. That is
    a different question from which way the market is trending, and mixing the two made both worse.

    Two earlier attempts are recorded so neither returns:
      * requiring 4H and 1D to AGREE gated NOTHING — replayed against the six real GBP/JPY signals,
        all six read ranging and every one was still taken. Mid-decline, detect(H4) was correctly
        DOWNTREND while detect(D1) read RANGING (and UPTREND at an 80-bar lookback), because over
        50 DAYS the pair was net HIGHER: a three-day, 580-pip fall is invisible at daily scale.
      * the Daily as a VETO worked on that case but was doing far too much elsewhere — measured
        over 293 sampled H4 points it cut DOWNTREND readings from 20.5% to 5.1%, suppressing three
        quarters of them for one confirmed catch.

    `d1` is kept in the signature, unused, so callers do not all have to change and so the next
    reader sees deliberately-ignored rather than forgotten.
    """
    t4 = detect(closed_only(h4))
    if t4 == Trend.UPTREND:
        return 1
    if t4 == Trend.DOWNTREND:
        return -1
    return 0


def detect_setup(h4: list[Candle], pip: float = 0.0001, book=None, session_candles=None,
                 htf_map: dict | None = None, d1: list[Candle] | None = None) -> SetupResult:
    """`htf_map` is the D1/W1/MN zone map (bx_sd_htf.htf_zone_map). It is only used to SCORE the
    zone's strength, never to gate it. It must be passed: HTF confluence is the user's first-named
    and highest-weighted strength input (`_W_HTF = 3` per timeframe), and omitting it silently
    scored 0 of 196 zones as HTF-backed and capped every score at 6 — see the fix log."""
    r = SetupResult()
    if len(h4) < 30:
        r.reason = "not enough 4H history"; return r

    # `st` is still needed — is_valid -> broke_structure reads st.events, and that check derives its
    # required direction from the ZONE's own direction, so it was always direction-agnostic. Only
    # st.pro_trend() is gone: it decided WHICH SIDE to hunt, which is what cost 70-78% of setups.
    st    = map_structure(h4)
    # `pools = find_liquidity(h4, pip)` stood here and was NEVER READ — a full liquidity scan
    # (swings + EQH/EQL + every day/week/month level across the whole H4 history) run on every
    # detect_setup call and thrown away. Liquidity is consumed in exactly two places, both of which
    # build their own pools: the registry at zone formation (`swept_before`) and `bx_sd_confirm` at
    # entry (`defensive_ok`). Deleted 2026-08-05.
    price = h4[-1].close

    # The leg is needed INSIDE the selection loop now (see below), so it is computed up front.
    pts   = find_swing_points(h4)
    highs = [p.price for p in pts if p.is_high]
    lows  = [p.price for p in pts if not p.is_high]
    if not highs or not lows:
        r.reason = "no leg for premium/discount"; return r
    leg_low, leg_high = min(lows[-1], highs[-1]), max(lows[-1], highs[-1])

    # ZONES COME FROM THE REGISTRY — marked once when they qualified, and kept. Nothing is re-derived
    # here. The registry decided each zone's validity from the bars available AT ITS FORMATION, which
    # is what stops a break that PREDATES a zone from validating it (the 27 Jul defect: a mid-waterfall
    # candle marked as a zone off a BOS at lag -1). This function's job is only to ask which marked
    # zone price is working right now.
    bars   = closed_only(h4)
    # The book is built ONCE per scan by bx_sd.analyze and passed in; building it here would
    # duplicate the replay and risk two paths disagreeing. The fallback keeps this callable
    # standalone (tests, harnesses) without forcing every caller to know about the registry.
    marked = build(h4, pip, session_candles=session_candles) if book is None else book
    live_bar = h4[-1]      # the FORMING bar — 'is price at this zone RIGHT NOW?'
                           # NOT named `live`: the counter below shadowed it and
                           # tapped_by() got an int. Caught by bx_live_tap_test.

    # A zone is a candidate once price has MITIGATED it (tapped it) recently and it is still alive.
    # The 1M/5M confirmation downstream is what proves it was RESPECTED.
    # REGIME. In a trend take only zones on the trend's side; in a range take either.
    reg = regime(h4, d1)
    # These MUST be initialised here. An edit that added the regime lines replaced this
    # initialisation instead of preceding it, and `detect_setup` then raised UnboundLocalError on
    # every scan where the loop below found no candidate — the common case. The unit tests passed
    # (they exercise `regime` directly) and a single e2e run passed (it happened to find one), so
    # only a walk-forward replay over hundreds of bars surfaced it.
    cand, cand_mz, n_live, off_trend = None, None, 0, 0
    cand_via, no_entry_event, cand_swept = "", 0, False
    spent_skipped = 0                            # why a tapped zone was passed over — see the reasons
    unbroken_skipped = 0                         # the entry gate refused it — see `entry_refusals`
    # WHICH condition refused, and how often. A bare "not entry-ready" covered four different facts
    # and was usually the wrong one, which is what made eight days of silence unreadable.
    entry_refusals: dict[str, int] = {}
    # THE POOLS, BUILT ONCE. `find_liquidity` replays the whole window; it was being called inside
    # the loop, i.e. once per zone. Both the sweep-at-tap score and the CHoCH validity gate read the
    # same pools, so there is also only one answer for them to disagree about.
    _pools = find_liquidity(bars, pip, session_candles=session_candles)
    for mz in sorted(marked, key=lambda m: m.ifc_time, reverse=True):
        # NOT `respected` — that is the RETEST path's job (bx_sd_reports, min_grade="B"). Accepting
        # it here let one zone fire BOTH: a duplicate signal, and the fresh cascade firing at C+,
        # bypassing the B/A bar the retest deliberately requires of a zone already worked.
        #
        # It must include `unmitigated`: the registry is built from CLOSED bars, so a tap by the
        # FORMING bar is not in the book yet and the zone still reads unmitigated. Demanding a
        # mitigated state AND a live tap can never both hold at the same instant — by the time the
        # state flips at bar close, the live bar has moved on. That would have silenced the cascade.
        #
        # `wick_mitigated` and `body_mitigated` replaced the single `mitigated` (2026-07-30). BOTH
        # trade: the user's rule is that a wick tap signals AND its later retap signals again, and a
        # body-mitigated zone still signals on a retap, carrying a caution on the card.
        # THE `respected` REQUIREMENT IS GONE (2026-08-15) — see the trigger note below. It read
        # "RESPECTED ONLY — move away first, then enter the pullback (user's rule, 2026-08-01)",
        # which was the model the document's entry replaced. The surrounding lines about wick vs
        # body mitigation still hold: both states trade, and a body-mitigated retap carries a
        # caution on the card.
        #
        # This used to accept unmitigated / wick_mitigated / body_mitigated, i.e. enter on the FIRST
        # TOUCH with no reaction required. That is where the losses came from: the zone had proven
        # nothing. BX was running two entry models side by side, and only the retest path matched
        # the rule; the first-touch path fired at a LOWER grade bar despite having LESS evidence.
        #
        # THE `respected` GATE IS GONE (2026-08-22) — AND REMOVING IT IS WHAT UNBLOCKS SIGNAL 2.
        #
        # HIS RULING: *"remove this because price coming back is already a confirmation that the zone
        # held. Once the zone comes back here we only look for entry in 1m or 5m."*
        #
        # IT COULD NEVER PASS ALONGSIDE THE STATE CHECK BELOW. This demanded `respected`; the check
        # 47 lines down demands `unmitigated` or wick-only. `respected` is neither, so NO zone in ANY
        # state cleared both — verified against every state the registry can hold:
        #
        #     unmitigated     blocked here          wick/body   blocked by both
        #     respected       blocked below         broken      blocked by both
        #
        # Measured cost: BX produced its last confirmed entry 14 Aug 2026 12:57 UTC — 18 in the 30
        # days before, ZERO in the 8 days after, and zero candidates even BUILT. On 21 Aug 20:59 all
        # four pairs refused simultaneously (EUR/USD 14 zones tapped, GBP/USD 10, GBP/JPY 9,
        # USD/JPY 6). Not a market condition — arithmetic.
        #
        # The note that stood here claimed "no timing contradiction... does not apply here". It was
        # reasoning about the WRONG pairing: the trap is not `respected` + a live tap, it is
        # `respected` + `unmitigated` on the SAME zone, which is a straight contradiction.
        #
        # The evidence the gate was standing in for has not been dropped — it moved to where it
        # belongs. The PARENT being reacted-from is checked by `parent_of` (bx_sd_lineage), and the
        # return tap itself is the confirmation, which is his rule above.
        # NEVER THE DECISIONAL ZONE (Smart Risk, "Double Zone Break Out", 2026-08-15).
        #
        #     "we cannot place any trades based on the decisional supply zone because there is a high
        #      chance that the price will push higher to sweep the liquidity accumulated above the
        #      double tops and trigger the stop-loss of traders who entered from the decisional supply
        #      zone."   ...   "Don't use the decisional zones, you will be a liquidity."
        #
        # When one move leaves several same-side zones behind, only the FURTHEST (`extreme`) is on
        # offer; the nearer ones are what price runs through to reach it, so an order resting there is
        # the fuel for that run. `role` is "" when a zone stands alone in its group — no decisional
        # zone exists to be preferred over, so it trades normally. See `bx_sd_registry.classify_roles`.
        # POSITION NO LONGER DECIDES THIS (2026-08-19). `classify_roles` labels the furthest
        # unmitigated zone in a group "extreme" and every nearer one "decisional" — a purely
        # positional test. His model defines the two by their PROPERTIES instead:
        #
        #     the EXTREME is the zone created by the reversal OUT OF an HTF zone, with a liquidity
        #     sweep behind it; the DECISIONAL is one formed on a later rally that FAILED to reach it.
        #
        # In his diagrams the extreme sits inside the HTF band and the decisional sits below it,
        # outside — so position is the CONSEQUENCE of those properties, not the test for them.
        #
        # Filtering positionally here and then testing HTF / sweep / CHoCH below meant filtering
        # twice on the same idea, with the first pass using the weaker definition — and it threw
        # away zones that satisfy every real criterion before those criteria ever ran. The three
        # gates below now decide it alone. `role` is still computed and REPORTED (the tap card names
        # the extreme price is travelling to), it just no longer refuses on its own.

        # ...AND THE ZONE MUST STILL BE UNMITIGATED (his rule, 2026-08-19).
        #
        #     "we are only trading unmitigated and extreme zones"
        #
        # THIS WAS NEVER CHECKED. The cascade refused `decisional` and nothing else, so a zone that
        # had already been tapped, reacted and finished was still on offer — and measured, that is
        # almost the whole of what BX was trading: of 86 EUR/USD taps and 73 GBP/USD taps in a
        # sampled walk, ONE was on an unmitigated zone. The rest were return visits to spent zones.
        #
        # THE DOCUMENT IS EXPLICIT that the reaction comes from a zone that has not been used. A Fake
        # CHoCH is *"price did not reverse from a major UNMITIGATED demand zone"* (§9), and §21's
        # sequence ENDS at "extreme zone mitigated" — that is the close of its life, not a state to
        # keep trading. His own annotation on p10 names the failure mode: a zone tapped without the
        # conditions met *"is likely to fail and act as liquidity"*.
        #
        # A WICK TAP DOES NOT SPEND A ZONE. `wick_only` is the sweep case — his rule, "where a wick
        # mitigates a zone, chances are that it's gonna be retapped": the orders were never filled,
        # so the zone is still loaded. A BODY through it is what spends it.
        if not (mz.state == "unmitigated" or mz.wick_only):
            spent_skipped += 1
            continue
        # RETAP **OR** 4H PULLBACK. Both qualify. Neither replaces the other.
        #
        # User's rule, 2026-08-01: *"Keep the retap and add a pullback. If the pullback happens
        # before the retap, it serves as both the pullback and the retap. However, in case the retap
        # happens before the price leaves the zone, we wait for the pullback in 4HR."*
        #
        #   RETAP    price is back INSIDE the zone right now. An event, so read from the LIVE bar.
        #   PULLBACK price left the zone, ran, and is retracing on the 4H — one candle or many —
        #            without necessarily reaching the zone again. A level, so read from CLOSED bars.
        #
        # Both readings before this were wrong in opposite directions. Requiring ONLY a retap missed
        # every pullback that never came back to the zone, which is most of them. Then replacing it
        # with "price on the working side of the zone" dropped the retap altogether and let anything
        # in the move away qualify. It is an OR of two specific events, not either one alone.
        #
        # The "retap before price left the zone" case needs no separate test: `respected` above
        # already requires a CLOSE a full zone-height clear of the zone, so price cannot reach this
        # line without having left. A retap that never left the zone never sets `respected`, and the
        # zone waits — which is exactly "we wait for the pullback in 4HR".
        # THE TRIGGER IS THE TAP (Smart Risk entry model, 2026-08-15).
        #
        # HIS INSTRUCTION: *"Just build the CHOCH document entry model then we will do confirmation in
        # LTF plus we use stop orders."*
        #
        # WHAT THIS REPLACED, and why the replacement is not a regression to the old first-touch bug.
        # Until now the cascade required `respected` (tapped, then a close a full zone-height away)
        # AND a live retap OR a 4H pullback. That model put the evidence AFTER the zone formed: the
        # zone had to prove itself before it could be traded. The document puts the evidence BEFORE
        # it — price mitigated an HTF zone, swept liquidity, broke through two zones, and left THIS
        # one at the extreme — so the first return is the trade, entered on a stop with the stop
        # beyond the zone.
        #
        # The 2026-08-01 note "entering on the FIRST touch is gone; that path had no evidence the
        # zone held and is where the losses came from" was TRUE OF THAT MODEL, where any respected
        # zone qualified and nothing upstream filtered. It is not this one: `role != "decisional"`
        # above means only the extreme of a stack is ever offered. **THREE OF THE DOCUMENT'S FOUR
        # QUALITY CRITERIA ARE STILL UNBUILT** (HTF mitigation as a gate, liquidity swept before the
        # tap, the double-zone break as a requirement) — that is a knowing trade-off recorded in the
        # open-defects list, not an oversight. If this model underperforms, build those before
        # reinstating the pullback.
        if not mz.tapped_by(live_bar):
            no_entry_event += 1
            continue
        cand_via = "tap"

        # LIQUIDITY MUST HAVE BEEN SWEPT BEFORE PRICE ARRIVED (Smart Risk criterion 2, 2026-08-15).
        #
        #     "If the price taps unmitigated HTF zone without sweeping liquidity, the zone or
        #      mitigation is likely to fail and act as liquidity."
        #     "Market requires liquidity for momentum. If the price doesn't sweep liquidity before a
        #      key level, it often uses that zone as liquidity to fuel its momentum."
        #
        # THIS IS A DIFFERENT MOMENT FROM THE ONE ALREADY CHECKED. `bx_sd_registry` asks the same
        # question at zone FORMATION (factor 3: did the move that BUILT this zone grab fuel first?).
        # This asks it at the TAP: on the way BACK to the zone, did price take out resting stops, or
        # is it arriving with the zone itself as the only liquidity left to take? Those are two
        # different sweeps at two different times, and passing the first says nothing about the
        # second — which is why the document lists it as its own criterion.
        #
        # SIDE: the same mapping the registry uses, deliberately — a demand zone is approached from
        # above, so it is SELL-side pools (lows) that should have been taken; mirrored for supply.
        # One convention across the platform, not two that can drift apart.
        #
        # WINDOW: `LIQ_WINDOW` — the SAME constant the formation check uses. A second number for
        # "how recently must the fuel have been grabbed" would be an invented one, and there is no
        # evidence for a different value at this moment than at the other.
        #
        # `swept_within`, NOT `swept_before`. The latter asks "did any bar trade beyond this level",
        # which is trivially true for any level already on the wrong side of price — asked here it
        # answered YES on 100% of taps on both pairs, a check that decides nothing. See its docstring.
        #
        # THIS IS A CONFLUENCE, NOT A GATE (corrected 2026-08-15, same day it shipped as a gate).
        # The document calls it *"additional confirmation"* and *"a confirmation factor"*, and
        # reserves "must" for criterion 1 alone. As a refusal it was cutting 33-55% of taps on top of
        # the two confirmations BX already requires (the 4H zone and the 1M/5M reaction) — the user's
        # point: *"we still have double checks"*. It now feeds `bx_sd_strength` instead.
        _side = "sell" if mz.direction == "demand" else "buy"
        _tap_i = len(bars) - 1
        cand_swept = swept_within(_pools, bars, _side, max(0, _tap_i - LIQ_WINDOW), _tap_i)
        # ── HIS QUALIFICATION FOR THE EXTREME (2026-08-19) ──────────────────────────────────────
        #
        #     "Price comes from the demand side, meaning price originates from a demand zone. Then
        #      obviously it is going to break a supply zone or 2, then sweep static liquidity or any
        #      other liquidity that was on the other side of the broken zone, before tapping the
        #      extreme zone. One zone break is a rule but two is a bonus."
        #
        # The transcript is the same sequence: price rallies, breaks the nearer supply zones (those
        # ARE the decisionals), sweeps the liquidity resting above them, and only then taps the
        # extreme. A zone reached without that fight is not an extreme — it is the liquidity.
        #
        # WHY IT LIVES HERE AND NOT IN `classify_roles`. The registry labels the whole book at once
        # from STATIC facts (position, unmitigated). "Has liquidity been swept on the approach" is a
        # LIVE fact about this moment — measured, it is the same answer for every zone on an
        # instrument at a given bar, because it describes the approach, not the zone. Putting it in
        # the book was my error and it read 0/30 and 0/21 there: `swept_within` only counts pools
        # resting at the START of its window, and measured from a zone's marking almost every pool
        # formed later. On the approach window it reads 16/30 and 12/21. Same rule, right place.
        #
        # ONE BREAK, NOT TWO. *"One zone break is a rule but 2 zones break is a bonus"* — and the
        # document agrees three ways (§4 singular; §22 step 8 unconditional vs step 9 "IF... becomes
        # STRONGER"; §16 "stronger than breaking ONLY ONE"). The count of two stays a strength input
        # in `bx_sd_strength` and must never be a gate.

        # ── CRITERION 3: THE ZONE'S MOVE BROKE AN OPPOSITE ZONE (the CHoCH) ─────────────────────
        #
        # His sequence: the reversal at the HTF zone creates this supply, price then FALLS and
        # breaks the DEMAND zones below — that break is the change of character, and it is what
        # says order flow has flipped. Only then do we wait for the return to this zone.
        #
        # OPPOSITE SIDE, NOT SAME SIDE. My first build of this asked for a broken SAME-side zone and
        # was wrong: a supply extreme is confirmed by broken DEMAND, not by broken supply.
        # `count_breakthroughs` already counts exactly that — opposite zones this zone's move closed
        # through, up to the next structure event the other way — and it was computed and discarded.
        #
        # ONE IS THE RULE, TWO IS THE BONUS. His words, and the document three ways (§4 singular;
        # §22 step 8 unconditional vs step 9 "IF ... becomes STRONGER"; §16 "stronger than breaking
        # ONLY ONE"). Two stays a strength input in `bx_sd_strength` and must never gate here.
        # ── SIGNAL 2: THIS MUST BE THE ZONE THE CHoCH CREATED, AND PRICE MUST BE BACK AT IT ────
        #
        #     "After the price breaking an opposite zone or two, it is anticipated to go back and tap
        #      the unmitigated zone it formed when it tapped the HTF zone to birth the CHoCH... the
        #      second one is a confirmed entry when the price comes back to tap that zone."
        #
        # BX USED TO RE-TRADE THE SAME ZONE. It entered on whichever zone price was tapping, with no
        # notion of which zone was born of which reaction — so the "second signal" was just the first
        # one again. `bx_sd_lineage` supplies the missing sentence: this zone has a PARENT whose
        # reaction created it, and the CHoCH behind it has completed.
        #
        # `is_entry_zone` folds in the CHoCH check (`broke_through >= 1`) that used to sit here on its
        # own, so the two are asked together and cannot drift apart.
        # THE CHoCH VALIDITY GATE (2026-08-22). `entry_refusal` now names WHICH of its conditions
        # refused — including his new one: a structure break with no liquidity swept on the way to
        # the extreme is a FAKE CHoCH, and a fake one is a decisional one, never traded.
        _why = entry_refusal(mz, marked, live_bar, bars, _pools)
        if _why is not None:
            unbroken_skipped += 1
            entry_refusals[_why] = entry_refusals.get(_why, 0) + 1
            continue

        if (mz.top - mz.bottom) < _MIN_PIPS * pip:
            continue
        # PRO-TREND ONLY WHILE TRENDING. A supply zone in an uptrend produces a PULLBACK, not a
        # move: its upside is capped by the prevailing trend while its stop is sized for a real
        # one — structurally poor even when it wins. In a range (reg == 0) this does nothing and
        # both directions run exactly as before.
        # THE CHoCH SETS THE TREND, AND IT OUTRANKS THE 4H/1D REGIME (his ruling, 2026-08-22):
        #
        #     "Make the trend filter to work with CHOCH in 4HR because a valid CHOCH in 4HR shows
        #      the trend is reversing."
        #
        # WHY THE OLD GATE WAS BACKWARDS HERE. `regime()` reads the 4H and Daily as they stand — i.e.
        # the trend the CHoCH has just BROKEN. A change of character IS the trend reversing, so
        # refusing a post-CHoCH zone for being "counter-trend" refuses precisely the setups the CHoCH
        # creates. The zone's own side is the new trend's side.
        #
        # In practice this makes the regime inert for signal 2, because `is_entry_zone` above already
        # requires a completed CHoCH — every zone reaching this line has one. That is not the check
        # being quietly deleted: it still refuses when there is no CHoCH evidence, which is what
        # `choch_complete` decides, and it keeps working for any caller without one.
        if reg and not choch_complete(mz):
            want = "demand" if reg > 0 else "supply"
            if mz.direction != want:
                off_trend += 1
                continue
        n_live += 1
        # PREMIUM / DISCOUNT IS A CONFLUENCE, NOT A REFUSAL (2026-08-22). It is still computed and
        # still reported on the card (`r.confluences["pricing"]`, below) — it just no longer drops a
        # setup on its own.
        #
        # TWO REASONS, and he took the recommendation. First, it is measured against the WRONG leg
        # after a CHoCH: `leg_low/leg_high` are the last 4H swing high and low, which belong to the
        # move the CHoCH just broke — judging a fresh entry against a structure that no longer
        # governs. Second, signal 2 has already established location (tapped an extreme, reacted,
        # broke an opposite zone, returned to the child); this was a second, cruder location test on
        # top of five existing refusals.
        # (premium/discount is no longer computed here at all — it is read straight off
        #  `premium_discount` into the card's confluences below. Assigning it here and never
        #  reading it left a variable that looked like a live check.)
        z = to_zone(mz, bars)
        if z is None:
            continue                      # older than this window — cannot resolve indices
        cand, cand_mz = z, mz; break     # keep the MarkedZone too — it carries state/retaps
    if cand is None:
        if off_trend:
            r.reason = (f"{off_trend} zone(s) tapped but COUNTER-TREND — 4H and 1D both "
                        f"{'up' if reg > 0 else 'down'}, so only "
                        f"{'demand' if reg > 0 else 'supply'} zones are taken")
            return r
        # The "badly priced" refusal was deleted with the gate it reported on (2026-08-22):
        # premium/discount no longer drops a setup, so it can never be the reason none was found.
        # It is still computed and still shown on the card as a confluence.
        # THE TWO REFUSALS THAT CARRY HIS RULE. Reported separately because they are different
        # facts: "price is in a zone we deliberately never trade" vs "price is in a zone that has
        # already been used up". Both used to fall through to the generic "no zone tapped" line,
        # which reads as a quiet market when in fact price is sitting inside a zone right now.
        if spent_skipped:
            r.reason = (f"{spent_skipped} zone(s) tapped but ALREADY MITIGATED — only unmitigated "
                        f"zones are traded, a spent zone has done its job")
            return r
        if unbroken_skipped:
            top = sorted(entry_refusals.items(), key=lambda kv: -kv[1])
            detail = "; ".join(f"{n}x {why}" for why, n in top[:3])
            r.reason = f"{unbroken_skipped} zone(s) tapped but not entry-ready — {detail}"
            return r
        # HOW FAR IS PRICE FROM THE NEAREST LIVE ZONE? This is the one number that answers "why no
        # signal" during a quiet stretch — the cascade fires on a tap, so the distance to the closest
        # zone IS the distance to a possible setup. It was computed nowhere and the reason line said
        # only how many zones exist, which cannot distinguish "price is 2 pips away, watch closely"
        # from "price is 200 pips away, nothing is going to happen today".
        live_zones = [m for m in marked if m.live]
        near = min((abs(m.proximal - price) for m in live_zones), default=None)
        gap = f", nearest {near / pip:.0f} pips away" if near is not None else ""
        # THE REASON LINES DESCRIBE THE MODEL THAT IS ACTUALLY RUNNING. These said "respected
        # zone(s)... neither retapped nor pulled back on the 4H" until 2026-08-15 — three things
        # the cascade no longer asks for. A diagnostic that names a rule the code does not have
        # sends the next reader to the wrong file, which is exactly what a reason line exists to
        # prevent.
        if no_entry_event:
            r.reason = (f"{no_entry_event} tradeable zone(s) marked, but price is not tapping "
                        f"any of them right now{gap}")
            return r
        r.reason = (f"no zone tapped right now "
                    f"({len(live_zones)} live zones on the book{gap})")
        return r

    tdir = "buy" if cand.direction == "demand" else "sell"
    up   = cand.direction == "demand"

    # These are the WIDE 4H zone's levels — informational only. We never trade them: the real entry/SL
    # come from the entry-TF refinement in entry_trigger, and bx_sd_confirm.confirm_grade runs the
    # defensive-liquidity guard on THOSE final levels (every entry-confirming path goes through it).
    # The guard used to run here too, on these wide levels, which only produced FALSE REJECTS — a pool
    # sitting on the 4H distal killed setups whose real SL is nowhere near it.
    entry = cand.proximal
    # same buffer the entry uses — one definition of where the stop goes (bx_sd_entry)
    sl    = cand.distal - _SL_BUFFER_PIPS * pip if up else cand.distal + _SL_BUFFER_PIPS * pip

    r.active, r.direction, r.zone = True, tdir, cand
    r.entry, r.sl = entry, sl
    r.entry_via = cand_via
    r.tp1 = fib_target(leg_low, leg_high, tdir, 0.272)
    r.tp2 = fib_target(leg_low, leg_high, tdir, 0.618)
    side = control(marked)          # control reads the SAME book — one set of zones, never re-derived
    etype = classify(st, side, cand.direction)      # Ch.2 naming — classification only, never a gate
    r.confluences = {"control": describe(side, cand.direction), "control_phrase": phrase(side, cand.direction),
                     "entry_type": etype, "entry_type_phrase": et_phrase(etype),
                     "broke_structure": True, "liquidity_grab": True,
                     "pricing": premium_discount(leg_low, leg_high, price),
                     "rsi_divergence": rsi_divergence(h4, tdir),
                     "entry_via": cand_via}
    # HOW it was mitigated and HOW STRONG it is — both read off the zone book, both previously
    # invisible on the card. A wick-only tap and a full body mitigation used to look identical.
    if cand_mz is not None:
        _s = zone_strength(cand_mz, marked, bars, htf_map=htf_map, as_zone=cand,
                           swept=cand_swept)
        r.confluences["mitigation_note"] = mitigation_note(cand_mz)
        r.confluences["strength_phrase"] = (f"Zone strength {_s.label} ({_s.score}) — "
                                            f"{', '.join(_s.reasons())}")
        r.confluences["zone_state"] = cand_mz.state
        r.confluences["zone_retaps"] = cand_mz.retaps
        # WHICH ZONE OF THE STACK, and how much inefficiency the move left. Computed in the registry
        # (`classify_roles` / `count_breakthroughs`) and carried here so the card can say it — the
        # extreme/decisional distinction is the document's central warning and was invisible on the
        # card until 2026-08-15.
        r.confluences["zone_role"] = cand_mz.role
        r.confluences["broke_through"] = cand_mz.broke_through
        r.confluences["swept"] = cand_swept
    r.reason = "active"
    return r
