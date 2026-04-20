/**
 * Esmeralda Market — Local Print Server
 * ──────────────────────────────────────
 * Runs on the deli PC and receives order data from the web order page.
 * Formats a receipt and sends it to the system's default (or configured) printer.
 *
 * Usage:
 *   node server.js
 *   node server.js --printer "EPSON TM-T88VI"   (use a specific printer by name)
 *
 * Requires Node.js 16+ and npm packages: express, cors
 * Install once with:  npm install
 */

const express  = require('express');
const cors     = require('cors');
const { exec } = require('child_process');
const fs       = require('fs');
const path     = require('path');
const os       = require('os');

// ─── CONFIG ──────────────────────────────────────────────────────────────────

const PORT = 3000;

// Optional: set a specific printer name, or leave null to use system default.
// Find your printer name by running:  node server.js --list-printers
const PRINTER_NAME = getPrinterArg() || null;

// ─── APP SETUP ───────────────────────────────────────────────────────────────

const app = express();

// Allow requests from the order page (any origin, since it may be a local file or web server)
app.use(cors());
app.use(express.json());

// ─── ROUTES ──────────────────────────────────────────────────────────────────

/** Health check — confirms the server is running */
app.get('/', (req, res) => {
  res.json({
    status:  'ok',
    message: 'Esmeralda Print Server is running.',
    printer: PRINTER_NAME || '(system default)',
  });
});

/** List available printers — useful during setup */
app.get('/printers', (req, res) => {
  listPrinters((err, printers) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ printers });
  });
});

/** Receive an order and print it */
app.post('/print', (req, res) => {
  const order = req.body;

  // Basic validation
  if (!order || !order.id || !order.items) {
    return res.status(400).json({ success: false, error: 'Invalid order data.' });
  }

  const receipt  = formatReceipt(order);
  const tmpFile  = path.join(os.tmpdir(), `esmeralda-${order.id}.txt`);

  // Write receipt text to a temp file
  try {
    fs.writeFileSync(tmpFile, receipt, 'utf8');
  } catch (writeErr) {
    console.error('Could not write temp file:', writeErr.message);
    return res.status(500).json({ success: false, error: 'File write failed.' });
  }

  console.log(`\n[${new Date().toLocaleTimeString()}] Order received: ${order.id}`);
  console.log(`  Customer : ${order.customer_name} (${order.customer_phone})`);
  console.log(`  Items    : ${order.items.map(i => i.name).join(', ')}`);
  console.log(`  Total    : $${order.total.toFixed(2)}`);
  console.log(`  Printing to: ${PRINTER_NAME || 'system default'} ...`);

  printFile(tmpFile, (printErr) => {
    // Clean up temp file regardless of outcome
    try { fs.unlinkSync(tmpFile); } catch (_) {}

    if (printErr) {
      console.error('  Print failed:', printErr.message);
      return res.status(500).json({ success: false, error: printErr.message });
    }

    console.log('  Print job sent successfully.\n');
    res.json({ success: true, orderId: order.id });
  });
});

// ─── START ───────────────────────────────────────────────────────────────────

app.listen(PORT, () => {
  console.log('\n  ╔══════════════════════════════════════╗');
  console.log('  ║     ESMERALDA PRINT SERVER           ║');
  console.log('  ╚══════════════════════════════════════╝');
  console.log(`\n  Listening on  http://localhost:${PORT}`);
  console.log(`  Printer       ${PRINTER_NAME || '(system default)'}`);
  console.log('\n  Ready to receive orders. Keep this window open.\n');
  console.log('  Tip: run  node server.js --list-printers  to see available printers.');
  console.log('  Tip: run  node server.js --printer "Printer Name"  to pick one.\n');
});

// Handle --list-printers flag run before server starts
if (process.argv.includes('--list-printers')) {
  listPrinters((err, printers) => {
    if (err) { console.error('Could not list printers:', err.message); process.exit(1); }
    console.log('\nAvailable printers:');
    printers.forEach(p => console.log('  -', p));
    process.exit(0);
  });
}

// ─── PRINTING ────────────────────────────────────────────────────────────────

/**
 * Send a text file to the printer.
 * Uses PowerShell on Windows, lp on Mac/Linux.
 */
