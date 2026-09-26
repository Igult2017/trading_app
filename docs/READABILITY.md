# READABILITY — why pages look blurred here, and how to fix it

**His instruction, 2026-08-30:** *"I need you to record that fix somewhere we will use it when
needed."*

Five surfaces were fixed the same week — the drawdown panel, the blog, the economic calendar, the
landing page and the footer — and they all had **the same cause**. This is the recipe, so the sixth
takes twenty minutes instead of an afternoon.

## ⭐ 2026-09-26 — THE WHITE THEME'S TEXT: THE OVERRIDE SHEET NEVER MATCHED ANYTHING

**Read this before touching the journal's light theme.** It is the fourth cause, it is not in the list
of three below, and it is not a colour problem — it is a *mechanism* problem, which is why darkening
greys never fixed it.

**His report:** the app has a text-visibility problem on the white theme, and the eco-friendly
marketplace does the same job well — copy how it does it.

### The mechanism that was not working

The journal's light theme was a **283-rule override sheet** inside `Journal.tsx` matching literal hex
strings inside inline styles:

```css
.journal-light [style*="color:#60a5fa"] { color: #1d4ed8 !important; }
```

**Half of that sheet could never fire.** React applies inline styles through the CSSOM, and the CSSOM
serialises a colour to `rgb()`. Probed in Chromium, 26 Sep:

| | |
|---|---|
| `el.style.color = '#0d1117'` → `getAttribute('style')` | `"color: rgb(13, 17, 23);"` |
| `el.matches('[style*="color:#0d1117"]')` | **FALSE** |
| `el.matches('[style*="color: #0d1117"]')` | **FALSE** |
| `el.matches('[style*="rgb(13, 17, 23)"]')` | TRUE |

`Journal.tsx` has recorded the `color` half of this since **2026-08-08** and named the answer in the
same comment — *"a variable is resolved per theme at the root, so one inline value is correct in
both"* — and then **only two variables were ever added** (`--jr-ink`, `--jr-ink-dim`). Everything else
went on hardcoding dark-theme literals, and the sheet grew to 283 rules that looked like a fix.

**The distinction that matters, because both shapes are in the codebase:**

| shape | fate |
|---|---|
| `.journal-light [style*="color:#34d399"]` | **dead** — the CSSOM serialises to `rgb()` |
| `.journal-light .np-pl-up { color:#047857 }` | **works** — an ordinary class selector |

