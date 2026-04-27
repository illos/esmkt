# Esmeralda Market — Print Server

A small Node.js process that runs unattended on the snackbar PC. It does several things on a loop:

1. **Polls the website** (`/api/orders/pending`) every few seconds, prints any new orders to a thermal receipt printer, plays an order chime, and marks them done.
2. **Sends a heartbeat** (`/api/print-server/heartbeat`) every 30 seconds — and includes a snapshot of the printer's CUPS state (idle/stopped, paper-out, cover-open, queued-jobs count). If the heartbeat stops or the printer reports a problem, online ordering can be auto-disabled and an alert email is sent to the owner.
3. **Probes the printer** every 5 minutes with a tiny 1-line test job so the stuck-queue detector still catches paper-out during slow hours when no real orders are flowing.
4. **Plays an error chime** at the snackbar (a different sound from the order chime) when the printer goes unready, then repeats every 3 minutes until it's fixed.
5. **Auto-updates** itself by `git pull`-ing this repo every 10 minutes. New commits land on the snackbar PC without anyone driving out there.

There is **no inbound port** — the snackbar PC only makes outbound HTTPS calls. That means no port-forwarding, no dynamic DNS, no firewall openings.

---

## Architecture at a glance

```
   ┌─────────────────┐    POST /api/orders     ┌──────────────────────┐
   │ Customer's      │ ──────────────────────▶ │ Cloudflare Pages     │
   │ phone / browser │                         │ Functions  +  D1     │
   └─────────────────┘                         └──────────────┬───────┘
                                                              │
                                              GET /api/orders/pending
                                              POST /api/print-server/heartbeat
                                              POST /api/orders/:id/printed
                                                              ▲
                                                              │ (poll loop)
                                          ┌───────────────────┴────────────┐
                                          │  Snackbar PC (this software)   │
                                          │  ─ headless Debian/Ubuntu      │
                                          │  ─ thermal printer via CUPS    │
                                          │  ─ chime via aplay             │
                                          │  ─ git pull auto-update        │
                                          └────────────────────────────────┘
```

---

## Hardware

The PC just needs to be on, online, and connected to the printer. A small fanless mini-PC works great. Anything that can run Debian and Node 18+:

- **Mini-PC**: Intel N100 / N5105 fanless box, 4 GB RAM, $130–180.
- **Raspberry Pi 4 / 5**: also fine; install Raspberry Pi OS Lite instead of Debian.
- **Existing register PC**: works too if it stays on during snackbar hours.

For the printer, anything CUPS supports (Epson TM-T20III, TM-T88VI, Star TSP100, etc.). We send plain text 40 chars wide, so no driver-specific bytes.

---

## Quick install — `setup.sh`

For Ubuntu / Lubuntu / Debian, the recommended path is the bundled setup script. It walks through everything below — apt installs, user/groups, CUPS printer, `.env` config, systemd unit, and the optional live status monitor — and you can re-run it anytime to update config or fix something.

```bash
sudo apt install -y git
git clone https://github.com/REPLACE_WITH_YOUR_GITHUB_USER/esmkt.git ~/esmkt
cd ~/esmkt/print-server
./setup.sh
```

The script self-elevates with `sudo` and shows a menu:

```
1) Initial install (full walkthrough)
2) Update config (edit .env)
3) Printer setup / change printer
4) Reinstall systemd service
5) Show service status
6) Tail live logs
7) Restart service
8) Install / remove status-monitor autostart
q) Exit
```

Pick **1** for first-time setup. After that, the same script handles ongoing config changes — pick **2** to edit values in `.env` (`API_BASE_URL`, `PRINT_SERVER_SECRET`, `PRINTER_NAME`, etc.) without remembering exact paths or syntax. Each prompt shows the current value as the default; press Enter to keep it.

The script is idempotent — running it again won't break anything that's already set up.

### Live status monitor

Setup option **8** installs an autostart entry so the snackbar PC opens a status terminal at login. The terminal shows a 5-line header (service active state, heartbeat age, printer ready/unready, pending order count) that auto-refreshes every 5 seconds, plus a colorized `journalctl` tail below it (errors red, "printed" green, order ids highlighted, etc.). Useful for spotting problems at a glance from across the snackbar.

You can also run it manually anytime:

```bash
~/esmkt/print-server/monitor.sh
```

Press Ctrl-C to exit. Removing the autostart entry is the same setup option — re-run **8** and it offers to delete it.

---

## Manual install (alternative to `setup.sh`)

