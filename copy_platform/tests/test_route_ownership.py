"""EVERY COPY ENDPOINT THAT TAKES A `brokerAccountId` MUST PROVE THE CALLER OWNS IT.

THE DEFECT. `POST /api/copy/masters` and `POST /api/copy/followers` passed the request body
straight to the database and only overwrote `userId`. Neither looked at `brokerAccountId`, and the
PUT versions let it be swapped in afterwards. Nothing downstream re-checks: the copy engine takes
the row at its word, decrypts that account's credentials and trades it.

So a logged-in stranger could name someone else's account and either publish it as a master —
streaming that person's positions to themselves — or point a FOLLOWER row at it, which places
copied orders on that person's money. The id needed for it was being handed out by
`GET /api/copy/providers`, which required no login at all.

WHY THIS TEST IS A SOURCE CHECK AND NOT A REQUEST. Running the real endpoints needs a live server,
a database and two users' JWTs. The failure mode being guarded is not "the check computes the wrong
answer" — it is "somebody adds a fifth endpoint and forgets the check", which is exactly what
source can see and a request against four known endpoints cannot. The same reasoning as the
signal platform's credential-pin guard, which caught a missed call site the same way.

Read from the syntax tree, not by grepping for text: a grep matches the words in this file's own
comments, and it matched a docstring once already and reported three passing checks against code
that was wrong.
"""
import re

from _harness import Suite, repo_path

s = Suite("ROUTE OWNERSHIP — you may only name an account you own")

ROUTES = open(repo_path("server", "routes.ts"), encoding="utf-8").read()

GUARD = "requireOwnBrokerAccount"

# The endpoints that accept a brokerAccountId from the request BODY. The three
# `/api/broker-accounts/:id/...` routes take it from the URL and load it with their own
# `account.userId !== user.id` check, so they are listed separately below.
BODY_ENDPOINTS = [
    ('app.post("/api/copy/masters"',   "publishes an account as a signal provider"),
    ('app.put("/api/copy/masters/:id"', "can RE-POINT a master at another account"),
    ('app.post("/api/copy/followers"', "decides which account orders are placed ON"),
    ('app.put("/api/copy/followers/:id"', "can RE-POINT the copy target"),
]


def _handler_body(marker: str) -> str:
    """The source of one route handler: from its `app.<verb>(` to the next one."""
    start = ROUTES.index(marker)
    nxt = re.search(r"\n  app\.(get|post|put|delete|patch)\(", ROUTES[start + 10:])
    end = start + 10 + (nxt.start() if nxt else len(ROUTES) - start - 10)
    return ROUTES[start:end]


for marker, why in BODY_ENDPOINTS:
    s.check(f"{marker.split('(')[1]} checks ownership  ({why})",
            GUARD in _handler_body(marker), True)

# The guard is defined once, so no endpoint can invent its own weaker spelling of it.
s.check("the ownership check is defined in ONE place",
        len(re.findall(r"const " + GUARD + r"\s*=", ROUTES)), 1)

# It must 404 rather than 403 for an account belonging to someone else — a "forbidden" would
# confirm the id exists, which is how an enumeration turns into a target list. Matched on the
# actual `res.status(...)` calls, not on the digits appearing anywhere: "403" also occurs in the
# comment explaining why it is NOT used, which a looser check reads as a failure.
guard_src = _handler_body("const " + GUARD)
s.check("an account that isn't yours answers 404", "res.status(404)" in guard_src, True)
s.check("...and never 403, which would confirm the id exists",
        "res.status(403)" not in guard_src, True)

# Bodies are parsed, not spread: what reaches storage must be the SCHEMA'S output, so an unknown
# field is dropped rather than written. Asserted on what is handed to storage — the raw body still
# appears in the file as safeParse's input, which is correct and must not be read as a failure.
for marker, fn in (('app.post("/api/copy/masters"', "createCopyMaster"),
                   ('app.post("/api/copy/followers"', "createCopyFollower")):
    body = _handler_body(marker)
    s.check(f"{marker.split('(')[1]} validates the body against the schema",
            "safeParse" in body, True)
    s.check(f"{marker.split('(')[1]} stores the PARSED result, not the raw body",
            f"{fn}(parsed.data)" in body, True)
    s.check(f"{marker.split('(')[1]} rejects an invalid body with 400",
            "res.status(400)" in body, True)


