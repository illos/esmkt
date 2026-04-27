/**
 * Esmeralda Market — Print Server (polling client)
 * ────────────────────────────────────────────────────
 * Runs on the snackbar PC as a long-lived Node process. Three concurrent
 * loops:
 *
 *   1. POLLER     — every POLL_INTERVAL_MS hits GET /api/orders/pending,
 *                   prints each order, plays a chime, then POSTs
 *                   /api/orders/:id/printed (or /printed with an error).
 *   2. HEARTBEAT  — every HEARTBEAT_INTERVAL_MS hits POST /api/print-server/heartbeat
 *                   so the website knows we're alive.
 *   3. UPDATER    — every UPDATER_INTERVAL_MS runs `git fetch`; if the
 *                   public GitHub repo has new commits, pulls them, runs
 *                   `npm install --omit=dev` if package.json changed,
 *                   then exits with code 0 — systemd restarts the unit.
 *
 * No inbound HTTP is exposed — the snackbar PC only makes outbound calls.
 *
 * See README.md for setup. Configuration via env vars (or print-server/.env
 * if dotenv is installed; we read .env manually so there's no extra dep).
 *
 *   API_BASE_URL          required — e.g. https://esmeraldamarket.com
 *   PRINT_SERVER_SECRET   required — must match Cloudflare side
 *   PRINTER_NAME          optional — CUPS / Windows printer name. Default = system default.
 *   POLL_INTERVAL_MS      optional — default 5000  (5s)
 *   HEARTBEAT_INTERVAL_MS optional — default 30000 (30s)
 *   UPDATER_INTERVAL_MS   optional — default 600000 (10min). 0 disables auto-update.
 *   CHIME_CMD             optional — shell command to play the chime. Default = `aplay /usr/share/sounds/alsa/Front_Center.wav`
 *                                    Set CHIME_CMD="" to disable the chime.
 *   LOG_FILE              optional — path to NDJSON order log. Default ./orders.log
 *   GIT_BRANCH            optional — branch to track. Default `main`.
 */

'use strict';

const { execFile, exec } = require('child_process');
const fs   = require('fs');
const os   = require('os');
const path = require('path');

// ── load .env (no dependency) ───────────────────────────────────────────────
loadEnvFile(path.join(__dirname, '.env'));

// ── module-level state ──────────────────────────────────────────────────────
// Declared up here (not where they're used) because the loop-start calls
// below trigger pollOnce()/heartbeatOnce() synchronously, and those would
// hit the temporal dead zone if the `let` declarations were further down.
let polling = false;
let heartbeatFailures = 0;
// Most recent printer status snapshot from `lpstat -p -l`. Refreshed on
// every heartbeat, also read by the error-chime loop.
let lastPrinterStatus = null; // { state, reasons, enabled, queued_jobs, ready }
// Used by the error-chime timer to decide whether to play the immediate
// "first time bad" chime (vs. the periodic repeat).
let lastPrinterReady = true;
// Stuck-queue detection: timestamp (ms) when we first observed >0 pending
// jobs in the CUPS queue. Cleared whenever the queue drains. If this stays
// non-zero longer than STUCK_JOB_THRESHOLD_MS, we flip the printer to unready.
// This is necessary because raw CUPS queues + simple thermal printers don't
// surface paper-out / jam via lpstat — they just stop accepting jobs.
let jobsStuckSince = 0;

// ── version ─────────────────────────────────────────────────────────────────
const VERSION = readPackageVersion();

