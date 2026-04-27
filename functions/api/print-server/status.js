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
  let printerStatus = null;
  let printerStatusAt = 0;
  let printerUnreadySince = 0;

  // ── Preferred: D1 ────────────────────────────────────────────────────────
  if (env.ORDERS_DB) {
    try {
      const stateRows = await env.ORDERS_DB
        .prepare(`SELECT key, value FROM print_server_state
                  WHERE key IN (
                    'last_heartbeat_ms', 'print_server_version',
                    'printer_status_json', 'printer_status_at',
                    'printer_unready_since'
                  )`)
        .all();
      for (const row of stateRows.results || []) {
        if (row.key === 'last_heartbeat_ms')      lastSeen            = parseInt(row.value, 10) || 0;
        if (row.key === 'print_server_version')   version             = row.value || '';
        if (row.key === 'printer_status_json')    printerStatus       = safeParse(row.value);
        if (row.key === 'printer_status_at')      printerStatusAt     = parseInt(row.value, 10) || 0;
        if (row.key === 'printer_unready_since')  printerUnreadySince = parseInt(row.value, 10) || 0;
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

  // Printer health is meaningful only if we've seen a printer status payload
  // AND the print server is currently online (otherwise the status may be stale).
  const printer = computePrinterStatus({
    online, printerStatus, printerStatusAt, printerUnreadySince,
  });

  return json({
    configured,
    online,
    lastSeen: lastSeen || null,
    secondsSinceLastSeen: configured ? Math.floor(age / 1000) : null,
    version,
    pendingOrders,
    printer,
    // Convenience: what the menu page actually needs to gate ordering.
    // True only if both server is online AND printer is ready (or unknown
    // state but printer-required isn't toggled — the menu side checks that).
    ready: online && (printer.known ? printer.ready : true),
  });
}

function computePrinterStatus({ online, printerStatus, printerStatusAt, printerUnreadySince }) {
  // No status received yet
  if (!printerStatus || !printerStatusAt) {
    return { known: false, ready: false, human_status: 'Unknown', state: '', reasons: [], queued_jobs: 0, unready_since: null };
  }
  const ready  = printerStatus.ready === true;
  const human  = ready ? 'Ready' : humanizeReasons(printerStatus.reasons || [], printerStatus.state, printerStatus.enabled);
  return {
    known:        true,
    ready,
    human_status: ready ? 'Ready' : human,
    state:        printerStatus.state || '',
    reasons:      printerStatus.reasons || [],
    queued_jobs:  printerStatus.queued_jobs || 0,
    unready_since: printerUnreadySince || null,
    status_at:     printerStatusAt || null,
    status_stale:  online ? false : true, // payload is from the last heartbeat — meaningful only when server is online
  };
}

function humanizeReasons(reasons, state, enabled) {
  if (enabled === false) return 'Printer disabled';
  if (state === 'stopped') return 'Printer stopped';
  for (const r of reasons) {
    if (!r || r === 'none') continue;
    if (r.includes('queue-stuck'))   return 'Printer not responding (likely out of paper / jam / cover open)';
    if (r.includes('media-empty'))   return 'Out of paper';
    if (r.includes('media-jam'))     return 'Paper jam';
    if (r.includes('cover-open'))    return 'Cover open';
    if (r.includes('door-open'))     return 'Door open';
    if (r.includes('toner-empty'))   return 'Toner empty';
    if (r.includes('marker-supply-empty')) return 'Supply empty';
    if (r.includes('offline'))       return 'Printer offline';
    if (r.includes('connecting'))    return 'Connecting…';
    return 'Error: ' + r.replace(/-(error|warning|report)$/, '').replace(/-/g, ' ');
  }
  return 'Not ready';
}

function safeParse(s) {
  try { return JSON.parse(s); } catch (_) { return null; }
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}
