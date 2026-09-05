# Strategy Audit page — research, plan, fixes (2026-09-05)

His instruction: move the two headings, move the tab bar, fix the Action page, fix text visibility,
and fix the fonts (*"you can use playfair for headers and montserat and inter for non header text"*).

---

## THE ROOT CAUSE OF BOTH FONT COMPLAINTS — measured, not guessed

**`.audit-root` is not exempt from the journal's global font rule.**

`Journal.tsx:1019` forces `font-family: <journal font> !important` on every element under
`.journal-root` EXCEPT `.dp`, `.ct-app` and `.ts-page`. `StrategyAudit` is rendered at
`Journal.tsx:1538`, inside `.journal-root`, and `.audit-root` is **not** on that list.

So every `fontFamily: FONT` (Montserrat) and `fontFamily: INTER` in `StrategyAudit.tsx` — 12 Inter
declarations and dozens of Montserrat ones — is **overridden and does nothing**. The page renders in
the journal's default, **Playfair Display**: a high-contrast display serif.

Only the mono figures survive, because the page's own rule `.audit-root [style*="DM Mono"]` has
specificity 0,2,0 against the journal rule's 0,1,0 (`:where()` contributes zero) and is also
`!important`.

The comment directly above that rule already warns: *"Any panel with its own font MUST be listed
here."* Trade Sync learned it the hard way; the audit page never did.

### And the same page fails the other two readability causes

Counted from the source:

| | audit page | the floor |
|---|---|---|
| rules under 11px | **65** (down to **7px** and 8px) | 11px |
| letter-spacing above .12em | **26 of 49**, up to **.3em** | .12em |

`docs/READABILITY.md` names exactly three causes: a display serif doing body work, text under 11px,
and tracking above .12em. **The audit page has all three at once.** It is not on that doc's
PAGES DONE list — it falls under *"Not yet checked: everything behind the login."*

The colours are NOT the problem: they were measured and fixed on 2026-08-08 and sit at 16.29:1
(text), 7.38:1 (muted) and 6.48:1 (dim). This is the doc's headline case — *"the cause is almost
never the colour."*

---

## THE ACTION PAGE THROWS AWAY MOST OF ITS DATA

The server computes and ships `finalVerdict: { grade, summary, strengths, weaknesses, nextActions,
authorized }` (`output_shaper.py:265`, built in `level4_action.py:472`).

`Page4` renders **only** `grade`, the first two `nextActions`, and `authorized`
(`StrategyAudit.tsx:804-807`, `VerdictBar` at :301-303). **`summary`, `strengths` and `weaknesses`
are never rendered anywhere in the file** — verified across every `finalVerdict` reference.

That is why the page looks thin next to the others: the audit's actual written conclusion is fetched
over the wire and dropped. Pages 1-3 are dense with cards; Page 4 shows two cards that are often
empty plus two action lines.

**Card style is also inconsistent:** 62 cards use the `<Cell>` component, 3 are raw `<div>`s painted
with `var(--jr-panel)` / `var(--jr-border)` — the JOURNAL's tokens, not the audit's `T.bg2`/`T.line`
— so those three are a different shade from every other card (`Page1:479`, `Page3:657`, `Page4:801`).

---

## PLAN

### 1. Give the page its own typography (fixes "font types are horrible" + most of "visibility")
* Add `.audit-root` to the exemption list in `Journal.tsx`, exactly as `.dp` is, so the page's own
  font choices actually apply.
* `PLAYFAIR` for **headers only** — the h1 and large headings. **Never** on the 9-11px uppercase
  labels: that is the mush this same doc describes, and the mistake just made on the drawdown panel.
* `Montserrat` for labels and UI text, `Inter` for prose and readable sentences, `DM Mono` for
  figures (unchanged).

### 2. Raise every size to the 11px floor and pull tracking to .12em
65 size rules and 26 tracking values. Mechanical, but each reviewed — the smallest are 7px and 8px.

### 3. Header, as he described it
* The small eyebrow becomes **"Your strategy breakdown: How sharp is your edge?"**, keeping the small
  secondary style (at 11px, the floor — he asked for the visibility fix in the same message).
* The 26px `<h1>` is removed from that slot.
* The tab bar moves up into the space the h1 vacated.

**Assumption named:** he wrote *"move ActionAI AnalysisAI Strategy to where 'how sharp is your edge?'
was initially"* — those are the last three of the six tab labels. I am reading that as **the tab bar
moves up**, since splitting three tabs away from the other three would leave two separate bars. Easy
to flip if he meant something else.

### 4. Action page
* Render the `summary`, `strengths` and `weaknesses` the server already sends.
* Convert the 3 journal-token divs to `<Cell>` so every card on the page is one system.

---

## Verification
* Render the page against the real built stylesheet and fonts, both themes, as with the drawdown fix.
* Re-count sizes and tracking; both must reach zero violations.
* `tsc`, build, existing suites.