If you'd rather install by hand or you're on a non-Debian distro, the steps below are what `setup.sh` runs internally. They're written for a fresh **Debian 12 / Ubuntu 22.04 LTS minimal** install. Adapt freely for Raspberry Pi OS or another Debian-flavored distro.

### 1. Create a service user

```bash
sudo adduser --system --group --shell /bin/bash --home /home/esmkt esmkt
sudo usermod -aG lp esmkt          # so it can print
sudo usermod -aG audio esmkt       # so it can play the chime
```

### 2. Install Node 18+ and required tools

```bash
sudo apt update
sudo apt install -y nodejs npm git cups alsa-utils
node --version    # confirm >= 18
```

If apt's Node is too old, install via NodeSource:

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
```

### 3. Hook up the printer (CUPS)

```bash
sudo systemctl enable --now cups
# Plug the printer in (USB), then:
lpinfo -v                          # see what CUPS detected
sudo lpadmin -p snackbar -E -v <device-uri> -m raw
sudo lpadmin -d snackbar           # set as default
echo "TEST" | lp                   # smoke test — should print one line
```

Replace `<device-uri>` with the line `lpinfo -v` shows for your printer (e.g. `usb://EPSON/TM-T20II?serial=…`). The `-m raw` driver tells CUPS not to do any rendering — it pipes plain text directly to the printer, which is exactly what the print server emits (40-char-wide ASCII).

**Why `raw` and not `everywhere`?** CUPS's IPP-Everywhere driver only works with network IPP printers, not USB. Running `lpadmin … -m everywhere` against a USB printer fails with `IPP Everywhere driver requires an IPP connection`. For USB-connected thermal receipt printers, `raw` is the right choice.

**About the deprecation warning.** When you create a raw queue, CUPS prints "Raw queues are deprecated and will stop working in a future version of CUPS." That warning has been there for years and raw queues still work fine. Plan to migrate later (not now) by either installing the printer vendor's official driver — Epson publishes `tmt-cups` for the TM-T20 series — or using a generic text PPD:

```bash
sudo lpadmin -x snackbar
sudo lpadmin -p snackbar -E -v <device-uri> -m drv:///sample.drv/generic.ppd
sudo lpadmin -d snackbar
```

### 4. Clone the repo

The auto-updater runs `git pull` from this checkout, so the print-server PC must clone the repo via HTTPS (no SSH key needed for a public repo).

```bash
sudo -u esmkt git clone https://github.com/REPLACE_WITH_YOUR_GITHUB_USER/esmkt.git /home/esmkt/esmkt
cd /home/esmkt/esmkt/print-server
sudo -u esmkt npm install --omit=dev   # currently has zero runtime deps; harmless to run
```

### 5. Configure `.env`

```bash
sudo -u esmkt cp .env.example .env
sudo -u esmkt nano .env
```

Set at minimum:

```
API_BASE_URL=https://esmeraldamarket.com
PRINT_SERVER_SECRET=<the same string you set on Cloudflare>
```

The secret is generated once by you and shared between the Cloudflare deployment (`wrangler pages secret put PRINT_SERVER_SECRET …`) and this `.env`. Use a 40+ character random string.

### 6. Install the systemd unit

```bash
sudo cp esmkt-print.service /etc/systemd/system/
sudo nano /etc/systemd/system/esmkt-print.service
```

In the editor, replace **two things** in the unit:

1. The `Documentation=` URL placeholder with your actual GitHub repo URL.
2. The `%U` specifier in the two `Environment=` lines with your user's actual UID (e.g. `1000` — find with `id -u esmkt`). systemd's `%U` doesn't always expand correctly in `Environment=` directives — sometimes resolves to `0` (root) — so hardcode the value.

Resulting `Environment=` lines should read:

```
Environment="XDG_RUNTIME_DIR=/run/user/1000"
Environment="PULSE_SERVER=unix:/run/user/1000/pulse/native"
```

