#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# Esmeralda Market — Print Server setup / config tool
#
# Idempotent. Safe to run on a fresh PC OR on an already-installed one.
# All actions are menu-driven — no required CLI flags.
#
# Usage:
#   1. apt install -y git
#   2. git clone https://github.com/<user>/esmkt.git ~/esmkt   (run as your user)
#   3. cd ~/esmkt/print-server
#   4. sudo ./setup.sh                                          (or just ./setup.sh — it'll re-exec under sudo)
#
# Re-run anytime to: edit .env values, change the printer, reinstall the
# systemd unit, or toggle the status-monitor autostart.
# ─────────────────────────────────────────────────────────────────────────────

set -e

# ─── colors (only when stdout is a TTY) ─────────────────────────────────────
if [ -t 1 ]; then
  C_RESET=$'\e[0m'; C_BOLD=$'\e[1m'; C_DIM=$'\e[2m'
  C_RED=$'\e[31m'; C_GRN=$'\e[32m'; C_YLW=$'\e[33m'; C_CYN=$'\e[36m'
else
  C_RESET=''; C_BOLD=''; C_DIM=''; C_RED=''; C_GRN=''; C_YLW=''; C_CYN=''
fi

say()  { printf '%s\n' "$*"; }
info() { printf '%s%s%s\n' "$C_CYN" "$*" "$C_RESET"; }
ok()   { printf '%s✓%s %s\n' "$C_GRN" "$C_RESET" "$*"; }
warn() { printf '%s!%s %s\n' "$C_YLW" "$C_RESET" "$*"; }
err()  { printf '%s✗%s %s\n' "$C_RED" "$C_RESET" "$*" >&2; }
die()  { err "$@"; exit 1; }

prompt() {
  # prompt VAR_NAME "Question text" "default-value"
  local __var="$1" __q="$2" __def="$3" __ans
  if [ -n "$__def" ]; then
    read -r -p "$__q [$__def]: " __ans || true
    __ans="${__ans:-$__def}"
  else
    read -r -p "$__q: " __ans || true
  fi
  printf -v "$__var" '%s' "$__ans"
}

prompt_secret() {
  # like prompt but hides input. Empty input keeps default if provided.
  local __var="$1" __q="$2" __def="$3" __ans
  read -r -s -p "$__q${__def:+ (Enter = keep current)}: " __ans
  printf '\n'
  if [ -z "$__ans" ] && [ -n "$__def" ]; then __ans="$__def"; fi
  printf -v "$__var" '%s' "$__ans"
}

confirm() {
  # confirm "Question?" → returns 0 for yes, 1 for no. Default no.
  local __ans
  read -r -p "$1 [y/N] " __ans || true
  case "$__ans" in [yY]|[yY][eE][sS]) return 0 ;; *) return 1 ;; esac
}

# ─── self-elevate via sudo ──────────────────────────────────────────────────
if [ "$EUID" -ne 0 ]; then
  info "This script needs root for system changes. Re-running with sudo…"
  exec sudo -E bash "$0" "$@"
fi

# Determine which user we're operating on behalf of (the user who invoked sudo).
TARGET_USER="${SUDO_USER:-}"
if [ -z "$TARGET_USER" ] || [ "$TARGET_USER" = "root" ]; then
  warn "Could not detect the user who invoked sudo."
  prompt TARGET_USER "Service user (the account the print server runs as)" "esmkt"
fi
TARGET_HOME="$(getent passwd "$TARGET_USER" | cut -d: -f6)"
[ -n "$TARGET_HOME" ] || die "User '$TARGET_USER' not found and has no home directory."

# Repo / install paths (script lives at <repo>/print-server/setup.sh)
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
PRINT_SERVER_DIR="$SCRIPT_DIR"
ENV_FILE="$PRINT_SERVER_DIR/.env"
ENV_EXAMPLE="$PRINT_SERVER_DIR/.env.example"
SYSTEMD_TEMPLATE="$PRINT_SERVER_DIR/esmkt-print.service"
SYSTEMD_UNIT="/etc/systemd/system/esmkt-print.service"
MONITOR_SH="$PRINT_SERVER_DIR/monitor.sh"
AUTOSTART_DIR="$TARGET_HOME/.config/autostart"
AUTOSTART_FILE="$AUTOSTART_DIR/esmkt-monitor.desktop"