// ── config ──────────────────────────────────────────────────────────────────
const API_BASE_URL          = (process.env.API_BASE_URL || '').replace(/\/+$/, '');
const PRINT_SERVER_SECRET   = process.env.PRINT_SERVER_SECRET || '';
const PRINTER_NAME          = getPrinterArg() || process.env.PRINTER_NAME || '';
const POLL_INTERVAL_MS      = parseIntDefault(process.env.POLL_INTERVAL_MS,      5_000);
const HEARTBEAT_INTERVAL_MS = parseIntDefault(process.env.HEARTBEAT_INTERVAL_MS, 30_000);
const UPDATER_INTERVAL_MS   = parseIntDefault(process.env.UPDATER_INTERVAL_MS,   10 * 60 * 1000);
// Bundled sound files (in print-server/sounds/) — work on any Linux distro
// without depending on system sound themes. aplay is part of alsa-utils,
// which the setup script installs.
const SOUNDS_DIR            = path.join(__dirname, 'sounds');
const DEFAULT_ORDER_WAV     = path.join(SOUNDS_DIR, 'order-chime.wav');
const DEFAULT_ERROR_WAV     = path.join(SOUNDS_DIR, 'error-chime.wav');

const CHIME_CMD             = process.env.CHIME_CMD == null
                                ? `aplay -q "${DEFAULT_ORDER_WAV}"`
                                : process.env.CHIME_CMD;
// Played immediately when the printer transitions from ready → unready,
// then every PRINTER_ERROR_CHIME_INTERVAL_MS while it stays unready.
// More urgent sound than the order chime by default. CHIME_CMD="" disables
// both; PRINTER_ERROR_CHIME_CMD="" disables only the error chime.
const PRINTER_ERROR_CHIME_CMD          = process.env.PRINTER_ERROR_CHIME_CMD == null
  ? `aplay -q "${DEFAULT_ERROR_WAV}"`
  : process.env.PRINTER_ERROR_CHIME_CMD;
const PRINTER_ERROR_CHIME_INTERVAL_MS  = parseIntDefault(process.env.PRINTER_ERROR_CHIME_INTERVAL_MS, 3 * 60 * 1000);
// Default CUPS queue name that we'll lpstat. If PRINTER_NAME is set, use
// that. Otherwise fall back to whatever lpstat -d says is the default.
const PRINTER_QUEUE_NAME    = PRINTER_NAME || '';
// How long a print job may sit in the queue before we treat the printer
// as stuck. Calibrated for thermal receipt printers (jobs normally complete
// in <5s). Set to 0 to disable queue-based detection.
const STUCK_JOB_THRESHOLD_MS = parseIntDefault(process.env.STUCK_JOB_THRESHOLD_MS, 30_000);
// Periodic probe: submit a minimal test job at this interval so the
// stuck-queue detector still catches paper-out / jam during slow periods
// when no real orders are coming through. Each probe consumes ~3mm of
// paper (one line feed). 0 disables.
const PROBE_INTERVAL_MS      = parseIntDefault(process.env.PROBE_INTERVAL_MS, 5 * 60 * 1000);
const LOG_FILE              = process.env.LOG_FILE || path.join(__dirname, 'orders.log');
const GIT_BRANCH            = process.env.GIT_BRANCH || 'main';

// Reasons we treat as "still ready" (warnings only, printer keeps printing)
const BENIGN_REASONS = new Set([
  'none', '',
  'marker-supply-low-warning', 'media-low-warning', 'toner-low-warning',
]);

// ── CLI: --list-printers ────────────────────────────────────────────────────
if (process.argv.includes('--list-printers')) {
  listPrinters((err, printers) => {
    if (err) { console.error('Could not list printers:', err.message); process.exit(1); }
    console.log('\nAvailable printers:');
    printers.forEach(p => console.log('  -', p));
    process.exit(0);
  });
  return;
}

// ── boot banner + sanity checks ─────────────────────────────────────────────
banner();

if (!API_BASE_URL || !/^https?:\/\//.test(API_BASE_URL)) {
  fatal('API_BASE_URL is required and must start with http(s)://');
}
if (!PRINT_SERVER_SECRET) {
  fatal('PRINT_SERVER_SECRET is required (set it in print-server/.env)');
}

