-- ============================================================================
--  Esmeralda Market — D1 schema
--  Apply with:
--    wrangler d1 execute esmeralda-orders --remote --file=./schema/d1_init.sql
--    wrangler d1 execute esmeralda-orders --local  --file=./schema/d1_init.sql
--
--  Re-running this file is safe — every CREATE/INSERT uses IF NOT EXISTS / OR IGNORE.
-- ============================================================================

-- ── ORDERS QUEUE ────────────────────────────────────────────────────────────
-- Customer-submitted orders waiting to be (or already) printed by the
-- snackbar print server. The print server polls /api/orders/pending,
-- prints each one, then POSTs /api/orders/:id/printed to mark it done.
--
-- payload_json holds the full order object as submitted by the menu page
-- (see js/menu.js submitOrder() — same shape print-server/server.js expects).
-- Storing it as JSON keeps the schema flexible if order fields evolve.
--
-- created_at and printed_at are unix-ms (Date.now()) for trivial sorting
-- and age comparisons.
CREATE TABLE IF NOT EXISTS orders (
  id           TEXT    PRIMARY KEY,           -- "ESM-XXXXXXXX"
  payload_json TEXT    NOT NULL,              -- full order JSON
  status       TEXT    NOT NULL DEFAULT 'pending', -- 'pending' | 'printed' | 'failed'
  created_at   INTEGER NOT NULL,              -- unix ms
  printed_at   INTEGER,                       -- unix ms when /printed was called
  print_error  TEXT                           -- last error from print server (if any)
);

-- Pending-order queue lookups (the print server's poll query).
CREATE INDEX IF NOT EXISTS idx_orders_status_created
  ON orders(status, created_at);

-- ── PRINT SERVER STATE ──────────────────────────────────────────────────────
-- A single-row table that holds the heartbeat timestamp and the last
-- offline-alert-sent timestamp. Using a key/value pattern so we can add
-- new fields without migrations.
CREATE TABLE IF NOT EXISTS print_server_state (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

-- Seed expected keys so reads never come back NULL.
INSERT OR IGNORE INTO print_server_state(key, value) VALUES
  ('last_heartbeat_ms',      '0'),  -- unix ms of most recent heartbeat
  ('last_alert_sent_ms',     '0'),  -- unix ms of most recent offline-alert email
  ('last_alert_recipient',   ''),   -- the email it was sent to (for log/debug)
  ('print_server_version',   '');   -- version reported by the heartbeat (informational)

-- ── HOUSEKEEPING ────────────────────────────────────────────────────────────
-- Optional: clean out printed orders older than 30 days. Run manually or
-- via a future scheduled task — not auto-pruned by the app code.
--
--   DELETE FROM orders
--   WHERE status = 'printed'
--     AND printed_at IS NOT NULL
--     AND printed_at < (strftime('%s','now') - 30*24*60*60) * 1000;
