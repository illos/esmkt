================================================================================
  ESMERALDA MARKET — WEBSITE PROJECT
  HWY 264 MM8, Dyer, NV 89010  |  775-572-3200
  Live:    https://esmeraldamarket.com
  Staging: https://esmkt.pages.dev
================================================================================


--------------------------------------------------------------------------------
PROJECT OVERVIEW
--------------------------------------------------------------------------------

A full-featured website for Esmeralda Market — a gas station, grocery, and
snackbar in Fish Lake Valley, Nevada. Hosted on Cloudflare Pages (free tier)
with a serverless backend using:

  - Cloudflare Pages Functions  (API routes — no separate server needed)
  - Cloudflare KV               (key-value store for settings, menu, events)
  - Cloudflare R2               (object storage for uploaded images)

No build step. All files are plain HTML, CSS, and JavaScript. To deploy, push
the repo or run "wrangler pages deploy .".

A separate print server project lives in print-server/ and runs locally on the
snackbar register PC to print order receipts. See print-server/README.md.


--------------------------------------------------------------------------------
FILE STRUCTURE
--------------------------------------------------------------------------------

  index.html              Homepage
  menu.html               Snackbar order / menu page
  admin.html              Admin panel (password-protected)
  contact.html            Contact form page
  readme.txt              This file
  wrangler.toml           Cloudflare bindings config (KV + R2)
  _headers                Cloudflare Pages HTTP headers (noindex on /admin)

  css/
    base.css              Shared: CSS variables, nav, nav overlay, footer,
                          global button styles, responsive breakpoints
    index.css             Homepage-specific styles (hero, explore section,
                          hours cards, events grid, service banners, footer)
    order.css             Snackbar order/menu page styles (menu cards,
                          cart, checkout form, receipt, toast, floating cart)
    admin.css             Admin panel styles (tabs, tables, form cards,
                          image upload areas, drag handles, modals)
    contact.css           Contact page styles (form layout, success state)

  js/
    nav.js                Shared across all pages: DEFAULT_LINKS constant,
                          nav overlay toggle/close, renderNavLinks() renders
                          links in overlay + footer. Fetches /api/settings
                          on non-index pages to get fresh link list from KV.
    index.js              Homepage: applySiteInfo(), renderLinks(),
                          renderHoursCards(), updateStoreStatus(),
                          renderEvents(), scroll-driven trail animation,
                          hero bg photo patching.
    order.js              Snackbar order page: menu loading, hours check
                          (checkSnackbarHours), cart, tax calculation,
                          order submission, receipt building, print menu.
    admin.js              Admin panel: auth, all tab logic (settings, hours,
                          menu CRUD with drag-and-drop, events CRUD),
                          image upload, links admin (renderAdminLinks,
                          collectAdminLinks, saveLinks, addLink, removeLink).
    contact.js            Contact page: Turnstile widget render, form submit,
                          success/error state.

  functions/
    api/
      auth.js             POST /api/auth       — login, issues HMAC token
      menu.js             CRUD /api/menu       — menu items + categories
      upload.js           POST /api/upload     — image upload to R2
      settings.js         GET/PUT /api/settings — all site settings (KV)
      contact.js          POST /api/contact    — Turnstile verify + Resend
      events.js           CRUD /api/events     — events list
    images/
      [filename].js       GET /images/:filename — serve images from R2

  assets/
    emskt-logo-inline.webp    Horizontal logo (nav)
    esmeralda-logo.webp       Full stacked logo (footer)
    topo-white.svg            Topo contour texture (light, used on dark bgs)
    black-topo.svg            Topo contour texture (dark, used on light bgs)
    landscape.jpg             Default hero background photo
    store-photo.jpg           Store exterior photo (hero left column)
    fish-lake-valley-1.webp   Explore section hero image
    hotsprings.webp           Fish Lake Valley Hot Springs card
    trail-canyon-resevior.webp  Trail Canyon Reservoir card
    boundery-1.webp           Boundary Peak card
    bristlecone-pine-forest.webp  Bristlecone Pine Forest card

  print-server/
    server.js             Express print server (runs on snackbar/register PC)
    package.json          Node.js project file
    README.md             Full setup and usage guide
    orders.log            Auto-created: one JSON order per line (NDJSON)