console.log(`  API base:      ${API_BASE_URL}`);
console.log(`  Printer:       ${PRINTER_NAME || '(system default)'}`);
console.log(`  Poll:          every ${POLL_INTERVAL_MS / 1000}s`);
console.log(`  Heartbeat:     every ${HEARTBEAT_INTERVAL_MS / 1000}s`);
console.log(`  Auto-update:   ${UPDATER_INTERVAL_MS > 0 ? `every ${Math.round(UPDATER_INTERVAL_MS / 60000)}m from origin/${GIT_BRANCH}` : 'disabled'}`);
console.log(`  Chime:         ${CHIME_CMD ? CHIME_CMD : '(disabled)'}`);
console.log(`  Error chime:   ${PRINTER_ERROR_CHIME_CMD ? PRINTER_ERROR_CHIME_CMD : '(disabled)'}${PRINTER_ERROR_CHIME_INTERVAL_MS > 0 ? ` (every ${Math.round(PRINTER_ERROR_CHIME_INTERVAL_MS / 60000)}m)` : ''}`);
console.log(`  Probe:         ${PROBE_INTERVAL_MS > 0 ? `every ${Math.round(PROBE_INTERVAL_MS / 60000)}m` : '(disabled)'}`);
console.log(`  Log file:      ${LOG_FILE}`);
console.log(`  Version:       ${VERSION}\n`);

// ── start loops ─────────────────────────────────────────────────────────────
runHeartbeatLoop();
runPollLoop();
runPrinterErrorChimeLoop();
runProbeLoop();
if (UPDATER_INTERVAL_MS > 0) runUpdaterLoop();

// Keep the event loop alive even if all timers were somehow cleared.
setInterval(() => {}, 1 << 30);

// ════════════════════════════════════════════════════════════════════════════
// HEARTBEAT
// ════════════════════════════════════════════════════════════════════════════

async function runHeartbeatLoop() {
  // Fire one immediately so the website learns we're back fast on restart.
  await heartbeatOnce();
  setInterval(heartbeatOnce, HEARTBEAT_INTERVAL_MS);
}

async function heartbeatOnce() {
  // Refresh printer status from CUPS BEFORE shipping the heartbeat so the
  // website always sees a fresh snapshot. Best-effort — if lpstat fails,
  // we still send the heartbeat without a printer block.
  let printerPayload = null;
  try {
    const status = await collectPrinterStatus();
    if (status) {
      lastPrinterStatus = status;
      // Track ready/unready transitions for the chime loop (immediate first chime)
      if (lastPrinterReady !== status.ready) {
        if (!status.ready) {
          // Just transitioned from ready → unready: play the error chime once now.
          console.warn(`[${ts()}] printer became unready: ${humanizeReasons(status)}`);
          playErrorChime();
        } else {
          console.log(`[${ts()}] printer recovered: ready`);
        }
        lastPrinterReady = status.ready;
      }
      printerPayload = status;
    }
  } catch (_) { /* ignore — heartbeat still runs */ }

  try {
    const res = await psFetch('/api/print-server/heartbeat', {
      method: 'POST',
      body:   JSON.stringify({
        version: VERSION,
        ...(printerPayload ? { printer: printerPayload } : {}),
      }),
    });
    if (!res.ok) throw new Error(`heartbeat ${res.status}`);
    if (heartbeatFailures > 0) {
      console.log(`[${ts()}] heartbeat recovered after ${heartbeatFailures} failures`);
    }
    heartbeatFailures = 0;
  } catch (e) {
    heartbeatFailures += 1;
    // Quiet log — log every 10th failure so we don't spam during outages.
    if (heartbeatFailures === 1 || heartbeatFailures % 10 === 0) {
      console.warn(`[${ts()}] heartbeat failed (${heartbeatFailures}): ${e.message}`);
    }
  }
}

// ════════════════════════════════════════════════════════════════════════════
// POLL → PRINT
// ════════════════════════════════════════════════════════════════════════════

async function runPollLoop() {
  await pollOnce();
  setInterval(() => { if (!polling) pollOnce(); }, POLL_INTERVAL_MS);
}

