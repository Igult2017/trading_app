#!/usr/bin/env python3
"""
One-time cTrader OAuth2 authorization setup.

Run this once when your cTrader app is Active in the Portal:
  python auth_setup.py

It opens a browser to Spotware's consent page. After you approve,
paste the redirect URL back here. The script exchanges the code for
access + refresh tokens and saves them to .ctrader_token.json.

The signal platform reads that file automatically — no .env changes needed.
Delete .ctrader_token.json to fall back to MetaTrader 5.
"""

import json
import sys
import webbrowser
from pathlib import Path
from urllib.parse import parse_qs, urlencode, urlparse

try:
    import httpx
except ImportError:
    print("Install httpx first:  pip install httpx")
    sys.exit(1)

TOKEN_FILE = Path(__file__).parent / ".ctrader_token.json"
TOKEN_URL  = "https://openapi.ctrader.com/apps/token"
AUTH_URL   = "https://connect.spotware.com/apps/auth"
REDIRECT   = "https://localhost"


def _load_env() -> dict:
    env: dict = {}
    env_path = Path(__file__).parent / ".env"
    if not env_path.exists():
        return env
    for line in env_path.read_text().splitlines():
        if "=" in line and not line.startswith("#"):
            k, _, v = line.partition("=")
            env[k.strip()] = v.strip()
    return env


def _get(env: dict, key: str, prompt: str) -> str:
    v = env.get(key, "")
    if v and not v.startswith("<"):
        print(f"  {key}: {v[:10]}...")
        return v
    return input(f"  {prompt}: ").strip()


def main() -> None:
    print("cTrader OAuth2 Setup")
    print("=" * 40)
    print("Requirements: cTrader app status must be 'Active' in the Portal.\n")

    env = _load_env()

    print("Credentials (loaded from .env where found):")
    client_id     = _get(env, "CTRADER_CLIENT_ID",     "Client ID")
    client_secret = _get(env, "CTRADER_CLIENT_SECRET", "Client Secret")

    account_id = 0
    raw_id = env.get("CTRADER_ACCOUNT_ID", "0")
    try:
        account_id = int(raw_id)
    except ValueError:
        pass
    if not account_id:
        try:
            account_id = int(input("  cTrader Account ID (numeric): ").strip())
        except ValueError:
            print("Invalid account ID.")
            sys.exit(1)

    auth_url = AUTH_URL + "?" + urlencode({
        "client_id":     client_id,
        "redirect_uri":  REDIRECT,
        "response_type": "code",
        "scope":         "trading",
    })

    print(f"\nOpen this URL in your browser:\n  {auth_url}\n")
    try:
        webbrowser.open(auth_url)
    except Exception:
        pass

    print("After authorizing, your browser redirects to a URL starting with:")
    print(f"  {REDIRECT}/?code=...\n")
    raw = input("Paste the full redirect URL (or just the code): ").strip()

    if raw.startswith("http"):
        code = parse_qs(urlparse(raw).query).get("code", [""])[0]
    else:
        code = raw

    if not code:
        print("No authorization code found.")
        sys.exit(1)

    print("\nExchanging code for tokens...")
    r = httpx.post(TOKEN_URL, data={
        "grant_type":    "authorization_code",
        "code":          code,
        "redirect_uri":  REDIRECT,
        "client_id":     client_id,
        "client_secret": client_secret,
    }, timeout=15)
    body = r.json()

    if "refresh_token" not in body:
        print(f"Error from Spotware: {body}")
        sys.exit(1)

    tokens = {
        "client_id":     client_id,
        "account_id":    account_id,
        "access_token":  body.get("access_token", ""),
        "refresh_token": body["refresh_token"],
    }
    TOKEN_FILE.write_text(json.dumps(tokens, indent=2))
    print(f"\nSaved to: {TOKEN_FILE}")
    print("The signal platform will now use cTrader for market data.")
    print("Delete .ctrader_token.json to fall back to MetaTrader 5.")


if __name__ == "__main__":
    main()
