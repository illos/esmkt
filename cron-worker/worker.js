/**
 * Esmeralda Market — offline-alert cron worker
 * ───────────────────────────────────────────────
 * Runs on a Cloudflare Cron Trigger every 5 minutes. Reads the print
 * server's last-heartbeat timestamp from D1; if the gap exceeds the
 * threshold configured in admin Settings AND we haven't already sent an
 * alert in the last hour, sends an email via Resend.
 *
 * Why a separate Worker (not a Pages Function):
 *   Cloudflare Pages Functions don't support scheduled events directly.
 *   This Worker shares the same D1 database (via the same database_id in
 *   wrangler.toml) and the same KV namespace (for reading admin Settings),
 *   so it has full access to the data without any cross-service hops.
 *
 * Deploy:
 *   cd cron-worker
 *   wrangler deploy
 *
 * Required bindings (see ./wrangler.toml):
 *   ORDERS_DB        D1   — same database as the Pages project
 *   MENU_KV          KV   — same namespace as the Pages project
 *   RESEND_API_KEY   secret
 *   RESEND_FROM      secret  (verified sender, e.g. "alerts@esmeraldamarket.com")
 */

export default {
  /**
   * Triggered by `[triggers] crons = ["*\/5 * * * *"]` in wrangler.toml.
   * The handler runs in a fresh isolate each invocation.
   */
  async scheduled(event, env, ctx) {
    // Two independent checks each tick: heartbeat-stale (print server
    // offline) and printer-not-ready. Each has its own threshold and its
    // own 1-hour cooldown so a sustained outage doesn't spam the inbox.
    ctx.waitUntil(Promise.all([
      checkAndAlert(env),
      checkPrinterAndAlert(env),
    ]));
  },

  /**
   * Manual trigger endpoint — useful for testing the alert flow without
   * waiting for the next cron tick. Hit it from the dashboard or via curl
   * with `Authorization: Bearer <PRINT_SERVER_SECRET>` to authorize.
   * Without auth it just reports current state without sending email.
   */
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.pathname === '/manual-check') {
      const auth = request.headers.get('Authorization') || '';
      const expected = env.PRINT_SERVER_SECRET || '';
      const sendEmail = expected && auth === `Bearer ${expected}`;
      const result = await Promise.all([
        checkAndAlert(env,         { dryRun: !sendEmail }),
        checkPrinterAndAlert(env,  { dryRun: !sendEmail }),
      ]);
      return Response.json({ heartbeat: result[0], printer: result[1] });
    }
    return new Response('esmkt offline-alert worker — see /manual-check', {
      headers: { 'Content-Type': 'text/plain' },
    });
  },
};

// ────────────────────────────────────────────────────────────────────────────

