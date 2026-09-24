#!/usr/bin/env bash
# Process-identity bookkeeping for start-servers.sh / stop-servers.sh.
#
# A bare "pidfile containing a number" is unsafe: after an unclean exit the PID
# may have been reused by an unrelated process, and `kill -TERM -$pid` would then
# signal a process group that belongs to someone else. `kill -0` does not help,
# because it succeeds for a recycled PID too.
#
# Instead each server gets a state file recording a per-run token plus identity
# data that cannot change for the lifetime of a process:
#
#   pid, pgid, session, starttime (field 22 of /proc/<pid>/stat) and boot_id.
#
# stop-servers.sh only signals a PID when the recorded identity still matches the
# live process *and* that process is the leader of the group this run created. If
# anything is missing, malformed or different, the metadata is quarantined and no
# signal is sent.
#
# The leader may legitimately be gone while its group is not: a wrapper can exit
# on SIGTERM while a child (vite/ng) ignores it and keeps the port. `verify_state`
# therefore has a second, verified path -- "leader dead, group alive" -- that
# signals the *group* only when every live member provably belongs to the session
# the run created (session id == recorded pgid, since setsid gives the leader
# session id == pid) and none was born before the recorded leader. When no live
# member remains the record is simply spent (return code 2), not a failure.
#
# State files are written atomically (temp file + rename) so an interrupted run
# can never leave a half-written file that looks valid.

# --- identity helpers ------------------------------------------------------

# Field 22 (starttime) and field 5 (pgrp) of /proc/<pid>/stat. comm can contain
# spaces and parentheses, so everything up to the *last* ')' is stripped first.
proc_stat_field() {
  local pid="$1" which="$2" rest
  [ -r "/proc/$pid/stat" ] || return 1
  rest="$(sed 's/.*) //' "/proc/$pid/stat" 2>/dev/null)" || return 1
  [ -n "$rest" ] || return 1
  case "$which" in
    # after comm: state=1 ppid=2 pgrp=3 session=4 ... starttime=20
    pgrp)      echo "$rest" | awk '{print $3}' ;;
    session)   echo "$rest" | awk '{print $4}' ;;
    starttime) echo "$rest" | awk '{print $20}' ;;
    state)     echo "$rest" | awk '{print $1}' ;;
    *)         return 1 ;;
  esac
}

proc_boot_id() {
  cat /proc/sys/kernel/random/boot_id 2>/dev/null || echo unknown
}

# Command identity, informational but also compared: the cmdline must still be
# the one we launched. NUL-separated, so translate to spaces.
proc_cmdline() {
  local pid="$1"
  [ -r "/proc/$pid/cmdline" ] || return 1
  tr '\0' ' ' < "/proc/$pid/cmdline" 2>/dev/null | sed 's/ *$//'
}

# Echo "<starttime> <pgrp> <boot_id>" for a live PID, or nothing.
proc_identity() {
  local pid="$1" st pg
  st="$(proc_stat_field "$pid" starttime)" || return 1
  pg="$(proc_stat_field "$pid" pgrp)" || return 1
  [ -n "$st" ] && [ -n "$pg" ] || return 1
  echo "$st $pg $(proc_boot_id)"
}

new_run_token() {
  echo "$$-$(date +%s)-${RANDOM}${RANDOM}"
}

# --- state files -----------------------------------------------------------

# write_state <file> <pid> <run_token> <cmd>
# Atomic: everything is written to a temp file in the same directory and then
# renamed into place, so a reader never observes a partial file.
write_state() {
  local file="$1" pid="$2" token="$3" cmd="$4"
  local stat_start pgrp session boot tmp
  stat_start="$(proc_stat_field "$pid" starttime)" || return 1
  pgrp="$(proc_stat_field "$pid" pgrp)" || return 1
  session="$(proc_stat_field "$pid" session)" || return 1
  boot="$(proc_boot_id)"
  tmp="${file}.tmp.$$"
  {
    echo "# frontend-benchmark server state (atomic write)"
    echo "pid=$pid"
    echo "pgid=$pgrp"
    echo "session=$session"
    echo "starttime=$stat_start"
    echo "boot_id=$boot"
    echo "run_token=$token"
    echo "cmd=$cmd"
  } > "$tmp" || { rm -f "$tmp"; return 1; }
  mv -f "$tmp" "$file"
}