async function pollOnce() {
  polling = true;
  try {
    const res = await psFetch('/api/orders/pending', { method: 'GET' });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`pending ${res.status}: ${body.slice(0, 120)}`);
    }
    const data = await res.json();
    const orders = Array.isArray(data && data.orders) ? data.orders : [];
    for (const row of orders) {
      await processOrder(row);
    }
  } catch (e) {
    console.warn(`[${ts()}] poll failed: ${e.message}`);
  } finally {
    polling = false;
  }
}

async function processOrder(row) {
  const order = row.payload;
  if (!order || !order.id) {
    console.warn(`[${ts()}] skipping malformed row id=${row && row.id}`);
    await markOrder(row.id, { error: 'Malformed payload on print server' });
    return;
  }

  console.log(`\n[${ts()}] ── Order ${order.id} ──`);
  console.log(`  Customer : ${order.customer_name || ''} (${order.customer_phone || '—'})`);
  console.log(`  Pickup   : ${order.pickup_time || 'ASAP'}`);
  console.log(`  Items    : ${(order.items || []).map(i => i.name).join(', ')}`);
  if (order.total != null) console.log(`  Total    : $${Number(order.total).toFixed(2)}`);

  // Append to local NDJSON log (best-effort)
  try {
    const entry = JSON.stringify({ ...order, _received: new Date().toISOString() });
    fs.appendFileSync(LOG_FILE, entry + '\n', 'utf8');
  } catch (e) {
    console.warn(`  [warn] order log write failed: ${e.message}`);
  }

  // Print
  const receipt = formatReceipt(order);
  const tmpFile = path.join(os.tmpdir(), `esmeralda-${order.id}.txt`);

  try {
    fs.writeFileSync(tmpFile, receipt, 'utf8');
  } catch (e) {
    console.error(`  [error] temp file write failed: ${e.message}`);
    await markOrder(row.id, { error: `temp file: ${e.message}` });
    return;
  }

  printFile(tmpFile, async (err) => {
    try { fs.unlinkSync(tmpFile); } catch (_) {}
    if (err) {
      console.error(`  [error] print failed: ${err.message}`);
      await markOrder(row.id, { error: `print: ${err.message}` });
      return;
    }
    console.log('  printed.');
    playChime();
    await markOrder(row.id, {});
  });
}

async function markOrder(id, body) {
  try {
    const res = await psFetch(`/api/orders/${encodeURIComponent(id)}/printed`, {
      method: 'POST',
      body:   JSON.stringify(body || {}),
    });
    if (!res.ok) {
      console.warn(`  [warn] mark-printed ${res.status} for ${id}`);
    }
  } catch (e) {
    // If marking fails the order will reappear on next poll — we'll retry.
    console.warn(`  [warn] mark-printed network error for ${id}: ${e.message}`);
  }
}

// ════════════════════════════════════════════════════════════════════════════
// AUTO-UPDATER
// ════════════════════════════════════════════════════════════════════════════
//
// Every UPDATER_INTERVAL_MS we run `git fetch` and compare the local commit
// to origin/<GIT_BRANCH>. If they differ, we pull, optionally `npm install`,
// then exit with status 0. systemd's Restart=always will bring us back up
// on the new code.
//
// This requires the print-server PC's working copy to be a git checkout
// of the public esmkt repo (the repo that contains this file). Setup
// instructions are in print-server/README.md.

async function runUpdaterLoop() {
  setInterval(checkForUpdates, UPDATER_INTERVAL_MS);
}

