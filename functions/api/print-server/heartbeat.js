/**
 * POST /api/print-server/heartbeat — print server reports it's alive.
 *
 * Auth: Authorization: Bearer ps:<PRINT_SERVER_SECRET>  (see _lib/ps-auth.js)
 * Required binding: ORDERS_DB (D1)
 *
 * Body (all optional):
 *   {
 *     version: "1.2.3",
 *     printer: {
 *       state:       "idle" | "printing" | "stopped",
 *       reasons:     ["none"] | ["media-empty-error", ...],
 *       enabled:     true,
 *       queued_jobs: 0
 *     }
 *   }
 *
 * Behaviour:
 *   - Updates last_heartbeat_ms (+ print_server_version) every call.
 *   - If the body includes a `printer` object, persists printer_status_json
 *     and printer_status_at, then manages printer_unready_since:
 *       * if printer is currently unready and printer_unready_since == 0,
 *         set printer_unready_since = now (latch);
 *       * if printer is currently ready, clear printer_unready_since to 0.
 *     The cron-worker reads printer_unready_since to decide whether to send
 *     a "Printer not ready" alert email.
 *
 * Response:
 *   { ok: true, last_heartbeat_ms, server_time_ms, printer_ready }
 */

import { isPrintServerAuthorized, psJson, psUnauthorized, PS_CORS } from '../../_lib/ps-auth.js';

// State-reasons from CUPS we treat as "still ready" (warnings only). Anything
// not in this allowlist counts as a problem and flips printer_ready to false.
// "none" / "" mean explicitly fine.
const BENIGN_REASONS = new Set([
  'none',
  '',
  // low-supply warnings — printer is still printing, just nudge to refill soon
  'marker-supply-low-warning',
  'media-low-warning',
  'toner-low-warning',
]);

export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: PS_CORS });
}

export async function onRequestPost({ request, env }) {
  if (!isPrintServerAuthorized(request, env)) return psUnauthorized();
  if (!env.ORDERS_DB) return psJson({ error: 'Orders database is not configured.' }, 503);

  let body = {};
  try { body = await request.json(); } catch (_) { /* empty body is fine */ }

  const now     = Date.now();
  const version = body && typeof body.version === 'string' ? body.version.slice(0, 32) : '';

  // ── Always-updated keys ───────────────────────────────────────────────────
  const stmts = [
    env.ORDERS_DB
      .prepare(`INSERT INTO print_server_state(key, value) VALUES ('last_heartbeat_ms', ?1)
                ON CONFLICT(key) DO UPDATE SET value = excluded.value`)
      .bind(String(now)),
    env.ORDERS_DB
      .prepare(`INSERT INTO print_server_state(key, value) VALUES ('print_server_version', ?1)
                ON CONFLICT(key) DO UPDATE SET value = excluded.value`)
      .bind(version),
  ];

  // ── Optional printer-status block ─────────────────────────────────────────
  let printerReady = null; // null = no printer block submitted this call
  const p = body && body.printer;
  if (p && typeof p === 'object') {
    const state    = typeof p.state === 'string' ? p.state.slice(0, 32) : '';
    const enabled  = p.enabled !== false;
    const reasons  = Array.isArray(p.reasons) ? p.reasons.slice(0, 16).map(r => String(r).slice(0, 64)) : [];
    const jobs     = Number.isFinite(p.queued_jobs) ? p.queued_jobs : 0;

    printerReady = computePrinterReady(state, reasons, enabled);

    const status = { state, reasons, enabled, queued_jobs: jobs, ready: printerReady };
    stmts.push(env.ORDERS_DB
      .prepare(`INSERT INTO print_server_state(key, value) VALUES ('printer_status_json', ?1)
                ON CONFLICT(key) DO UPDATE SET value = excluded.value`)
      .bind(JSON.stringify(status)));
    stmts.push(env.ORDERS_DB
      .prepare(`INSERT INTO print_server_state(key, value) VALUES ('printer_status_at', ?1)
                ON CONFLICT(key) DO UPDATE SET value = excluded.value`)
      .bind(String(now)));

    // Latch printer_unready_since: read current value, only flip on transitions.
    const cur = await env.ORDERS_DB
      .prepare(`SELECT value FROM print_server_state WHERE key='printer_unready_since'`)
      .first();
    const since = cur ? parseInt(cur.value, 10) || 0 : 0;
    if (!printerReady && since === 0) {
      stmts.push(env.ORDERS_DB
        .prepare(`INSERT INTO print_server_state(key, value) VALUES ('printer_unready_since', ?1)
                  ON CONFLICT(key) DO UPDATE SET value = excluded.value`)
        .bind(String(now)));
    } else if (printerReady && since !== 0) {
      stmts.push(env.ORDERS_DB
        .prepare(`UPDATE print_server_state SET value='0' WHERE key='printer_unready_since'`));
    }
  }

  await env.ORDERS_DB.batch(stmts);

  return psJson({
    ok: true,
    last_heartbeat_ms: now,
    server_time_ms:    now,
    printer_ready:     printerReady,
  });
}

function computePrinterReady(state, reasons, enabled) {
  if (!enabled) return false;
  if (state === 'stopped') return false;
  for (const r of reasons || []) {
    if (!BENIGN_REASONS.has(r)) return false;
  }
  return true;
}