function printFile(filePath, callback) {
  const platform = os.platform();

  let cmd;

  if (platform === 'win32') {
    if (PRINTER_NAME) {
      // Print to a named printer silently via PowerShell
      cmd = `powershell -Command "Get-Content '${filePath}' | Out-Printer -Name '${PRINTER_NAME}'"`;
    } else {
      // Print to the default printer via PowerShell
      cmd = `powershell -Command "Get-Content '${filePath}' | Out-Printer"`;
    }
  } else {
    // macOS / Linux
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
 * Return a list of printer names on this machine.
 */
function listPrinters(callback) {
  const platform = os.platform();

  if (platform === 'win32') {
    const cmd = `powershell -Command "Get-Printer | Select-Object -ExpandProperty Name"`;
    exec(cmd, (err, stdout) => {
      if (err) return callback(err);
      const printers = stdout.split('\n').map(s => s.trim()).filter(Boolean);
      callback(null, printers);
    });
  } else {
    exec('lpstat -a 2>/dev/null || lpstat -p 2>/dev/null', (err, stdout) => {
      if (err) return callback(err);
      const printers = stdout.split('\n')
        .map(line => line.split(/\s+/)[0])
        .filter(Boolean);
      callback(null, printers);
    });
  }
}

// ─── RECEIPT FORMATTING ───────────────────────────────────────────────────────

/**
 * Format an order object as a plain-text receipt.
 * The 40-character width fits standard 80mm thermal receipt paper.
 */
function formatReceipt(order) {
  const W    = 40;            // receipt width in characters
  const WIDE = '='.repeat(W);
  const THIN = '-'.repeat(W);
  const d    = new Date(order.timestamp).toLocaleString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: 'numeric', minute: '2-digit',
  });

  function center(str) {
    const pad = Math.max(0, Math.floor((W - str.length) / 2));
    return ' '.repeat(pad) + str;
  }

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
  r += WIDE + '\n';
  r += '\n';

  // ── Pickup time — large and prominent at the top ──
  const pickupLabel = (order.pickup_time || 'AS SOON AS READY').toUpperCase();
  r += center('*** DESIRED PICKUP TIME ***') + '\n';
  r += center(pickupLabel) + '\n';
  r += WIDE + '\n';
  r += '\n';

  r += `Order # : ${order.id}\n`;
  r += `Time    : ${d}\n`;
  r += `Name    : ${order.customer_name}\n`;
  r += `Phone   : ${order.customer_phone}\n`;
  if (order.notes) {
    r += `Notes   : ${wordWrap(order.notes, W - 10, '          ')}\n`;
  }
  r += '\n';
  r += THIN + '\n';
  r += 'ITEMS\n';
  r += THIN + '\n';

  order.items.forEach(item => {
    r += row(truncate(item.name, W - 8), `$${item.base_price.toFixed(2)}`) + '\n';
    // Options (no price effect — show as "Bread: White")
    (item.options || []).forEach(opt => {
      r += `  > ${opt.name}: ${opt.choice}\n`;
    });
    item.addons.forEach(addon => {
      // Pull just the name without the +$ price for cleaner receipt
      const addonName = addon.replace(/\s*\+\$[\d.]+$/, '');
      const addonPrice = parseAddonPrice(addon);
      if (addonPrice > 0) {
        r += row(`  + ${truncate(addonName, W - 12)}`, `+$${addonPrice.toFixed(2)}`) + '\n';
      } else {
        r += `  + ${addonName}\n`;
      }
    });
  });

  r += '\n';
  r += THIN + '\n';
  r += row('Subtotal', `$${order.subtotal.toFixed(2)}`) + '\n';
  r += row('Tax (6.85%)', `$${order.tax.toFixed(2)}`) + '\n';
  r += WIDE + '\n';
  r += row('TOTAL', `$${order.total.toFixed(2)}`) + '\n';
  r += WIDE + '\n';
  r += '\n';
  r += center('Thank you for stopping by!') + '\n';
  r += center('Ride safe out there.') + '\n';
  r += '\n\n\n'; // Paper feed — gives space to tear

  return r;
}

// ─── UTILITIES ───────────────────────────────────────────────────────────────

function truncate(str, maxLen) {
  return str.length > maxLen ? str.slice(0, maxLen - 1) + '…' : str;
}

function wordWrap(str, width, indent) {
  const words = str.split(' ');
  let line = '', out = '';
  words.forEach(word => {
    if ((line + word).length > width) { out += '\n' + indent; line = ''; }
    line += (line ? ' ' : '') + word;
    out += (out && !out.endsWith('\n' + indent) ? '' : '') + word + ' ';
  });
  return out.trim();
}

function parseAddonPrice(label) {
  const m = String(label).match(/\+\$(\d+(?:\.\d+)?)/);
  return m ? parseFloat(m[1]) : 0;
}

function getPrinterArg() {
  const idx = process.argv.indexOf('--printer');
  return idx !== -1 ? process.argv[idx + 1] : null;
}
