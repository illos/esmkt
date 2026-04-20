================================================================================
  ESMERALDA MARKET — WEBSITE PROJECT
  HWY 264 MM8, Dyer, NV 89010  |  775-572-3200
================================================================================

PROJECT OVERVIEW
----------------
A website for Esmeralda Market: a public-facing homepage, a deli ordering page,
an admin panel for managing menu items, and a local Node.js print server for
the deli PC. The site is designed to be hosted on Cloudflare Pages (free tier).


--------------------------------------------------------------------------------
FILE STRUCTURE
--------------------------------------------------------------------------------

  index.html                  Homepage  
  order.html                  Deli order page
  admin.html                  Admin panel (menu management)
  readme.txt                  This file
  _headers                    Cloudflare Pages HTTP headers config

  functions/
    api/
      auth.js                 POST /api/auth  — password login, returns token
      menu.js                 GET/POST/PUT/DELETE /api/menu  — menu CRUD
      upload.js               POST /api/upload  — image upload to R2
    images/
      [filename].js           GET /images/:filename  — serve images from R2

  print-server/
    server.js                 Node.js local print server (runs on deli PC)
    package.json              Node dependencies
    start.bat                 Windows double-click launcher


--------------------------------------------------------------------------------
WHAT'S BEEN BUILT
--------------------------------------------------------------------------------

  index.html — Homepage
  ─────────────────────
  - Sticky navigation with logo, live open/closed status pill, phone number,
    and "Order Deli" call-to-action button.
  - Open/Closed logic: reads the device clock. Shows "Open Now" (green) if
    between 8:30 AM–7:30 PM, or "Opens at 8:30 AM" (gray) otherwise.
    Refreshes every minute automatically.
  - Hero section: branding, short market description, two CTAs (phone + order).
  - Hours section: Market/Gas/RV hours and Deli hours cards.
  - Services grid: 24-Hr Fuel, Deli, Cold Drinks, Ice, Beer, Fireworks,
    Restrooms, Free WiFi.
  - Find Us section: address with Google Maps button.
  - Fully responsive.


  order.html — Deli Order Page
  ─────────────────────────────
  - Loads the menu from GET /api/menu at page load.
    Falls back to a hardcoded menu if the API is unreachable (e.g., local dev).
  - Shows actual item photos from /images/{filename} when uploaded.
  - Deli hours check: outside 9 AM–3 PM Mon–Sat, a "Deli is Closed" banner
    replaces the order form. The menu grid remains visible at all times.
  - Order panel: itemized cart, tax (6.85%), and grand total.
  - Checkout form: name, phone, pickup time selector, special notes.
  - Receipt: desired pickup time shown prominently at top, then items,
    totals, and customer info. Includes a Print Receipt button.
  - TODO stubs in submitOrder() for Google Sheets logging and print server.


  admin.html — Menu Admin Panel
  ──────────────────────────────
  - Three-state single page: Login → Item List → Add/Edit Form.
  - Password-only login. Token stored in sessionStorage (8-hour expiry).
  - Menu list: thumbnail, name, price, add-on count, Edit/Delete buttons.
  - Add/Edit form:
      - Item name and price
      - Description textarea
      - Photo upload: drag-and-drop or click to browse. Previews image
        before upload. Can remove existing photo. Uploads on save.
      - Add-ons editor: each add-on is split into a name field and a price
        field, then serialized back to the "Name +$Price" string format.
  - Delete confirmation modal.
  - All changes go to Cloudflare KV via the API. Photos go to R2.
  - The admin panel is marked noindex/nofollow via the _headers file.


  functions/ — Cloudflare Pages Functions (serverless backend)
  ─────────────────────────────────────────────────────────────

  POST /api/auth
    Body: { password }
    Returns: { token }  — a timestamp:HMAC-SHA256 string, valid 8 hours.
    Requires env var: ADMIN_PASSWORD, AUTH_SECRET

  GET /api/menu  (public)
    Returns: { items: [...] }
    Seeds default 8 items into KV on first call if empty.

  POST /api/menu  (auth required)
    Body: item object (no id needed)
    Returns: created item with assigned id.

  PUT /api/menu  (auth required)
    Body: full item object including id.
    Returns: updated item.

  DELETE /api/menu  (auth required)
    Body: { id }
    Returns: { success: true }

  POST /api/upload  (auth required)
    Body: multipart/form-data with "file" field and optional "itemName".
    Allowed types: JPEG, PNG, WebP, GIF. Max size: 5 MB.
    Returns: { filename }  — filename is slug-timestamp.ext

  GET /images/:filename
    Serves image from R2 with immutable cache headers.


  print-server/ — Local Print Server
  ────────────────────────────────────
  - Node.js/Express server on http://localhost:3000
  - POST /print: receives order JSON, formats 40-char wide receipt, prints.
  - GET /printers: lists printers available on the machine.
  - Windows: PowerShell Out-Printer. Mac/Linux: lp command.
  - Receipt highlights "Desired Pickup Time" prominently at the top.


