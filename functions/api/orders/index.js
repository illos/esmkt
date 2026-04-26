/**
 * POST /api/orders — customer submits a snackbar order from menu.html.
 *
 * Public endpoint. Stores the order in D1 with status='pending' so the print
 * server (which polls /api/orders/pending) can pick it up, print it, and
 * mark it done.
 *
 * Required binding: ORDERS_DB (D1)
 *
 * Request body — JSON object built by js/menu.js submitOrder():
 *   {
 *     id, timestamp, customer_name, customer_phone, pickup_time, notes,
 *     items: [{ id, name, base_price, choices, options, options_total }],
 *     subtotal, tax, total, taxRate
 *   }
 *
 * Response: { success: true, id }   on accept (201)
 *           { error: "..." }        on validation failure (400)
 *
 * Notes:
 *   - We trust the order id from the client (Date-based ESM-XXXXXXXX). If
 *     two clients race and pick the same id, the second INSERT will fail
 *     with a unique-constraint error and we'll return 409 — the client
 *     can retry with a fresh id.
 *   - We do NOT recompute subtotal/tax/total here. Those are display-only;
 *     authoritative pricing happens at the snackbar when staff prepare the
 *     order. (The receipt printout shows the customer-side totals so any
 *     discrepancy is visible.)
 *   - We deliberately do not log anything sensitive to console — order
 *     payloads contain customer phone numbers.
 */

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: CORS });
}

export async function onRequestPost({ request, env }) {
  let order;
  try {
    order = await request.json();
  } catch (_) {
    return json({ error: 'Body must be JSON.' }, 400);
  }

  // ── Validate required fields ───────────────────────────────────────────
  const err = validate(order);
  if (err) return json({ error: err }, 400);

  if (!env.ORDERS_DB) {
    return json({ error: 'Orders database is not configured on this deployment.' }, 503);
  }

  // ── Persist ────────────────────────────────────────────────────────────
  // Trust the client-generated id; D1 unique constraint will catch collisions.
  try {
    await env.ORDERS_DB
      .prepare(`INSERT INTO orders (id, payload_json, status, created_at)
                VALUES (?1, ?2, 'pending', ?3)`)
      .bind(order.id, JSON.stringify(order), Date.now())
      .run();
  } catch (e) {
    // SQLite unique constraint violation
    const msg = String(e && e.message || e);
    if (/UNIQUE|already exists/i.test(msg)) {
      return json({ error: 'Order id collision — please retry.' }, 409);
    }
    return json({ error: 'Could not save order: ' + msg }, 500);
  }

  return json({ success: true, id: order.id }, 201);
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function validate(o) {
  if (!o || typeof o !== 'object')                    return 'Body must be a JSON object.';
  if (!o.id || typeof o.id !== 'string')              return 'Missing required field: id.';
  if (!/^[A-Z0-9-]{4,40}$/.test(o.id))                return 'id must be 4–40 uppercase alphanumerics or dashes.';
  if (!o.customer_name || typeof o.customer_name !== 'string') return 'Missing required field: customer_name.';
  if (o.customer_name.length > 200)                   return 'customer_name is too long.';
  if (!Array.isArray(o.items) || o.items.length === 0) return 'items must be a non-empty array.';
  if (o.items.length > 100)                           return 'items has too many entries.';
  // payload size guard — D1 row max is ~1MB but we want sane requests
  const size = JSON.stringify(o).length;
  if (size > 64 * 1024)                               return 'order payload is too large.';
  return null;
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}
