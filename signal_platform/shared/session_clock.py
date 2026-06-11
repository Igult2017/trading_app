"""
Session clock — thin wrapper that delegates to session_api.py.

session_api.py calls the app's /api/market-sessions endpoint (live, cached)
and falls back to local UTC window math if the server is unreachable.

Session definitions (from client/src/lib/tradingSessions.ts):
  Sydney   22:00–07:00 UTC  (crosses midnight)
  Tokyo    00:00–09:00 UTC
  London   07:00–15:30 UTC
  New York 12:00–21:00 UTC
"""
from datetime import datetime
from shared.session_api import is_valid_session, active_session_names   # noqa: F401

__all__ = ["is_valid_session", "active_session_names"]