--------------------------------------------------------------------------------
PAGES
--------------------------------------------------------------------------------

index.html — Homepage
─────────────────────
The main public-facing page. Structured top-to-bottom:

  NAV
    Fixed CSS-grid nav: status pill (left) | logo (center) | hamburger (right).
    Hamburger opens a slide-in overlay panel populated with site links from KV.

  OPEN/CLOSED STATUS PILL
    Reads device clock against store hours from KV. Shows:
      "Open Now"             — green, pulsing dot
      "Opens 8:30 AM"        — gold (before opening)
      "Opens 8:30 AM Tomorrow" — gold (after closing)
    Updates every 60 seconds via setInterval.

  HERO SECTION (hero-v2)
    Two-column layout on desktop (text left, photo right), stacked on mobile.
    - Left: logo, store name, tagline, description, CTA buttons (call + order)
    - Right: background landscape photo + store exterior pop-out photo
    - Floating links panel on desktop / 2-column grid below text on mobile
    - Hero background photo, description, button text/link all configurable
      via admin Settings tab.

  LINKS PANEL
    Links stored in KV as quickLinks array. Rendered in:
      1. Hero links panel (homepage only)
      2. Nav overlay (all pages)
      3. Footer (all pages)

  SNACKBAR BANNER
    Teal-green gradient banner between hero and events.

  EVENTS SECTION
    Pulled from GET /api/events. Hidden (display:none) if no events exist.
    First event is "featured" (full-width, text left / image right).
    Subsequent events shown as standard cards (image top, text bottom).
    Below events: Facebook follow strip.

  FIREWORKS BANNER
    Red-gradient banner (sold year-round).

  HOURS SECTION (info-strip)
    Three cards: Market hours | Snackbar hours | Location + map button.
    Hours populated from GET /api/settings (storeHours and deliHours keys).
    If all days have the same time, shows single time + day summary.
    If days vary, shows a per-day schedule table.

  24-HR FUEL BANNER
    Gold-gradient banner.

  SERVICES GRID
    10 service icons (Cold Drinks, Groceries, Daily Essentials, Ice, Fresh
    Coffee, Beer & Liquor, Tobacco, Snacks, Restrooms, Free WiFi).

  EXPLORE BANNER
    Blue-slate gradient banner introducing the Exploring Esmeralda section.

  EXPLORING ESMERALDA SECTION
    Five attraction cards with scroll-driven animations:
      1. Fish Lake Valley (hero card — tall slideshow image + text)
      2. FLV Hot Springs (left-layout card)
      3. Trail Canyon Reservoir (right-layout card)
      4. Boundary Peak (left-layout card)
      5. Bristlecone Pine Forest (right-layout card)
    Animated gold trail line on the left tracks scroll progress.
    Each card fades/slides in when scrolled into view (IntersectionObserver-
    style using scroll events + getBoundingClientRect).

  SEE YOU SOON BANNER
    Purple-indigo gradient banner with a "Get Directions" button.

  FOOTER (global-footer)
    Three columns: Brand + contact info | Links | Business hours.
    Links and hours populated dynamically from KV settings.
    Copyright year set via JS (new Date().getFullYear()).


