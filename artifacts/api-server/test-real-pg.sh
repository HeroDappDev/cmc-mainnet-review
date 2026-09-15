#!/usr/bin/env bash
set -euo pipefail

root_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
tmp_dir="$(mktemp -d /tmp/workspace-onchain-pg.XXXXXX)"
data_dir="$tmp_dir/data"
socket_dir="$tmp_dir/socket"
port="$((55432 + ($$ % 1000)))"
database_url="postgresql://onchain@localhost/onchain_test?host=${socket_dir}&port=${port}"

cleanup() {
  pg_ctl -D "$data_dir" -w stop -m immediate >/dev/null 2>&1 || true
  rm -rf "$tmp_dir"
}
trap cleanup EXIT INT TERM

mkdir -p "$socket_dir"
initdb -D "$data_dir" --username=onchain --auth=trust --no-locale >/dev/null
cat >>"$data_dir/postgresql.conf" <<EOF
listen_addresses = ''
unix_socket_directories = '$socket_dir'
port = $port
EOF
pg_ctl -D "$data_dir" -w start -l "$tmp_dir/postgres.log" >/dev/null
createdb -h "$socket_dir" -p "$port" -U onchain onchain_test

(
  cd "$root_dir"
  DATABASE_URL="$database_url" pnpm --filter @workspace/db push
  DATABASE_URL="$database_url" \
    ONCHAIN_REAL_PG_TEST_URL="$database_url" \
    pnpm --filter @workspace/api-server test:real-pg
)