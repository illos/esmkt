/**
 * POST /api/orders/:id/reprint — admin-only "send this order back to the
 * snackbar printer" action. Used by the View modal in the Online Orders Log.
 *
 * Implementation: fetches the original order's payload, generates a fresh
 * id (so the print-server poll picks it up as a new pending row), and
 * inserts a new row with status='pending'. The original row is left
 * untouched — useful as a paper trail.
 *
 * Auth: admin HMAC (Bearer <ts>:<hex>).
 *
 * Response: { success: true, id: "<new_id>" }    (201)
 *           { error: "..." }                     (404 / 500 / 503)
 */

import {
  isAdminAuthorized,
  adminJson,
  adminUnauthorized,
  ADMIN_CORS,
} from '../../../_lib/admin-auth.js';

export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: ADMIN_CORS });
}

export async function onRequestPost({ request, env, params }) {
  if (!await isAdminAuthorized(request, env)) return adminUnauthorized();
  if (!env.ORDERS_DB) return adminJson({ error: 'Orders database is not configured.' }, 503);

  const id = params && params.id;
  if (!id) return adminJson({ error: 'Missing :id route param.' }, 400);

  // Pull the original order's payload.
  const row = await env.ORDERS_DB
    .prepare(`SELECT payload_json FROM orders WHERE id = ?1`)
    .bind(id)
    .first();

  if (!row) return adminJson({ error: 'Order not found.' }, 404);

  let payload;
  try {
    payload = JSON.parse(row.payload_json);
  } catch (_) {
    return adminJson({ error: 'Original order payload is unreadable.' }, 500);
  }

  // Fresh id, prefixed so admin can tell reprints apart from real customer
  // submissions in the log.
  const newId = `RPR-${Date.now().toString(36).toUpperCase()}`;
  const newPayload = { ...payload, id: newId, _reprint_of: id };

  try {
    await env.ORDERS_DB
      .prepare(`INSERT INTO orders (id, payload_json, status, created_at)
                VALUES (?1, ?2, 'pending', ?3)`)
      .bind(newId, JSON.stringify(newPayload), Date.now())
      .run();
  } catch (e) {
    return adminJson({ error: 'Could not enqueue reprint: ' + (e && e.message || e) }, 500);
  }

  return adminJson({ success: true, id: newId }, 201);
}