menu.html — Snackbar Order Page
────────────────────────────────
  MENU LOADING
    Fetches GET /api/menu and GET /api/settings concurrently on DOMContentLoaded.
    Shows a loading spinner while fetching. Falls back to MENU_FALLBACK array
    if API is unreachable.

  CATEGORY/ITEM DISPLAY
    If categories exist: renders category heading, optional hero photo,
    optional description, items in the category, optional footnotes.
    If no categories (or only Uncategorized): renders flat item list.
    Items show: photo (from R2), name, price, description, add-ons dropdown,
    options selects. Add-ons with default:true are pre-checked.

  ONLINE ORDERING CHECK
    If onlineOrdering === false in settings: add-to-cart buttons are hidden.
    An "Online Ordering Unavailable" status card is shown.

  SNACKBAR HOURS CHECK
    Reads deliHours from /api/settings (stored locally as snackbarHours).
    If current time is outside snackbar hours: order panel (id="snackbarOpenContent")
    is hidden. A status card shows "Snackbar Closed" with today's hours.
    If open: order panel is visible and ordering is enabled.
    orderingOpen = snackbarIsOpen AND onlineOrderingEnabled.

  CART
    Items are added via addToCart(itemId). Cart stored in a JS array.
    Order panel shows itemized list with addons, subtotal, tax, grand total.
    Tax rate loaded from settings.deliTax (KV key) → stored as snackbarTaxRate.
    Floating cart button (mobile) appears when cart has items.

  CHECKOUT FORM
    Fields: customer name (required), phone (required), pickup time select
    (auto-populated from snackbar hours in 30-min increments), special notes.
    Validates name + phone on submit. Shows a toast if cart is empty.

  RECEIPT
    Built inline after submit. Shows pickup time prominently, all items with
    addons, subtotal, tax, total, order ID, customer info, timestamp.
    "Print Receipt" button calls window.print().

  PRINT MENU
    Opens a new window with a print-optimized version of the full menu.
    Uses two-column layout for items. Includes category photos and descriptions.

  FLOATING CART BUTTON (mobile)
    Appears once the first item is added. Scrolls to order panel on click.

  PRINT SERVER INTEGRATION (TODO / uncomment when ready)
    In submitOrder() there is a commented fetch block to POST the order to
    http://localhost:3000/print (the local print server in print-server/).
    Uncomment those lines to enable automatic receipt printing.


admin.html — Admin Panel
─────────────────────────
  Authentication: POST /api/password → token stored in sessionStorage (8-hr).
  Token is a "timestamp:HMAC-SHA256" string verified server-side.
  Four tabs once logged in:

  SETTINGS TAB (pageSettings)
    Online Ordering toggle — flips onlineOrdering in KV, takes effect immediately
    on the order page on next load/refresh.

    Site Info section:
      Phone number, Snackbar tax rate (%), Homepage description, Hero button
      text, Hero button link, Hero background photo (drag/drop or click upload).
      Saved via PUT /api/settings (partial merge — only changed fields sent).

    Contact Form section:
      Contact email (where contact form submissions are delivered).
      Turnstile Site Key (public key for the bot-check widget).

    Links section:
      Drag-to-reorder list of links saved in KV as quickLinks[].
      Each link: display text, URL/anchor.
      Add Link (addLink) / Remove Link (removeLink) / Save Links (saveLinks).
      Links populate: nav overlay, hero panel, footer on all pages.

  HOURS TAB (pageHours)
    Store Hours table (7 rows Mon-Sun): open time, close time, Closed checkbox.
    Snackbar Hours table (same layout).
    "Save Hours" submits both tables via PUT /api/settings.
    JSON body uses deliHours key (KV field name preserved for compatibility).

  MENU TAB (pageList)
    Category blocks with drag-to-reorder (ondragstart/ondrop).
    Within each category: item rows, also draggable (between categories too).
    Category controls: rename (inline input), delete, add hero photo, description,
    footnotes. Deleting a category moves its items to Uncategorized.
    Item rows: thumbnail, name, price, Edit / Delete buttons.
    Item form (pageForm): name, price, description, category select, photo
    upload, add-ons editor (name + price + Default checkbox), options editor
    (option group name + list of choices).

  EVENTS TAB (pageEvents)
    Event list with drag-to-reorder. Events appear on the homepage.
    Event form (pageEventForm): title (required), date (required), description,
    CTA button text + URL (optional), event photo (optional).


contact.html — Contact Form
─────────────────────────────
  Fields: Name, Email, Message (all required).
  Cloudflare Turnstile bot-check widget — renders in explicit mode after
  fetching the site key from GET /api/settings.
  On submit: POST /api/contact with { name, email, message, turnstileToken }.
  Server verifies Turnstile token, then sends email via Resend.
  Reply-to set to the submitter's email so staff can reply directly.
  Success state shown after submit. "Send Another Message" resets the form.
  Error messages shown inline below the submit button.


