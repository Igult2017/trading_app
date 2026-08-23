# Why the site loads slowly — measured, 23 August 2026

Prompted by the logo appearing a moment after the rest of the header on the live landing page.

**The logo was not the problem.** It is a 19 KB WebP, correctly compressed, correctly preloaded, and
the fix for it shipped on 21 August and is live. It is simply the thing you *notice* arriving late,
because text and layout paint from the HTML while an image needs its own round trip to the server.

Everything below is measured against **https://www.fsdzones.cloud**, not assumed.

> **The one caveat that matters.** All timings were taken from the development machine, which may be
> a very different distance from the server than you are. **The absolute seconds may not match your
> experience.** What does not depend on location: the number of round trips, the bundle sizes, the
> HTTP version and the caching headers. Those are facts about the site.

---

## 1. Where the time actually goes

Five loads of the landing page, broken into stages (each figure is cumulative from the start):

| | DNS | TCP connect | TLS handshake | first byte | fully downloaded |
|---|---|---|---|---|---|
| run 1 | 0.008s | 0.318s | 0.629s | 0.938s | 1.536s |
| run 2 | 0.006s | 0.291s | 0.596s | 0.884s | 1.462s |
| run 3 | 0.007s | 0.254s | 0.508s | 0.749s | 1.231s |
| run 4 | 0.007s | 0.306s | 0.632s | 0.935s | 1.540s |
| run 5 | 0.007s | 0.249s | 0.506s | 0.750s | 1.235s |

**Read the gaps, not the totals.** Each stage takes almost exactly the same time — about **250
milliseconds**. That is one trip to the server and back. So:

```
   250ms   open the connection        (TCP)
 + 250ms   agree on encryption        (TLS)
 + 250ms   ask for the page, wait     (the request)
 = 750ms   before a single byte of anything arrives
```

**The server is not slow.** Its own thinking time is inside that last 250ms, and a 884-byte favicon
takes the same 750ms as a 72 KB page — so the server is doing essentially no work. **The delay is
distance.**

---

## 2. HTTP/2 — ~~missing~~ **ALREADY ON. This section was WRONG.**

The first version of this audit said the site was on HTTP/1.1 and recommended enabling HTTP/2.

**That was measured with a curl that cannot speak HTTP/2 at all** (`curl 8.17.0 … Schannel`, built
without nghttp2 — it lists no HTTP2 feature and rejects `--http2` outright). It reported HTTP/1.1
because that is the only thing it can do, and the number was read as a fact about the server.

**Checked properly**, by asking what the server advertises during the encryption handshake:

```
  openssl s_client -alpn h2,http/1.1 …   ->  ALPN protocol: h2
  python ssl.selected_alpn_protocol()    ->  h2      (TLS 1.3)
```

**HTTP/2 is enabled and working.** Traefik turns it on by default for HTTPS entrypoints, and the
labels confirm the https router has `tls=true`. Nothing to do.

**What this also invalidates:** the original explanation for the logo arriving late — "the page, the
JavaScript, the font and the logo all compete for a handful of connections" — was built on the same
wrong reading. On HTTP/2 they share one connection and are multiplexed. **That story is dead too.**

## 3. The JavaScript bundle is one 520 KB file

| file | raw | what actually transfers (Brotli) |
|---|---|---|
| `index-*.js` | 2.1 MB | **520 KB** |
| `index-*.css` | 228 KB | 49 KB |

Compression is working properly — 2.1 MB down to 520 KB.

**But nothing on the page can appear until that 520 KB has arrived, been unpacked, parsed and run.**
The header, the nav, the logo — all of it is drawn by that file. It is a single bundle, so a visitor
landing on the home page downloads the trading journal, the admin panel, the charts and the blog
before they see a headline.

---

## 4. Caching is inconsistent, and the wrong things expire

| what | cached for | verdict |
|---|---|---|
| the HTML page | not cached | **correct** — it must always be fresh |
| `index-*.js`, `index-*.css` | **1 year**, immutable | **correct** — the filename changes when the file does |
| **the logo** (both colours) | **1 hour** | **wrong** |
| **the font** | **1 hour** | **wrong** |
| **the favicon** | **1 hour** | **wrong** |

The logo, font and favicon never change, yet a returning visitor re-fetches all three every hour —
and each one costs a fresh round trip. The font in particular is on the critical path: text cannot
settle until it lands.

---

## Recommendations, in the order I would do them

### 1. Cache the unchanging files properly — biggest win for the least risk

The logo, font and favicon should be cached for months, not an hour. This is a few lines in the
Express static-file handler.

**The catch, stated because it bit the JS bundle's design already:** cache something for a year and
you cannot change it — browsers keep the old copy. The JS bundle solves this by putting a hash in its
filename (`index-DRUFzlOj.js`), so a new build is a new name. Two honest options:

- **Safe:** cache for **30 days**. Big improvement, and a change still reaches everyone within a month.
- **Best:** give the logo and font hashed filenames like the bundles have, then cache for a year.
  More work, and it touches the build.

### 2. ~~Turn on HTTP/2~~ — WITHDRAWN, it was already on

See section 2. The finding came from a measurement tool that cannot speak HTTP/2.

### 3. Split the JavaScript bundle

520 KB before anything can render is the single largest cause of the page feeling slow. Loading only
what the landing page needs, and fetching the journal and admin code when someone actually navigates
there, is the standard fix (route-level code splitting in Vite).

**This is real work and carries real risk** — it changes how the app boots. It should be planned and
tested on its own, not bundled with anything else.

### 4. Put a CDN in front of the static files

The 250ms is distance, and no amount of code fixes distance. A CDN keeps copies near the visitor and
turns that into roughly 20ms. Biggest effect of anything here for visitors far from the server —
**but confirm the latency from your own location first**, because if you are near the server this may
buy you very little.

### What I would NOT do

**Nothing to the logo.** It is 19 KB, preloaded, high priority, with its space reserved. It is
already correct and changing it would not help.

---

## What was wrong in the diagnosis before this audit, and why

Two explanations were given for the slow logo before anything was measured. **Both were wrong.**

| claimed | reality |
|---|---|
| *"The 21 August fix was never deployed"* | It **was** live — the preload was in the served HTML |
| *"The file is too big"* | 19 KB, downloads in ~0.2 seconds once it starts |

The actual cause — a second of round-trip latency on every request, and a 520 KB bundle in front of
the first paint — only appeared once the request was broken into stages and compared against a
884-byte file. **The lesson is the same one recorded in `strategies/bx-sd-measured.md`: a symptom is
not a cause, and the explanation must be measured, not assumed.**
