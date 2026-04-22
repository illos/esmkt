# Esmeralda Market — Print Server

A lightweight Node.js Express server that runs on the snackbar / register PC. When a customer places an order on `menu.html`, the web page can POST the order object to this server, which logs it to a local file and sends a formatted receipt to the system's default printer.

---

## What it does

1. Accepts `POST /print` requests containing a JSON order object (same shape produced by `order.js`).
2. Validates the order has the required fields (`id`, `customer_name`, `items`).
3. Appends the raw order as a newline-delimited JSON entry to `orders.log` in the server directory.
4. Formats a 40-character-wide plain-text receipt and sends it to the configured printer using `lp` (Linux/macOS) or PowerShell `Out-Printer` (Windows).
5. Responds `{ success: true, orderId }` on success.

---

## Prerequisites

- **Node.js 18+** — download from [nodejs.org](https://nodejs.org)
- **A printer** configured as the system default printer (or know the printer name to target it specifically)
- The snackbar PC must be on the same local network as the device customers use to order (or `localhost` if staff place orders on the same machine)

---

## Setup

### 1. Install dependencies

```bash
cd print-server
npm install
```

### 2. Set environment variables (optional)

| Variable         | Default | Description                                                      |
|------------------|---------|------------------------------------------------------------------|
| `PORT`           | `3000`  | Port the server listens on                                       |
| `ALLOWED_ORIGIN` | `*`     | CORS allowed origin — set to your site URL to restrict access    |

On Linux/macOS you can set them inline:

```bash
PORT=3000 ALLOWED_ORIGIN=https://esmeralda.market npm start
```

On Windows, set them in the `.env` file or in System Environment Variables, then run `npm start`.

### 3. Start the server

```bash
npm start
```

You should see:

```
  ╔══════════════════════════════════════╗
  ║     ESMERALDA PRINT SERVER           ║
  ╚══════════════════════════════════════╝

  Listening on   http://localhost:3000
  Printer        (system default)
  Allowed origin *
  Order log      /path/to/print-server/orders.log

  Ready to receive orders. Keep this window open.
```

### 4. (Optional) Select a specific printer

List all available printers:

```bash
node server.js --list-printers
```

Start the server targeting a named printer:

```bash
node server.js --printer "EPSON TM-T88VI"
```

---

## Environment Variables

| Variable         | Default | Required | Description                                          |
|------------------|---------|----------|------------------------------------------------------|
| `PORT`           | `3000`  | No       | TCP port the Express server binds to                 |
| `ALLOWED_ORIGIN` | `*`     | No       | Value sent in `Access-Control-Allow-Origin` header.  |
|                  |         |          | Set to your Cloudflare Pages URL to lock it down.    |

---

## API Endpoints

### `POST /print`

Receives an order and prints a receipt.

**Request body** — JSON object matching the order structure from `order.js`:

```json
{
  "id": "ESM-XXXXXXXX",
  "timestamp": "2025-04-21T18:30:00.000Z",
  "customer_name": "Jane Smith",
  "customer_phone": "775-555-0100",
  "pickup_time": "12:30 PM",
  "notes": "No onions please",
  "items": [
    {
      "id": 1,
      "name": "Classic Snackbar Sub",
      "base_price": 9.50,
      "options": [{ "name": "Bread", "choice": "Wheat" }],
      "addons": ["Avocado +$1", "Extra Cheese +$0.75"],
      "addons_total": 1.75
    }
  ],
  "subtotal": 11.25,
  "tax": 0.93,
  "total": 12.18,
  "taxRate": 8.25
}
```

**Success response:**

```json
{ "success": true, "orderId": "ESM-XXXXXXXX" }
```

**Error response (400):**

```json
{ "success": false, "error": "Missing required field: customer_name." }
```

---

### `GET /health`

Health check — confirms the server is running.

**Response:**

```json
{ "status": "ok", "timestamp": "2025-04-21T18:30:00.000Z" }
```

---

### `GET /printers`

Returns a list of printer names installed on this machine — useful during setup.

**Response:**

```json
{ "printers": ["EPSON TM-T88VI", "Microsoft Print to PDF"] }
```

---

## Order Log

Every accepted order is appended to `orders.log` in the print-server directory, one JSON object per line (newline-delimited JSON / NDJSON format). This gives you a local backup of all orders even if the web page doesn't store them elsewhere.

Example entry:

```
{"id":"ESM-LF5K2X","timestamp":"2025-04-21T18:30:00.000Z","customer_name":"Jane Smith",...,"_received":"2025-04-21T18:30:01.123Z"}
```

---

## Integration with order.js

In `js/order.js`, there is a commented-out `fetch` block inside `submitOrder()`. To enable print server integration, uncomment it:

```js
// 2. Send to local print server (Node.js running on deli PC):
fetch('http://localhost:3000/print', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(order),
});
```

The fetch is fire-and-forget (no `await`) so a slow or offline print server does not block the success screen from showing to the customer.

---

## Deployment Notes

### Keep the server running on the snackbar PC

**Option A — pm2 (recommended for Linux/macOS):**

```bash
npm install -g pm2
pm2 start server.js --name esmeralda-print
pm2 save
pm2 startup   # follow the instructions to start on boot
```

**Option B — Windows Task Scheduler or startup folder:**

Create a `.bat` file:

```bat
@echo off
cd /d "C:\path\to\print-server"
node server.js
```

Add it to the Windows Startup folder (`shell:startup`) or create a Task Scheduler task that runs on login.

**Option C — nodemon (development only):**

```bash
npm run dev
```

### Network access

If the customer-facing ordering page is served from the internet (Cloudflare Pages) and the print server runs on `localhost`, only staff placing orders on the same machine as the print server will trigger automatic printing. This is the intended use case — the snackbar staff place or review the order on the register PC where the print server runs.

If you want the print server to be reachable from other devices on the local network, start it with `PORT=3000` and use the local IP address in the fetch URL (e.g., `http://192.168.1.50:3000/print`).

Set `ALLOWED_ORIGIN` to the Cloudflare Pages URL to prevent other origins from sending print jobs.