--------------------------------------------------------------------------------
API ENDPOINTS (Cloudflare Pages Functions)
--------------------------------------------------------------------------------

  POST /api/auth
    Body:    { password }
    Returns: { token }
    Token:   "timestamp:HMAC-SHA256(timestamp, AUTH_SECRET)" — valid 8 hours.
    Env:     ADMIN_PASSWORD, AUTH_SECRET
    Note:    All mutating endpoints require Authorization: Bearer <token>.

  GET /api/menu                    (public)
    Returns: { items: [...], categories: [...] }

  POST /api/menu                   (auth)  — create item
    Body:    { item: { name, price, description, photo, addons, defaultAddons,
               options }, categoryId }
    Returns: { item, categories }

  PUT /api/menu                    (auth)  — update item
    Body:    same as POST
    Returns: { item, categories }

  PATCH /api/menu                  (auth)  — save full state (reorder)
    Body:    { items: [...], categories: [...] }
    Returns: { success: true }

  DELETE /api/menu                 (auth)  — delete item
    Body:    { id }
    Returns: { success: true }

  POST /api/upload                 (auth)
    Body:    multipart/form-data: file (image) + itemName (string)
    Types:   JPEG, PNG, WebP, GIF. Max 5 MB.
    Returns: { filename }   — stored in R2, served at /images/<filename>

  GET /images/:filename            (public)
    Serves image from R2.
    Cache-Control: public, max-age=31536000, immutable (1 year).
    404 if not found.

  GET /api/settings                (public)
    Returns full settings object (see KV Data section below).

  PUT /api/settings                (auth)
    Partial update — only include fields you want to change.
    Worker merges with existing KV data, so unrelated fields are preserved.

  GET /api/events                  (public)
    Returns: { events: [...] }

  POST /api/events                 (auth)  — create event
  PUT  /api/events                 (auth)  — update event
  PATCH /api/events                (auth)  — save full order
  DELETE /api/events               (auth)  — delete event by id

  POST /api/contact                (public)
    Body:    { name, email, message, turnstileToken }
    1. Verifies turnstileToken with Cloudflare Turnstile API.
    2. Reads contactEmail from KV settings.
    3. Sends email via Resend with reply-to set to submitter's address.
    Env:     TURNSTILE_SECRET, RESEND_API_KEY, RESEND_FROM


--------------------------------------------------------------------------------
PRINT SERVER  (separate project: print-server/)
--------------------------------------------------------------------------------

Purpose:
  Runs on the snackbar/register PC. Receives the order object that order.js
  builds after a customer submits a checkout, formats it as a plain-text
  40-column receipt, and sends it to the system default printer.

Location:
  print-server/ directory. Runs independently of the Cloudflare deployment.
  Start it with "npm start" on the snackbar PC and keep the window open.

Integration point:
  In js/order.js, inside the submitOrder() function, there is a commented-out
  fetch block:

    // fetch('http://localhost:3000/print', {
    //   method: 'POST',
    //   headers: { 'Content-Type': 'application/json' },
    //   body: JSON.stringify(order),
    // });

  Uncomment these lines to enable automatic receipt printing when an order
  is placed. The fetch is fire-and-forget (no await) so a slow or offline
  print server does not block the success screen.

Endpoints:
  POST /print   — accepts order JSON, validates, logs, and prints
  GET  /health  — returns { status: "ok", timestamp }

See print-server/README.md for full setup, environment variables, and
deployment notes (pm2, Windows startup, etc.).


--------------------------------------------------------------------------------
CLOUDFLARE ENVIRONMENT VARIABLES
--------------------------------------------------------------------------------

Set in Cloudflare Dashboard → Pages project → Settings → Environment Variables.
A redeploy is required after adding or changing any of these.

  ADMIN_PASSWORD      Password for admin panel login
                      Example: a long random passphrase

  AUTH_SECRET         Long random string for HMAC token signing (40+ chars)
                      Generate at: https://randomkeygen.com
                      Never put this in wrangler.toml (that file is in the repo)

  RESEND_API_KEY      API key from resend.com — used to send contact form emails
                      Get one free at: https://resend.com

  RESEND_FROM         Verified sender address for Resend
                      Example: Esmeralda Market <contact@esmeraldamarket.com>

  TURNSTILE_SECRET    Secret key from Cloudflare Turnstile dashboard
                      Matches the Turnstile Site Key stored in admin settings.
                      Get at: Cloudflare Dashboard → Turnstile → Add widget


