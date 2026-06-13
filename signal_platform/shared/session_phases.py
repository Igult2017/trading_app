"""
6 institutional trading phases (UTC).
Tokyo-Sydney Overlap crosses midnight — handled with a split comparison.
"""
from datetime import datetime, time

_PHASES = [
    ("Tokyo Mid",         time(3, 0),  time(6, 0)),
    ("London Open",       time(7, 0),  time(9, 0)),
    ("London Mid",        time(9, 0),  time(12, 0)),
    ("NY-London Overlap", time(12, 0), time(15, 30)),
    ("NY Mid",            time(15, 30), time(18, 0)),
]

_OVERNIGHT_START = time(22, 0)
_OVERNIGHT_END   = time(2, 0)


def is_valid_phase(dt: datetime) -> bool:
    """Return True if dt (UTC) falls inside any of the 6 institutional windows."""
    t = dt.time()
    for _, start, end in _PHASES:
        if start <= t < end:
            return True
    if t >= _OVERNIGHT_START or t < _OVERNIGHT_END:
        return True
    return False


def active_phase(dt: datetime) -> str | None:
    """Return the phase name or None if outside all windows."""
    t = dt.time()
    for name, start, end in _PHASES:
        if start <= t < end:
            return name
    if t >= _OVERNIGHT_START or t < _OVERNIGHT_END:
        return "Tokyo-Sydney Overlap"
    return None
