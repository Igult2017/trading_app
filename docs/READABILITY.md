# READABILITY — why pages look blurred here, and how to fix it

**His instruction, 2026-08-30:** *"I need you to record that fix somewhere we will use it when
needed."*

Five surfaces were fixed the same week — the drawdown panel, the blog, the economic calendar, the
landing page and the footer — and they all had **the same cause**. This is the recipe, so the sixth
takes twenty minutes instead of an afternoon.

**Run the tool before reading anything:**

```bash
npm run build                                   # once, so dist/public is current
node scripts/check-readability.mjs "" blog calendar about support legal
```

It serves the built files, needs no database and no login, and prints — per page — the fonts in use,
everything below 4.5:1 contrast, everything under 11px, and how much serif is doing a body-text job.

*(Pass routes WITHOUT the leading slash on Windows. Git Bash rewrites a bare `/blog` into
`C:/Program Files/Git/blog` before the script sees it. `""` means the home page.)*

---

## THE CAUSE IS ALMOST NEVER THE COLOUR

This is the single most useful thing on this page. Every instinct says "the text is faint, darken the
grey" — and four times out of five that is the wrong repair.

| page | what it looked like | what it actually was |
|---|---|---|
| economic calendar | blurred, unreadable | colours **already passed at 7.58:1**. It was Playfair Display at 8–10px in a dense table |
| drawdown panel | dim labels | already AA. 17 rules below 11px, tracking up to `.32em` |
| landing page | soft, low-contrast | a constant **named `sans` that was the serif** |
| footer | links ran together | one colour doing two jobs — a 1.18:1 `·` separator |

**Measure first. Change second.**

---

## THE THREE CAUSES, IN ORDER OF HOW OFTEN THEY ARE IT

### 1. A display serif doing a body-text job

**Playfair Display is the house display face and it is the right choice for a headline.** It has thin
strokes and heavy thick/thin contrast, which is exactly what makes it handsome large and mush at
11px in a table cell.

**The rule:** serif for headlines, the logo, prices and pull-quotes. **Everything meant to be READ is
sans** — body copy, labels, navigation, buttons, table cells, metadata, tickers.

```ts
const SERIF = "'Playfair Display', Georgia, serif";                        // headlines
const SANS  = "'Inter', system-ui, -apple-system, 'Segoe UI', sans-serif"; // everything read
```

Both are already bundled (`client/src/index.css`), so neither costs a download.

> **The name is not the font.** `HomePage.tsx` declared `display`, `serif` AND `sans` — and all three
> were Playfair Display. `sans` was used 15 times for body copy, 6 more in `HomeStatsSection`. There
> was not one sans-serif font on the entire landing page, and the code read as though the job was
> done. **Never trust a variable called `sans`; check what it holds.**

### 2. Text below 11px

**11px is this project's floor.** It came from measuring a well-set reference page whose smallest
label was 11px, against ours at 8–10px. Below that, small uppercase text with wide letter-spacing
reads as texture rather than words.

Counts found: calendar 13 rules, drawdown 17, landing page 5.

### 3. Letter-spacing above about `.12em` on small text

Wide tracking spreads thin strokes apart and is a large part of what reads as faint. The drawdown
panel had `.32em` on 9px capitals. Bring anything above `.12em` down.

---

## CONTRAST TARGETS USED HERE

| | floor | what we actually set |
|---|---|---|
| body and labels | 4.5:1 (AA) | **7:1+** where practical |
| large headlines | 3:1 | inherited from the ink colour, fine |
| a separator or divider **character** | it has to do its job | ≥4.5:1 — see the footer note below |
| a hairline **rule** | decorative | may be faint; different value from the above |

**Two jobs, two values.** The footer used one colour for its hairline rules and for the `·` between
the legal links. A rule can be faint; a separator character cannot, or the links run together as one
phrase. That was 1.18:1 and invisible.

---

## WHAT TO CHECK IN DARK MODE, SEPARATELY

**A light-mode screenshot will not show you a broken dark theme**, and both times the dark theme was
the worse of the two:

* economic calendar: muted text **3.95:1 — fails**, borders **1.23:1 — invisible**
* drawdown light theme: `--ink3` at **2.56:1**, below AA outright, plus green and orange that only
  passed at large sizes while being used on 10–12px text