--------------------------------------------------------------------------------
CLOUDFLARE PAGES SETUP
--------------------------------------------------------------------------------

This site uses Cloudflare Pages for hosting plus two Cloudflare services for
the backend: KV (menu data) and R2 (uploaded photos).

STEP 1 — Deploy to Cloudflare Pages
  1. Push all files to a GitHub (or GitLab) repository.
  2. Log into dash.cloudflare.com → Pages → Create a project.
  3. Connect your GitHub repo. No build command needed (it's all static).
     Set the output directory to: / (root).
  4. Click Save and Deploy. Cloudflare will give you a .pages.dev URL.

STEP 2 — Create a KV Namespace (menu storage)
  1. In the Cloudflare dashboard, go to Workers & Pages → KV.
  2. Click "Create a namespace". Name it something like: esmeralda-menu
  3. Go to your Pages project → Settings → Functions → KV namespace bindings.
  4. Add a binding:
       Variable name:  MENU_KV
       KV namespace:   esmeralda-menu  (select from dropdown)
  5. Save.

STEP 3 — Create an R2 Bucket (photo storage)
  1. In the Cloudflare dashboard, go to R2.
  2. Click "Create bucket". Name it something like: esmeralda-images
  3. Go to your Pages project → Settings → Functions → R2 bucket bindings.
  4. Add a binding:
       Variable name:  IMAGES_BUCKET
       R2 bucket:      esmeralda-images  (select from dropdown)
  5. Save.

STEP 4 — Set Environment Variables (secrets)
  1. Go to your Pages project → Settings → Environment variables.
  2. Add two variables (mark both as "Encrypted"):

       ADMIN_PASSWORD   — the password you'll use to log into admin.html
                          (choose something secure, e.g. a random word + number)

       AUTH_SECRET      — a long random string used to sign login tokens
                          (generate one at: https://randomkeygen.com or any
                          password manager — it never needs to be typed by hand)

  3. Save.

STEP 5 — Redeploy
  After adding bindings and environment variables, go to your Pages project
  and trigger a new deployment (or just push any small commit). The new
  Functions will pick up the KV, R2, and env var bindings automatically.

STEP 6 — Test the admin panel
  1. Visit https://your-site.pages.dev/admin.html
  2. Log in with the ADMIN_PASSWORD you set.
  3. Try adding a menu item and uploading a photo.
  4. Visit the order page — the item should appear.

NOTES:
  - The functions/ folder must be at the root of your repo alongside index.html.
  - Function file paths map directly to URL routes:
      functions/api/auth.js     → /api/auth
      functions/api/menu.js     → /api/menu
      functions/api/upload.js   → /api/upload
      functions/images/[filename].js → /images/*
  - Cloudflare's free tier includes 100,000 KV reads/day and 1 GB R2 storage,
    which is more than enough for a small market deli.


--------------------------------------------------------------------------------
HOW TO SET UP THE PRINT SERVER (Local Deli PC)
--------------------------------------------------------------------------------

Prerequisites:
  - Node.js 16 or higher on the deli PC.
    Download from: https://nodejs.org (choose the LTS version).

Step 1 — First-time install:
  - Copy the print-server/ folder onto the deli PC.
  - On Windows: double-click start.bat.
    It automatically runs "npm install" on first launch.
  - On Mac/Linux: open a terminal in the print-server folder and run:
      npm install
      node server.js

Step 2 — Find your printer name (optional):
  - Run: node server.js --list-printers
  - Copy the exact printer name shown.

Step 3 — Start the server:
  - Windows: double-click start.bat  (or: node server.js)
  - Specific printer: node server.js --printer "EPSON TM-T88VI"
  - Keep the terminal window open while the deli is open.

Step 4 — Test it:
  - Visit http://localhost:3000 — should show { "status": "ok", ... }

Step 5 — Connect order.html to the print server:
  In order.html, find the submitOrder() function and uncomment:

    fetch('http://localhost:3000/print', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(order),
    });

  NOTE: "localhost" only works when the customer is ordering from the deli PC
  itself. If customers order from their own phones, use the deli PC's local
  network IP instead (e.g., http://192.168.1.X:3000/print).
  Find the PC's local IP with:  ipconfig (Windows) or ifconfig (Mac/Linux).

To auto-start on Windows boot:
  - Press Win + R, type shell:startup, press Enter.
  - Create a shortcut to start.bat in that folder.


--------------------------------------------------------------------------------
WHAT STILL NEEDS TO BE DONE
--------------------------------------------------------------------------------

1. CONNECT ORDER PAGE TO PRINT SERVER
   Uncomment the fetch to localhost:3000/print in order.html's submitOrder().
   (See Step 5 in the print server section above.)

2. GOOGLE SHEETS ORDER LOGGING
   In order.html, uncomment the Google Sheets fetch in submitOrder() once you
   have a deployed Apps Script Web App. The Apps Script code is documented in
   the previous version of this readme. Steps:
     a. Create a Google Sheet with order columns.
     b. Add a doPost() Apps Script function (see older readme or ask for help).
     c. Deploy as a Web App (Anyone can access).
     d. Replace YOUR_DEPLOYMENT_ID in the fetch URL.

3. HERO PHOTO (homepage)
   The homepage hero uses a gradient background. To add a real photo:
   In index.html, find the .hero CSS rule and add:
     background-image: url('your-photo.jpg');
   Upload the photo alongside index.html.

4. ORDER CONFIRMATION — SMS OR EMAIL (optional)
   Future enhancement: Twilio (SMS) or SendGrid (email) can notify the
   customer when their order is received. Both have free tiers.


--------------------------------------------------------------------------------
DESIGN NOTES
--------------------------------------------------------------------------------

Colors:
  Gold (primary accent)  #C9A96E
  Gold dark              #8B6B3A
  Charcoal (background)  #1A1A1A
  Charcoal card          #2C2B28
  Cream (text)           #F0EBE0
  Cream dim (secondary)  #B8B0A0

Fonts (Google Fonts):
  Oswald         — headings, labels, navigation, UI elements
  Source Sans 3  — body text

All pages share the same CSS variables and visual language. To change a color
site-wide, update the :root block at the top of each file.

All files are single-file HTML (CSS + JS inline). Any text editor works.
The print-server/ folder never goes online — it's PC-only.


--------------------------------------------------------------------------------
CONTACT / PROJECT NOTES
--------------------------------------------------------------------------------

Market:   Esmeralda Market
Address:  HWY 264, Mile Marker 8, Dyer, NV 89010
Phone:    775-572-3200
Maps:     https://maps.app.goo.gl/dhU5oMRYwXpTUhmY9

================================================================================