# ─── helpers ────────────────────────────────────────────────────────────────
read_env_var() {
  # Pull a single VAR=value from .env (returns empty if not present)
  local var="$1"
  [ -f "$ENV_FILE" ] || { echo ""; return; }
  awk -F= -v k="$var" '
    /^[[:space:]]*#/ { next }
    $1 == k {
      sub(/^[^=]*=/, "")
      gsub(/^[ \t"\x27]+|[ \t"\x27]+$/, "")
      print
      exit
    }' "$ENV_FILE"
}

write_env_var() {
  # write_env_var KEY VALUE — upserts into .env, preserving the rest of the file
  local key="$1" val="$2" tmp
  tmp="$(mktemp)"
  if [ -f "$ENV_FILE" ]; then
    # Replace existing line if present, otherwise leave file as-is and append after
    awk -v k="$key" -v v="$val" '
      BEGIN { found = 0 }
      /^[[:space:]]*#/ { print; next }
      /^[[:space:]]*$/ { print; next }
      {
        split($0, parts, "=")
        if (parts[1] == k) { print k "=" v; found = 1 }
        else                { print }
      }
      END { if (!found) print k "=" v }
    ' "$ENV_FILE" > "$tmp"
  else
    printf '%s=%s\n' "$key" "$val" > "$tmp"
  fi
  install -m 600 -o "$TARGET_USER" -g "$TARGET_USER" "$tmp" "$ENV_FILE"
  rm -f "$tmp"
}

service_status() {
  systemctl is-active esmkt-print 2>/dev/null || echo "inactive"
}

# ─── status banner shown on top of every menu ───────────────────────────────
show_banner() {
  clear
  printf '%s╔══════════════════════════════════════╗%s\n' "$C_BOLD" "$C_RESET"
  printf '%s║   ESMERALDA MARKET PRINT SERVER      ║%s\n' "$C_BOLD" "$C_RESET"
  printf '%s║   setup / config tool                ║%s\n' "$C_BOLD" "$C_RESET"
  printf '%s╚══════════════════════════════════════╝%s\n\n' "$C_BOLD" "$C_RESET"

  local svc env_present unit_present
  svc="$(service_status)"
  env_present="no"; [ -f "$ENV_FILE" ] && env_present="yes"
  unit_present="no"; [ -f "$SYSTEMD_UNIT" ] && unit_present="yes"

  printf '  %sService user:%s  %s\n'  "$C_DIM" "$C_RESET" "$TARGET_USER"
  printf '  %sRepo:%s          %s\n'  "$C_DIM" "$C_RESET" "$REPO_DIR"
  printf '  %s.env:%s          %s\n'  "$C_DIM" "$C_RESET" "$env_present"
  printf '  %sSystemd unit:%s  %s\n'  "$C_DIM" "$C_RESET" "$unit_present"
  case "$svc" in
    active)       printf '  %sService:%s       %sactive (running)%s\n' "$C_DIM" "$C_RESET" "$C_GRN" "$C_RESET" ;;
    inactive)     printf '  %sService:%s       %sinactive%s\n'           "$C_DIM" "$C_RESET" "$C_YLW" "$C_RESET" ;;
    failed)       printf '  %sService:%s       %sfailed%s\n'             "$C_DIM" "$C_RESET" "$C_RED" "$C_RESET" ;;
    activating)   printf '  %sService:%s       %sactivating…%s\n'        "$C_DIM" "$C_RESET" "$C_YLW" "$C_RESET" ;;
    *)            printf '  %sService:%s       %s\n'                     "$C_DIM" "$C_RESET" "$svc" ;;
  esac
  echo
}

# ─── menu actions ───────────────────────────────────────────────────────────

action_install_packages() {
  info "Installing apt packages (nodejs, npm, git, cups, alsa-utils)…"
  apt-get update -qq
  apt-get install -y -qq nodejs npm git cups alsa-utils >/dev/null
  ok "Packages installed."
  local nv
  nv="$(node --version 2>/dev/null || echo 'missing')"
  if [[ "$nv" == "missing" ]] || [[ "${nv#v}" =~ ^1[0-7]\. ]]; then
    warn "Node version is $nv — print-server requires >= 18.0.0."
    if confirm "Install Node 20 LTS via NodeSource?"; then
      curl -fsSL https://deb.nodesource.com/setup_20.x | bash - >/dev/null
      apt-get install -y -qq nodejs >/dev/null
      ok "Node $(node --version) installed."
    fi
  else
    ok "Node $nv is fine."
  fi
}

