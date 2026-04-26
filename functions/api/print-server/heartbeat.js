/**
 * POST /api/print-server/heartbeat — print server reports it's alive.
 *
 * Auth: Authorization: Bearer ps:<PRINT_SERVER_SECRET>  (see _lib/ps-auth.js)
 * Required binding: ORDERS_DB (D1)
 *
 * Body (optional):
 *   { version: "1.2.3" }   — version reported by the print server (informational)
 *
 * Behaviour:
 *   - Updates print_server_state.last_heartbeat_ms to now (every call writes).
 *   - D1 free tier handles 100k writes/day, so a 30-second cadence (~2880/day)
 *     fits comfortably.
 *
 * Response:
 *   { ok: true, last_heartbeat_ms: <ms>, server_time_ms: <ms> }
 */

import { isPrintServerAuthorized, psJson, psUnauthorized, PS_CORS } from '../../_lib/ps-auth.js';

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

  // Two upserts in a single batch — D1 supports batch() for atomicity.
  await env.ORDERS_DB.batch([
    env.ORDERS_DB
      .prepare(`INSERT INTO print_server_state(key, value) VALUES ('last_heartbeat_ms', ?1)
                ON CONFLICT(key) DO UPDATE SET value = excluded.value`)
      .bind(String(now)),
    env.ORDERS_DB
      .prepare(`INSERT INTO print_server_state(key, value) VALUES ('print_server_version', ?1)
                ON CONFLICT(key) DO UPDATE SET value = excluded.value`)
      .bind(version),
  ]);

  return psJson({ ok: true, last_heartbeat_ms: now, server_time_ms: now });
}