`Notifications.tsx` does the second properly and deliberately (*"an inline style beats a plain CSS
rule… one place, two themes"*). Do not "fix" it to tokens, and do not read its dark values as defects.

### What the eco-friendly marketplace actually does

Measured in its source, not assumed — it is a discipline, not a trick:

1. **One token set, declared once**, and the **light theme is the base** rather than an override.
2. **Names that describe the JOB.** `muted` is muted *text*; `border` is a border. (Same lesson as
   `dim` here — a token used for a job its name does not describe breaks silently at a theme change.)
3. **A tiny closed ink palette.** Across its 2,139 text-colour usages: **four** values, and **67% of
   all text is the two darkest** — `#2B3441` at 12.6:1 and `#6B7280` at 4.8:1 on white.
4. **Status colours belong to the palette**, not to a shared literal table — which is exactly what the
   admin panel learned here on 09-10.

It is worth knowing it is not flawless: its `#9CA3AF` hint grey measures **2.5:1 on white** and is used
189 times. The discipline is what to copy, not every value.

### What was done here

**`client/src/lib/journalInk.ts`** holds the token set. Every value measured on `#FFFFFF`, on the
`#FFFEFB` canvas, and on its own 20% wash (where a status colour actually sits — a badge):

| token | light value | on white | on its wash |
|---|---|---|---|
| `--jr-ink-text` | `#141310` (the theme's own) | 18.58:1 | — |
| `--jr-ink-mute` | `#5C5646` (the theme's own) | 7.31:1 | — |
| `--jr-ink-faint` | `#6E6754` | 5.63:1 | — |
| `--jr-up` | `#046c4e` | 6.44:1 | 5.33:1 |
| `--jr-down` | `#b91c1c` | 6.47:1 | 4.99:1 |
| `--jr-warn` | `#92400e` | 7.09:1 | 6.10:1 |
| `--jr-info` | `#1e40af` | 8.72:1 | 6.92:1 |
| `--jr-alt` | `#5b21b6` | 8.98:1 | 6.97:1 |
| `--jr-pink` | `#9d174d` | 7.88:1 | 6.13:1 |
| `--jr-teal` | `#086070` | 7.20:1 | 6.29:1 |

Green, red, amber, blue and teal are **the admin panel's own signed-off light values, reused verbatim**
— this document's standing rule is to check what the surface next door uses rather than invent one.

**THE RULE THAT MAKES IT SAFE, and it is the part to carry forward:**

> **Every token is defined ONLY on `.journal-light`, and every call site keeps its old literal as the
> `var()` fallback** — `color: 'var(--jr-up, #34d399)'`.

In the five dark themes the token does not exist, so CSS falls through to the literal that was always
there. The dark themes are unchanged **by construction**, not by inspection. Proven three ways: all
155 rewrites reduce character-for-character back to the line they replaced; `inkVars(dark)` returns
`{}` and a test fails if any ink token is ever defined outside the light scope; and a Chromium render
of both trees shows the light one resolving to the measured inks while the dark one resolves to its own
literal.

It is also why **many different dark greens can share one light `--jr-up`**: the dark themes keep every
shade they had, and only the white theme collapses to the small closed palette that point 3 above is
about.

**Brand marks are a separate job with a separate bar** — and the bar is text's 4.5:1, not a graphic's
3:1, because `PLATFORM_ICON_META` uses the same value for a two-letter mark (`'BN'`, `'CT'`) when the
icon is absent. Binance's `#F3BA2F` measured **1.77:1 on white**: a logo nobody can see. Coinbase's
`#0052FF` is deliberately left alone at 5.75:1 — changing a colour that works is how a fix acquires a
regression.

### ⚠ THE RENDERED NUMBERS, WHICH ARE THE REAL ONES — and the source claim they corrected

**I first reported this as "358 failing pairs → 0" and that was a SOURCE measurement stated as if it
were a fact about the app.** `scripts/render-contrast.mjs` then booted the real journal in Chromium, at
1440×1000, and walked every text element in all eleven panels. It found **81 failures the source audit
called clean** — including two bugs in the fix itself. This table is the honest result:

| panel | before | after |
|---|---|---|
| dashboard | 27 | **0** |
| accounts | 3 | **0** |
| leaderboard | 3 | **0** |
| assets | 5 | 3 |
| calendar | 14 | 12 |
| fsdai | 2 | 1 |
| vault | 3 | 3 |
| metrics | 62 | 62 |
| journal · drawdown · strategy | 0 | 0 |
| **total, 640 text elements** | **119** | **81** |

**The dark theme is 78 before and 78 after, identical panel for panel** — measured the same way, on
`97df094` and then on the change. That is the guarantee holding in a real browser, not just in the
`var()` reduction argument.

**Still failing, and what each one is** (the next pass, not this one):

* **metrics — 62, and all of them are NEAR misses**: 3.90, 4.07, 4.25, 4.28, 4.34:1 against a 4.5
  floor. They are `Panel` badge chips whose ink sits on its own tinted wash (`rgb(220,38,38)` on
  `rgb(240,228,232)`). One small palette, a handful of values to darken; the static audit calls the file
  clean because it is theme-branched and the branch does answer — it just answers slightly too faint.
  **"Answering is not passing" — see darkBranchLines() in the audit.**
* **calendar — 12**: this panel keeps DARK grounds under the light theme (`rgb(8,11,17)`,
  `rgb(51,54,61)`), so its `--tc-bg` light override is not reaching everything, and light ink then lands
  on a dark chip. Its own dark values are also dark-on-dark (`rgb(42,61,82)` on `rgb(8,11,17)`, 1.77:1)
  which is a defect in BOTH themes.
* **vault — 3, assets — 3, fsdai — 1**: raw `#00e5a0`, `#00d48a`, `#4da6ff`, `#a78bfa`, `#94a3b8` in
  computed or interpolated values that no line-based extractor reaches.

**The lesson, and it is the same one this document already records as trap 3:** a source audit is a
fast gate, not a verdict. It caught 358 things worth fixing and was wrong about being finished.

### TWO BUGS IN THE FIX THAT ONLY THE RENDER FOUND

Both were in the codemod's own classifier, and both are the kind that typecheck and ship.

1. **HSL saturation explodes near white, so a near-white ink was classified as a colour.** `#E8EDF5`
   spans 13 of 255 channels and reports **s ≈ 0.40**; an `s < 0.22` floor therefore sent it to
   `--jr-info` and turned the calendar's status line BLUE in the light theme. **Use CHROMA
   (`max - min` on raw channels), not HSL saturation** — `#E8EDF5` scores 13, `#38bdf8` scores 192,
   `#94a3b8` scores 36 and correctly stays ink. The cut is 40.
2. **A bare `white` keyword is not a colour when a `.` precedes it.** `(?<![\w-])white` let `MC.white`
   through, so `color: MC.white` was rewritten to `color: MC.var(--jr-ink-text, white)`. TypeScript
   caught that one; a variant that happened to compile would have shipped.

**Result at the source level: 358 failing foreground/ground pairs → 0**, across 15 journal surfaces —
which is the gate, and the rendered table above is the verdict.

### FOUR FALSE-POSITIVE CLASSES THE TOOL HAD TO LEARN — every one cost a wrong number first

This section is the useful half. The measurement was wrong four times before it was right, and all four
mistakes are the kind that get made again.

1. **`\bcolor` matches the `color` inside `border-color`.** `-` is a word boundary. A focus ring at
   `border-color: rgba(99,102,241,0.6)` was reported as unreadable ink. `background-color`,
   `outline-color`, `caret-color` and `text-decoration-color` were all caught by the same slip. The
   pattern needs `(?<![-\w])`.
2. **A comment is not a rendered colour.** This codebase's prose quotes the literals it fixed. A
   `^\s*\*` test catches a JSDoc block and misses the shape actually written here — a `/* … */` block
   whose continuation lines are plain prose with no leading star. Comment state has to be *tracked*.
3. **Text on its own declared fill is correct in every theme.** White on `background:'#3b82f6'` is a
   deliberate pairing; 16 of those were being reported as 1:1 failures and they drowned the real ones.
4. **A `darkMode ? {…} : {…}` palette already answers per theme.** `SignalPlatformStatus.tsx` does this
   properly and its dark branch is not a defect. Ten false positives in a compliant file teach the next
   reader that the tool cries wolf.

And the class the OLD tool could not see at all: **`rgba(255,255,255,α)` text.** White over white is
`rgb(255,255,255)` at *every* alpha — exactly 1:1, invisible — and a hex-only regex walks straight past
it. Fourteen were sitting unreported. **Their tier is their alpha**, not their lightness: a dark panel
dims a label by fading pure white, so `0.35` is a caption and `0.9` is a heading, and grading them by
lightness flattens three levels into one.

### The two commands

```bash
node scripts/contrast-audit.mjs      # SOURCE gate; exits 1 if anything fails. Targets are DERIVED from
                                     # Journal.tsx's own imports, so a new panel cannot be missed
node scripts/ink-codemod.mjs         # dry run: what it would rewrite, and to which token
node scripts/ink-codemod.mjs --write # apply
npx tsx client/src/lib/journalInk.test.ts   # the dark-themes-cannot-move guarantee
```

**And the one that is the actual verdict** — it needs a running app, which is why it is last and why the
source gate exists at all:

```bash
# Postgres + schema, once per container
apt-get install -y postgresql && service postgresql start
su postgres -c "psql -c \"CREATE ROLE app WITH LOGIN SUPERUSER PASSWORD 'app';\"" && su postgres -c "createdb -O app fsd"
export DATABASE_URL="postgres://app:app@127.0.0.1:5432/fsd" DB_SSL=false ADMIN_SECRET=local-admin-token PORT=5055
npx drizzle-kit push --force && npx tsx server/index.ts &

node scripts/render-contrast.mjs                 # the light theme, all 11 panels
node scripts/render-contrast.mjs --theme navy     # a dark theme, to prove nothing moved
node scripts/render-contrast.mjs --shots out/     # plus a PNG per panel
```

It gets in without Supabase through the app's **own** local-admin path (`VITE_SUPABASE_URL` unset →
`AuthContext` restores from `sessionStorage.local_admin_session`) and sets the theme the app's own way,
through `localStorage.journal_settings_v2`. **A panel that renders nothing is reported as NOT MEASURED
and fails the run** — printing "ok" for zero elements is how a sweep of one screen out of eleven reads
as a clean sweep, which is the spot-check mistake this document already records.

**⚠ It has to stub `/api/notifications/unread`, and that is a real server bug, not a test convenience.**
`routes.ts:2398` calls `requireAuth(req, res)`, which SENDS its own 401, and then the handler sends a
second response; the throw lands in the catch, the catch tries to send a 500, and THAT throw is
uncaught. **An unauthenticated request to that route takes the whole Node process down** with
`ERR_HTTP_HEADERS_SENT`. Reproduced twice while measuring. Not fixed here — different subsystem.

The old audit's hand-typed target list had drifted: it was missing `CreateSession`, `JournalPaywall`,
`TradingCalendar`, `Notifications` and `TradeSyncPage`, which between them held 40 failures. **Derive
the list; never type it.**

### Still not converted, and why

`TradingChart.tsx` paints its own opaque `#080c10` and takes no theme prop — a price chart is a dark
instrument panel in both themes by design. `TradeSyncPage`'s `.ts-page` sets its own `--ink:#090C15`
ground and is exempt from the journal's theming. The admin panel has its own five palettes and reached
zero on 09-10. All three are listed with their reasons in `SELF_GROUNDED` in the audit script — **if one
of those ever gains a light theme, its entry is what has to go.**

---

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

### 1. A DISPLAY serif doing a body-text job

**⚠ THE WORD "DISPLAY" IS THE WHOLE RULE. It used to say "a serif doing a body-text job", and that
sent this project the wrong way for days — read the settled ruling at the bottom of this document
before acting on this section.** A *text* serif at 13px is not a problem; measured, it lays down
more ink than the sans does.

**Playfair Display is the house DISPLAY face and it is the right choice for a headline.** It has thin
strokes and heavy thick/thin contrast, which is exactly what makes it handsome large and mush at
11px in a table cell.

**The rule:** a DISPLAY serif (Playfair Display, DM Serif Display) is for headlines, the logo, prices
and pull-quotes, and never goes below 16px. Everything meant to be READ takes either a sans **or a
TEXT serif** — the two are equally fine; what is never fine is a display face doing it.

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

## ⛔ CORRECTED 2026-09-10 — the section below was WRONG, read this first

**I claimed a weight and size floor made Playfair safe as body text. It does not, and he saw it
immediately:** *"Are you seeing how blurred things are here."*

What I got wrong: I measured **one thing** — the darkest pixel of the thinnest stroke — and treated
"the hairline survives" as "the text is legible". The right measure is how much ink lands across the
**whole word**, and on that measure the floor barely helps:

| the same words, the same size | Playfair | Montserrat |
|---|---|---|
| "New user registrations by month" 13px/600 | **19.8%** | 24.3% |
| "Henry Otieno" 15px/600 | **22.3%** | 25.0% |
| "Growth Analytics" 16px/700 | 24.0% | 23.1% |
| "210m 2s" 32px/600 | 33.8% | 34.5% |

**A quarter of the ink is missing at caption size and none of it at 32px.** Rule 1 at the top of
this document was right all along. What is true from the correction below is only the second half:
*if* a display serif must be used small, 13px and 15px rasterise better than 13.5/14/14.5/16, and
weight 600+ helps. That is a mitigation, not a licence.

**The rule now, and it applies to every surface:** a display face (Playfair Display, DM Serif
Display — both are drawn with thick stems next to hairlines) is used at **16px and above only**.
Below that, the sans. Enforced in the admin panel by `applyAdminFont`, which gives
`--admin-header-font` the chosen face and `--admin-font` the sans whenever the chosen face is in
`DISPLAY_FACES`.

**And the mistake NOT to repeat while fixing it:** the first time I applied this split, the headings
went sans too, which took Playfair off the screen entirely — that is what he was objecting to, not
the split itself. Keep the display face on the titles, the card headings, the big figures and the
navigation rail, and it stays visibly his brand.

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

---

## ⭐ THE SETTLED RULING — display serif vs TEXT serif (2026-09-10)

**This supersedes every earlier note in this document about Playfair, Inter and Montserrat. It is
also the answer to a question that cost several round trips, so read it before changing a face.**

### What happened

He asked repeatedly for a serif. It kept coming out blurred. I concluded a serif could not carry
body text and moved the admin panel to a sans. He rejected that too — *"one is very refined and mine
is very ugly"* — pointing at his other project, DORIXÉ, as the thing to copy.

I read DORIXÉ's code: it loads `Playfair_Display` and `Inter`. So I copied Inter. **That was wrong.
DORIXÉ never applies Inter.** Its `--font-sans` is defined as itself (`globals.css:38`), a circular
reference and therefore invalid, so every unstyled element falls back to the browser default.
Measured on the live site: **247 elements in Times New Roman, 29 in Playfair, zero in Inter**, and
`getComputedStyle(document.body).fontFamily` returns `"Times New Roman"`.

The face he had been pointing at for days was a **text serif**.

### The measurement that settles it

Average ink laid down across the same words at 13px / weight 400 — all four faces verified as
genuinely loaded first, by checking their widths differ (522 / 577 / 588 / 614):

| face | kind | ink at 13px |
|---|---|---|
| Times New Roman | text serif | **21.0%** |
| Georgia | text serif | 20.8% |
| Inter | sans | 19.5% |
| Playfair Display | **display** serif | **14.5%** |

**A text serif beats the sans at body size, and lays down 45% more ink than the display serif.**

### The rule

* **Display serif** (Playfair Display, DM Serif Display): headlines only, **16px and up, never
  below.** Thick stems next to hairlines — handsome large, gone small.
* **Text serif** (Times New Roman, Georgia, and the Lora/Source Serif family): perfectly good for
  body text at 13px+. Drawn for exactly that job.
* **Sans** (Inter, Montserrat): also fine. Not required.

"Serif" was never the problem. **Display** serif was. The admin panel now pairs Playfair headings
with a Times New Roman body, which is what he approved.

### Three traps this exercise produced, all worth keeping

1. **A font that "did not load" silently ruins a comparison.** My first font-matching render came out
   with all eight candidates looking identical, because `page.setContent()` has no origin and the
   relative `@font-face` URLs resolved to nothing. Every row was the fallback serif. **Always
   width-check each face against a known control before trusting a visual comparison.**
2. **Measuring one pixel is not measuring legibility.** I first measured the darkest pixel of the
   thinnest stroke and read "the hairline survives" as "this is legible". The measure that matches
   what the eye reports is **average ink across the whole word**.
3. **Reading the source is not the same as reading the render.** DORIXÉ's source says Inter. Its
   screen says Times New Roman. When the question is "what does this look like", the rendered page
   is the only authority.

---

## 2026-09-14 — THE JOURNAL'S DM MONO NUMBERS ARE NOW BOLD TIMES NEW ROMAN. NOTHING ELSE CHANGED.

**What happened first, so it is not repeated.** He asked, pointing at numbers that were already in DM
Mono: *"write these numbers in DM mono in the journal, the whole of the journal in playfair with no
strokes"*. He meant take them OUT of DM Mono. I did the opposite — DM Mono on every digit, plus a
weight floor, a size floor, italic header levels and Metrics edits (`5c5f49b`). His verdict: *"you have
destroyed the clear display of text and it is back to blurredness again ... you cannot italize level
one headers ... who told you to touch metrics page??"* It was reverted in full (`ecb1710`).

**What he then asked, and what was done:** *"replace DM mono with bold times new roman"*. The three
places DM Mono actually rendered now use `'Times New Roman', Georgia, 'Liberation Serif', serif` at 700
— the same stack as the admin panel's body text:

* `.jr-num` (`Journal.tsx`) — dashboard calendar day numbers, equity-curve %, Performance Mix values,
  pair counts, trade-log date and P&L
* `.tv-num` (`TradeVault.tsx`) — trade date, time, R:R badge, table figure
* Strategy Audit figures (`MONO`, the `num` helper, and the forcing rule)

**Checked by diffing every visible text element's family, size, weight, style and colour before and
after on the rendered dashboard and Trade Vault** — only number elements may differ. Metrics, headers,
labels, sizes and Trade Sync are untouched.

**Lessons:** an ambiguous font instruction is read by checking what the ticked elements are RIGHT NOW;
never italicise a top-level title; never touch a page he did not name. Where Playfair is blurred at
small sizes, he has given permission for a better Times New Roman variant — but only where he points.

**Later the same day — the Drawdown panel.** *"The drawdown page still has other fonts. It should be
playfair without strokes and times new roman where other font types are."* The panel's reading font
(`--mono`) came from `FONTS['playfair-display'].bodyStack`, which was Montserrat; it is now the same Times
New Roman stack. One value, and it has no other user. Diffed on the rendered panel: of 130 text
elements, the 20 that were Montserrat changed family only, to Times New Roman; the 110 Playfair
elements are identical. He also asked to remove the *"Tracking Drawdown: Where Are You Losing? · Status :
In Drawdown"* line — removed, with the styles only it used (`.eyebrow`, `.ask`, `.hero-head`,
`.equity`, `.slabel`).