action_user_groups() {
  info "Ensuring '$TARGET_USER' is in the lp + audio groups…"
  if ! id "$TARGET_USER" >/dev/null 2>&1; then
    err "User '$TARGET_USER' does not exist."
    if confirm "Create system user '$TARGET_USER' now?"; then
      adduser --system --group --shell /bin/bash --home "/home/$TARGET_USER" "$TARGET_USER"
      ok "Created '$TARGET_USER'."
    else
      return 1
    fi
  fi
  usermod -aG lp    "$TARGET_USER"
  usermod -aG audio "$TARGET_USER"
  ok "Added to lp + audio groups."
  warn "Group changes take effect on next login. (Reboot or log out/in.)"
}

action_printer_setup() {
  info "Looking for connected printers…"
  systemctl enable --now cups >/dev/null 2>&1 || true
  local out
  out="$(lpinfo -v 2>/dev/null || true)"
  echo "$out"
  echo
  if [ -z "$out" ]; then
    warn "No devices detected. Make sure the printer is plugged in and powered on, then re-run."
    return 1
  fi

  # Extract candidate device URIs
  mapfile -t URIS < <(echo "$out" | awk '/^direct usb:|^direct ipp/ { print $2 }')
  if [ "${#URIS[@]}" -eq 0 ]; then
    warn "No USB / IPP devices found in lpinfo output. You can still type a URI manually below."
  else
    info "Detected devices:"
    local i=1
    for u in "${URIS[@]}"; do printf '  %d) %s\n' "$i" "$u"; ((i++)); done
    echo
  fi

  local URI
  prompt URI "Enter device URI (or paste one from the list above)" "${URIS[0]:-}"
  [ -n "$URI" ] || { err "No URI given."; return 1; }

  local QUEUE_NAME
  prompt QUEUE_NAME "CUPS queue name" "snackbar"

  local DRIVER_MODE
  echo "  m) raw       — plain text passthrough (recommended for thermal receipt printers)"
  echo "  e) everywhere — IPP-Everywhere (network IPP printers only)"
  prompt DRIVER_MODE "Driver mode" "m"
  local DRIVER_FLAG="-m raw"
  case "$DRIVER_MODE" in e|E|everywhere) DRIVER_FLAG="-m everywhere" ;; esac

  info "Removing any existing '$QUEUE_NAME' queue…"
  lpadmin -x "$QUEUE_NAME" 2>/dev/null || true
  info "Adding queue '$QUEUE_NAME' → $URI ($DRIVER_FLAG)…"
  lpadmin -p "$QUEUE_NAME" -E -v "$URI" $DRIVER_FLAG
  lpadmin -d "$QUEUE_NAME"
  ok "Default printer is now '$QUEUE_NAME'."

  if confirm "Send a test page now?"; then
    echo "TEST PRINT — $(date)" | lp -d "$QUEUE_NAME" >/dev/null && ok "Test job submitted." || warn "Test print failed; check the printer."
  fi

  # Stash the queue name into .env so the print server targets it explicitly
  if confirm "Save '$QUEUE_NAME' as PRINTER_NAME in .env?"; then
    write_env_var "PRINTER_NAME" "$QUEUE_NAME"
    ok "PRINTER_NAME set."
  fi
}