async function checkAndAlert(env, { dryRun = false } = {}) {
  const now = Date.now();

  // ── 1. Read settings (threshold + recipient) from KV ──────────────────────
  const settings = await readSettings(env);
  const thresholdMs = (Number(settings.printServerOfflineAlertMinutes) || 10) * 60 * 1000;

  const recipient = (settings.printServerAlertEmail || settings.contactEmail || '').trim();

  // ── 2. Read state from D1 ────────────────────────────────────────────────
  const state = await readState(env);
  const lastSeen      = state.last_heartbeat_ms;
  const lastAlertSent = state.last_alert_sent_ms;

  // Never heard from the server → no alert. (Ordering would already have
  // been blocked by the Settings toggle if the owner cares.)
  if (!lastSeen) {
    return { skipped: 'never_configured', now };
  }

  const gapMs = now - lastSeen;
  if (gapMs < thresholdMs) {
    return { skipped: 'within_threshold', gap_minutes: Math.floor(gapMs / 60000), threshold_minutes: thresholdMs / 60000 };
  }

  // ── 3. De-dupe: don't email more than once an hour ───────────────────────
  const ALERT_COOLDOWN_MS = 60 * 60 * 1000; // 1 hour
  if (lastAlertSent && (now - lastAlertSent) < ALERT_COOLDOWN_MS) {
    return { skipped: 'recently_alerted', last_alert_minutes_ago: Math.floor((now - lastAlertSent) / 60000) };
  }

  // ── 4. Need a recipient ──────────────────────────────────────────────────
  if (!recipient) {
    return { skipped: 'no_recipient_configured' };
  }

  // ── 5. Send the email ────────────────────────────────────────────────────
  if (dryRun) {
    return { would_send: true, recipient, gap_minutes: Math.floor(gapMs / 60000) };
  }

  const sendResult = await sendAlertEmail(env, recipient, lastSeen, gapMs);

  // ── 6. Record that we sent it (only on success) ──────────────────────────
  if (sendResult.ok) {
    await env.ORDERS_DB.batch([
      env.ORDERS_DB
        .prepare(`INSERT INTO print_server_state(key, value) VALUES ('last_alert_sent_ms', ?1)
                  ON CONFLICT(key) DO UPDATE SET value = excluded.value`)
        .bind(String(now)),
      env.ORDERS_DB
        .prepare(`INSERT INTO print_server_state(key, value) VALUES ('last_alert_recipient', ?1)
                  ON CONFLICT(key) DO UPDATE SET value = excluded.value`)
        .bind(recipient),
    ]);
  }

  return {
    sent: sendResult.ok,
    recipient,
    gap_minutes: Math.floor(gapMs / 60000),
    error: sendResult.error || null,
  };
}

async function readSettings(env) {
  if (!env.MENU_KV) return {};
  try {
    const raw = await env.MENU_KV.get('settings');
    return raw ? JSON.parse(raw) : {};
  } catch (_) {
    return {};
  }
}

async function readState(env) {
  const out = { last_heartbeat_ms: 0, last_alert_sent_ms: 0 };
  if (!env.ORDERS_DB) return out;
  try {
    const rows = await env.ORDERS_DB
      .prepare(`SELECT key, value FROM print_server_state
                WHERE key IN ('last_heartbeat_ms', 'last_alert_sent_ms')`)
      .all();
    for (const row of rows.results || []) {
      const n = parseInt(row.value, 10);
      if (Number.isFinite(n)) out[row.key] = n;
    }
  } catch (_) {}
  return out;
}

async function sendAlertEmail(env, to, lastSeenMs, gapMs) {
  if (!env.RESEND_API_KEY || !env.RESEND_FROM) {
    return { ok: false, error: 'RESEND_API_KEY / RESEND_FROM not configured' };
  }

  const lastSeenDate = new Date(lastSeenMs).toLocaleString('en-US', {
    timeZone: 'America/Los_Angeles',
    dateStyle: 'medium',
    timeStyle: 'short',
  });
  const minutes = Math.floor(gapMs / 60000);

  const subject = `Esmeralda Market: print server offline (${minutes} min)`;
  const text =
`The Esmeralda Market print server has not heartbeated in ${minutes} minutes.
Last seen: ${lastSeenDate} (Pacific time).

Online ordering is currently blocked if "Require Print Server for Orders"
is enabled in the admin Settings tab. Customers will see a message that
ordering is temporarily unavailable.

To resolve:
  1. Check the snackbar PC is powered on and connected to the internet.
  2. Check the print-server service is running:
       sudo systemctl status esmkt-print
     (Restart with: sudo systemctl restart esmkt-print)
  3. Visit ${env.SITE_URL || 'https://esmeraldamarket.com'}/admin.html → Settings
     to confirm the status indicator updates once the server reconnects.

This is an automated alert. You'll receive at most one of these per hour
while the server remains offline. The next alert will fire if the server
is still offline an hour from now.
`;

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from:    env.RESEND_FROM,
        to:      [to],
        subject,
        text,
      }),
    });
    if (!res.ok) {
      const body = await res.text();
      return { ok: false, error: `Resend ${res.status}: ${body.slice(0, 200)}` };
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: String(e && e.message || e) };
  }
}