Then enable and start:

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now esmkt-print
sudo journalctl -u esmkt-print -f       # watch the boot output
```

You should see the boot banner (with `Probe: every 5m` and `Error chime: …` lines), then heartbeat + poll log lines every interval.

(If you're using `setup.sh`, option 4 handles all of these substitutions automatically — including hardcoding the UID — so you don't have to edit the unit by hand. The manual steps above are only for non-Debian distros or hand installs.)

### 7. (Optional) Verify in the admin

Open the website's admin → Settings → "Print Server" indicator. The dot should turn green within ~30 seconds, with "Online · last heartbeat <Xs ago".

To test the order pipeline end-to-end, place a test order from the menu page on your phone. You should see it print at the snackbar within 5–10 seconds.

---

## Configuration

All config lives in `print-server/.env`. The full list with defaults is in `.env.example`. Most installs only need to set `API_BASE_URL` and `PRINT_SERVER_SECRET`.

| Variable                          | Default                                                                        | Notes |
|-----------------------------------|--------------------------------------------------------------------------------|-------|
| `API_BASE_URL`                    | (required)                                                                     | Production: `https://esmeraldamarket.com`. Staging: `https://esmkt.pages.dev`. |
| `PRINT_SERVER_SECRET`             | (required)                                                                     | Must match the Cloudflare Pages secret of the same name. |
| `PRINTER_NAME`                    | system default                                                                 | CUPS queue name. `setup.sh` writes `snackbar` here on first run. |
| `POLL_INTERVAL_MS`                | `5000` (5 s)                                                                   | How often to poll for new orders. |
| `HEARTBEAT_INTERVAL_MS`           | `30000` (30 s)                                                                 | The website considers the server offline after 90 s. |
| `UPDATER_INTERVAL_MS`             | `600000` (10 min)                                                              | `0` disables auto-update. |
| `GIT_BRANCH`                      | `main`                                                                         | Branch the auto-updater tracks. |
| `CHIME_CMD`                       | `aplay -q "<install>/sounds/order-chime.wav"`                                  | Order chime — bundled WAV. Set to `""` to disable. |
| `PRINTER_ERROR_CHIME_CMD`         | `aplay -q "<install>/sounds/error-chime.wav"`                                  | Played when printer goes unready, then on the repeat interval. Set to `""` to disable. |
| `PRINTER_ERROR_CHIME_INTERVAL_MS` | `180000` (3 min)                                                               | How often to repeat the error chime while printer stays unready. `0` disables the repeat (still plays once on the transition). |
| `STUCK_JOB_THRESHOLD_MS`          | `30000` (30 s)                                                                 | How long a job may sit in the CUPS queue before we treat the printer as stuck. `0` disables queue-based detection. |
| `PROBE_INTERVAL_MS`               | `300000` (5 min)                                                               | Periodic 1-line probe so the stuck detector also catches problems with no real orders. `0` disables. |
| `LOG_FILE`                        | `./orders.log`                                                                 | NDJSON log of every printed order. |

The bundled WAVs are committed to `print-server/sounds/` and travel with the repo, so there's no dependency on the system having `freedesktop-sound-theme` or any specific ALSA sample files. If you want to use a different sound, drop a new `.wav` in that directory and point `CHIME_CMD` at it.

---

## Operation

### Common commands

```bash
# Status / live logs
sudo systemctl status esmkt-print
sudo journalctl -u esmkt-print -f

# Restart after a config change
sudo systemctl restart esmkt-print

# Pause auto-printing temporarily (e.g. printer maintenance)
sudo systemctl stop esmkt-print
# Resume
sudo systemctl start esmkt-print

# List installed printers (handy for picking PRINTER_NAME)
cd /home/esmkt/esmkt/print-server
sudo -u esmkt node server.js --list-printers
```

### What the auto-updater does

Every `UPDATER_INTERVAL_MS` (default 10 min):
1. `git fetch origin <branch>` (default `main`)
2. If local HEAD differs from `origin/<branch>`:
   - `git pull --ff-only origin <branch>`
   - If `print-server/package.json` changed: `npm install --omit=dev`
   - Exit with code 0 — systemd's `Restart=always` brings the service back on the new code within 3 seconds.

If you push a broken commit, the print server will pull it and try to start. Watch logs after pushing. To roll back, push a fix or `git reset --hard <good-commit>` on the snackbar PC and `systemctl restart esmkt-print`.

To skip a deploy without reverting, set `UPDATER_INTERVAL_MS=0` in `.env` and restart.

### Local order log

Every order received and printed is appended to `orders.log` (NDJSON — one JSON object per line) so you have a local backup independent of the website. Rotate it with `logrotate` if it gets large.

### How printer health detection works

Two complementary signals are sent to the website with each heartbeat:

1. **CUPS state** — the print server runs `lpstat -l -p <queue>` and parses any `reasons:` line, `state:` value, and the enabled flag. On printers with proper drivers (e.g. Epson `tmt-cups` package), CUPS reports `media-empty-error` when paper runs out, `cover-open-error`, `media-jam-error`, etc. The website maps these to friendly text ("Out of paper", "Cover open", etc.).

