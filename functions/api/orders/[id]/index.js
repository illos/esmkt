/**
 * DELETE /api/orders/:id — remove an order from the log entirely.
 *
 * Used by the trash button next to each row in the admin Online Orders Log.
 * Hard delete (the row is gone, not soft-flagged), so the order id can be
 * re-used by future entries without collision concerns.
 *
 * Auth: admin HMAC (Bearer <ts>:<hex>).
 *
 * Response: { success: true }     (200)
 *           404 if no such id
 *
 * Note: an order that's currently 'pending' could still be picked up by the
 * print server in the few seconds between when the admin clicks delete and
 * when the row is removed. Worst case it gets printed once and disappears
 * from the log — the staff at the snackbar can simply discard the receipt.
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

export async function onRequestDelete({ request, env, params }) {
  if (!await isAdminAuthorized(request, env)) return adminUnauthorized();
  if (!env.ORDERS_DB) return adminJson({ error: 'Orders database is not configured.' }, 503);

  const id = params && params.id;
  if (!id) return adminJson({ error: 'Missing :id route param.' }, 400);

  const result = await env.ORDERS_DB
    .prepare(`DELETE FROM orders WHERE id = ?1`)
    .bind(id)
    .run();

  const changes = result && result.meta && result.meta.changes;
  if (changes === 0) return adminJson({ error: 'Order not found.' }, 404);

  return adminJson({ success: true });
}
