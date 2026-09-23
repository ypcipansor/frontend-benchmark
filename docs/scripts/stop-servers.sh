#!/usr/bin/env bash
# Stop exactly the servers started by start-servers.sh, using the PIDs it wrote.
# Never uses a broad pkill; if a pidfile is missing the process is left alone.
#
# Usage: bash docs/scripts/stop-servers.sh
set -u

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
LOGS="${FB_LOGS_DIR:-$ROOT/docs/logs}"

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
  # start-servers.sh launches each server with setsid, so $pid is a process-group
  # leader and -$pid addresses the whole tree. Signal the group even if the
  # leader itself has already exited, otherwise an orphaned vite/ng child would
  # keep holding the port and stale the next run.
  group_alive=0
  if kill -0 -- "-$pid" 2>/dev/null; then group_alive=1; fi
  if kill -0 "$pid" 2>/dev/null || [ "$group_alive" -eq 1 ]; then
    echo "stopping $name (pid $pid)"
    kill -TERM "-$pid" 2>/dev/null || kill -TERM "$pid" 2>/dev/null
    for _ in $(seq 1 20); do
      kill -0 -- "-$pid" 2>/dev/null || break
      sleep 0.25
    done
    kill -KILL "-$pid" 2>/dev/null || true
  else
    echo "$name (pid $pid) already gone"
  fi
  rm -f "$pidfile"
done
echo "all benchmark servers stopped"
