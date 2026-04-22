/**
 * Esmeralda Market — Local Print Server
 * ──────────────────────────────────────
 * Runs on the snackbar PC. Receives order data from menu.html, logs each
 * order to orders.log (newline-delimited JSON), and sends a formatted receipt
 * to the system's default (or configured) printer.
 *
 * Usage:
 *   npm start                                         — use defaults
 *   PORT=3001 node server.js                          — custom port
 *   ALLOWED_ORIGIN=https://esmeralda.market node server.js
 *   node server.js --printer "EPSON TM-T88VI"        — pick a printer by name
 *   node server.js --list-printers                   — see available printers
 *
 * Requires Node.js 18+ and:  npm install
 */

const express  = require('express');
const cors     = require('cors');
const { exec } = require('child_process');
const fs       = require('fs');
const path     = require('path');
const os       = require('os');

// ─── CONFIG ──────────────────────────────────────────────────────────────────

// Port the server listens on. Override with PORT env var.
const PORT = parseInt(process.env.PORT, 10) || 3000;

// CORS origin. Set ALLOWED_ORIGIN env var to restrict to your site domain.
// Default '*' allows any origin (safe for localhost-only use).
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || '*';

// Optional: set a specific printer name via CLI arg, or use system default.
const PRINTER_NAME = getPrinterArg() || null;

// Path to the local order log file (one JSON object per line).
const LOG_FILE = path.join(__dirname, 'orders.log');

// ─── APP SETUP ───────────────────────────────────────────────────────────────

const app = express();

// Enable CORS — restricts which origins can POST to this server.
app.use(cors({ origin: ALLOWED_ORIGIN }));

// Parse incoming JSON bodies.
app.use(express.json());

// ─── ROUTES ──────────────────────────────────────────────────────────────────

/**
 * GET /health
 * Health check endpoint. Returns ok + timestamp so the web page can verify
 * the print server is reachable before attempting to send an order.
 */
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

/**
 * POST /print
 * Accepts a JSON order object from menu.html.
 * Required fields: id, customer_name, items (array).
 * Logs the order to orders.log, then sends it to the printer.
 */
app.post('/print', (req, res) => {
  const order = req.body;

  // ── Validate required fields ──────────────────────────────────────────────
  if (!order || typeof order !== 'object') {
    return res.status(400).json({ success: false, error: 'Request body must be a JSON object.' });
  }
  if (!order.id) {
    return res.status(400).json({ success: false, error: 'Missing required field: id.' });
  }
  if (!order.customer_name) {
    return res.status(400).json({ success: false, error: 'Missing required field: customer_name.' });
  }
  if (!Array.isArray(order.items) || !order.items.length) {
    return res.status(400).json({ success: false, error: 'Missing required field: items (must be a non-empty array).' });
  }

  // ── Log to orders.log (newline-delimited JSON) ────────────────────────────
  try {
    const logEntry = JSON.stringify({ ...order, _received: new Date().toISOString() });
    fs.appendFileSync(LOG_FILE, logEntry + '\n', 'utf8');
  } catch (logErr) {
    // Logging failure is non-fatal — proceed with printing.
    console.warn('[warn] Could not write to orders.log:', logErr.message);
  }

  // ── Format and print ──────────────────────────────────────────────────────
  const receipt = formatReceipt(order);
  const tmpFile = path.join(os.tmpdir(), `esmeralda-${order.id}.txt`);

  try {
    fs.writeFileSync(tmpFile, receipt, 'utf8');
  } catch (writeErr) {
    console.error('[error] Could not write temp file:', writeErr.message);
    return res.status(500).json({ success: false, error: 'File write failed.' });
  }

  // Log to console for visibility at the register
  console.log(`\n[${new Date().toLocaleTimeString()}] Order received: ${order.id}`);
  console.log(`  Customer : ${order.customer_name} (${order.customer_phone || '—'})`);
  console.log(`  Items    : ${order.items.map(i => i.name).join(', ')}`);
  if (order.total != null) console.log(`  Total    : $${Number(order.total).toFixed(2)}`);
  console.log(`  Printing to: ${PRINTER_NAME || 'system default'} ...`);

  printFile(tmpFile, (printErr) => {
    // Clean up temp file regardless of outcome
    try { fs.unlinkSync(tmpFile); } catch (_) {}

    if (printErr) {
      console.error('  [error] Print failed:', printErr.message);
      return res.status(500).json({ success: false, error: printErr.message });
    }

    console.log('  Print job sent successfully.\n');
    res.json({ success: true, orderId: order.id });
  });
});