// ────────────────────────────────────────────────────────────────────────────
// PRINTER-NOT-READY ALERT (separate from the print-server-offline alert)
// ────────────────────────────────────────────────────────────────────────────
//
// Triggered when the printer has been in a non-ready state (out of paper,
// jam, cover open, etc.) longer than settings.printerAlertMinutes.
// Recipient lookup chain: settings.printerAlertEmail → printServerAlertEmail
// → contactEmail. 1-hour cooldown to prevent spam during a sustained outage.
//
// Skips:
//   - never_configured       — no printer status payload received yet
//   - server_offline         — print server isn't online so the status is
//                              stale; the heartbeat-stale alert covers this
//   - currently_ready        — printer is ready; clear the unready latch so
//                              the next problem starts a fresh threshold
//   - within_threshold       — unready but for less than the threshold
//   - recently_alerted       — sent an alert within the last hour
//   - no_recipient_configured

async function checkPrinterAndAlert(env, { dryRun = false } = {}) {
  const now = Date.now();
  const settings = await readSettings(env);
  const thresholdMs = (Number(settings.printerAlertMinutes) || 3) * 60 * 1000;
  const recipient = (
    settings.printerAlertEmail ||
    settings.printServerAlertEmail ||
    settings.contactEmail || ''
  ).trim();

  const state = await readPrinterState(env);
  if (!state.has_status) return { skipped: 'never_configured' };
  if (!state.server_online) return { skipped: 'server_offline' };

  if (state.printer_ready) {
    // Clear the unready latch so the next problem gets a fresh threshold
    if (state.unready_since && env.ORDERS_DB) {
      await env.ORDERS_DB
        .prepare(`UPDATE print_server_state SET value='0' WHERE key='printer_unready_since'`)
        .run();
    }
    return { skipped: 'currently_ready' };
  }

  // Printer is unready. How long?
  if (!state.unready_since) {
    // Defensive: no latch even though printer is unready. The next heartbeat
    // will set it. Skip this tick.
    return { skipped: 'no_unready_latch_yet' };
  }
  const gapMs = now - state.unready_since;
  if (gapMs < thresholdMs) {
    return { skipped: 'within_threshold', gap_minutes: Math.floor(gapMs / 60000), threshold_minutes: thresholdMs / 60000 };
  }

  const ALERT_COOLDOWN_MS = 60 * 60 * 1000;
  if (state.last_alert_ms && (now - state.last_alert_ms) < ALERT_COOLDOWN_MS) {
    return { skipped: 'recently_alerted', last_alert_minutes_ago: Math.floor((now - state.last_alert_ms) / 60000) };
  }

  if (!recipient) return { skipped: 'no_recipient_configured' };
  if (dryRun) {
    return {
      would_send: true, recipient,
      gap_minutes: Math.floor(gapMs / 60000),
      problem: state.human_status,
    };
  }

  const sendResult = await sendPrinterAlertEmail(env, recipient, state, gapMs);
  if (sendResult.ok) {
    await env.ORDERS_DB.batch([
      env.ORDERS_DB
        .prepare(`INSERT INTO print_server_state(key, value) VALUES ('last_printer_alert_ms', ?1)
                  ON CONFLICT(key) DO UPDATE SET value = excluded.value`)
        .bind(String(now)),
      env.ORDERS_DB
        .prepare(`INSERT INTO print_server_state(key, value) VALUES ('last_printer_alert_recip', ?1)
                  ON CONFLICT(key) DO UPDATE SET value = excluded.value`)
        .bind(recipient),
    ]);
  }

  return {
    sent: sendResult.ok, recipient,
    gap_minutes: Math.floor(gapMs / 60000),
    problem: state.human_status,
    error: sendResult.error || null,
  };
}

