#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
if [ -f "$SCRIPT_DIR/.env" ]; then
  set -a
  # shellcheck disable=SC1090
  source "$SCRIPT_DIR/.env"
  set +a
fi

if [ -z "${DATABASE_URL:-}" ]; then
  echo "DATABASE_URL is required"
  exit 1
fi

if [ -z "${SESSION_SECRET:-}" ]; then
  echo "SESSION_SECRET is required"
  exit 1
fi

PORT=${PORT:-8080}
export PORT

if [ -n "${PGDATA:-}" ]; then
  PGPORT=${PGPORT:-}
  if [ -z "$PGPORT" ]; then
    PGPORT=$(printf '%s' "$DATABASE_URL" | sed -n 's#.*://[^@]*@[^:]*:\([0-9]*\)/.*#\1#p')
    PGPORT=${PGPORT:-5432}
  fi

  export PGDATA
  export PGPORT

  if ! pg_ctl -D "$PGDATA" status >/dev/null 2>&1; then
    if [ ! -d "$PGDATA" ] || [ ! -f "$PGDATA/PG_VERSION" ]; then
      echo "Initializing local PostgreSQL data directory at $PGDATA"
      initdb -D "$PGDATA"
    fi

    echo "Starting local PostgreSQL at port $PGPORT from $PGDATA"
    pg_ctl -D "$PGDATA" -l "$PGDATA/postgres.log" -w start -o "-p $PGPORT -h 127.0.0.1"
  else
    echo "Local PostgreSQL already running from $PGDATA"
  fi
fi

export NODE_ENV=production

echo "Running API server on http://localhost:${PORT}"
cd "$(dirname "$0")"
./node_modules/.bin/pnpm --filter @workspace/api-server run start