async function checkForUpdates() {
  try {
    await sh('git', ['fetch', '--quiet', 'origin', GIT_BRANCH], { cwd: repoRoot() });
    const local  = (await sh('git', ['rev-parse', 'HEAD'],                { cwd: repoRoot() })).stdout.trim();
    const remote = (await sh('git', ['rev-parse', `origin/${GIT_BRANCH}`], { cwd: repoRoot() })).stdout.trim();
    if (!local || !remote || local === remote) return;

    console.log(`\n[${ts()}] update available: ${local.slice(0, 7)} → ${remote.slice(0, 7)}. pulling…`);

    // Was package.json touched? If so, we'll npm install after pull.
    const diffOut = (await sh('git', ['diff', '--name-only', `${local}..${remote}`], { cwd: repoRoot() })).stdout;
    const needsInstall = diffOut.split('\n').some(p => p === 'print-server/package.json' || p === 'print-server/package-lock.json');

    await sh('git', ['pull', '--ff-only', '--quiet', 'origin', GIT_BRANCH], { cwd: repoRoot() });

    if (needsInstall) {
      console.log(`[${ts()}] running npm install (package.json changed)…`);
      await sh('npm', ['install', '--omit=dev', '--no-audit', '--no-fund'], { cwd: __dirname });
    }

    console.log(`[${ts()}] update applied. exiting for systemd to restart on new code.`);
    process.exit(0);
  } catch (e) {
    console.warn(`[${ts()}] update check failed: ${e.message}`);
  }
}

function repoRoot() {
  // print-server/ lives at the repo root, so cwd one level up.
  return path.resolve(__dirname, '..');
}

// ════════════════════════════════════════════════════════════════════════════
// PRINTING
// ════════════════════════════════════════════════════════════════════════════

function printFile(filePath, callback) {
  if (os.platform() === 'win32') {
    const cmd = PRINTER_NAME
      ? `powershell -Command "Get-Content '${filePath}' | Out-Printer -Name '${PRINTER_NAME.replace(/'/g, "''")}'"`
      : `powershell -Command "Get-Content '${filePath}' | Out-Printer"`;
    exec(cmd, (err, _, stderr) => callback(err ? new Error(stderr || err.message) : null));
  } else {
    const args = PRINTER_NAME ? ['-d', PRINTER_NAME, filePath] : [filePath];
    execFile('lp', args, (err, _, stderr) => callback(err ? new Error(stderr || err.message) : null));
  }
}

function listPrinters(callback) {
  if (os.platform() === 'win32') {
    exec(`powershell -Command "Get-Printer | Select-Object -ExpandProperty Name"`, (err, stdout) => {
      if (err) return callback(err);
      callback(null, stdout.split(/\r?\n/).map(s => s.trim()).filter(Boolean));
    });
  } else {
    exec('lpstat -a 2>/dev/null || lpstat -p 2>/dev/null', (err, stdout) => {
      if (err) return callback(err);
      callback(null, stdout.split('\n').map(line => line.split(/\s+/)[0]).filter(Boolean));
    });
  }
}

// ════════════════════════════════════════════════════════════════════════════
// CHIME
// ════════════════════════════════════════════════════════════════════════════
//
// Fire-and-forget. We don't want a misconfigured audio device to block
// the print pipeline. CHIME_CMD="" disables it entirely.

function playChime() {
  if (!CHIME_CMD) return;
  exec(CHIME_CMD, (err) => {
    if (err) console.warn(`  [warn] chime failed: ${err.message}`);
  });
}

// Distinct chime for printer errors. Fires once when the printer transitions
// ready → unready (from heartbeatOnce), then every PRINTER_ERROR_CHIME_INTERVAL_MS
// from runPrinterErrorChimeLoop while the printer remains unready.
function playErrorChime() {
  if (!PRINTER_ERROR_CHIME_CMD) return;
  exec(PRINTER_ERROR_CHIME_CMD, (err) => {
    if (err) console.warn(`  [warn] error chime failed: ${err.message}`);
  });
}

