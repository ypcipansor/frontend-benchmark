#!/usr/bin/env bash
# Stop exactly the servers started by start-servers.sh, using the identity it
# recorded in docs/logs/<framework>.state. Never uses a broad pkill.
#
# Safety is the whole point here. A PID alone is not an identity: after an
# unclean exit the number can be recycled by an unrelated process, and signalling
# its process group would kill someone else's tree. So before any signal is sent
# we verify, against live /proc data, that the recorded PID
#
#   * still exists,
#   * has the recorded starttime (so it is not a recycled PID),
#   * is still the leader of the process group this run created, and
#   * was started in the same boot (so a starttime collision across a reboot
#     cannot be mistaken for a match).
#
# The recorded command line is kept for diagnostics but is deliberately *not* a
# gate: a process may legitimately rewrite its own title (npm, `setsid`), which
# would otherwise make a live server look like a foreign process.
#
# If any of that cannot be verified, no signal is sent: the metadata is
# quarantined and a warning is printed. The recorded process-group id is used for
# the signal so children (vite/ng) are reaped too, never left orphaned.
#
# Usage: bash docs/scripts/stop-servers.sh
set -u

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
# shellcheck source=lib/procstate.sh
. "$ROOT/docs/scripts/lib/procstate.sh"
LOGS="${FB_LOGS_DIR:-$ROOT/docs/logs}"

if [ ! -d "$LOGS" ]; then
  echo "stop-servers.sh: nothing to stop ($LOGS does not exist)"
  exit 0
fi

stopped=0
skipped=0
finished=0

for statefile in "$LOGS"/*.state; do
  [ -e "$statefile" ] || continue
  name="$(basename "$statefile" .state)"
  verify_state "$statefile"
  rc=$?
  if [ "$rc" -eq 0 ]; then
    pid="$STATE_PID"
    echo "stopping $name ($STATE_REASON)"
    # Signal the whole group: the group id equals the recorded PID because
    # start-servers.sh launches each server under setsid. The group is re-read
    # from /proc for liveness -- `kill -0 -- -$pid` also succeeds for a group of
    # zombies, so it cannot tell "still running" from "already dead".
    kill -TERM -- "-$pid" 2>/dev/null || kill -TERM "$pid" 2>/dev/null || true
    for _ in $(seq 1 20); do
      group_has_live_members "$pid" || break
      sleep 0.25
    done
    if group_has_live_members "$pid"; then
      kill -KILL -- "-$pid" 2>/dev/null || kill -KILL "$pid" 2>/dev/null || true
    fi
    rm -f "$statefile"
    stopped=$((stopped + 1))
  elif [ "$rc" -eq 2 ]; then
    # Leader gone and no live member left in the group: the server has already
    # exited on its own, so the record is spent. Remove it rather than
    # quarantining it -- nothing was skipped and nothing needs signalling.
    echo "stop-servers.sh: $name already stopped ($STATE_REASON)"
    rm -f "$statefile"
    finished=$((finished + 1))
  else
    echo "stop-servers.sh: refusing to signal $name: $STATE_REASON" >&2
    quarantine_state "$statefile" "$LOGS"
    skipped=$((skipped + 1))
  fi
done

# A pidfile left by a pre-overhaul run has no identity metadata and is therefore
# unusable; quarantine it rather than trusting its number.
for pidfile in "$LOGS"/*.pid; do
  [ -e "$pidfile" ] || continue
  echo "stop-servers.sh: ignoring legacy pidfile $(basename "$pidfile") (no identity metadata)" >&2
  quarantine_state "$pidfile" "$LOGS"
done

echo "stopped $stopped server(s), $finished already finished, skipped $skipped unverifiable record(s)"