--------------------------------------------------------------------------------
KV NAMESPACE
--------------------------------------------------------------------------------

  Binding name (in wrangler.toml):  MENU_KV

  Keys stored:
    "menu"       { items: [...], categories: [...] }
    "settings"   full settings object (see schema below)
    "events"     { events: [...] }

  Settings object schema:
    storeHours        Array[7]  Business hours Mon–Sun
                                Each entry: { day, open, close, closed }
                                day:   "Mon"|"Tue"|...|"Sun"
                                open:  "HH:MM" 24hr or null if closed
                                close: "HH:MM" 24hr or null if closed
                                closed: boolean

    deliHours         Array[7]  Snackbar hours — same format as storeHours
                                NOTE: KV key is "deliHours" (preserved for
                                backward compatibility with existing data).
                                Displayed in the UI as "Snackbar Hours".

    onlineOrdering    Boolean   true = online ordering enabled on menu page

    phone             String    Store phone number, e.g. "775-572-3200"

    deliTax           Number    Snackbar tax rate as a percentage, e.g. 8.25
                                NOTE: KV key is "deliTax" (preserved for
                                backward compatibility). Displayed as
                                "Snackbar Tax" in the admin UI.

    heroDescription   String    Body text in the homepage hero section

    heroButtonText    String    CTA button label in the hero (e.g. "Order Now")

    heroButtonLink    String    CTA button href (e.g. "menu.html")

    heroBgPhoto       String|null  Filename in R2 for the hero background photo

    quickLinks        Array     Navigation links list
                                Each entry: { id, text, url }
                                id:   string (unique, e.g. "1")
                                text: display text (e.g. "Get Directions")
                                url:  href or #anchor (e.g. "#hours")

    contactEmail      String    Destination email for contact form submissions

    turnstileSiteKey  String    Public Cloudflare Turnstile key for contact form


--------------------------------------------------------------------------------
R2 BUCKET
--------------------------------------------------------------------------------

  Binding name (in wrangler.toml):  IMAGES_BUCKET
  Bucket name:                      esmeralda-images

  Stores all uploaded photos:
    - Menu item photos
    - Menu category hero photos
    - Hero background photo
    - Event photos

  Served publicly via GET /images/:filename (functions/images/[filename].js).
  Cache headers: public, max-age=31536000, immutable.
  Filenames are slugified from the item/event name + timestamp to avoid
  collisions and to make them human-readable.


--------------------------------------------------------------------------------
THIRD-PARTY SERVICES
--------------------------------------------------------------------------------

  Google Fonts  (fonts.googleapis.com)
    Loaded via CDN link in each HTML <head>. No API key required.
    Fonts used:
      Oswald       400, 500, 600, 700 — headings, labels, nav, buttons
      Source Sans 3  300, 400, 600   — body text, descriptions, inputs

  Cloudflare Turnstile  (developers.cloudflare.com/turnstile)
    Bot protection widget on contact.html. Free, privacy-preserving.
    Requires two keys:
      Site Key   — stored in admin → Contact Form settings (public, in KV)
      Secret Key — stored as TURNSTILE_SECRET env var (server-side only)
    Widget: configured at Cloudflare Dashboard → Turnstile → Add Widget
    Add both domains: esmeraldamarket.com and esmkt.pages.dev

  Resend  (resend.com)
    Transactional email service for contact form submissions.
    Free tier: 3,000 emails/month, 100/day.
    Requires a verified sending domain or email address.
    API key stored as RESEND_API_KEY. From address stored as RESEND_FROM.


--------------------------------------------------------------------------------
DESIGN SYSTEM
--------------------------------------------------------------------------------

CSS Variables (defined in css/base.css :root):
  --gold              #C9A96E    Primary accent (headings, icons, borders, CTAs)
  --gold-dark         #8B6B3A    Subtle gold (borders, gradients)
  --gold-light        #D4B483    Hover states
  --charcoal          #1A1A18    Page background
  --charcoal-mid      #222220    Section alternates, input backgrounds
  --charcoal-card     #2C2B28    Card backgrounds
  --charcoal-border   #3A3830    Borders
  --cream             #F0EBE0    Primary text
  --cream-dim         #B8B0A0    Secondary / muted text
  --open-green        #4CAF7D    "Open Now" status pill
  --danger            #C0392B    Error / destructive action states

