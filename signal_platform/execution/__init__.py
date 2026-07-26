"""
VIX.1 autotrade — real pending stop orders, for measurement rather than profit.

OFF unless `autotrade_enabled` is set, demo-only unless that is explicitly relaxed, and refused by
`guards` for a dozen reasons before anything reaches a broker.

  sizing.py   risk % -> lots -> the Open API's integer `volume`. The encoding lives here, once.
  guards.py   the gates. Returns a reason to refuse, or None to allow.
  broker.py   the cTrader conversation: connect, auth, send, resolve.
  orders.py   the WIRE FORMAT: building the request, reading the verdict.
  placer.py   orchestrates the above, and produces the FILL vs MODEL report that is the point.
"""
