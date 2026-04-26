/**
 * GET /api/print-server/status — public read of print-server liveness.
 *
 * Reads the most recent heartbeat from D1 (print_server_state table).
 * Falls back to the legacy KV `print_server_last_seen` key during the
 * KV→D1 migration (so deployments that haven't applied the D1 schema yet
 * still report sensibly). The KV fallback can be removed once the new
 * schema is applied in production.
 *
 * Required bindings: ORDERS_DB (D1, optional during migration), MENU_KV (legacy)
 *
 * Response shape:
 *   {
 *     configured: bool,           // ever heartbeated?
 *     online:     bool,           // last heartbeat < onlineWindowMs ago
 *     lastSeen:   number | null,  // unix ms
 *     secondsSinceLastSeen: number | null,
 *     version:    string,         // version reported on last heartbeat
 *     pendingOrders: number       // count of unprinted orders waiting (0 if no D1)
 *   }
 *
 * No auth — the menu page calls this to decide whether to allow ordering,
 * and the admin page polls it for the status indicator.
 */

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

// "Online" if a heartbeat has been received within this many ms.
// 90s allows missing 2 of the 30s heartbeats before flipping to offline.
const ONLINE_WINDOW_MS = 90 * 1000;

export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: CORS });
}

export async function onRequestGet({ env }) {
  let lastSeen = 0;
  let version  = '';
  let pendingOrders = 0;

  // ── Preferred: D1 ────────────────────────────────────────────────────────
  if (env.ORDERS_DB) {
    try {
      const stateRows = await env.ORDERS_DB
        .prepare(`SELECT key, value FROM print_server_state
                  WHERE key IN ('last_heartbeat_ms', 'print_server_version')`)
        .all();
      for (const row of stateRows.results || []) {
        if (row.key === 'last_heartbeat_ms')    lastSeen = parseInt(row.value, 10) || 0;
        if (row.key === 'print_server_version') version  = row.value || '';
      }
      const pending = await env.ORDERS_DB
        .prepare(`SELECT COUNT(*) AS n FROM orders WHERE status = 'pending'`)
        .first();
      pendingOrders = (pending && pending.n) || 0;
    } catch (_) {
      // D1 binding present but schema not applied yet — fall through to KV.
    }
  }

  // ── Legacy fallback: KV ──────────────────────────────────────────────────
  if (!lastSeen && env.MENU_KV) {
    try {
      const kvRaw = await env.MENU_KV.get('print_server_last_seen');
      if (kvRaw) lastSeen = parseInt(kvRaw, 10) || 0;
    } catch (_) {}
  }

  const age        = lastSeen ? Date.now() - lastSeen : Infinity;
  const configured = lastSeen > 0;
  const online     = configured && age < ONLINE_WINDOW_MS;

  return json({
    configured,
    online,
    lastSeen: lastSeen || null,
    secondsSinceLastSeen: configured ? Math.floor(age / 1000) : null,
    version,
    pendingOrders,
  });
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}