2. **Stuck-queue overlay** — with a `raw` CUPS queue + a basic thermal printer, CUPS itself often can't see paper-out / jam (no driver-side state codes available). To work around that, the print server also runs `lpstat -o <queue>` to count pending jobs. If any job has been queued longer than `STUCK_JOB_THRESHOLD_MS` (default 30s), it adds a synthetic `queue-stuck-error` reason and flips printer-ready to false. The website renders this as **"Printer not responding (likely out of paper / jam / cover open)"**.

The stuck-queue check only fires when something is actually being printed. To make sure detection still works during slow hours when no real orders are coming in, the print server sends a periodic **probe** — a single newline submitted as a print job every `PROBE_INTERVAL_MS` (default 5 min). On a healthy printer it produces a tiny ~3mm paper sliver; on a broken printer it queues, gets stuck, and trips the detector within 30s.

Probes only fire when the printer is currently believed to be ready — once an unready state is detected, no more probes are sent until recovery.

---

## Troubleshooting

**Print Server indicator stays red in admin Settings.** The service isn't starting or can't reach Cloudflare. Check `sudo journalctl -u esmkt-print -n 200`. Common causes:
- `API_BASE_URL` typo or missing scheme.
- `PRINT_SERVER_SECRET` doesn't match the Cloudflare value (heartbeat returns 401).
- DNS or outbound firewall blocking the Cloudflare domain.

**Orders never print but the indicator is green.** Heartbeat works (so auth and connectivity are fine) but printing fails. Check the log lines after `[error] print failed:`. Run a manual smoke test: `echo TEST | lp -d snackbar`.

**Printer indicator says "Printer not responding (likely out of paper / jam / cover open)".** The stuck-queue detector is firing — there's a job that's been sitting in the CUPS queue past `STUCK_JOB_THRESHOLD_MS` without completing. Almost always a paper / cover / jam issue. Check the printer physically. After fixing, the queue drains, the next heartbeat clears the synthetic reason, the indicator goes green automatically.

If you're sure the printer is fine and the indicator is wrong, look at `lpstat -o snackbar` — if it shows queued jobs that aren't real, cancel them with `lprm -P snackbar -` (cancels all). The next heartbeat should report ready.

**`aplay: audio open error: Host is down` in the logs / chime not playing.** ALSA can't reach a sound device because the systemd service runs outside your desktop's PulseAudio session. The systemd unit injects `XDG_RUNTIME_DIR` and `PULSE_SERVER` env vars pointing at the user's pulse socket — `setup.sh` option 4 hardcodes the actual UID at install time (systemd's `%U` specifier doesn't always expand correctly in `Environment=` lines, sometimes resolving to UID 0). To verify:

```bash
# Should show /run/user/1000/... (NOT /run/user/0/...)
sudo systemctl show esmkt-print | grep -iE "Environment|PULSE"
```

If you see `0` anywhere, re-run `sudo ./setup.sh` → option 4 → confirm restart. If it still fails after reinstall, confirm auto-login is enabled for your user (the pulse socket only exists while logged in) and that your user is in the `audio` group.

If audio isn't critical to your operation, set `CHIME_CMD=""` and `PRINTER_ERROR_CHIME_CMD=""` in `.env` — the thermal printer is audible on its own and the website indicator + email alert still cover printer problems.

**Need to test without involving real customers.** Use the staging URL (`https://esmkt.pages.dev`) in `API_BASE_URL`, place a test order from staging menu, watch it print. Or hit the heartbeat endpoint manually:

```bash
curl -X POST https://esmeraldamarket.com/api/print-server/heartbeat \
  -H "Authorization: Bearer ps:$PRINT_SERVER_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"version":"manual-test"}'
```

A 200 means the server-side wiring is good; a 401 means the secret doesn't match.

**Force an immediate update without waiting for the 10-minute auto-updater.**

```bash
cd ~/esmkt && git pull && sudo systemctl restart esmkt-print
```

**Confirm which version is actually running.**

```bash
sudo journalctl -u esmkt-print -n 30 --no-pager | grep "Version:"
```

The boot banner prints the package.json version. Useful as a deploy marker after pushing changes.

---

## Security notes

- The `PRINT_SERVER_SECRET` is the only credential the snackbar PC needs. It's a static shared secret. Rotate by setting a new value on Cloudflare (`wrangler pages secret put …`) and in the snackbar PC's `.env`, then `systemctl restart esmkt-print`.
- The repo is expected to be public; the snackbar PC only fetches over HTTPS, no SSH key required.
- The systemd unit runs as a dedicated `esmkt` user with `ProtectSystem=strict` and `ReadWritePaths=` limited to the checkout + `/tmp`. The process can't modify the rest of the system.
