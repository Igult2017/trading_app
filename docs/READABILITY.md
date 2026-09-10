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

## THE ADMIN PANEL — DONE 2026-09-09, and it was the worst case of cause 1 in the codebase

His report: *"we used that variant of playfair that has strokes which disappear or become blurred in
small font sizes, can you fix that by using the new variant we adopted."* He is describing cause 1
exactly, without needing the tool.

**`applyAdminFont` set BOTH the body and the heading variable to Playfair Display**, with a comment
reading *"PERMANENTLY Playfair Display (locked 2026-07-20 per request)"* — so **the entire panel** was
a display serif: 13px inputs, 11px table cells, 10px labels. It is almost nothing but small text.

**Counted rather than assumed**, which changed the fix. Of the 26 places using the *heading* font:

| size | count | verdict |
|---|---|---|
| 11px | 5 | small uppercase section labels — **not headlines**, moved to Inter |
| 12px | 10 | same — moved to Inter |
| 13-20px | 10 | genuine headings, **Playfair kept** |

So the body font became a sans and 15 small "headings" went with it. Playfair stays where it earns its
place: the 13px-and-above headings and the wordmark. The blog editor and the traffic panel read the
same variable and followed automatically.

### ⚠ I PICKED THE WRONG SANS, AND THIS PAGE IS WHY — read this before quoting the rule above

I set the admin body font to **Inter**, because this document says "everything READ is Inter". He
rejected it immediately: *"I said you use the variant of playfair that does not disappear or blurr on
small font sizes and you changed the font type instead of doing that, why?"*, then named the answer:
*"use the playfair font type we used in journal dashboard"*.

**The journal does not fix small-size Playfair by abandoning Playfair. It pairs two faces**
(`useJournalSettings.ts` `FONTS['playfair-display']`):

| role | face |
|---|---|
| headings | `'Playfair Display Variable', 'Playfair Display', Georgia, serif` — **the variable family first**, so a heading can be weighted up rather than stuck on a fixed 400 whose hairlines vanish |
| read-text | `'Montserrat', system-ui, -apple-system, 'Segoe UI', sans-serif` |

and **Montserrat is his own choice, recorded 2026-09-05 — "it was Inter for a day."**

**So the SHAPE of the rule on this page is right and the NAMED FACE is out of date.** Display serif
for headings, sans for read-text — yes. But which sans is a decision he has already made per surface,
and it is not the same everywhere: the blog uses Inter (`blogTheme.ts`), the journal and now the admin
panel use Montserrat. **Check what the surface next door actually uses before naming a face** — this
page is not the authority on that, the surface is.

**The lesson for the next surface:** "which font" was the wrong question twice over. It is *which font
does which JOB* — and the answer needs the SIZES counted, because half the things called headings here
were 11-12px labels; and it is *which face has he already chosen here*, which is not a question this
document can answer.

**Still not checked:** the journal and its fifteen panels, trade vault, metrics, trade sync. The tool
cannot reach them without a session, so those need checking by hand or by pointing it at a logged-in
build.

---

## THE ADMIN BLOG SCREEN IS DELIBERATELY ALL PLAYFAIR — do not "fix" it back to the sans

Added 2026-09-10. Rule 1 above says a display serif must not do a body's job. **The admin blog
screen is a signed-off exception**, and this section exists so the next session does not read rule 1,
see Playfair in a table, and undo it.

His instruction, after the panel had already been through two font round trips:
*"font type here should be playfair with not strokes to make them visible."* Two requirements in one
sentence — Playfair, **and** strokes that survive. He is not asking for the rule to be broken; he is
asking for the condition under which it can be kept.

**The condition is weight and size, and both were measured, not guessed.** The letter "o" was drawn
with the real `playfair-display-var-latin.woff2` in Chromium at a plain non-retina scale, and the
thinnest part of its arc read straight back off the canvas — 100% is solid ink, 0% is a stroke that
rendered as nothing. Five sub-pixel positions were averaged, because an arc landing exactly on a
pixel row prints dark and the same arc half a pixel lower prints pale, and a reader meets both on
one line:

| size | w400 | w500 | w600 | w700 |
|---|---|---|---|---|
| 12px | 36% | 42% | 49% | 54% |
| **13px** | 49% | 52% | **58%** | **63%** |
| 13.5px | 37% | 45% | 47% | 54% |
| 14px | 35% | 40% | 46% | 50% |
| 14.5px | 37% | 38% | 46% | 51% |
| **15px** | 51% | 55% | **58%** | **63%** |
| 16px | 33% | 38% | 44% | 53% |

**Two findings, and the second one is the useful one:**

1. **Weight is the fix.** 400 → 700 adds 15-18 points at every single size. The family is a VARIABLE
   font (`index.css` declares `font-weight: 400 900` against one file for both names), so asking for
   a heavier weight genuinely thickens the hairline. This is why the answer is a weight and not a
   different typeface.
