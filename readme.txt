================================================================================
  ESMERALDA MARKET — WEBSITE PROJECT
  HWY 264 MM8, Dyer, NV 89010  |  775-572-3200
  Live: https://esmeraldamarket.com  |  Staging: https://esmkt.pages.dev
================================================================================


--------------------------------------------------------------------------------
PROJECT OVERVIEW
--------------------------------------------------------------------------------

A full-featured website for Esmeralda Market. Hosted on Cloudflare Pages (free
tier) with a serverless backend using Cloudflare Pages Functions, KV (database),
and R2 (image storage). All site content — menu, hours, events, quick links,
hero copy — is managed through the admin panel and stored in KV.

No build step required. All files are plain HTML/CSS/JS and deploy directly.


--------------------------------------------------------------------------------
FILE STRUCTURE
--------------------------------------------------------------------------------

  index.html              Homepage
  menu.html               Snackbar order page
  admin.html              Admin panel
  contact.html            Contact form page
  readme.txt              This file
  _headers                Cloudflare Pages HTTP headers (noindex on admin)

  css/
    base.css              Shared styles: CSS variables, nav, nav overlay, footer
    index.css             Homepage-specific styles
    order.css             Snackbar order page styles
    admin.css             Admin panel styles
    contact.css           Contact page styles

  js/
    nav.js                Shared: nav overlay, quick links rendering (all pages)
    index.js              Homepage JS
    order.js              Snackbar order page JS
    admin.js              Admin panel JS
    contact.js            Contact form JS

  functions/
    api/
      auth.js             POST /api/auth         — login, HMAC token
      menu.js             GET/POST/PUT/PATCH/DELETE /api/menu
      upload.js           POST /api/upload       — image upload to R2
      settings.js         GET/PUT /api/settings  — all site settings
      contact.js          POST /api/contact      — contact form email sender
      events.js           GET/POST/PUT/PATCH/DELETE /api/events
    images/
      [filename].js       GET /images/:filename  — serve images from R2

  assets/
    emskt-logo-inline.webp    Horizontal logo (used in nav)
    esmeralda-logo.webp       Full logo (used in footer)
    topo-white.svg            Topo texture overlay (nav overlay, hero)
    (+ other site images)


