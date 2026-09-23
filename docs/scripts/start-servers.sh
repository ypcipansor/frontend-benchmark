#!/usr/bin/env bash
# Start the seven benchmark implementations on their fixed ports and wait until
# each one answers. Used by CI and by anyone running the parity gate locally.
#
# Every server logs to docs/logs/<framework>.log; an atomic state file recording
# its PID, process-group id, /proc starttime and a per-run token is written to
# docs/logs/<framework>.state. stop-servers.sh uses that identity to terminate
# exactly the processes this run started -- never a broad pkill, and never a
# recycled PID that now belongs to something else.
#
# A port that is already in use is a hard error: the script refuses to start so a
# pre-existing (possibly stale) server can never be mistaken for the one it just
# launched. It never kills a foreign process. If any server fails, everything
# this run already started is stopped before exiting.
#
# Usage: bash docs/scripts/start-servers.sh [--ready-timeout 120] [--only <fw>]
#                                            [--port-offset N]
set -u

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
# shellcheck source=lib/procstate.sh
. "$ROOT/docs/scripts/lib/procstate.sh"
LOGS="${FB_LOGS_DIR:-$ROOT/docs/logs}"
READY_TIMEOUT=120
ONLY=""
PORT_OFFSET=0

FRAMEWORKS="react vue angular leptos yew dioxus blade"

usage() {
  echo "usage: start-servers.sh [--ready-timeout <seconds>] [--only <framework>]" >&2
  echo "                        [--port-offset <n>]" >&2
  echo "  --only must be one of: $FRAMEWORKS" >&2
}

# Reject a value that is empty or not a plain non-negative integer. Without this
# an arg like `--port-offset abc` reaches arithmetic expansion and produces a
# confusing shell error (or worse, a silently wrong port).
require_uint() {
  local flag="$1" value="$2" max="${3:-}"
  if [ -z "$value" ]; then
    echo "start-servers.sh: $flag requires a value" >&2
    usage; exit 2
  fi
  case "$value" in
    ''|*[!0-9]*)
      echo "start-servers.sh: $flag expects a non-negative integer, got '$value'" >&2
      exit 2 ;;
  esac
  if [ -n "$max" ] && [ "$value" -gt "$max" ]; then
    echo "start-servers.sh: $flag expects a value <= $max, got '$value'" >&2
    exit 2
  fi
}

while [ $# -gt 0 ]; do
  case "$1" in
    --ready-timeout)
      shift
      require_uint "--ready-timeout" "${1:-}"
      READY_TIMEOUT="$1"; shift ;;
    --only)
      shift
      ONLY="${1:-}"
      if [ -z "$ONLY" ]; then
        echo "start-servers.sh: --only requires a framework name" >&2
        usage; exit 2
      fi
      case " $FRAMEWORKS " in
        *" $ONLY "*) ;;
        *) echo "start-servers.sh: unknown --only target '$ONLY'" >&2
           usage; exit 2 ;;
      esac
      shift ;;
    --port-offset)
      shift
      require_uint "--port-offset" "${1:-}" 10000
      PORT_OFFSET="$1"; shift ;;
    *) echo "start-servers.sh: unknown argument $1" >&2; usage; exit 2 ;;
  esac
done

# Ports are data so --port-offset can shift them (used by the regression tests to
# exercise the stale-port guard without touching the real benchmark ports).
PORT_REACT=$((4001 + PORT_OFFSET))
PORT_VUE=$((4002 + PORT_OFFSET))
PORT_ANGULAR=$((4003 + PORT_OFFSET))
PORT_LEPTOS=$((4004 + PORT_OFFSET))
PORT_YEW=$((4005 + PORT_OFFSET))
PORT_DIOXUS=$((4006 + PORT_OFFSET))
PORT_BLADE=$((4007 + PORT_OFFSET))

mkdir -p "$LOGS"
FAILED=0
RUN_TOKEN="$(new_run_token)"

want() { [ -z "$ONLY" ] || [ "$1" = "$ONLY" ]; }

# PIDs launched by *this* run, so a partial failure stops only what we started.
STARTED_PIDS=()

start() {
  local name="$1"; shift
  if ! want "$name"; then return; fi
  echo "starting $name ..."
  # Run each server in its own session (setsid) via serve.sh, which records the
  # state file from *inside* the new session and then `exec`s the server. Doing
  # the write in the child removes the race where the parent reads /proc/<pid>
  # before setsid() has run and records the launcher's group instead. The
  # recorded pid is a process-group leader, so stop-servers.sh can terminate the
  # whole tree with `kill -TERM -$pid` and no vite/ng child is orphaned.
  setsid bash "$ROOT/docs/scripts/lib/serve.sh" "$LOGS/$name.state" "$RUN_TOKEN" "$@" \
    >"$LOGS/$name.log" 2>&1 &
  local pid=$!
  STARTED_PIDS+=("$pid")
}

# True when something already accepts TCP connections on the port. Uses bash's
# /dev/tcp so no extra tool (lsof, nc) is required on the CI runner.
port_in_use() {
  local port="$1"
  (exec 3<>"/dev/tcp/127.0.0.1/$port") 2>/dev/null || return 1
  exec 3<&-
  exec 3>&-
  return 0
}

state_pid_for() { state_get "$LOGS/$1.state" pid; }

