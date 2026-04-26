# Esmeralda Market — Print Server

A small Node.js process that runs unattended on the snackbar PC. It does three things on a loop:

1. **Polls the website** (`/api/orders/pending`) every few seconds, prints any new orders to a thermal receipt printer, plays a chime, and marks them done.
2. **Sends a heartbeat** (`/api/print-server/heartbeat`) every 30 seconds so the website knows it's alive. If the heartbeat stops, online ordering can be auto-disabled and an alert email is sent to the owner.
3. **Auto-updates** itself by `git pull`-ing this repo every 10 minutes. New commits land on the snackbar PC without anyone driving out there.

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

## One-time install on the snackbar PC

These steps are written for a fresh **Debian 12 / Ubuntu 22.04 LTS minimal** install. Adapt freely for Raspberry Pi OS or another Debian-flavored distro.

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
# Plug the printer in (USB or network), then:
lpinfo -v                          # see what CUPS detected
sudo lpadmin -p snackbar -E -v <device-uri> -m everywhere
sudo lpadmin -d snackbar           # set as default
echo "TEST" | lp                   # smoke test — should print one line
```

Replace `<device-uri>` with the line `lpinfo -v` shows for your printer (e.g. `usb://EPSON/TM-T20III?serial=…`). Use `-m raw` instead of `-m everywhere` if you have a vendor PPD you'd rather use.

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
# Open it and replace the GitHub URL + paths if you used different ones
sudo nano /etc/systemd/system/esmkt-print.service
sudo systemctl daemon-reload
sudo systemctl enable --now esmkt-print
sudo journalctl -u esmkt-print -f       # watch the boot output
```

You should see the boot banner, then heartbeat + poll log lines every interval.

### 7. (Optional) Verify in the admin

Open the website's admin → Settings → "Print Server" indicator. The dot should turn green within ~30 seconds, with "Online · last heartbeat <Xs ago".

To test the order pipeline end-to-end, place a test order from the menu page on your phone. You should see it print at the snackbar within 5–10 seconds.

---

## Configuration

All config lives in `print-server/.env`. The full list with defaults is in `.env.example`. Most installs only need to set `API_BASE_URL` and `PRINT_SERVER_SECRET`.

| Variable                | Default                                                     | Notes |
|-------------------------|-------------------------------------------------------------|-------|
| `API_BASE_URL`          | (required)                                                  | Production: `https://esmeraldamarket.com`. Staging: `https://esmkt.pages.dev`. |
| `PRINT_SERVER_SECRET`   | (required)                                                  | Must match the Cloudflare Pages secret of the same name. |
| `PRINTER_NAME`          | system default                                              | Override with a CUPS / Windows printer name. |
| `POLL_INTERVAL_MS`      | `5000` (5 s)                                                | How often to poll for new orders. |
| `HEARTBEAT_INTERVAL_MS` | `30000` (30 s)                                              | The website considers the server offline after 90 s. |
| `UPDATER_INTERVAL_MS`   | `600000` (10 min)                                           | `0` disables auto-update. |
| `GIT_BRANCH`            | `main`                                                      | Branch the auto-updater tracks. |
| `CHIME_CMD`             | `aplay -q /usr/share/sounds/alsa/Front_Center.wav`          | Set to `""` to disable. |
| `LOG_FILE`              | `./orders.log`                                              | NDJSON log of every printed order. |

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

---

## Troubleshooting

**Indicator stays red in admin Settings.** The service isn't starting or can't reach Cloudflare. Check `sudo journalctl -u esmkt-print -n 200`. Common causes:
- `API_BASE_URL` typo or missing scheme.
- `PRINT_SERVER_SECRET` doesn't match the Cloudflare value (heartbeat returns 401).
- DNS or outbound firewall blocking the Cloudflare domain.

**Orders never print but the indicator is green.** Heartbeat works (so auth and connectivity are fine) but printing fails. Check the log lines after `[error] print failed:`. Run a manual smoke test: `echo TEST | lp -d snackbar`.

**Chime doesn't play.** The `esmkt` user might not be in the `audio` group, or the headless box has no audio output device. Set `CHIME_CMD=""` in `.env` to silence; the printer is loud enough on its own.

**Need to test without involving real customers.** Use the staging URL (`https://esmkt.pages.dev`) in `API_BASE_URL`, place a test order from staging menu, watch it print. Or hit the heartbeat endpoint manually:

```bash
curl -X POST https://esmeraldamarket.com/api/print-server/heartbeat \
  -H "Authorization: Bearer ps:$PRINT_SERVER_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"version":"manual-test"}'
```

A 200 means the server-side wiring is good; a 401 means the secret doesn't match.

---

## Security notes

- The `PRINT_SERVER_SECRET` is the only credential the snackbar PC needs. It's a static shared secret. Rotate by setting a new value on Cloudflare (`wrangler pages secret put …`) and in the snackbar PC's `.env`, then `systemctl restart esmkt-print`.
- The repo is expected to be public; the snackbar PC only fetches over HTTPS, no SSH key required.
- The systemd unit runs as a dedicated `esmkt` user with `ProtectSystem=strict` and `ReadWritePaths=` limited to the checkout + `/tmp`. The process can't modify the rest of the system.