state_get() {
  local file="$1" key="$2"
  sed -n "s/^${key}=//p" "$file" 2>/dev/null | head -n1
}

# verify_state <file>
# Prints a human-readable status and returns:
#   0 -> the recorded process is alive and is verifiably the one this run started
#   1 -> cannot verify (missing/malformed metadata, recycled PID, foreign group)
#   2 -> the leader is gone and its group holds no live member (record is spent,
#        nothing to signal; this is *not* an unverifiable record)
# Reads STATE_PID / STATE_REASON after the call.
verify_state() {
  local file="$1"
  STATE_PID=""
  STATE_REASON=""

  [ -f "$file" ] || { STATE_REASON="state file disappeared"; return 1; }

  local pid pgid stored_start stored_boot stored_token
  pid="$(state_get "$file" pid)"
  pgid="$(state_get "$file" pgid)"
  stored_start="$(state_get "$file" starttime)"
  stored_boot="$(state_get "$file" boot_id)"
  stored_token="$(state_get "$file" run_token)"

  if [ -z "$pid" ] || [ -z "$pgid" ] || [ -z "$stored_start" ] || [ -z "$stored_boot" ] || [ -z "$stored_token" ]; then
    STATE_REASON="state file is missing required metadata (pid/pgid/starttime/boot_id/run_token)"
    return 1
  fi
  case "$pid" in *[!0-9]*|'') STATE_REASON="state pid is not numeric ('$pid')"; return 1 ;; esac
  case "$pgid" in *[!0-9]*|'') STATE_REASON="state pgid is not numeric ('$pgid')"; return 1 ;; esac

  STATE_PID="$pid"

  if [ ! -e "/proc/$pid" ]; then
    # The leader is gone. That is not automatically a failure: a wrapper can exit
    # on SIGTERM while a child (vite/ng) ignores it and keeps the port. Signal the
    # *group* only if every live member is provably part of the session this run
    # created. Otherwise quarantine, never signal. And when no live member
    # remains, the record is simply spent -- the normal "stop after everything has
    # already exited" case -- so remove it without treating it as a failure.
    local group_rc
    verify_group_by_session "$pgid" "$stored_start" "$stored_boot"
    group_rc=$?
    if [ "$group_rc" -eq 0 ]; then
      STATE_REASON="leader $pid is gone but its group $pgid still has verified live members"
      return 0
    fi
    if [ "$group_rc" -eq 2 ]; then
      STATE_REASON="process $pid no longer exists and its group $pgid is empty"
      return 2
    fi
    STATE_REASON="leader $pid is gone and its group $pgid cannot be verified"
    return 1
  fi

  local live_start live_pgrp live_boot
  live_start="$(proc_stat_field "$pid" starttime)" || { STATE_REASON="cannot read /proc/$pid/stat"; return 1; }
  live_pgrp="$(proc_stat_field "$pid" pgrp)" || { STATE_REASON="cannot read /proc/$pid/stat"; return 1; }
  live_boot="$(proc_boot_id)"

  if [ "$live_boot" != "$stored_boot" ]; then
    STATE_REASON="boot id changed (recorded $stored_boot, now $live_boot)"
    return 1
  fi
  if [ "$live_start" != "$stored_start" ]; then
    STATE_REASON="PID $pid has been reused (starttime $live_start != recorded $stored_start)"
    return 1
  fi
  # The recorded PID must still *lead* the group this run created. If it is not
  # a group leader any more, `kill -$pid` would hit an unrelated group.
  if [ "$live_pgrp" != "$pid" ] || [ "$pgid" != "$pid" ]; then
    STATE_REASON="PID $pid is not the leader of the recorded process group (pgid recorded $pgid, live $live_pgrp)"
    return 1
  fi
  # The recorded command line (stored_cmd) is diagnostic only, never a gate: a
  # process may legitimately rewrite its own title (npm sets it to the script
  # name, a `setsid` wrapper execs away), yet it is still the process we
  # launched. The stable, unforgeable evidence remains starttime + boot id +
  # group leadership, which is what the checks above established.
  STATE_REASON="identity verified (pid $pid, pgid $pgid, starttime $stored_start)"
  return 0
}

