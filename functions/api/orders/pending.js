/**
 * GET /api/orders/pending — print server polls this endpoint to fetch
 * orders that have not yet been printed.
 *
 * Auth: Authorization: Bearer ps:<PRINT_SERVER_SECRET>  (see _lib/ps-auth.js)
 * Required binding: ORDERS_DB (D1)
 *
 * Response shape:
 *   { orders: [{ id, payload, created_at }, ...] }
 *
 * Notes:
 *   - Returns at most 25 orders per call. The print server can call again
 *     immediately if it received a full batch.
 *   - Sorted oldest-first so customers wait their turn.
 *   - We also "claim" each row by writing status='claiming' inside a single
 *     SQL update — but D1 doesn't have UPDATE...RETURNING, so instead we
 *     just leave rows as 'pending' and rely on the print server to call
 *     POST /api/orders/:id/printed promptly. Stuck rows stay visible.
 */

import { isPrintServerAuthorized, psJson, psUnauthorized, PS_CORS } from '../../_lib/ps-auth.js';

export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: PS_CORS });
}

export async function onRequestGet({ request, env }) {
  if (!isPrintServerAuthorized(request, env)) return psUnauthorized();
  if (!env.ORDERS_DB) return psJson({ error: 'Orders database is not configured.' }, 503);

  const result = await env.ORDERS_DB
    .prepare(`SELECT id, payload_json, created_at
              FROM orders
              WHERE status = 'pending'
              ORDER BY created_at ASC
              LIMIT 25`)
    .all();

  const rows = result.results || [];
  const orders = rows.map(r => ({
    id:         r.id,
    created_at: r.created_at,
    payload:    safeParse(r.payload_json),
  }));

  return psJson({ orders });
}

function safeParse(s) {
  try { return JSON.parse(s); } catch (_) { return null; }
}
