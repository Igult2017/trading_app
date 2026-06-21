"""
One-shot Telethon login helper for the user-session relay. Spawned by the Node API
(server/lib/tgRelayLogin.ts): reads a JSON command on STDIN, performs ONE OTP step,
persists the (encrypted) session to telegram_user_sessions, and prints a JSON result
on STDOUT. Sensitive inputs (code/password) come via stdin, never argv.

Stateless across steps: each call rebuilds the Telethon client from the stored
StringSession, so send → verify → password can run as separate processes.

Commands:  {"cmd":"send","sessionId":..}
           {"cmd":"verify","sessionId":..,"code":"12345"}
           {"cmd":"password","sessionId":..,"password":".."}
"""
import sys
import json
import asyncio

from db import Session, TelegramUserSession
from config import TELEGRAM_API_ID, TELEGRAM_API_HASH


def _save(sid, session_enc, code_hash, status, active):
    with Session() as db:
        row = db.get(TelegramUserSession, sid)
        if row:
            row.session_enc     = session_enc
            row.phone_code_hash = code_hash
            row.status          = status
            row.is_active       = active
            db.commit()


def _set_error(sid, err):
    with Session() as db:
        row = db.get(TelegramUserSession, sid)
        if row:
            row.status = "failed"
            row.last_error = (err or "")[:500]
            db.commit()


async def run(req: dict) -> dict:
    cmd = req.get("cmd")
    sid = req.get("sessionId")
    if not (TELEGRAM_API_ID and TELEGRAM_API_HASH):
        return {"ok": False, "error": "relay disabled — TELEGRAM_API_ID/HASH not set"}

    from telethon import TelegramClient
    from telethon.sessions import StringSession
    from telethon.errors import SessionPasswordNeededError
    from crypto import decrypt_json
    from _encrypt import encrypt_str

    with Session() as db:
        row = db.get(TelegramUserSession, sid)
        if not row:
            return {"ok": False, "error": "session not found"}
        phone     = row.phone_number
        code_hash = row.phone_code_hash
        sess_str  = ""
        if row.session_enc:
            try:
                sess_str = (decrypt_json(row.session_enc) or {}).get("session") or ""
            except Exception:
                sess_str = ""

    def enc(s):
        return encrypt_str(json.dumps({"session": s}))

    client = TelegramClient(StringSession(sess_str), TELEGRAM_API_ID, TELEGRAM_API_HASH)
    await client.connect()
    try:
        if cmd == "send":
            sent = await client.send_code_request(phone)
            _save(sid, enc(client.session.save()), sent.phone_code_hash, "code_sent", False)
            return {"ok": True, "status": "code_sent"}

        if cmd == "verify":
            try:
                await client.sign_in(phone, req.get("code"), phone_code_hash=code_hash)
            except SessionPasswordNeededError:
                _save(sid, enc(client.session.save()), code_hash, "password_needed", False)
                return {"ok": True, "status": "password_needed"}
            _save(sid, enc(client.session.save()), None, "active", True)
            return {"ok": True, "status": "active"}

        if cmd == "password":
            await client.sign_in(password=req.get("password"))
            _save(sid, enc(client.session.save()), None, "active", True)
            return {"ok": True, "status": "active"}

        return {"ok": False, "error": f"unknown cmd: {cmd}"}
    except Exception as e:
        _set_error(sid, str(e))
        return {"ok": False, "error": str(e)}
    finally:
        await client.disconnect()


def main():
    try:
        req = json.loads(sys.stdin.read() or "{}")
    except Exception as e:
        print(json.dumps({"ok": False, "error": f"bad input: {e}"}))
        return
    result = asyncio.run(run(req))
    print(json.dumps(result))


if __name__ == "__main__":
    main()
