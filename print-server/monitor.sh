#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# Esmeralda Market — Print Server live status monitor
#
# Two-pane terminal: a 6-line header at the top (service state, heartbeat
# age, printer ready/unready, pending order count) that auto-refreshes every
# 5 seconds, plus a journalctl tail below it with sed colorization.
#
# Header data sources:
#   - `systemctl is-active esmkt-print`  → service state
#   - `GET <API_BASE_URL>/api/print-server/status` → heartbeat + printer + pending
#     (API_BASE_URL is read from print-server/.env in the same directory)
#
# Run manually:    ./monitor.sh
# Auto-launch:     setup.sh menu option 8 installs a per-user .desktop entry.
# Exit:            Ctrl-C
# ─────────────────────────────────────────────────────────────────────────────

set -u

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ENV_FILE="$SCRIPT_DIR/.env"

# Pull API_BASE_URL from .env (no other env vars needed)
API_BASE_URL=""
if [ -f "$ENV_FILE" ]; then
  API_BASE_URL="$(awk -F= '/^[[:space:]]*API_BASE_URL=/{
    sub(/^[^=]*=/, ""); gsub(/^[ \t"\x27]+|[ \t"\x27]+$/, ""); print; exit
  }' "$ENV_FILE")"
fi

# Colors
if [ -t 1 ]; then
  C_RESET=$'\e[0m'; C_BOLD=$'\e[1m'; C_DIM=$'\e[2m'
  C_RED=$'\e[31m'; C_GRN=$'\e[32m'; C_YLW=$'\e[33m'; C_CYN=$'\e[36m'; C_MAG=$'\e[35m'
else
  C_RESET=''; C_BOLD=''; C_DIM=''; C_RED=''; C_GRN=''; C_YLW=''; C_CYN=''; C_MAG=''
fi

ROWS=$(tput lines 2>/dev/null || echo 24)
COLS=$(tput cols  2>/dev/null || echo 80)
HEADER_HEIGHT=7

# ─── header rendering ───────────────────────────────────────────────────────

render_header() {
  # Move to top-left, clear the lines we own
  tput cup 0 0
  for i in $(seq 0 $((HEADER_HEIGHT - 1))); do
    tput cup "$i" 0; tput el
  done
  tput cup 0 0

  printf '%s┌─ ESMERALDA PRINT SERVER · monitor ' "$C_BOLD"
  local pad=$((COLS - 38)); [ "$pad" -lt 0 ] && pad=0
  printf '%*s┐%s\n' "$pad" '' "$C_RESET" | tr ' ' '─'

  # Line 1: service state
  local svc; svc="$(systemctl is-active esmkt-print 2>/dev/null || echo unknown)"
  local svc_color="$C_RESET"
  case "$svc" in
    active)   svc_color="$C_GRN" ;;
    failed)   svc_color="$C_RED" ;;
    inactive|activating) svc_color="$C_YLW" ;;
  esac
  printf '%s│%s service: %s%-12s%s' "$C_BOLD" "$C_RESET" "$svc_color" "$svc" "$C_RESET"

  # Heartbeat + printer + pending all come from one status call (cheap).
  local status_json="" online="?" age="?" printer="?" pending="?" version=""
  if [ -n "$API_BASE_URL" ]; then
    status_json="$(curl -fsS --max-time 4 "$API_BASE_URL/api/print-server/status" 2>/dev/null || true)"
  fi
  if [ -n "$status_json" ]; then
    online="$(jq_field "$status_json" online)"
    age="$(jq_field "$status_json" secondsSinceLastSeen)"
    pending="$(jq_field "$status_json" pendingOrders)"
    version="$(jq_field "$status_json" version)"
    printer="$(jq_path  "$status_json" '"printer"."human_status"')"
    [ -z "$printer" ] && printer="$(jq_path "$status_json" '"printer"."ready"')"
  fi

  # Continue line 1 with version
  printf '   version: %s%s%s\n' "$C_DIM" "${version:-—}" "$C_RESET"

  # Line 2: heartbeat
  local hb_color="$C_DIM" hb_text="—"
  if [ "$online" = "true" ];  then hb_color="$C_GRN"; hb_text="online · $(format_age "$age")"
  elif [ "$online" = "false" ]; then hb_color="$C_RED"; hb_text="offline · last seen $(format_age "$age")"; fi
  printf '%s│%s heartbeat: %s%-40s%s\n' "$C_BOLD" "$C_RESET" "$hb_color" "$hb_text" "$C_RESET"

  # Line 3: printer
  local pr_color="$C_DIM"
  case "$printer" in
    Ready|true)         pr_color="$C_GRN"; printer="Ready" ;;
    "")                 printer="—" ;;
    *)                  pr_color="$C_RED" ;;
  esac
  printf '%s│%s printer:   %s%-40s%s\n' "$C_BOLD" "$C_RESET" "$pr_color" "$printer" "$C_RESET"

  # Line 4: pending
  local pend_color="$C_DIM" pend_label="${pending:-—}"
  if [[ "$pending" =~ ^[0-9]+$ ]]; then
    if [ "$pending" -gt 0 ]; then pend_color="$C_YLW"; fi
    pend_label="$pending order$( [ "$pending" = "1" ] || echo s) waiting"
  fi
  printf '%s│%s pending:   %s%-40s%s\n' "$C_BOLD" "$C_RESET" "$pend_color" "$pend_label" "$C_RESET"

  # Line 5: bottom border + last refresh
  printf '%s└─ refreshed %s ' "$C_BOLD" "$(date '+%H:%M:%S')"
  pad=$((COLS - 25)); [ "$pad" -lt 0 ] && pad=0
  printf '%*s┘%s\n' "$pad" '' "$C_RESET" | tr ' ' '─'
  echo  # blank line under the header
}