Typography:
  Oswald (sans-serif, condensed) — used for all display text: section headers,
    nav items, labels, buttons, card titles, admin UI. Weights 400–700.
  Source Sans 3 — used for body copy, descriptions, form inputs, error messages.
    Weights 300 (light), 400 (regular), 600 (semibold).

Shared Layout:
  All pages load css/base.css and js/nav.js.
  The nav is a 3-column CSS grid (.site-nav).
  The nav overlay is a full-screen dark panel with links (.nav-overlay).
  The footer is a 3-column grid (.global-footer): brand | links | hours.
  All pages share the same link rendering logic (nav.js → renderNavLinks).


--------------------------------------------------------------------------------
DEPLOYMENT / SETUP STEPS
--------------------------------------------------------------------------------

PREREQUISITES
  - Cloudflare account (cloudflare.com — free)
  - Node.js installed (nodejs.org — LTS)
  - Wrangler CLI: npm install -g wrangler

STEP 1 — Authenticate Wrangler
  wrangler login

STEP 2 — Create KV namespace
  wrangler kv namespace create "esmeralda-menu"
  → Copy the printed id into wrangler.toml:
      [[kv_namespaces]]
      binding = "MENU_KV"
      id      = "<paste id here>"

STEP 3 — Create R2 bucket
  wrangler r2 bucket create esmeralda-images

STEP 4 — Set environment secrets
  wrangler pages secret put ADMIN_PASSWORD   --project-name esmeralda-market
  wrangler pages secret put AUTH_SECRET      --project-name esmeralda-market
  wrangler pages secret put RESEND_API_KEY   --project-name esmeralda-market
  wrangler pages secret put RESEND_FROM      --project-name esmeralda-market
  wrangler pages secret put TURNSTILE_SECRET --project-name esmeralda-market

STEP 5 — Deploy
  wrangler pages deploy . --project-name esmeralda-market
  (First deploy creates the project and gives you a *.pages.dev URL.)

STEP 6 — Configure the site via admin panel
  1. Visit /admin.html and sign in.
  2. Settings → Site Info:     Set phone, snackbar tax rate, hero copy.
  3. Settings → Contact Form:  Enter contact email + Turnstile site key.
  4. Settings → Links:         Add/edit/reorder nav links.
  5. Hours tab:                Set store hours and snackbar hours.
  6. Menu tab:                 Add categories and menu items.
  7. Events tab:               Add upcoming events.

STEP 7 — (Optional) Set up print server on snackbar PC
  cd print-server
  npm install
  npm start
  (Then uncomment the fetch block in js/order.js — see print-server/README.md)

CLOUDFLARE FUNCTION ROUTING
  Pages Functions map automatically from their file path:
    functions/api/auth.js           → POST /api/auth
    functions/api/menu.js           → GET|POST|PUT|PATCH|DELETE /api/menu
    functions/api/upload.js         → POST /api/upload
    functions/api/settings.js       → GET|PUT /api/settings
    functions/api/contact.js        → POST /api/contact
    functions/api/events.js         → GET|POST|PUT|PATCH|DELETE /api/events
    functions/images/[filename].js  → GET /images/:filename


--------------------------------------------------------------------------------
FREE TIER LIMITS (Cloudflare)
--------------------------------------------------------------------------------

  KV:
    100,000 reads/day     — trivially covered for a small site
    1,000 writes/day      — well within limits (admin saves are rare)

  R2:
    10 GB storage         — more than enough for all menu/event photos
    1,000,000 Class A operations/month  (writes, lists)
    10,000,000 Class B operations/month (reads)

  Pages Functions:
    100,000 requests/day  — far beyond typical traffic for a rural market

  All well within free tier limits at current traffic levels. Paid plans are
  available if the site ever grows to need them.


================================================================================
  Esmeralda Market  |  HWY 264 MM8, Dyer, NV 89010  |  775-572-3200
  esmeraldamarket.com  |  facebook.com/WhiteMountainsNV
================================================================================