--------------------------------------------------------------------------------
PAGES
--------------------------------------------------------------------------------

  index.html — Homepage
  ─────────────────────
  - Fixed navigation: CSS grid layout (left: open/closed status | center: logo |
    right: hamburger button). Hamburger opens a slide-in overlay with quick links.
  - Live open/closed status pill reads the device clock against store hours from
    KV. Shows "Open Now" (green) or "Opens at X:XX AM/PM" (gold). Updates every
    60 seconds.
  - Hero section: full-bleed background (supports custom photo uploaded via
    admin). Customizable description text, button text, and button link — all
    editable in admin Settings.
  - Hero quick links panel: same quick links stored in KV, shown as an icon grid
    in the hero. Populated from /api/settings on load.
  - Explore section: full-width image cards with descriptions.
  - Events section: pulled from /api/events. Hidden if no events.
  - Hours section: Market and Snackbar hours cards, pulled from /api/settings.
    Shows actual per-day schedule.
  - Services grid: icons + labels for key offerings.
  - Find Us section: address + Google Maps link.
  - Footer: three columns (logo/contact, quick links, business hours). Quick
    links populated from KV same as nav overlay.
  - Fully responsive (mobile-first).


  menu.html — Snackbar Order Page
  ────────────────────────────────
  - Menu loaded from GET /api/menu. Organized by category with category names,
    optional descriptions, and optional footnotes.
  - Category hero photos (banner images per category section).
  - Items display photo (from R2), name, description, price, add-ons, options.
  - Add-ons: optional extras with price (e.g. "Avocado +$1.00"). Some add-ons
    can be pre-checked as defaults.
  - Options: choice groups with no price change (e.g. "Bread: Roll, White, Wheat").
  - Online ordering check: if ordering is disabled in admin, the add buttons,
    order form, and floating cart are hidden. A "currently closed" message shows.
  - Snackbar hours check: outside configured deli hours a banner replaces the
    order form. Menu grid stays visible.
  - Cart: floating cart button appears when items are added. Itemized with tax
    (configurable rate from admin settings) and grand total.
  - Checkout form: customer name, phone, pickup time selector, special notes.
  - Receipt shown inline after submit. Print button triggers browser print.
  - Nav overlay and footer quick links from KV (same as all other pages).
  - Same grid nav layout as all other pages.


  admin.html — Admin Panel
  ─────────────────────────
  Password-protected single-page app. Token stored in sessionStorage (8-hour
  expiry). Three tabs once logged in:

  SETTINGS & HOURS TAB
    Online Ordering toggle — enables/disables ordering site-wide instantly.

    Site Info section:
      - Phone number
      - Snackbar tax rate (%)
      - Homepage description (hero section body text)
      - Hero button text and link
      - Hero background photo (upload/remove)
      Saves on blur or via "Save Site Info" button.

    Contact Form section:
      - Contact Email — where form submissions get delivered
      - Turnstile Site Key — public key for the bot-check widget
      Requires TURNSTILE_SECRET and RESEND_API_KEY as Cloudflare env vars
      (see Environment Variables section below).

    Quick Links section:
      - Drag-to-reorder links (appears in nav overlay, hero panel, and footer)
      - Each link: icon picker (Lucide icon grid with search), display text, URL
      - Add / Remove links
      - ~80 curated Lucide icons to choose from

    Store Hours — 7-day grid (open time, close time, Closed toggle per day)
    Snackbar Hours — same 7-day grid for deli/snackbar hours

  MENU TAB
    Categories:
      - Add, rename, delete categories
      - Drag-to-reorder categories
      - Optional category description (shown under category heading)
      - Optional category footnotes (shown after items)
      - Optional category hero photo
      - Deleted categories move their items to Uncategorized

    Items (within categories):
      - Drag-to-reorder within a category
      - Drag items between categories
      - Add item: name, price, description, category, photo
      - Photo: drag-and-drop or click upload. Previewed before save.
        Stored in R2. Can be removed.
      - Add-ons editor: name + price + optional "Default" checkbox
      - Options editor: option group name + list of choices
      - Edit / Delete per item. Delete is confirmed via modal.

  EVENTS TAB
    - Event list with drag-to-reorder
    - Add / Edit / Delete events
    - Event fields: title, date, description, optional CTA button
      (text + URL), optional photo
    - Events appear on the homepage events section


  contact.html — Contact Form
  ────────────────────────────
  - Fields: Name, Email, Message
  - Cloudflare Turnstile bot protection (explicit render mode, dark theme).
    Site key loaded async from /api/settings.
  - On submit: verifies Turnstile server-side, sends email via Resend API.
  - Reply-to on outbound email is set to the submitter's address so you can
    just hit Reply in your inbox.
  - Success state shown after submit. "Send Another" resets the form.
  - Error messages shown inline if validation or sending fails.
  - Same grid nav and footer as all other pages.


--------------------------------------------------------------------------------
API ENDPOINTS (Cloudflare Pages Functions)
--------------------------------------------------------------------------------

  POST /api/auth
    Body:    { password }
    Returns: { token }  — "timestamp:HMAC-SHA256", valid 8 hours
    Env:     ADMIN_PASSWORD, AUTH_SECRET

  GET /api/menu  (public)
    Returns: { items: [...], categories: [...] }

  POST /api/menu  (auth)   — create item
  PUT  /api/menu  (auth)   — update item
  PATCH /api/menu (auth)   — save full state (items + categories reorder)
  DELETE /api/menu (auth)  — delete item by id

  POST /api/upload  (auth)
    Body:    multipart/form-data: file + itemName
    Types:   JPEG, PNG, WebP, GIF. Max 5 MB.
    Returns: { filename }

  GET /images/:filename    (public)
    Serves image from R2 with long-lived cache headers.

  GET /api/settings        (public)
    Returns full settings object (see KV Data section below).

  PUT /api/settings        (auth)
    Partial update — only send the fields you want to change.
    Worker merges with existing KV data.

  GET /api/events          (public)
    Returns: { events: [...] }

  POST /api/events         (auth)   — create event
  PUT  /api/events         (auth)   — update event
  PATCH /api/events        (auth)   — save full order
  DELETE /api/events       (auth)   — delete event by id

  POST /api/contact        (public)
    Body:    { name, email, message, turnstileToken }
    Verifies Turnstile, reads contactEmail from KV, sends via Resend.
    Env:     TURNSTILE_SECRET, RESEND_API_KEY, RESEND_FROM


