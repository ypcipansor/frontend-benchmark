#!/usr/bin/env bash
# Launch a server as the leader of its own session and record its identity.
#
# This runs as the process started by `setsid`, so by the time it executes it is
# already the new session's leader and `pgid == pid`. Writing the state file
# *here*, in the child, removes the race that exists when the parent inspects
# /proc/<pid> before the child has called setsid(): the parent would sometimes
# read the launcher's process group instead of the server's own.
#
# After recording the identity the wrapper `exec`s the server, so the recorded
# pid *is* the server; there is no intermediate process to hold the port.
#
# Usage: setsid serve.sh <state-file> <run-token> <cmd...>
set -u

STATE_FILE="$1"; shift
RUN_TOKEN="$1"; shift

pid=$$
pgrp="$(sed 's/.*) //' "/proc/$pid/stat" | awk '{print $3}')"
starttime="$(sed 's/.*) //' "/proc/$pid/stat" | awk '{print $20}')"
boot_id="$(cat /proc/sys/kernel/random/boot_id 2>/dev/null || echo unknown)"
cmd="$(printf '%s ' "$@" | sed 's/ *$//')"

# The whole safety model rests on pid == pgid here. If setsid did not put us in
# charge of a new group, refuse to record identity we cannot vouch for.
if [ -z "$pgrp" ] || [ "$pgrp" != "$pid" ]; then
  echo "serve.sh: refusing to record state: pid $pid is not the session leader (pgrp ${pgrp:-none})" >&2
  exit 1
fi

tmp="${STATE_FILE}.tmp.$$"
{
  echo "# frontend-benchmark server state (atomic write)"
  echo "pid=$pid"
  echo "pgid=$pgrp"
  echo "starttime=$starttime"
  echo "boot_id=$boot_id"
  echo "run_token=$RUN_TOKEN"
  echo "cmd=$cmd"
} > "$tmp" || { rm -f "$tmp"; exit 1; }
mv -f "$tmp" "$STATE_FILE"

exec "$@"