// Periodic reminder while the printer is unready. Polls the in-memory
// `lastPrinterStatus.ready` flag (refreshed by heartbeatOnce every 30s)
// and chimes if we're still unready. Disabled when interval = 0.
function runPrinterErrorChimeLoop() {
  if (PRINTER_ERROR_CHIME_INTERVAL_MS <= 0) return;
  setInterval(() => {
    if (lastPrinterStatus && lastPrinterStatus.ready === false) {
      playErrorChime();
    }
  }, PRINTER_ERROR_CHIME_INTERVAL_MS);
}

// ════════════════════════════════════════════════════════════════════════════
// PROBE — periodic 1-line print job to detect paper-out during slow periods
// ════════════════════════════════════════════════════════════════════════════
//
// With raw CUPS queues, the printer's actual state isn't visible until we
// try to print. The stuck-queue detector watches the queue depth — but it
// only fires when something is in the queue. During slow hours (no real
// orders), paper could be removed and we'd still report ready. This probe
// loop submits a minimal test job (~3mm of paper feed) every PROBE_INTERVAL_MS,
// so the stuck detector has something to watch. The probe job itself is
// fire-and-forget — we don't track its outcome here; the heartbeat picks
// up the consequence (queue stuck or queue drained).

function runProbeLoop() {
  if (PROBE_INTERVAL_MS <= 0) return;
  // Skip the very first interval — no need to probe immediately on startup.
  setInterval(submitProbe, PROBE_INTERVAL_MS);
}

function submitProbe() {
  if (os.platform() === 'win32') return;
  // If we already know the printer is unready, skip — there's no value in
  // adding more stuck jobs to an already-stuck queue, and the existing
  // detection has already done its job.
  if (lastPrinterStatus && lastPrinterStatus.ready === false) return;

  const queue = PRINTER_QUEUE_NAME;
  const tmpFile = path.join(os.tmpdir(), `esmeralda-probe-${Date.now()}.txt`);
  try {
    // Single newline = ~3mm of paper feed on a thermal printer. Smaller
    // than any actual receipt; staff will recognize these tiny strips.
    fs.writeFileSync(tmpFile, '\n', 'utf8');
  } catch (e) {
    console.warn(`[${ts()}] probe: temp file failed: ${e.message}`);
    return;
  }
  const args = queue ? ['-d', queue, tmpFile] : [tmpFile];
  execFile('lp', args, (err) => {
    try { fs.unlinkSync(tmpFile); } catch (_) {}
    if (err) {
      console.warn(`[${ts()}] probe: lp failed: ${err.message}`);
    }
  });
}

// ════════════════════════════════════════════════════════════════════════════
// PRINTER STATUS (from `lpstat -p <queue> -l`)
// ════════════════════════════════════════════════════════════════════════════
//
// Returns { state, reasons, enabled, queued_jobs, ready } or null on Windows
// (Windows status is harder; the print-server runs on Linux per the README,
// so we only collect status there). The shape matches what the heartbeat
// endpoint expects.

async function collectPrinterStatus() {
  if (os.platform() === 'win32') return null;
  const queue = PRINTER_QUEUE_NAME; // empty string → no -p flag → default printer
  return new Promise((resolve) => {
    const cmd = queue ? `lpstat -l -p "${queue.replace(/"/g, '\\"')}"` : 'lpstat -l -p';
    exec(cmd, { timeout: 5000 }, (err, stdout) => {
      if (err) return resolve(null);
      const status = parseLpstatOutput(String(stdout || ''));
      // Pending jobs query — `lpstat -o <queue>` lists pending jobs only.
      const jobsCmd = queue ? `lpstat -o "${queue.replace(/"/g, '\\"')}" 2>/dev/null` : 'lpstat -o 2>/dev/null';
      exec(jobsCmd, { timeout: 5000 }, (_jerr, jstdout) => {
        const lines = String(jstdout || '').split(/\r?\n/).filter(Boolean);
        status.queued_jobs = lines.length;

        // Stuck-queue overlay: if there are jobs and they've been there
        // longer than STUCK_JOB_THRESHOLD_MS, treat the printer as unready.
        // This is the canonical signal for raw queues, where CUPS itself
        // doesn't know paper-out / jam / cover-open.
        const now = Date.now();
        if (status.queued_jobs > 0) {
          if (jobsStuckSince === 0) jobsStuckSince = now;
          const stuckFor = now - jobsStuckSince;
          if (STUCK_JOB_THRESHOLD_MS > 0 && stuckFor >= STUCK_JOB_THRESHOLD_MS) {
            // Inject the synthetic reason and force unready
            if (!status.reasons.includes('queue-stuck-error')) {
              status.reasons = (status.reasons || []).filter(r => r !== 'none').concat(['queue-stuck-error']);
            }
          }
        } else {
          jobsStuckSince = 0;
        }

        status.ready = computeReady(status);
        resolve(status);
      });
    });
  });
}

