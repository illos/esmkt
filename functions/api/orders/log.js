/**
 * GET /api/orders/log?from=<unix_ms>&to=<unix_ms>
 *   Returns orders whose created_at falls in [from, to), sorted newest first.
 *   Auth: admin HMAC (Bearer <ts>:<hex>).
 *
 * Used by the "Online Orders Log" section in admin Settings. The client
 * fetches today's orders on open, then hits this endpoint with previous-day
 * windows when the user clicks "Load more".
 *
 * Response shape:
 *   {
 *     orders: [
 *       {
 *         id, status, created_at, printed_at, print_error,
 *         customer_name, customer_phone, total,
 *         payload  // full original order JSON, for the modal view
 *       },
 *       …
 *     ]
 *   }
 *
 * Hard cap of 500 rows per call. A snackbar averaging hundreds of orders
 * per day is a great problem to have; revisit pagination then.
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

  const url = new URL(request.url);
  const from = parseInt(url.searchParams.get('from'), 10);
  const to   = parseInt(url.searchParams.get('to'),   10);

  if (!Number.isFinite(from) || !Number.isFinite(to) || from >= to) {
    return adminJson({ error: 'Provide valid `from` and `to` query params (unix ms, from < to).' }, 400);
  }

  const result = await env.ORDERS_DB
    .prepare(`SELECT id, status, created_at, printed_at, print_error, payload_json
              FROM orders
              WHERE created_at >= ?1 AND created_at < ?2
              ORDER BY created_at DESC
              LIMIT 500`)
    .bind(from, to)
    .all();

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