async function readPrinterState(env) {
  const out = {
    has_status:      false,
    server_online:   false,
    printer_ready:   false,
    human_status:    'Unknown',
    unready_since:   0,
    last_alert_ms:   0,
  };
  if (!env.ORDERS_DB) return out;
  try {
    const rows = await env.ORDERS_DB
      .prepare(`SELECT key, value FROM print_server_state
                WHERE key IN (
                  'last_heartbeat_ms', 'printer_status_json',
                  'printer_unready_since', 'last_printer_alert_ms'
                )`)
      .all();
    let lastSeenMs = 0;
    let statusJson = null;
    for (const row of rows.results || []) {
      if (row.key === 'last_heartbeat_ms')        lastSeenMs        = parseInt(row.value, 10) || 0;
      if (row.key === 'printer_unready_since')    out.unready_since = parseInt(row.value, 10) || 0;
      if (row.key === 'last_printer_alert_ms')    out.last_alert_ms = parseInt(row.value, 10) || 0;
      if (row.key === 'printer_status_json')      statusJson        = row.value;
    }
    if (statusJson && statusJson !== '{}' && statusJson !== '') {
      try {
        const ps = JSON.parse(statusJson);
        out.has_status     = true;
        out.printer_ready  = ps.ready === true;
        out.human_status   = humanizeReasons(ps.reasons || [], ps.state || '', ps.enabled);
      } catch (_) {}
    }
    // server-online window matches the public status endpoint (90s)
    out.server_online = lastSeenMs > 0 && (Date.now() - lastSeenMs) < 90 * 1000;
  } catch (_) {}
  return out;
}

function humanizeReasons(reasons, state, enabled) {
  if (enabled === false) return 'Printer disabled';
  if (state === 'stopped') return 'Printer stopped';
  for (const r of reasons) {
    if (!r || r === 'none') continue;
    if (r.includes('queue-stuck'))         return 'Printer not responding (likely out of paper / jam / cover open)';
    if (r.includes('media-empty'))         return 'Out of paper';
    if (r.includes('media-jam'))           return 'Paper jam';
    if (r.includes('cover-open'))          return 'Cover open';
    if (r.includes('door-open'))           return 'Door open';
    if (r.includes('toner-empty'))         return 'Toner empty';
    if (r.includes('marker-supply-empty')) return 'Supply empty';
    if (r.includes('offline'))             return 'Printer offline';
    if (r.includes('connecting'))          return 'Connecting…';
    return 'Error: ' + r.replace(/-(error|warning|report)$/, '').replace(/-/g, ' ');
  }
  return 'Not ready';
}

async function sendPrinterAlertEmail(env, to, state, gapMs) {
  if (!env.RESEND_API_KEY || !env.RESEND_FROM) {
    return { ok: false, error: 'RESEND_API_KEY / RESEND_FROM not configured' };
  }
  const minutes = Math.floor(gapMs / 60000);
  const subject = `Esmeralda Market: printer needs attention — ${state.human_status}`;
  const text =
`The Esmeralda Market printer has been reporting "${state.human_status}" for ${minutes} minutes.

Online ordering is currently blocked if "Require Print Server for Orders"
is enabled in the admin Settings tab. Customers will see a generic message
that ordering is temporarily unavailable.

To resolve:
  1. At the snackbar PC, check the printer:
     - Out of paper:  load a new thermal roll.
     - Paper jam:     open the cover, clear the jam, close.
     - Cover open:    close the cover.
     - Other:         see admin Settings for the live status.
  2. The status indicator in admin Settings updates within ~30s once the
     printer recovers, and online ordering resumes automatically.

This is an automated alert. You'll receive at most one of these per hour
while the printer remains in this state.
`;
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ from: env.RESEND_FROM, to: [to], subject, text }),
    });
    if (!res.ok) {
      const body = await res.text();
      return { ok: false, error: `Resend ${res.status}: ${body.slice(0, 200)}` };
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: String(e && e.message || e) };
  }
}