// `lpstat -l -p <q>` typical output:
//   printer snackbar is idle.  enabled since Sun 26 Apr 2026 03:00:00 PM PDT
//           reasons: none
// or:
//   printer snackbar disabled since Sun 26 Apr 2026 03:00:00 PM PDT -
//           Out of paper
//           reasons: media-empty-error
function parseLpstatOutput(stdout) {
  const out = { state: '', reasons: [], enabled: true };
  const lines = stdout.split(/\r?\n/);
  for (const raw of lines) {
    const line = raw.trim();
    if (line.startsWith('printer ')) {
      // "printer <name> is idle.  enabled since ..."
      // or "printer <name> disabled since ..."
      if (/\bdisabled\b/i.test(line))      out.enabled = false;
      if (/\bis printing\b/i.test(line))   out.state = 'printing';
      else if (/\bis idle\b/i.test(line))  out.state = 'idle';
      else if (/\bis stopped\b/i.test(line) || /\bdisabled\b/i.test(line)) out.state = 'stopped';
    }
    const m = line.match(/reasons:\s*(.+)$/i);
    if (m) {
      out.reasons = m[1].split(/[,\s]+/).filter(Boolean);
    }
  }
  if (!out.reasons.length) out.reasons = ['none'];
  return out;
}

function computeReady(s) {
  if (s.enabled === false) return false;
  if (s.state === 'stopped') return false;
  for (const r of s.reasons || []) {
    if (!BENIGN_REASONS.has(r)) return false;
  }
  return true;
}

function humanizeReasons(s) {
  if (!s) return 'unknown';
  if (s.enabled === false) return 'printer disabled';
  if (s.state === 'stopped') return 'printer stopped';
  for (const r of s.reasons || []) {
    if (!r || r === 'none') continue;
    return r;
  }
  return 'not ready';
}

// ════════════════════════════════════════════════════════════════════════════
// RECEIPT FORMATTING (40-char wide, fits 80mm thermal paper)
// ════════════════════════════════════════════════════════════════════════════