The tool measures whichever theme the build renders by default. **Toggle the theme and run it again.**

---

## A TEST PAGE THAT LOADS THE WRONG FONT WILL TELL YOU THE PAGE IS FINE

**2026-09-05.** He said the drawdown panel looked "dim and horrible" in production while my Playwright
screenshot of the same markup looked perfect. The screenshot was the liar.

The harness pulled **`'Playfair Display'`** from Google Fonts. The journal's stack starts with
**`'Playfair Display Variable'`** (`useJournalSettings.ts:150`, self-hosted via
`@fontsource-variable`). Those are two different family NAMES — a plain-name reference matches
nothing and silently falls back. Measured with a negative control, same string, same size:

| asked for | width |
|---|---|
| a family that does not exist (control) | 282.22 |
| plain `'Playfair Display'` | **282.22 — identical, so it never rendered** |
| `'Playfair Display Variable'` | 294.61 |
| the production stack | **294.61** |

So the "good" screenshot was a sturdy fallback serif and production is a high-contrast display serif
whose thin strokes drop out at 10px. **Never judge readability from a harness that loads fonts from
anywhere but the app's own build.** Serve `dist/public` and link its real built stylesheet — the
`@font-face` rules and hashed `.woff2` files come with it. And measure which family actually won:
`document.fonts.check()` returns TRUE for fonts that do not exist, so compare a rendered width
against a deliberately-bogus family name instead.

## THE FONT SPLIT IS A PER-PANEL JOB, AND "DONE" DID NOT MEAN DONE

The drawdown panel is listed under PAGES DONE below, and its **sizes** were fixed on 2026-08-29 — but
its **face** was not. `DrawdownPanel` was passing the journal's display serif to BOTH of its font
roles, so every label, table cell and figure was set in a headline face. That is cause #1 on this
page, sitting inside a panel the page called finished.

Fixed 2026-09-05 by declaring it as data rather than sniffing the stack string: `FontDef.bodyStack`
names the face to use for text meant to be READ when the chosen face is a display one. Only Playfair
declares one; the other eight options are sans or mono and are untouched, so the font picker still
means what it says. **Declared, not sniffed** — a `/serif/` test on the stack is exactly the trap
recorded above, where a constant named `sans` held Playfair and every name-based check passed.

## THE TOOL HAD A BUG WORTH KNOWING ABOUT

Its first version reported **32 failures on the blog, half of them false**. It found the first
non-transparent background and ignored its alpha, so a badge with `rgba(244,97,127,0.08)` behind text
of `rgb(244,97,127)` was measured as that colour against **itself** — a perfect 1:1 failure on a
tinted 8% wash that was perfectly legible.

It now composites the stack of translucent layers down to a real colour. **If it ever reports exactly
1:1, suspect the tool before the page.**

---

## THE ORDER TO WORK IN

1. **Run the tool.** Write down the three numbers per page.
2. **Fix the font split first** — serif for headlines, sans for everything read. This alone fixes most of it.
3. **Raise anything under 11px.**
4. **Pull tracking above `.12em` down.**
5. **Only now** look at the colours, and measure rather than guess.
6. **Run the tool again** and check the numbers moved.
7. **Look at the page.** The tool cannot see layout, rhythm or whether the thing is ugly.

---

## PAGES DONE (2026-08-29 → 08-30)

drawdown panel · blog index · blog article · economic calendar · landing page · header ticker · footer

**`/support` and the three legal documents are clean** — 0 contrast failures, 0 under 11px, 0 serif
at body size.

**`/about` is NOT clean, and my first check said it was.** I measured it by reading the first `<p>`,
saw Inter and moved on; the tool then found **13 serif elements at 15px** on that page. A spot check
is not a measurement — that is exactly the mistake this tool exists to stop, and it caught me making
it. Not yet fixed.

**The home page has 6 elements below 4.5:1 still**, and 9 serif at body size of which the testimonial
pull-quotes are deliberate. Worth one more pass.

**Not yet checked:** everything behind the login — the journal and its fifteen panels, the admin
panel, trade vault, metrics, trade sync. The tool cannot reach them without a session, so those need
checking by hand or by pointing it at a logged-in build.