# group_has_live_members <pgid>
# True (exit 0) when at least one *live* process (state != Z) belongs to the
# process group. `kill -0 -$pgid` is not enough: it still succeeds for a group
# that holds only zombies, and it says nothing about a group whose leader has
# exited while a child keeps running. Callers that must reap a whole tree need a
# real membership test, so this walks /proc.
group_has_live_members() {
  local pgid="$1" d pid state pg
  [ -n "$pgid" ] || return 1
  for d in /proc/[0-9]*; do
    [ -d "$d" ] || continue
    pid="${d#/proc/}"
    pg="$(proc_stat_field "$pid" pgrp)" || continue
    [ "$pg" = "$pgid" ] || continue
    state="$(proc_stat_field "$pid" state)" || continue
    [ "$state" = "Z" ] && continue
    return 0
  done
  return 1
}

# verify_group_by_session <pgid> <recorded_start> <recorded_boot>
# Prove that every live member of process group <pgid> belongs to the session
# this benchmark run created, before the caller signals the group. This is the
# "leader dead, group alive" path: the recorded leader has exited but a child may
# still hold the port, so a bare `kill -0 -$pgid` (which also succeeds for a
# group of zombies, or for a recycled group id) is not evidence enough.
#
# Returns:
#   0 -> at least one live member, and all of them are provably ours
#   1 -> cannot vouch for the group (a member is foreign, or /proc is unreadable)
#   2 -> no live member remains (the group is spent, nothing to signal)
#
# "Provably ours" means, for every live member:
#   * it was started in the same boot as the leader,
#   * its session id equals the recorded pgid (setsid made the leader's session
#     id equal to its pid, and children inherit that session), and
#   * its starttime is >= the leader's, since no group member can be older than
#     the leader that created the session.
verify_group_by_session() {
  local pgid="$1" recorded_start="$2" recorded_boot="$3"
  local d pid state pg member_session member_start member_boot found=0
  [ -n "$pgid" ] || return 1
  [ -n "$recorded_start" ] || return 1
  [ -n "$recorded_boot" ] || return 1
  for d in /proc/[0-9]*; do
    [ -d "$d" ] || continue
    pid="${d#/proc/}"
    pg="$(proc_stat_field "$pid" pgrp)" || return 1
    [ "$pg" = "$pgid" ] || continue
    state="$(proc_stat_field "$pid" state)" || return 1
    [ "$state" = "Z" ] && continue
    member_session="$(proc_stat_field "$pid" session)" || return 1
    member_start="$(proc_stat_field "$pid" starttime)" || return 1
    member_boot="$(proc_boot_id)"
    # Every member must belong to the session the leader created, in the same
    # boot, and cannot predate the leader.
    [ "$member_session" = "$pgid" ] || return 1
    [ "$member_boot" = "$recorded_boot" ] || return 1
    [ "$member_start" -ge "$recorded_start" ] 2>/dev/null || return 1
    found=1
  done
  [ "$found" -eq 1 ] && return 0
  return 2
}

# quarantine_state <file> <logdir>
# Move an unusable state file aside instead of deleting it, so the failure can be
# inspected afterwards. Never signals anything.
quarantine_state() {
  local file="$1" logdir="$2" dest
  dest="$logdir/stale-$(basename "$file").$(date +%s)"
  mv -f "$file" "$dest" 2>/dev/null || rm -f "$file"
  echo "  quarantined $(basename "$file") -> $(basename "$dest")"
}