--------------------------------------------------------------------------------
CLOUDFLARE ENVIRONMENT VARIABLES
--------------------------------------------------------------------------------

Set these in Cloudflare Dashboard → Pages project → Settings → Environment
Variables. A redeploy is required after adding/changing any of these.

  ADMIN_PASSWORD      Password for the admin panel login
  AUTH_SECRET         Long random string for signing auth tokens (40+ chars).
                      Generate at https://randomkeygen.com
  RESEND_API_KEY      API key from resend.com (for contact form emails)
  RESEND_FROM         Verified sender address, e.g.:
                        Esmeralda Market <contact@esmeraldamarket.com>
  TURNSTILE_SECRET    Secret key from Cloudflare Turnstile dashboard
                      (matches the Site Key stored in admin settings)

  NEVER put these in wrangler.toml — that file is in your repo.


--------------------------------------------------------------------------------
KV NAMESPACE
--------------------------------------------------------------------------------

  Binding name:  MENU_KV

  Keys stored:
    "menu"        — { items: [...], categories: [...] }
    "settings"    — full settings object (see below)
    "events"      — { events: [...] }

  Settings object structure:
    storeHours        Array[7]  { day, open, close, closed } — Mon through Sun
    deliHours         Array[7]  same format
    onlineOrdering    Boolean
    phone             String    e.g. "775-572-3200"
    deliTax           Number    e.g. 8.25 (percent)
    heroDescription   String
    heroButtonText    String
    heroButtonLink    String
    heroBgPhoto       String|null  filename in R2
    quickLinks        Array     { id, icon, text, url }
    contactEmail      String    destination for contact form submissions
    turnstileSiteKey  String    public Turnstile key


--------------------------------------------------------------------------------
R2 BUCKET
--------------------------------------------------------------------------------

  Binding name:  IMAGES_BUCKET
  Bucket name:   esmeralda-images

  Stores all uploaded photos (menu items, category headers, hero background,
  event photos). Served via GET /images/:filename.