# Tiny JSON field extractor (no jq dependency). Works for top-level
# string/number/bool fields. Returns empty on miss.
jq_field() {
  local json="$1" key="$2"
  printf '%s' "$json" | grep -oE "\"$key\"[[:space:]]*:[[:space:]]*(\"[^\"]*\"|[0-9]+|true|false|null)" \
    | head -1 \
    | sed -E "s/^\"$key\"[[:space:]]*:[[:space:]]*//; s/^\"//; s/\"$//"
}

# Two-level path (e.g. `"printer"."human_status"`) — naive, good enough for
# our shape because there are no nested arrays at the top level.
jq_path() {
  local json="$1" path="$2"
  local outer inner
  outer="$(printf '%s' "$path" | awk -F'"\\.\"' '{print $1}' | tr -d '"')"
  inner="$(printf '%s' "$path" | awk -F'"\\.\"' '{print $2}' | tr -d '"')"
  local sub
  sub="$(printf '%s' "$json" | grep -oE "\"$outer\"[[:space:]]*:[[:space:]]*\\{[^{}]*\\}" | head -1 || true)"
  [ -z "$sub" ] && return 0
  jq_field "$sub" "$inner"
}

format_age() {
  local s="$1"
  case "$s" in ''|null|'?') printf '?'; return ;; esac
  if [[ "$s" =~ ^[0-9]+$ ]]; then
    if [ "$s" -lt 60 ];     then printf '%ss ago' "$s"
    elif [ "$s" -lt 3600 ]; then printf '%dm ago' "$((s / 60))"
    elif [ "$s" -lt 86400 ];then printf '%dh ago' "$((s / 3600))"
    else                         printf '%dd ago' "$((s / 86400))"
    fi
  else
    printf '%s' "$s"
  fi
}

# ─── set up scroll region: header on top, journal in the rest ───────────────
cleanup() {
  # Stop the header refresher
  if [ -n "${REFRESH_PID:-}" ]; then kill "$REFRESH_PID" 2>/dev/null || true; fi
  # Restore default scroll region + clear
  tput csr 0 $((ROWS - 1))
  clear
  exit 0
}
trap cleanup INT TERM EXIT

clear
# Set scroll region for journal output (header zone is locked above)
tput csr "$HEADER_HEIGHT" $((ROWS - 1))
render_header

# Header refresher (background)
(
  while true; do
    sleep 5
    tput sc           # save cursor
    render_header
    tput rc           # restore cursor (back into the scroll region)
  done
) &
REFRESH_PID=$!

# Position cursor at top of scroll region and tail the journal.
# Color rules (ANSI):
#   error / failed / fatal       → red
#   warn                         → yellow
#   printed / heartbeat recovered→ green
#   Order ESM-… / RPR-…          → bold magenta (visually pop)
#   heartbeat (info)             → dim
tput cup "$HEADER_HEIGHT" 0
journalctl -u esmkt-print -f --no-pager --output=cat 2>/dev/null \
  | sed -E '
      s/(\[error\][^\n]*|.*\bfatal\b[^\n]*|.*\bfailed\b[^\n]*)/\x1b[31m&\x1b[0m/Ig
      s/(\[warn\][^\n]*|.*\bwarning\b[^\n]*)/\x1b[33m&\x1b[0m/Ig
      s/( printed\.| heartbeat recovered[^\n]*| update applied[^\n]*)/\x1b[32m&\x1b[0m/g
      s/(Order (ESM|RPR)-[A-Z0-9]+|── Order [^─]*──)/\x1b[1;35m&\x1b[0m/g
    '
