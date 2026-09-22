#!/usr/bin/env bash
# Stop exactly the servers started by start-servers.sh, using the PIDs it wrote.
# Never uses a broad pkill; if a pidfile is missing the process is left alone.
#
# Usage: bash docs/scripts/stop-servers.sh
set -u

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
LOGS="$ROOT/docs/logs"

if [ ! -d "$LOGS" ]; then
  echo "stop-servers.sh: nothing to stop ($LOGS does not exist)"
  exit 0
fi

for pidfile in "$LOGS"/*.pid; do
  [ -e "$pidfile" ] || continue
  name="$(basename "$pidfile" .pid)"
  pid="$(cat "$pidfile" 2>/dev/null || true)"
  if [ -z "$pid" ]; then
    rm -f "$pidfile"
    continue
  fi
  if kill -0 "$pid" 2>/dev/null; then
    echo "stopping $name (pid $pid)"
    # npm/vite spawn children; kill the whole process group if we can.
    kill -TERM "-$pid" 2>/dev/null || kill -TERM "$pid" 2>/dev/null
    for _ in $(seq 1 20); do
      kill -0 "$pid" 2>/dev/null || break
      sleep 0.25
    done
    kill -0 "$pid" 2>/dev/null && kill -KILL "$pid" 2>/dev/null
  else
    echo "$name (pid $pid) already gone"
  fi
  rm -f "$pidfile"
done
echo "all benchmark servers stopped"