--------------------------------------------------------------------------------
THIRD-PARTY SERVICES
--------------------------------------------------------------------------------

  Google Fonts (Oswald + Source Sans 3)
    Loaded via CDN in each HTML file. No API key needed.

  Lucide Icons  (https://lucide.dev)
    Loaded via unpkg CDN. Used for quick link icons and admin icon picker.
    ~80 curated icons available in the admin picker. Lucide's icon data format
    is [[tag, attrs], ...] arrays — rendered to SVG strings via lucideToSvg()
    helper in nav.js and admin.js.

  Cloudflare Turnstile  (https://developers.cloudflare.com/turnstile/)
    Bot protection for the contact form. Free. Two keys required:
      Site Key   — stored in admin → Contact Form settings (public, in KV)
      Secret Key — stored as TURNSTILE_SECRET env var (private, server-side)
    Widget configured in: Cloudflare Dashboard → Turnstile → Add widget
    Allowed hostnames: esmeraldamarket.com, esmkt.pages.dev

  Resend  (https://resend.com)
    Transactional email for contact form submissions. Free tier: 3,000/month.
    Requires a verified sending domain or email address.


--------------------------------------------------------------------------------
CLOUDFLARE PAGES SETUP
--------------------------------------------------------------------------------

PREREQUISITES
  - Node.js (https://nodejs.org — LTS version)
  - A Cloudflare account (https://cloudflare.com)

STEP 1 — Install Wrangler and log in
  npm install -g wrangler
  wrangler login

STEP 2 — Create the KV namespace
  wrangler kv namespace create "esmeralda-menu"
  → Copy the id from the output into wrangler.toml under [[kv_namespaces]]

STEP 3 — Create the R2 bucket
  wrangler r2 bucket create esmeralda-images

STEP 4 — Set environment variables
  wrangler pages secret put ADMIN_PASSWORD   --project-name esmeralda-market
  wrangler pages secret put AUTH_SECRET      --project-name esmeralda-market
  wrangler pages secret put RESEND_API_KEY   --project-name esmeralda-market
  wrangler pages secret put RESEND_FROM      --project-name esmeralda-market
  wrangler pages secret put TURNSTILE_SECRET --project-name esmeralda-market

STEP 5 — Deploy
  wrangler pages deploy . --project-name esmeralda-market

  First deploy creates the project and gives you a *.pages.dev URL.
  Run the same command for all future updates.

STEP 6 — Configure via admin panel
  1. Visit /admin.html and log in.
  2. Under Settings → Contact Form: enter contact email + Turnstile site key.
  3. Under Settings → Site Info: set phone, tax rate, hero copy.
  4. Under Settings → Quick Links: customize the nav/footer/hero links.
  5. Set store hours and snackbar hours.
  6. Add menu categories and items under the Menu tab.
  7. Add upcoming events under the Events tab.

CLOUDFLARE FUNCTION ROUTING
  Functions in the functions/ folder map directly to URL routes:
    functions/api/auth.js           → /api/auth
    functions/api/menu.js           → /api/menu
    functions/api/upload.js         → /api/upload
    functions/api/settings.js       → /api/settings
    functions/api/contact.js        → /api/contact
    functions/api/events.js         → /api/events
    functions/images/[filename].js  → /images/:filename

FREE TIER LIMITS (Cloudflare)
  KV:  100,000 reads/day, 1,000 writes/day
  R2:  10 GB storage, 1M operations/month
  Pages Functions: 100,000 requests/day
  All well within limits for a small market site.


--------------------------------------------------------------------------------
DESIGN SYSTEM
--------------------------------------------------------------------------------

CSS Variables (defined in css/base.css :root):
  --gold           #C9A96E    Primary accent (headings, icons, CTAs)
  --gold-dark      #8B6B3A    Borders, subtle gold
  --gold-light     #D4B483    Hover states
  --charcoal       #1A1A1A    Page background
  --charcoal-mid   #222220    Input backgrounds
  --charcoal-card  #2C2B28    Card backgrounds
  --charcoal-border #3A3830   Borders
  --cream          #F0EBE0    Primary text
  --cream-dim      #B8B0A0    Secondary text
  --danger         #C0392B    Error states

Fonts (Google Fonts):
  Oswald         — headings, labels, navigation, buttons, admin UI
  Source Sans 3  — body text, descriptions, form inputs

Icon Library:
  Lucide Icons (unpkg CDN) — used for quick links and admin icon picker.
  Icon names use Lucide's kebab-case format (e.g. "map-pin", "utensils").
  Old short names (map, menu, gas, etc.) are aliased in NAV_ICON_ALIASES
  in nav.js for backwards compatibility with any saved data.

Shared layout:
  All pages use the same CSS grid nav (base.css), nav overlay, and footer.
  nav.js is loaded on every page and handles overlay toggle + quick link
  rendering for both the nav overlay and footer #footerQuickLinks element.


--------------------------------------------------------------------------------
CONTACT / PROJECT NOTES
--------------------------------------------------------------------------------

Market:   Esmeralda Market
Address:  HWY 264, Mile Marker 8, Dyer, NV 89010
Phone:    775-572-3200
Maps:     https://maps.app.goo.gl/dhU5oMRYwXpTUhmY9
Facebook: https://www.facebook.com/WhiteMountainsNV

================================================================================