# Preflight: refuse to start when a target port is already taken. This is what
# prevents a stale server from being reported as freshly ready. It runs before
# anything is launched, so a bad port set leaves the machine untouched.
declare -A PORT_OF=(
  [react]="$PORT_REACT" [vue]="$PORT_VUE" [angular]="$PORT_ANGULAR"
  [leptos]="$PORT_LEPTOS" [yew]="$PORT_YEW" [dioxus]="$PORT_DIOXUS"
  [blade]="$PORT_BLADE"
)
for name in $FRAMEWORKS; do
  want "$name" || continue
  port="${PORT_OF[$name]}"
  if port_in_use "$port"; then
    echo "start-servers.sh: port $port for $name is already in use;" \
         "refusing to start (a stale server must not be mistaken for this run)" >&2
    FAILED=1
  fi
done # (preflight)

if [ "$FAILED" -ne 0 ]; then
  echo "start-servers.sh: preflight failed; no servers were started" >&2
  exit 1
fi

# --- JavaScript frameworks: Vite dev servers ------------------------------
if want react; then
  start react npm --prefix "$ROOT/implementations/react" run dev -- \
    --port "$PORT_REACT" --host 127.0.0.1 --strictPort
fi
if want vue; then
  start vue npm --prefix "$ROOT/implementations/vue" run dev -- \
    --port "$PORT_VUE" --host 127.0.0.1 --strictPort
fi
if want angular; then
  start angular npm --prefix "$ROOT/implementations/angular" start -- \
    --port "$PORT_ANGULAR" --host 127.0.0.1
fi

# --- Blade: PHP built-in server -------------------------------------------
if want blade; then
  start blade php -S "127.0.0.1:$PORT_BLADE" -t "$ROOT/implementations/blade"
fi

# --- Rust frameworks: static dist built by trunk ---------------------------
# The dists reference ../../shared/styles/todo.css; mirror it inside each dist so
# the relative path resolves when the dist is served directly. Doing it here (not
# only in CI) keeps a local run reproducible after `trunk build` wipes dist/.
mirror_shared() {
  local name="$1"
  want "$name" || return 0
  local dist="$ROOT/implementations/$name/dist"
  [ -d "$dist" ] || return 0
  mkdir -p "$dist/shared/styles"
  cp "$ROOT/shared/styles/todo.css" "$dist/shared/styles/"
}

if want leptos; then
  mirror_shared leptos
  start leptos python3 -m http.server "$PORT_LEPTOS" --bind 127.0.0.1 \
    --directory "$ROOT/implementations/leptos/dist"
fi
if want yew; then
  mirror_shared yew
  start yew python3 -m http.server "$PORT_YEW" --bind 127.0.0.1 \
    --directory "$ROOT/implementations/yew/dist"
fi
if want dioxus; then
  mirror_shared dioxus
  start dioxus python3 -m http.server "$PORT_DIOXUS" --bind 127.0.0.1 \
    --directory "$ROOT/implementations/dioxus/dist"
fi

# Stop everything this run launched, so a failure never leaves partial servers.
stop_started() {
  local pid
  for pid in "${STARTED_PIDS[@]:-}"; do
    [ -n "$pid" ] || continue
    kill -TERM "-$pid" 2>/dev/null || kill -TERM "$pid" 2>/dev/null
  done
  for pid in "${STARTED_PIDS[@]:-}"; do
    [ -n "$pid" ] || continue
    kill -0 "$pid" 2>/dev/null && kill -KILL "$pid" 2>/dev/null
  done
}

wait_port() {
  local name="$1" port="$2"
  if ! want "$name"; then return; fi
  # serve.sh writes the state file from inside the new session, just after
  # setsid forks, so it may not exist yet on the first read. Poll for it until
  # the deadline instead of failing on the very first probe.
  local deadline=$(( $(date +%s) + READY_TIMEOUT ))
  local pid=""
  while [ -z "$pid" ] && [ "$(date +%s)" -lt "$deadline" ]; do
    pid="$(state_pid_for "$name")"
    [ -n "$pid" ] || sleep 1
  done
  if [ -z "$pid" ]; then
    echo "  $name: no PID recorded; cannot verify readiness" >&2
    FAILED=1
    return 1
  fi
  while [ "$(date +%s)" -lt "$deadline" ]; do
    # The PID we launched must still be alive before we accept an HTTP response:
    # otherwise the response could come from something else entirely.
    if ! kill -0 "$pid" 2>/dev/null; then
      echo "  $name process (pid $pid) exited before becoming ready" >&2
      FAILED=1
      return 1
    fi
    if curl -sf -o /dev/null "http://127.0.0.1:$port/"; then
      echo "  $name ready on $port"
      return 0
    fi
    sleep 1
  done
  echo "  $name did not become ready within ${READY_TIMEOUT}s" >&2
  FAILED=1
  return 1
}

wait_port react "$PORT_REACT"
wait_port vue "$PORT_VUE"
wait_port angular "$PORT_ANGULAR"
wait_port leptos "$PORT_LEPTOS"
wait_port yew "$PORT_YEW"
wait_port dioxus "$PORT_DIOXUS"
wait_port blade "$PORT_BLADE"

if [ "$FAILED" -ne 0 ]; then
  stop_started
  echo "start-servers.sh: one or more servers failed to start" >&2
  exit 1
fi
echo "all requested servers are up"