/**
 * GET /printers
 * Returns a list of printer names installed on this machine — useful during setup.
 */
app.get('/printers', (req, res) => {
  listPrinters((err, printers) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ printers });
  });
});

// ─── START ───────────────────────────────────────────────────────────────────

// Handle --list-printers flag: print list and exit without starting the server.
if (process.argv.includes('--list-printers')) {
  listPrinters((err, printers) => {
    if (err) { console.error('Could not list printers:', err.message); process.exit(1); }
    console.log('\nAvailable printers:');
    printers.forEach(p => console.log('  -', p));
    process.exit(0);
  });
} else {
  app.listen(PORT, () => {
    console.log('\n  ╔══════════════════════════════════════╗');
    console.log('  ║     ESMERALDA PRINT SERVER           ║');
    console.log('  ╚══════════════════════════════════════╝');
    console.log(`\n  Listening on   http://localhost:${PORT}`);
    console.log(`  Printer        ${PRINTER_NAME || '(system default)'}`);
    console.log(`  Allowed origin ${ALLOWED_ORIGIN}`);
    console.log(`  Order log      ${LOG_FILE}`);
    console.log('\n  Ready to receive orders. Keep this window open.\n');
    console.log('  Tip: node server.js --list-printers  to see available printers.');
    console.log('  Tip: node server.js --printer "Name"  to select a specific printer.\n');
  });
}

// ─── PRINTING ────────────────────────────────────────────────────────────────

/**
 * Send a text file to the printer.
 * Uses PowerShell on Windows, lp on Linux/Mac.
 * @param {string}   filePath  Path to the temp receipt text file.
 * @param {Function} callback  Called with (err) on completion.
 */
function printFile(filePath, callback) {
  const platform = os.platform();
  let cmd;

  if (platform === 'win32') {
    // Windows: PowerShell Out-Printer
    cmd = PRINTER_NAME
      ? `powershell -Command "Get-Content '${filePath}' | Out-Printer -Name '${PRINTER_NAME}'"`
      : `powershell -Command "Get-Content '${filePath}' | Out-Printer"`;
  } else {
    // Linux / macOS: lp command
    cmd = PRINTER_NAME
      ? `lp -d "${PRINTER_NAME}" "${filePath}"`
      : `lp "${filePath}"`;
  }

  exec(cmd, (err, stdout, stderr) => {
    if (err) return callback(new Error(stderr || err.message));
    callback(null);
  });
}

/**
 * Return a list of printer names installed on this machine.
 * @param {Function} callback  Called with (err, printers[]).
 */
function listPrinters(callback) {
  if (os.platform() === 'win32') {
    exec(`powershell -Command "Get-Printer | Select-Object -ExpandProperty Name"`, (err, stdout) => {
      if (err) return callback(err);
      callback(null, stdout.split('\n').map(s => s.trim()).filter(Boolean));
    });
  } else {
    exec('lpstat -a 2>/dev/null || lpstat -p 2>/dev/null', (err, stdout) => {
      if (err) return callback(err);
      callback(null, stdout.split('\n').map(line => line.split(/\s+/)[0]).filter(Boolean));
    });
  }
}

// ─── RECEIPT FORMATTING ───────────────────────────────────────────────────────

/**
 * Format an order object as plain-text receipt.
 * 40-character width fits standard 80 mm thermal paper.
 * @param {Object} order  The order object from menu.html / order.js.
 * @returns {string}      Formatted receipt text ready to print.
 */
