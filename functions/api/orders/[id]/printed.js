/**
 * POST /api/orders/:id/printed — print server marks an order as printed
 * (or as failed, with an error message).
 *
 * Auth: Authorization: Bearer ps:<PRINT_SERVER_SECRET>  (see _lib/ps-auth.js)
 * Required binding: ORDERS_DB (D1)
 *
 * Body (optional):
 *   { error: "..." }   — if present, marks order as 'failed' with the message
 *   {}                 — marks order as 'printed' (default)
 *
 * Response: { success: true, status: 'printed' | 'failed' }
 *           404 if no such order id
 */

import { isPrintServerAuthorized, psJson, psUnauthorized, PS_CORS } from '../../../_lib/ps-auth.js';

export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: PS_CORS });
}

export async function onRequestPost({ request, env, params }) {
  if (!isPrintServerAuthorized(request, env)) return psUnauthorized();
  if (!env.ORDERS_DB) return psJson({ error: 'Orders database is not configured.' }, 503);

  const id = params && params.id;
  if (!id) return psJson({ error: 'Missing :id route param.' }, 400);

  let body = {};
  try { body = await request.json(); } catch (_) { /* empty body is fine */ }

  const printError = body && typeof body.error === 'string' ? body.error.slice(0, 500) : null;
  const newStatus  = printError ? 'failed' : 'printed';

  const result = await env.ORDERS_DB
    .prepare(`UPDATE orders
              SET status      = ?1,
                  printed_at  = ?2,
                  print_error = ?3
              WHERE id = ?4`)
    .bind(newStatus, Date.now(), printError, id)
    .run();

  // D1 returns meta.changes when ROWS_AFFECTED is supported
  const changes = result && result.meta && result.meta.changes;
  if (changes === 0) return psJson({ error: 'Order not found.' }, 404);

  return psJson({ success: true, status: newStatus });
}
