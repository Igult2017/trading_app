# OVP — BTC/USD and XAU/USD

**Status (17 Nov 2026): an exact copy of BX-S/D, renamed, SWITCHED OFF.** It sends nothing and trades nothing until
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