function formatReceipt(order) {
  const W    = 40;
  const WIDE = '='.repeat(W);
  const THIN = '-'.repeat(W);
  const d    = new Date(order.timestamp || Date.now()).toLocaleString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: 'numeric', minute: '2-digit',
  });

  const center = s => ' '.repeat(Math.max(0, Math.floor((W - s.length) / 2))) + s;
  const row    = (l, r) => l + ' '.repeat(Math.max(1, W - l.length - r.length)) + r;

  let out = '';
  out += WIDE + '\n';
  out += center('ESMERALDA MARKET') + '\n';
  out += center('HWY 264, Mile Marker 8') + '\n';
  out += center('Dyer, NV  89010') + '\n';
  out += center('(775) 572-3200') + '\n';
  out += WIDE + '\n\n';

  const pickupLabel = (order.pickup_time || 'AS SOON AS READY').toUpperCase();
  out += center('*** DESIRED PICKUP TIME ***') + '\n';
  out += center(pickupLabel) + '\n';
  out += WIDE + '\n\n';

  out += `Order # : ${order.id}\n`;
  out += `Time    : ${d}\n`;
  out += `Name    : ${order.customer_name || ''}\n`;
  if (order.customer_phone) out += `Phone   : ${order.customer_phone}\n`;
  if (order.notes)          out += `Notes   : ${order.notes}\n`;

  out += '\n' + THIN + '\nITEMS\n' + THIN + '\n';
  for (const item of order.items || []) {
    out += row(truncate(item.name || '', W - 8), `$${Number(item.base_price || 0).toFixed(2)}`) + '\n';
    for (const opt of item.choices || []) {
      out += `  > ${opt.name}: ${opt.choice}\n`;
    }
    for (const addon of item.options || []) {
      const name  = String(addon).replace(/\s*\+\$[\d.]+$/, '');
      const price = parseAddonPrice(addon);
      out += price > 0
        ? row(`  + ${truncate(name, W - 12)}`, `+$${price.toFixed(2)}`) + '\n'
        : `  + ${name}\n`;
    }
  }
  out += '\n' + THIN + '\n';
  out += row('Subtotal', `$${Number(order.subtotal || 0).toFixed(2)}`) + '\n';
  out += row(order.taxRate ? `Tax (${order.taxRate}%)` : 'Tax', `$${Number(order.tax || 0).toFixed(2)}`) + '\n';
  out += WIDE + '\n';
  out += row('TOTAL', `$${Number(order.total || 0).toFixed(2)}`) + '\n';
  out += WIDE + '\n\n';
  out += center('Thank you for stopping by!') + '\n';
  out += center('Ride safe out there.') + '\n';
  out += '\n\n\n'; // feed paper
  return out;
}

// ════════════════════════════════════════════════════════════════════════════
// HELPERS
// ════════════════════════════════════════════════════════════════════════════

function psFetch(pathname, init = {}) {
  const url = API_BASE_URL + pathname;
  const headers = {
    Authorization: `Bearer ps:${PRINT_SERVER_SECRET}`,
    'Content-Type': 'application/json',
    ...(init.headers || {}),
  };
  // Node 18+ has global fetch.
  return fetch(url, { ...init, headers });
}

function sh(cmd, args, opts) {
  return new Promise((resolve, reject) => {
    execFile(cmd, args, opts || {}, (err, stdout, stderr) => {
      if (err) return reject(new Error((stderr && stderr.toString()) || err.message));
      resolve({ stdout: String(stdout), stderr: String(stderr) });
    });
  });
}

function truncate(s, n)        { return s.length > n ? s.slice(0, n - 1) + '…' : s; }
function parseAddonPrice(label) { const m = String(label).match(/\+\$(\d+(?:\.\d+)?)/); return m ? parseFloat(m[1]) : 0; }
function parseIntDefault(v, d)  { const n = parseInt(v, 10); return Number.isFinite(n) && n >= 0 ? n : d; }
function ts()                   { return new Date().toLocaleTimeString(); }
function getPrinterArg()        { const i = process.argv.indexOf('--printer'); return i !== -1 ? process.argv[i + 1] : null; }

function readPackageVersion() {
  try { return JSON.parse(fs.readFileSync(path.join(__dirname, 'package.json'), 'utf8')).version || '0.0.0'; }
  catch (_) { return '0.0.0'; }
}

function loadEnvFile(file) {
  if (!fs.existsSync(file)) return;
  const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/);
  for (const raw of lines) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let   val = line.slice(eq + 1).trim();
    if (val.startsWith('"') && val.endsWith('"')) val = val.slice(1, -1);
    if (val.startsWith("'") && val.endsWith("'")) val = val.slice(1, -1);
    if (process.env[key] == null) process.env[key] = val;
  }
}

function banner() {
  console.log('\n  ╔══════════════════════════════════════╗');
  console.log('  ║   ESMERALDA MARKET PRINT SERVER      ║');
  console.log('  ╚══════════════════════════════════════╝\n');
}

function fatal(msg) {
  console.error('  [fatal] ' + msg + '\n');
  process.exit(1);
}
