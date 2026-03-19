#!/usr/bin/env bash
set -euo pipefail

DB="${1:-launchradar}"

echo "==> Flushing Redis (kills all BullMQ jobs)..."
redis-cli FLUSHALL

echo "==> Truncating all tables in database: $DB..."
psql "$DB" -c 'TRUNCATE TABLE "LaunchSource", "TweetSignal", "MonitoredAccount", "LaunchRecord" CASCADE;'

echo "==> Done. Restart the server to re-register static rules."