function formatReceipt(order) {
  const W    = 40;
  const WIDE = '='.repeat(W);
  const THIN = '-'.repeat(W);
  const d    = new Date(order.timestamp || Date.now()).toLocaleString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: 'numeric', minute: '2-digit',
  });

  // Center a string within the receipt width
  function center(str) {
    const pad = Math.max(0, Math.floor((W - str.length) / 2));
    return ' '.repeat(pad) + str;
  }

  // Two-column row: label left, value right, padded to width W
  function row(label, value) {
    const space = W - label.length - value.length;
    return label + ' '.repeat(Math.max(1, space)) + value;
  }

  let r = '';
  r += WIDE + '\n';
  r += center('ESMERALDA MARKET') + '\n';
  r += center('HWY 264, Mile Marker 8') + '\n';
  r += center('Dyer, NV  89010') + '\n';
  r += center('(775) 572-3200') + '\n';
  r += WIDE + '\n\n';

  // Pickup time — prominent at the top so staff see it immediately
  const pickupLabel = (order.pickup_time || 'AS SOON AS READY').toUpperCase();
  r += center('*** DESIRED PICKUP TIME ***') + '\n';
  r += center(pickupLabel) + '\n';
  r += WIDE + '\n\n';

  // Order metadata
  r += `Order # : ${order.id}\n`;
  r += `Time    : ${d}\n`;
  r += `Name    : ${order.customer_name}\n`;
  if (order.customer_phone) r += `Phone   : ${order.customer_phone}\n`;
  if (order.notes) r += `Notes   : ${order.notes}\n`;
  r += '\n' + THIN + '\n';
  r += 'ITEMS\n';
  r += THIN + '\n';

  // Line items
  order.items.forEach(item => {
    r += row(truncate(item.name, W - 8), `$${Number(item.base_price || 0).toFixed(2)}`) + '\n';
    // Options (choice selections — no price change)
    (item.options || []).forEach(opt => {
      r += `  > ${opt.name}: ${opt.choice}\n`;
    });
    // Add-ons (may affect price)
    (item.addons || []).forEach(addon => {
      const addonName  = addon.replace(/\s*\+\$[\d.]+$/, '');
      const addonPrice = parseAddonPrice(addon);
      if (addonPrice > 0) {
        r += row(`  + ${truncate(addonName, W - 12)}`, `+$${addonPrice.toFixed(2)}`) + '\n';
      } else {
        r += `  + ${addonName}\n`;
      }
    });
  });

  r += '\n' + THIN + '\n';
  r += row('Subtotal', `$${Number(order.subtotal || 0).toFixed(2)}`) + '\n';
  r += row(order.taxRate ? `Tax (${order.taxRate}%)` : 'Tax', `$${Number(order.tax || 0).toFixed(2)}`) + '\n';
  r += WIDE + '\n';
  r += row('TOTAL', `$${Number(order.total || 0).toFixed(2)}`) + '\n';
  r += WIDE + '\n\n';
  r += center('Thank you for stopping by!') + '\n';
  r += center('Ride safe out there.') + '\n';
  r += '\n\n\n'; // Feed paper so the receipt can be torn off cleanly

  return r;
}

// ─── UTILITIES ───────────────────────────────────────────────────────────────

/** Truncate a string to maxLen chars, adding ellipsis if needed. */
function truncate(str, maxLen) {
  return str.length > maxLen ? str.slice(0, maxLen - 1) + '\u2026' : str;
}

/** Extract the numeric dollar amount from an addon label like "Avocado +$1". */
function parseAddonPrice(label) {
  const m = String(label).match(/\+\$(\d+(?:\.\d+)?)/);
  return m ? parseFloat(m[1]) : 0;
}

/** Read --printer <name> from CLI args. */
function getPrinterArg() {
  const idx = process.argv.indexOf('--printer');
  return idx !== -1 ? process.argv[idx + 1] : null;
}
