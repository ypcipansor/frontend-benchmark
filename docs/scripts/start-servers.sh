#!/usr/bin/env bash
# Start the seven benchmark implementations on their fixed ports and wait until
# each one answers. Used by CI and by anyone running the parity gate locally.
#
# Every server logs to docs/logs/<framework>.log; its PID is written to
# docs/logs/<framework>.pid so stop-servers.sh can terminate exactly those
# processes (never a broad pkill).
#
# Usage: bash docs/scripts/start-servers.sh [--ready-timeout 120] [--only <fw>]
set -u

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
LOGS="$ROOT/docs/logs"
READY_TIMEOUT=120
ONLY=""

while [ $# -gt 0 ]; do
  case "$1" in
    --ready-timeout) READY_TIMEOUT="$2"; shift 2 ;;
    --only) ONLY="$2"; shift 2 ;;
    *) echo "start-servers.sh: unknown argument $1" >&2; exit 2 ;;
  esac
done

mkdir -p "$LOGS"
FAILED=0

want() { [ -z "$ONLY" ] || [ "$1" = "$ONLY" ]; }

start() {
  local name="$1"; shift
  if ! want "$name"; then return; fi
  echo "starting $name ..."
  ( "$@" ) >"$LOGS/$name.log" 2>&1 &
  echo $! >"$LOGS/$name.pid"
}

wait_port() {
  local name="$1" port="$2"
  if ! want "$name"; then return; fi
  local deadline=$(( $(date +%s) + READY_TIMEOUT ))
  while [ "$(date +%s)" -lt "$deadline" ]; do
    if curl -sf -o /dev/null "http://127.0.0.1:$port/"; then
      echo "  $name ready on $port"
      return 0
    fi
    if ! kill -0 "$(cat "$LOGS/$name.pid")" 2>/dev/null; then
      echo "  $name process exited before becoming ready" >&2
      FAILED=1
      return 1
    fi
    sleep 1
  done
  echo "  $name did not become ready within ${READY_TIMEOUT}s" >&2
  FAILED=1
  return 1
}

# --- JavaScript frameworks: Vite dev servers ------------------------------
if want react; then
  start react npm --prefix "$ROOT/implementations/react" run dev -- \
    --port 4001 --host 127.0.0.1 --strictPort
fi
if want vue; then
  start vue npm --prefix "$ROOT/implementations/vue" run dev -- \
    --port 4002 --host 127.0.0.1 --strictPort
fi
if want angular; then
  start angular npm --prefix "$ROOT/implementations/angular" start -- \
    --port 4003 --host 127.0.0.1
fi

# --- Blade: PHP built-in server -------------------------------------------
if want blade; then
  start blade php -S 127.0.0.1:4007 -t "$ROOT/implementations/blade"
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
  start leptos python3 -m http.server 4004 --bind 127.0.0.1 \
    --directory "$ROOT/implementations/leptos/dist"
fi
if want yew; then
  mirror_shared yew
  start yew python3 -m http.server 4005 --bind 127.0.0.1 \
    --directory "$ROOT/implementations/yew/dist"
fi
if want dioxus; then
  mirror_shared dioxus
  start dioxus python3 -m http.server 4006 --bind 127.0.0.1 \
    --directory "$ROOT/implementations/dioxus/dist"
fi

wait_port react 4001
wait_port vue 4002
wait_port angular 4003
wait_port leptos 4004
wait_port yew 4005
wait_port dioxus 4006
wait_port blade 4007

if [ "$FAILED" -ne 0 ]; then
  echo "start-servers.sh: one or more servers failed to start" >&2
  exit 1
fi
echo "all requested servers are up"