# ── THE ENDPOINT THAT LEAKED THE IDS ────────────────────────────────────────
providers = _handler_body('app.get("/api/copy/providers"')
s.check("the provider marketplace requires a login", "verifyToken" in providers, True)
s.check("...and scopes the directory to the caller",
        "getProviderDirectory(user.id)" in providers, True)

storage_src = open(repo_path("server", "storage.ts"), encoding="utf-8").read()
s.check("the directory no longer returns other users' ownerId",
        "ownerId:          r.ownerId" not in storage_src, True)
s.check("...it sends a computed isOwn instead", "isOwn:" in storage_src, True)
s.check("the directory query filters by opted-in OR own",
        "cm.id IS NOT NULL OR ba.user_id = $1" in storage_src, True)


# ── THE ACCOUNT-SCOPED ROUTES KEEP THEIR OWN CHECK ──────────────────────────
# These take the account from the URL and were always correct. Asserted so a future refactor
# cannot quietly drop them while the four above look fine.
for marker in ('app.post("/api/broker-accounts/:id/register-as-provider"',
               'app.post("/api/broker-accounts/:id/register-as-follower"',
               'app.post("/api/broker-accounts/:id/copy-listing"'):
    s.check(f"{marker.split('/')[-1][:-1]} still checks account.userId",
            "account.userId !== user.id" in _handler_body(marker), True)


# ── THE REST OF THE COPY SURFACE NEEDS A LOGIN TOO ──────────────────────────
# Found by sweeping every route for a missing auth check, after the two above were fixed —
# the same defect had five more instances in the same feature. Each one served, or wrote,
# another user's data to anyone who had an id.
NEEDS_LOGIN = [
    ('app.get("/api/copy/trades/follower/:followerId"', "a user's own copied trades"),
    ('app.get("/api/copy/logs/:followerId"',            "broker error messages for that account"),
    ('app.get("/api/copy/trades/master/:masterId"',     "a private master's whole trade history"),
    ('app.get("/api/copy/masters/:id"',                 "the full master row incl. notification email"),
    ('app.patch("/api/copy/telegram-journal/:id/outcome"', "an unauthenticated WRITE"),
]
for marker, why in NEEDS_LOGIN:
    s.check(f"{marker.split('(')[1]} requires a login  ({why})",
            "verifyToken" in _handler_body(marker), True)

# The two that read by follower id must check the follower is YOURS, not merely that you are
# logged in — otherwise any logged-in user still reads any other user's rows.
for marker in ('app.get("/api/copy/trades/follower/:followerId"',
               'app.get("/api/copy/logs/:followerId"'):
    s.check(f"{marker.split('(')[1]} checks the follower belongs to the caller",
            "follower.userId !== user.id" in _handler_body(marker), True)

# The unauthenticated write now scopes the UPDATE itself, so there is no check-then-write gap.
tg = _handler_body('app.patch("/api/copy/telegram-journal/:id/outcome"')
s.check("the outcome write is scoped to the caller inside the UPDATE",
        "cf.user_id = $3" in tg, True)
s.check("...and reports Not found when it matched no row of yours",
        "rowCount" in tg, True)

# A master you don't own must not hand over its owner's contact details.
mid = _handler_body('app.get("/api/copy/masters/:id"')
s.check("a non-owner gets a trimmed listing, not the full row",
        "notifEmail: _e" in mid and "notifPrefs: _p" in mid, True)
s.check("a private master is not readable by a stranger at all",
        "!master.isPublic" in mid, True)


# ── TEETH ───────────────────────────────────────────────────────────────────
# The pre-fix handler body must fail this suite's own test.
OLD_HANDLER = """  app.post("/api/copy/masters", async (req, res) => {
      const { userId: _uid, ...rest } = req.body;
      return res.status(201).json(await storage.createCopyMaster({ ...rest, userId: auth.id }));
  });"""
s.teeth("the pre-fix master endpoint", GUARD not in OLD_HANDLER)

s.done()
