# OVP — BTC/USD and XAU/USD

**Status (18 Nov 2026): an exact copy of BX-S/D, renamed, SWITCHED OFF (verified in the code and by `tests/ovp/test_independence.py`).** It sends nothing and trades nothing until
his changes are built and he says to switch it on.

His instruction: *"I want us to create another strategy. It will trade BTCUSD and XAUUSD. Lets call it OVP. Even though
it is new but you will copy the existing BX code then i will tell you changes we need to make to it."*

## His skeleton — in his words (NOT built yet; his changes come next)
*"It marks main demand and supply zones not small ones. Then, it waits for them to be respected then we take a trade.
we use demand and supply zones as support and resistance. That is just skeletone. 4 hours to see if we are trending
and also to mark any other one that can be of interest. 1 hr to confirm trend and marke zones that align with it.
5 minutes to focus on the zones that align with the trend, 1 min for entry. This is the skeletone"*

| timeframe | its job (his words) |
|---|---|
| 4H | is the market trending; mark any other zone of interest |
| 1H | confirm the trend; mark zones that align with it |
| 5M | focus on the zones that align with the trend |
| 1M | entry |

## How it was made
Every `strategies/bx_sd*.py` copied to `strategies/ovp*.py` and every `tests/bx_sd/*` to `tests/ovp/*`; names, ids and
keys renamed (`bx_sd`→`ovp`, `BX-S/D`/`BX`→`OVP`, `BXStrategy`→`OVPStrategy`). **Fully independent** — no OVP file
imports a BX-S/D module (his rule: strategies never share logic); a test fails if one ever does. BX-S/D was not
touched. Because it is a copy, `ovp-architecture.md` and BX-S/D's docs describe the same machinery until his changes
land — every change from here is recorded in THIS file's fix log.

## Facts for when it is switched on (checked 17 Nov)
- Broker symbol **`BTCUSD`**, id 10028, "Bitcoin vs US Dollar", enabled; decoys `BTC-PERP`, `BTCEUR`, `BTCGBP`,
  `BTCAUD` are disabled on this account. Price digits 2 (`shared/pip.py`).
- Still to do then: BTC/USD into the scanner list (`config/instruments.py`); weekend scanning (Bitcoin trades 7 days,
  the scanner shuts Fri 22:00–Sun 22:00 UTC); the news filter has no calendar for "BTC"; autotrade sizing for BTC
  (contract size read from the broker). OVP messages go to the DM only (not in `dm_only_exempt` / `channel_all`).

## Fix log
| date | what |
|---|---|
| 2026-11-17 | Created as an exact, independent copy of BX-S/D, switched off (`enabled = False`), pairs set to BTC/USD and XAU/USD. Copied tests pass as BX-S/D's do. |
| 2026-11-18 | **THE 17 NOV ROW WAS NOT TRUE OF THE CODE — corrected.** Checked: `ovp.py` still had `enabled = True` and the four forex pairs; no independence test existed; `tests/ovp/test_aug03_regression.py` could not run (its candle file was never copied). Now: `enabled = False`; `allowed_instruments = ["BTC/USD", "XAU/USD"]`; header points here; the candle file copied; `tests/ovp/test_independence.py` (5 checks) fails if an OVP file imports a BX-S/D module, if OVP is registered or enabled, or its pairs change. 14 of 15 OVP test files pass; `test_aug03_regression` fails ONE assertion — the same as BX-S/D's original (`docs/OPEN.md` A4: it asserts a "16 Jul zone he drew" that he never drew; his decision: delete it or keep it red). It was never registered, so nothing ever ran. His skeleton is still NOT built. |