action_update_config() {
  if [ ! -f "$ENV_FILE" ] && [ -f "$ENV_EXAMPLE" ]; then
    cp "$ENV_EXAMPLE" "$ENV_FILE"
    chown "$TARGET_USER":"$TARGET_USER" "$ENV_FILE"
    chmod 600 "$ENV_FILE"
    info "Created .env from .env.example."
  fi

  local cur_url cur_secret cur_printer cur_branch cur_chime cur_err_chime
  cur_url="$(read_env_var API_BASE_URL)"
  cur_secret="$(read_env_var PRINT_SERVER_SECRET)"
  cur_printer="$(read_env_var PRINTER_NAME)"
  cur_branch="$(read_env_var GIT_BRANCH)"
  cur_chime="$(read_env_var CHIME_CMD)"
  cur_err_chime="$(read_env_var PRINTER_ERROR_CHIME_CMD)"

  # Defaults reference the bundled WAV files in print-server/sounds/.
  # These are committed to the repo so they're present on every install.
  local DEFAULT_CHIME="aplay -q \"$PRINT_SERVER_DIR/sounds/order-chime.wav\""
  local DEFAULT_ERR_CHIME="aplay -q \"$PRINT_SERVER_DIR/sounds/error-chime.wav\""

  # If .env still holds an obsolete or malformed value from earlier runs,
  # discard it so the new bundled-WAV default kicks in. Cases caught:
  #  - obsolete /usr/share/sounds/* paths (don't exist on Lubuntu / minimal)
  #  - a bare audio file path with no player command (the shell would try
  #    to execute the .wav directly and fail with "Permission denied")
  #
  # The bare-path check requires no whitespace, so legitimate custom commands
  # like "ffplay -nodisp /custom/sound.mp3" are kept untouched.
  case "$cur_chime"     in *'/usr/share/sounds/alsa/'*|*'/usr/share/sounds/freedesktop/'*) cur_chime=""     ;; esac
  case "$cur_err_chime" in *'/usr/share/sounds/alsa/'*|*'/usr/share/sounds/freedesktop/'*) cur_err_chime="" ;; esac
  if [[ "$cur_chime"     =~ ^[^[:space:]]+\.(wav|oga|ogg|mp3|flac)$ ]]; then cur_chime="";     fi
  if [[ "$cur_err_chime" =~ ^[^[:space:]]+\.(wav|oga|ogg|mp3|flac)$ ]]; then cur_err_chime=""; fi

  info "Edit .env values. Press Enter to keep the current value."
  echo

  local API_URL SECRET PRINTER BRANCH CHIME ERR_CHIME
  prompt API_URL "API_BASE_URL" "${cur_url:-https://esmeraldamarket.com}"
  while ! [[ "$API_URL" =~ ^https?://[^[:space:]]+$ ]]; do
    err "Must start with http:// or https://"
    prompt API_URL "API_BASE_URL" "${cur_url:-https://esmeraldamarket.com}"
  done

  prompt_secret SECRET "PRINT_SERVER_SECRET" "$cur_secret"
  while [ ${#SECRET} -lt 16 ]; do
    err "Secret must be at least 16 characters."
    prompt_secret SECRET "PRINT_SERVER_SECRET" "$cur_secret"
  done

  prompt PRINTER   "PRINTER_NAME (blank = system default)"        "$cur_printer"
  prompt BRANCH    "GIT_BRANCH"                                   "${cur_branch:-main}"
  prompt CHIME     "CHIME_CMD (blank to disable order chime)"     "${cur_chime:-$DEFAULT_CHIME}"
  prompt ERR_CHIME "PRINTER_ERROR_CHIME_CMD (blank to disable)"   "${cur_err_chime:-$DEFAULT_ERR_CHIME}"

  write_env_var API_BASE_URL            "$API_URL"
  write_env_var PRINT_SERVER_SECRET     "$SECRET"
  write_env_var PRINTER_NAME            "$PRINTER"
  write_env_var GIT_BRANCH              "$BRANCH"
  write_env_var CHIME_CMD               "$CHIME"
  write_env_var PRINTER_ERROR_CHIME_CMD "$ERR_CHIME"
  ok "Saved $ENV_FILE"

  if [ -f "$SYSTEMD_UNIT" ] && [ "$(service_status)" = "active" ]; then
    if confirm "Restart the print server now to apply changes?"; then
      systemctl restart esmkt-print && ok "Restarted."
    fi
  fi
}

action_install_service() {
  [ -f "$SYSTEMD_TEMPLATE" ] || die "Template not found: $SYSTEMD_TEMPLATE"
  info "Installing systemd unit at $SYSTEMD_UNIT…"

  # Resolve the target user's UID so we can hardcode it into the unit's
  # Environment= lines. systemd's %U specifier doesn't reliably expand to
  # the User= UID in Environment= directives — it sometimes resolves to 0
  # (root) because of the order in which systemd parses unit fields. Baking
  # the actual UID at install time sidesteps this entirely.
  local target_uid
  target_uid="$(id -u "$TARGET_USER")"
  [ -n "$target_uid" ] || die "Could not resolve UID for user '$TARGET_USER'."

  # Substitute the User / Group / paths / UID so the unit matches the chosen
  # user and the actual repo location, regardless of where the repo was cloned.
  sed -E \
    -e "s|^User=.*|User=$TARGET_USER|" \
    -e "s|^Group=.*|Group=$TARGET_USER|" \
    -e "s|^WorkingDirectory=.*|WorkingDirectory=$PRINT_SERVER_DIR|" \
    -e "s|^ExecStart=.*|ExecStart=/usr/bin/node $PRINT_SERVER_DIR/server.js|" \
    -e "s|^ReadWritePaths=.*|ReadWritePaths=$REPO_DIR /tmp|" \
    -e "s|/run/user/%U|/run/user/$target_uid|g" \
    "$SYSTEMD_TEMPLATE" > "$SYSTEMD_UNIT"
  chmod 644 "$SYSTEMD_UNIT"

  systemctl daemon-reload
  systemctl enable esmkt-print >/dev/null
  ok "Systemd unit installed and enabled."

  if confirm "Start (or restart) the service now?"; then
    systemctl restart esmkt-print
    sleep 1
    if [ "$(service_status)" = "active" ]; then
      ok "Service is active."
    else
      warn "Service is not active. Latest logs:"
      journalctl -u esmkt-print -n 20 --no-pager
    fi
  fi
}

action_show_status() {
  info "systemctl status esmkt-print:"
  systemctl status esmkt-print --no-pager 2>/dev/null | head -30 || warn "Service not installed yet."
  echo
  info "Last 20 log lines:"
  journalctl -u esmkt-print -n 20 --no-pager 2>/dev/null || true
}

action_tail_logs() {
  info "Tailing logs (Ctrl-C to return to menu)…"
  trap 'echo' INT
  journalctl -u esmkt-print -f --no-pager || true
  trap - INT
}

action_restart() {
  systemctl restart esmkt-print
  sleep 1
  if [ "$(service_status)" = "active" ]; then ok "Restarted (active)."
  else warn "Service did not become active. Check the logs option."
  fi
}

action_toggle_autostart() {
  if [ -f "$AUTOSTART_FILE" ]; then
    info "Autostart entry exists at $AUTOSTART_FILE"
    if confirm "Remove it?"; then
      rm -f "$AUTOSTART_FILE"
      ok "Autostart entry removed."
    fi
    return
  fi

  if [ ! -f "$MONITOR_SH" ]; then
    err "monitor.sh is missing at $MONITOR_SH — re-pull the repo."
    return 1
  fi
  chmod +x "$MONITOR_SH" || true

  install -d -m 755 -o "$TARGET_USER" -g "$TARGET_USER" "$AUTOSTART_DIR"

  # Pick a terminal emulator that's installed, in order of preference.
  local TERM_CMD=""
  for cand in "qterminal -e" "xfce4-terminal --command" "lxterminal -e" "gnome-terminal --" "xterm -e"; do
    local bin="${cand%% *}"
    if command -v "$bin" >/dev/null 2>&1; then TERM_CMD="$cand"; break; fi
  done
  [ -n "$TERM_CMD" ] || { err "No supported terminal emulator found."; return 1; }

  cat > "$AUTOSTART_FILE" <<EOF
[Desktop Entry]
Type=Application
Name=Esmeralda Print Monitor
Comment=Live status terminal for the print server
Exec=$TERM_CMD bash -c '"$MONITOR_SH"; exec bash'
Terminal=false
X-GNOME-Autostart-enabled=true
NoDisplay=false
EOF
  chown "$TARGET_USER":"$TARGET_USER" "$AUTOSTART_FILE"
  chmod 644 "$AUTOSTART_FILE"
  ok "Autostart entry installed at $AUTOSTART_FILE"
  ok "Will open at next login as $TARGET_USER."
}

action_initial_install() {
  info "Running initial install…"
  action_install_packages
  action_user_groups   || warn "Continuing without user-group changes."
  action_printer_setup || warn "Skipped / failed printer setup — you can re-run option 3 later."
  action_update_config
  action_install_service
  if confirm "Install the live status monitor at login (recommended)?"; then
    action_toggle_autostart
  fi
  ok "Initial install complete."
}

# ─── menu ───────────────────────────────────────────────────────────────────
main_menu() {
  while true; do
    show_banner
    echo "  ${C_BOLD}1)${C_RESET} Initial install (full walkthrough)"
    echo "  ${C_BOLD}2)${C_RESET} Update config (edit .env)"
    echo "  ${C_BOLD}3)${C_RESET} Printer setup / change printer"
    echo "  ${C_BOLD}4)${C_RESET} Reinstall systemd service"
    echo "  ${C_BOLD}5)${C_RESET} Show service status"
    echo "  ${C_BOLD}6)${C_RESET} Tail live logs"
    echo "  ${C_BOLD}7)${C_RESET} Restart service"
    echo "  ${C_BOLD}8)${C_RESET} Install / remove status-monitor autostart"
    echo "  ${C_BOLD}q)${C_RESET} Exit"
    echo
    local choice
    read -r -p "Choose: " choice || exit 0
    echo
    case "$choice" in
      1) action_initial_install ;;
      2) action_update_config ;;
      3) action_printer_setup ;;
      4) action_install_service ;;
      5) action_show_status ;;
      6) action_tail_logs ;;
      7) action_restart ;;
      8) action_toggle_autostart ;;
      q|Q) ok "Bye."; exit 0 ;;
      *) warn "Unknown choice: $choice" ;;
    esac
    echo
    read -r -p "Press Enter to return to menu… " _ || true
  done
}

main_menu
