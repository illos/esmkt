/**
 * GET /api/orders/log
 *   Two modes (mutually exclusive — pick one):
 *
 *     ?from=<unix_ms>&to=<unix_ms>
 *       Range mode. Returns orders where created_at ∈ [from, to),
 *       sorted newest first, hard cap 500. Used for the initial
 *       "today's orders" load on Settings tab open.
 *
 *     ?before=<unix_ms>&limit=<n>
 *       Cursor mode. Returns the next N orders where created_at < before,
 *       sorted newest first. `limit` is clamped to 1..100. Used for the
 *       "Load 20 more" button.
 *
 *   Auth: admin HMAC (Bearer <ts>:<hex>).
 *
 *   Response shape:
 *     {
 *       orders: [
 *         {
 *           id, status, created_at, printed_at, print_error,
 *           customer_name, customer_phone, total,
 *           payload  // full original order JSON, for the modal view
 *         },
 *         …
 *       ]
 *     }
 */

import {
  isAdminAuthorized,
  adminJson,
  adminUnauthorized,
  ADMIN_CORS,
} from '../../_lib/admin-auth.js';

export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: ADMIN_CORS });
}

export async function onRequestGet({ request, env }) {
  if (!await isAdminAuthorized(request, env)) return adminUnauthorized();
  if (!env.ORDERS_DB) return adminJson({ error: 'Orders database is not configured.' }, 503);

  const url    = new URL(request.url);
  const before = parseInt(url.searchParams.get('before'), 10);
  const from   = parseInt(url.searchParams.get('from'),   10);
  const to     = parseInt(url.searchParams.get('to'),     10);

  let result;
  if (Number.isFinite(before)) {
    // Cursor mode: rows older than `before`, capped by `limit`.
    const rawLimit = parseInt(url.searchParams.get('limit'), 10);
    const limit    = Number.isFinite(rawLimit) ? Math.max(1, Math.min(100, rawLimit)) : 20;
    result = await env.ORDERS_DB
      .prepare(`SELECT id, status, created_at, printed_at, print_error, payload_json
                FROM orders
                WHERE created_at < ?1
                ORDER BY created_at DESC
                LIMIT ?2`)
      .bind(before, limit)
      .all();
  } else if (Number.isFinite(from) && Number.isFinite(to) && from < to) {
    // Range mode: rows in [from, to).
    result = await env.ORDERS_DB
      .prepare(`SELECT id, status, created_at, printed_at, print_error, payload_json
                FROM orders
                WHERE created_at >= ?1 AND created_at < ?2
                ORDER BY created_at DESC
                LIMIT 500`)
      .bind(from, to)
      .all();
  } else {
    return adminJson({ error: 'Provide either `from`+`to` (range mode) or `before`+`limit` (cursor mode).' }, 400);
  }

  const rows = result.results || [];
  const orders = rows.map(r => {
    const payload = safeParse(r.payload_json) || {};
    return {
      id:          r.id,
      status:      r.status,
      created_at:  r.created_at,
      printed_at:  r.printed_at,
      print_error: r.print_error,
      customer_name:  payload.customer_name  || '',
      customer_phone: payload.customer_phone || '',
      total:          typeof payload.total === 'number' ? payload.total : null,
      payload,
    };
  });

  return adminJson({ orders });
}

function safeParse(s) {
  try { return JSON.parse(s); } catch (_) { return null; }
}
