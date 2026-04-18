"""
Telegram session authenticator.

Run this ONCE per Telegram account before starting the bridge.
It performs the interactive OTP flow and saves a session file that the
listener reuses on every subsequent start — no OTP needed after this.

Usage (inside Docker, recommended):
  docker compose exec bridge-worker python -m python.copy_trading.auth_helper

Usage (local, then copy session to server):
  python -m python.copy_trading.auth_helper

The session file is saved to TELEGRAM_SESSION_DIR (default /var/lib/tradesync/tg_sessions).
It is named  session_<master_id>  and is stored in the tg_sessions Docker volume
so it survives container restarts and rebuilds.

What you will need:
  1. api_id   — from https://my.telegram.org  → "API Development Tools"
  2. api_hash — same page
  3. Phone number linked to that Telegram account (international format: +1234567890)
  4. The OTP Telegram sends to that phone / Telegram app
  5. 2FA password if your account has one
  6. master_id — the UUID of the copy_masters row this account belongs to
                 (shown in the wizard after you save a Telegram master)
"""
import asyncio
import os
import sys

try:
    from telethon import TelegramClient
    from telethon.errors import SessionPasswordNeededError
except ImportError:
    print("ERROR: Telethon is not installed.")
    print("  pip install telethon  or  docker compose exec bridge-worker pip install telethon")
    sys.exit(1)

from .config import TELEGRAM_SESSION_DIR


def _prompt(label: str, secret: bool = False) -> str:
    import getpass
    value = getpass.getpass(f"{label}: ") if secret else input(f"{label}: ")
    return value.strip()


async def authenticate():
    print("=" * 60)
    print("  TradeSync — Telegram Account Authentication")
    print("=" * 60)
    print()
    print("This runs once.  The session file it creates is reused")
    print("on every bridge start — you will not need to do this again")
    print("unless you delete the session file or revoke the session.")
    print()

    master_id = _prompt("Master ID (UUID from wizard)")
    api_id    = int(_prompt("api_id   (from my.telegram.org)"))
    api_hash  = _prompt("api_hash (from my.telegram.org)", secret=True)
    phone     = _prompt("Phone number (e.g. +1234567890)")

    os.makedirs(TELEGRAM_SESSION_DIR, exist_ok=True)
    session_path = os.path.join(TELEGRAM_SESSION_DIR, f"session_{master_id}")

    print(f"\nSession will be saved to: {session_path}")
    print("Connecting to Telegram...\n")

    client = TelegramClient(session_path, api_id, api_hash)
    await client.connect()

    if await client.is_user_authorized():
        me = await client.get_me()
        print(f"Already authenticated as: {me.first_name} (@{me.username})")
        print("Nothing to do — session file is already valid.")
        await client.disconnect()
        return

    await client.send_code_request(phone)
    print(f"OTP sent to {phone}.")

    code = _prompt("Enter the OTP code")
    try:
        await client.sign_in(phone, code)
    except SessionPasswordNeededError:
        # Account has 2FA enabled
        password = _prompt("2FA password", secret=True)
        await client.sign_in(password=password)

    me = await client.get_me()
    await client.disconnect()

    print()
    print("=" * 60)
    print(f"  Authenticated as: {me.first_name} (@{me.username})")
    print(f"  Session saved:    {session_path}")
    print("=" * 60)
    print()
    print("You can now start (or restart) the bridge:")
    print("  docker compose restart bridge-worker")
    print()


if __name__ == "__main__":
    asyncio.run(authenticate())