2. **Size does NOT get monotonically better, which is counter-intuitive and cost a round of edits.**
   13px and 15px land cleanly; 13.5, 14, 14.5 and 16 all come out 10+ points paler at the same
   weight, because the rasteriser fits this face's arcs to whole pixels differently at each
   pixel-per-em value. **A 14px choice looks like the safe middle and measures worse than either
   neighbour.** I shipped 13.5 and 14 first on exactly that assumption and had to correct them.

**So the floor is: 13px or 15px, weight 600 minimum, and nothing in between.** It is enforced in code,
not in prose — `serifText()` in `client/src/components/admin-ui/tokens.ts` clamps size and weight, and
carries the table above. Call it rather than writing `fontFamily` and `fontSize` by hand.

**Scope — WIDENED 2026-09-10 to the whole admin panel.** It covered the blog screen for one day.
He then asked for the same thing everywhere: *"work on font type of used in the whole admin panel"*.
`applyAdminFont` no longer splits the two variables — `--admin-font` and `--admin-header-font` both
take whatever the Appearance picker is set to, and the Montserrat body face is gone. Measured after:
40 of 40 text elements on the Overview resolve to `Playfair Display Variable`, against 33 Montserrat
to 7 Playfair before.

**What made that safe was doing the size and weight at the same time**, not the family swap:

* the shell's base-weight rule went 500 → 600, and the 5 inline weights below 600 that beat a
  stylesheet were lifted with it;
* `lbl` went 12px/.1em → 13px/.06em, `inp` 14px/500 → 15px/600, the nav labels 14.5px/500 →
  15px/600, `StatCard`'s label and caption and `Panel`'s hint all to 13px — every one of those was
  sitting on a rung the table above rejects;
* the chart's own labels went 10px/9px → 12px/11px, over this project's 11px floor.

`serifText` is now `panelText` and reads `FONT` rather than naming Playfair, so a different pick in
the Appearance picker carries the whole panel — including the blog screen, which used to hardcode
the serif and would have been the one screen that ignored the setting. The `font` prop on `Pill` went
with it; there is only one face to choose from now.

**One renderer.** These percentages are Chromium on Windows, which is what the panel is read in. A
different rasteriser would shift the exact numbers; the weight trend holds regardless.

---

## THE ADMIN PANEL'S FAINT TEXT WAS ONE CAUSE, REPEATED — a dark theme's colours left on a white card

Measured 2026-09-10 across all ten admin screens, 482 text elements, reading the rendered page rather
than the source. **113 failures at the start, 0 at the end.**

His words were *"fix blurred text in white background"*. Every single failure had the same origin:
the panel used to be dark-only, and the colours picked for a near-black card were still in place
after it went white. A bright green reads well on black and measures **2.58:1** on white.

| what | was | measured on white |
|---|---|---|
| growth KPI figures | `#e2e8f0` | **1.23:1** |
| System Monitor service names | `#cbd5e1` (the *divider* token, used as text) | **1.48:1** |
| Traffic Analytics heading | `color: 'white'` | **1.07:1** |
| "Resolved", "+25%", response time | `greenL #12b873` | 2.58:1 |
| ticket counts | `accentL #00c8e0` | 2.03:1 |
| "High", "Open", ratings | `amberL #d97706` | 3.19:1 |
| "Medium", "In Progress" | `blueL #3b82f6` | 3.68:1 |
| "Critical" | `redL #ef4444` | 3.76:1 |
| users table head | a `#080e18` strip on a white table | 3.55:1 |
| chart gridlines + baseline | `rgba(255,255,255,0.035)` | invisible |

**The root cause, and the fix that is not a symptom fix.** The status colours were **fixed literals
in `tokens.ts`, shared by all five palettes.** That can only work while every palette is dark. They
are now part of the palette itself, so each theme names its own — the four dark palettes keep exactly
the values they already had, and `light` gets ones measured against `#ffffff`:
green `#046c4e`, red `#b91c1c`, amber `#92400e`, blue `#1e40af`, accentL `#086070`.

**Two things worth carrying forward:**

1. **`dim` is a hairline colour and was being read as a text colour.** `C.dim` is `#cbd5e1` on the
   light palette — correct for a divider, unreadable as ink. Whenever a token is used for a job its
   name does not describe, a theme change breaks it silently.
2. **A private colour table is how a screen misses a theme change.** `TrafficSection.tsx` carried its
   own six-key palette with `text: '#c2d8ef'` and a heading hardcoded to `white`. It went on
   rendering a 1.07:1 title through every theme change the rest of the panel got, because nothing it
   used came from the shared palette. It now reads `admin-ui/tokens`.

**The measuring script is worth rebuilding if this comes up again**: walk every screen, and for each
piece of text read its colour, the colour actually painted behind it (walk up until an ancestor is
opaque), its size, its family and its weight. Reading the source finds none of this — a colour set in
one place is overridden in three others, and only the browser knows which won.

