/**
 * GET /api/print-server/status — placeholder endpoint for the future print
 * server integration. Today this always returns { configured: false, online: false }.
 *
 * Future shape (when the print server is wired up):
 *   GET  /api/print-server/status     → { configured, online, lastSeen, pendingOrders }
 *   POST /api/print-server/heartbeat  → (auth'd from the print-server PC)
 *                                       updates lastSeen, marks it online
 *
 * The print server itself will be a Node process running on a PC at the store
 * that polls this worker for pending orders and sends them to a receipt printer.
 * See readme.txt "Future integration: print server" section.
 *
 * No auth required on GET — the status is public (it gates online ordering,
 * and the menu page needs to know before auth happens).
 */

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: CORS });
}

export async function onRequestGet({ env }) {
  // Placeholder: check whether any heartbeat has ever been received.
  // For now we report as not configured; menu.js treats `configured: false`
  // as a pass-through (ordering is allowed if printServerRequired is off).
  const lastSeenRaw = await env.MENU_KV.get('print_server_last_seen');
  const lastSeen = lastSeenRaw ? parseInt(lastSeenRaw, 10) : 0;
  const age = Date.now() - lastSeen;
  const configured = lastSeen > 0;
  // Consider "online" if we've heard from it in the last 3 minutes
  const online = configured && age < 3 * 60 * 1000;

  return json({
    configured,
    online,
    lastSeen: lastSeen || null,
    // Seconds since last heartbeat, or null if never seen
    secondsSinceLastSeen: configured ? Math.floor(age / 1000) : null,
  });
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}
