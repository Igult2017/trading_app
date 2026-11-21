"""THE BROKER'S OWN CLOCK on an execution event — so a copy's delay is measured at both ends by cTrader, not by us.

Plan step 9 (21 Nov 2026): the delay of every copy = the broker's time on the follower's confirming event minus the
broker's time on the master's event. Both come from the same broker's clock, so our server's clock and the network
between us and cTrader do not distort it.
"""


def broker_ms(event) -> int | None:
    """Milliseconds since 1970 that cTrader stamped on this execution event: the deal's execution time when there is a
    deal, else the order's or position's last-update time. None when it carries none."""
    for part, field in (("deal", "executionTimestamp"), ("order", "utcLastUpdateTimestamp"),
                        ("position", "utcLastUpdateTimestamp")):
        try:
            if event.HasField(part):
                v = int(getattr(getattr(event, part), field, 0) or 0)
                if v:
                    return v
        except ValueError:
            continue
    return None
