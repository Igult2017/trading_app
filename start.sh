#!/bin/sh
set -e

echo "=== Environment Check ==="
echo "NODE_ENV: $NODE_ENV"
echo "DATABASE_URL set: $([ -n "$DATABASE_URL" ] && echo YES || echo NO)"
echo "GOOGLE_API_KEY set: $([ -n "$GOOGLE_API_KEY" ] && echo YES || echo NO)"
echo "========================="

# ── Run DB migrations against the real DB ─────────────────────────────────────
# Must happen before PgBouncer starts — DDL (CREATE TABLE / ALTER TABLE) does
# not work reliably through PgBouncer's transaction-pool mode.
if [ -n "$DATABASE_URL" ]; then
  echo "=== Running DB migrations ==="
  psql "$DATABASE_URL" -f /app/docker-migrate.sql \
    && echo "Migrations complete" \
    || echo "Migration warning (non-fatal, continuing)"
fi

# ── Configure and start PgBouncer ─────────────────────────────────────────────
# Python parses DATABASE_URL so passwords with special characters are safe.
# It writes the two config files PgBouncer needs, then prints the proxied URL.
PGBOUNCER_URL=$(python3 - <<'PYEOF'
import os, sys
from urllib.parse import urlparse, quote

raw = os.environ.get("DATABASE_URL", "")
if not raw:
    sys.stderr.write("DATABASE_URL not set — skipping PgBouncer\n")
    sys.exit(0)

p = urlparse(raw)
user     = p.username or ""
password = p.password or ""
host     = p.hostname or "127.0.0.1"
port     = p.port or 5432
dbname   = (p.path or "/").lstrip("/").split("?")[0]

# Detect SSL requirement from the original URL query string
sslmode = "prefer"
if p.query:
    for part in p.query.split("&"):
        if part.startswith("sslmode="):
            sslmode = part.split("=", 1)[1]

# ── pgbouncer.ini ──
ini = f"""[databases]
{dbname} = host={host} port={port} dbname={dbname} sslmode={sslmode}

[pgbouncer]
listen_port            = 6432
listen_addr            = 127.0.0.1
auth_type              = md5
auth_file              = /etc/pgbouncer/userlist.txt
pool_mode              = transaction
max_client_conn        = 5000
default_pool_size      = 20
min_pool_size          = 5
reserve_pool_size      = 5
reserve_pool_timeout   = 3
server_idle_timeout    = 600
ignore_startup_parameters = extra_float_digits
logfile                = /var/log/pgbouncer/pgbouncer.log
pidfile                = /var/run/pgbouncer/pgbouncer.pid
"""

# ── userlist.txt — PgBouncer uses this to auth TO the real PostgreSQL ──
# Also used to verify the client password (auth_type = md5)
# Format: "username" "md5<md5(password+username)>"  OR plaintext "password"
# We use plaintext here (PgBouncer supports it when prefixed with nothing special)
userlist = f'"{user}" "{password}"\n'

import os as _os
_os.makedirs("/var/log/pgbouncer", exist_ok=True)
_os.makedirs("/var/run/pgbouncer", exist_ok=True)

with open("/etc/pgbouncer/pgbouncer.ini", "w") as f:
    f.write(ini)

with open("/etc/pgbouncer/userlist.txt", "w") as f:
    f.write(userlist)
_os.chmod("/etc/pgbouncer/userlist.txt", 0o600)

# Print the proxied DATABASE_URL for the app to use
# Password is kept so md5 auth from app → PgBouncer works
encoded_pass = quote(password, safe="")
print(f"postgresql://{user}:{encoded_pass}@127.0.0.1:6432/{dbname}", end="")
PYEOF
)

if [ -n "$PGBOUNCER_URL" ]; then
  pgbouncer -d /etc/pgbouncer/pgbouncer.ini
  echo "PgBouncer started on 127.0.0.1:6432 (pool_mode=transaction, max_client_conn=5000)"
  # Point the app at PgBouncer instead of the real DB
  export DATABASE_URL="$PGBOUNCER_URL"
else
  echo "PgBouncer not configured — app will connect directly to the database"
fi

# ── Start the app ─────────────────────────────────────────────────────────────
exec node dist/index.prod.js
