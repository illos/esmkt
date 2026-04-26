================================================================================
  ESMERALDA MARKET — WEBSITE PROJECT
  HWY 264 MM8, Dyer, NV 89010  |  775-572-3200
  Live:    https://esmeraldamarket.com
  Staging: https://esmkt.pages.dev
================================================================================

Full-featured website for Esmeralda Market — a gas station, grocery, and
snackbar in Fish Lake Valley, Nevada.

No build step. Plain HTML, CSS, and JS. Hosted on Cloudflare Pages (free tier)
with a serverless backend on Cloudflare Pages Functions, Workers KV, R2,
and D1 (used for the orders queue + print-server heartbeat).
Push the repo or run `wrangler pages deploy .` to deploy.

Cron triggers for the offline-alert email live in a small companion Worker
under `cron-worker/` (deployed separately with `wrangler deploy` from that
directory). It shares the same D1 database and KV namespace as the Pages
project.


================================================================================
ARCHITECTURE AT A GLANCE
================================================================================

The site has two parts:

  1. PUBLIC PAGES — index.html, menu.html, contact.html
  2. ADMIN       — admin.html (password + Turnstile protected)

The public pages are composed of SECTIONS. A section is a reusable building
block (hero, banner, hours card, services grid, etc.). Sections are defined
in js/sections.js and stored in KV per page; the admin lets you reorder,
edit, add, delete, and hide them without touching code.

  index.html     → fetches /api/pages/home    → sections rendered into <main>
  contact.html   → fetches /api/pages/contact → sections rendered into <main>
  menu.html      → still hand-authored (sections refactor pending)

Every page that uses the sections system has a content-hiding fade-in while
its sections are being fetched and rendered, so the user doesn't see content
pop in. See PAGE-LOAD FADE below.


================================================================================
FILE STRUCTURE
================================================================================

  index.html              Public homepage shell. Populated by js/index.js.
  index.legacy.html       Pre-refactor backup (for emergency rollback).
  contact.html            Contact page shell. Populated by js/contact.js.
  contact.legacy.html     Pre-refactor backup.
  menu.html               Snackbar ordering page (still hand-authored).
  admin.html              Admin UI. Password + Turnstile gated.

  css/
    base.css              Shared resets, CSS vars, nav, page-load fade rules.
    index.css             Homepage-specific styles (all sections).
    menu.css              Menu/ordering styles.
    contact.css           Contact form styles.
    admin.css             Admin UI styles (login, tabs, section editor, etc.).

  js/
    nav.js                Nav hamburger overlay. Shared across public pages.
    sections.js           ★ Section type registry, render engine, and the
                            unified SVG_ICONS registry (31 icons). This is
                            the heart of the CMS.
    index.js              Homepage runtime. Fetches settings + events + page
                            sections, renders them, wires behavior, handles
                            hash deep-linking.
    menu.js               Menu/ordering runtime. Cart, checkout, order submit.
    contact.js            Contact page runtime. Renders sections, wires the
                            contact form, handles Turnstile + submission.
    admin.js              Admin UI runtime. Login (with Turnstile), tabs,
                            section editor, legacy menu/events CRUD. Large
                            file (~2900 lines); see "ADMIN STRUCTURE" below.

  functions/_lib/         Shared helpers (not exposed as routes — folders
                          beginning with "_" are import-only in Pages).
    ps-auth.js            Verifies Authorization: Bearer ps:<secret> for
                          print-server-issued requests.

  functions/api/          Cloudflare Pages Functions (serverless API routes).
    auth.js               POST login → HMAC token (8hr expiry).
                          Verifies Turnstile before password (when configured).
    menu.js               GET/PUT the snackbar menu.
    events.js             GET/PUT/DELETE events.
    settings.js           GET/PUT site settings (phone, hours, quick links…).
    upload.js             POST image → R2 bucket → returns filename.
    contact.js            POST contact form → Resend email + Turnstile check.
    pages/[slug].js       ★ GET/PUT page sections by slug.
                          Whitelisted slugs: home, menu, contact.
    orders/
      index.js            POST /api/orders — public; customer submits an
                          order. Persists into D1 (`orders` table).
      pending.js          GET — print server polls for unprinted orders.
                          (auth: Bearer ps:<PRINT_SERVER_SECRET>)
      [id]/printed.js     POST — print server marks an order printed
                          (or failed with an error).
    print-server/
      status.js           GET — public liveness read (configured/online,
                          last heartbeat age, pending order count).
      heartbeat.js        POST — print server reports it's alive.
                          (auth: Bearer ps:<PRINT_SERVER_SECRET>)

  functions/images/[filename].js
                          Serves uploaded images from R2.

  schema/
    d1_init.sql           D1 schema (orders + print_server_state). Apply
                          with `wrangler d1 execute esmeralda-orders ...`.

  cron-worker/            Companion Cloudflare Worker (NOT a Pages Function).
    worker.js             Cron-triggered every 5 min. Reads heartbeat from
                          D1; emails an alert if offline beyond threshold.
                          Manual trigger via /manual-check (auth required).
    wrangler.toml         Separate config; deploy with `wrangler deploy`
                          from inside this directory.

  assets/                 Static images (logo, landscape photos, etc.).
  print-server/           Polling Node client that runs on the snackbar PC.
                          Pulls pending orders, prints, plays a chime,
                          heartbeats, and self-updates from this repo.
                          See print-server/README.md.
  readme.txt              This file.
  wrangler.toml           Cloudflare Pages config (KV + R2 + D1 bindings).


================================================================================
THE SECTIONS SYSTEM
================================================================================

js/sections.js defines ALL section types in one place — their schema, their
defaults, and their render function. Adding a new section type = adding an
entry to SECTION_TYPES there.

TYPES CURRENTLY DEFINED (13 total):
  hero          Custom    Large welcome block with photos + CTAs.
  events        Custom    Events grid with optional Facebook strip.
  hours         Custom    Market + Snackbar hours + location card.
  services      Custom    Grid of service icons (cold drinks, wifi, etc.).
  explore       Custom    Numbered trail of destination cards.
  banner        Generic   Colored bar with icon, title, optional button.
  article       Generic   Tag line + title + image + rich-text body + CTA.
  text          Generic   Simple paragraph with size + alignment controls.
  heading       Generic   Standalone heading with tag line, size, alignment,
                            and optional underline rule.
  info_card     Generic   Bordered card with icon, subtitle, title, body.
                            Used for contact info, callouts, etc.
  contact_form  Generic   Name / email / message form with Turnstile.
                            Used on the Contact page.
  menu          Reserved  Not yet exposed in admin.
  footer        Reserved  Not yet exposed in admin.

EACH SECTION TYPE PROVIDES:
  label         Display name in the admin
  icon          Emoji/glyph for the admin list
  description   One-line explainer for the add-section picker
  category      'custom' | 'generic' | 'reserved'
  schema        Object of { fieldName: { type, label, ... } } — drives the
                admin form builder. Supported field types:
                  text, longtext, boolean, select, number
                  image, icon, list, richtext
                  layoutButtons   Inline picker for column layout variants
                  iconButtons     Inline picker rendering inline SVG per option
                  iconToggle      Single-button boolean toggle with lit/dim
                                  strikethrough visual
  defaults      Seed data for new instances
  render        fn(data, ctx) → HTML string

FIELD GROUPING (pairWith / pairRatio):
  Any schema field can declare `pairWith` to render on one row with sibling
  field(s). pairWith accepts a string (one sibling) OR an array (multiple
  siblings). pairRatio is an optional array of flex ratios.

    // 50/50 pair
    cta_label: { type: 'text', pairWith: 'cta_link' }
    cta_link:  { type: 'text' }

    // 20/80 split (banner icon + variant)
    icon:    { type: 'icon',   pairWith: 'variant', pairRatio: [1, 4] }
    variant: { type: 'select' }

    // 3-field row at 33/33/33 (heading size/align/rule)
    size:      { type: 'iconButtons', pairWith: ['align', 'show_rule'],
                 pairRatio: [1, 1, 1] }
    align:     { type: 'iconButtons' }
    show_rule: { type: 'iconToggle' }

ICON REGISTRY:
  js/sections.js exports window.SECTIONS.SVG_ICONS — a unified dictionary of
  31 inline SVG icons used across the whole admin + front-end. Section icons,
  link icons, service icons all pull from this same map. Call svgIcon(name)
  to retrieve an icon by key.

PAGE DATA SHAPE (stored in KV):
  page_<slug>: {
    sections: [
      { id: "sec_xyz", type: "hero", data: {...}, hidden?: true },
      ...
    ]
  }

The admin's section editor is generic — any section type added to
sections.js gets a working editor form automatically, because the form
builder reads the schema.


================================================================================
KV KEYS
================================================================================

  settings                Site settings (phone, hours, links, flags,
                          turnstileSiteKey, contactEmail,
                          printServerRequired, printServerAlertEmail,
                          printServerOfflineAlertMinutes)
  menu                    Snackbar menu (categories + items)
  events                  Events list
  page_home               Homepage sections array
  page_menu               Menu page sections (empty today — hand-authored)
  page_contact            Contact page sections array
  print_server_last_seen  LEGACY heartbeat key — kept as a fallback while
                          the D1 migration is rolling out, then removable.

All keys are in the MENU_KV binding defined in wrangler.toml.

================================================================================
D1 TABLES (binding: ORDERS_DB)
================================================================================

Schema lives in schema/d1_init.sql. Apply with:
  wrangler d1 execute esmeralda-orders --remote --file=./schema/d1_init.sql

  orders                  One row per customer order.
                          Columns: id, payload_json, status (pending /
                          printed / failed), created_at, printed_at,
                          print_error.

  print_server_state      Singleton key/value table.
                          Keys: last_heartbeat_ms, last_alert_sent_ms,
                          last_alert_recipient, print_server_version.


================================================================================
ADMIN STRUCTURE
================================================================================

admin.html has six tabs:

  Store Info   Phone, hero description, hero CTA button, store hours,
               snackbar hours, store photo, hero background photo
  Home Page    ★ Master list of sections on the homepage.
               (drag to reorder / click row to edit / + Add Section /
                eye icon to hide / × to delete / Save Layout to persist)
  Contact      ★ Master list of sections on the contact page. Same
               editor UI as Home Page.
  Menu         Snackbar menu item CRUD (per-item edit form, categories).
  Events       Events CRUD with drag-to-reorder.
  Settings     Tax rate, contact email, Turnstile site key, quick links,
               Facebook strip, print server toggle, online ordering toggle.

AUTH:
  Login requires the admin password. If TURNSTILE_SECRET is configured on
  the server, login also requires a valid Cloudflare Turnstile token —
  the same bot protection used by the contact form.

  On successful login, the server returns an HMAC-signed session token.
  All PUT/POST/DELETE requests include it via `Authorization: Bearer ts:hmac`.
  Tokens expire after 8 hours.

  If TURNSTILE_SECRET is NOT set, login falls back to password-only.
  This prevents a misconfigured Turnstile setup from locking the owner out.


================================================================================
PAGE-LOAD FADE
================================================================================

Every page (index, contact, menu, admin) starts with `class="page-loading"`
on <body>, which sets opacity: 0 via base.css. Each page's bootstrap script
removes it (and adds `page-loaded`) once its initial async work settles —
fetches resolved, sections rendered, widgets wired.

A 3-second @keyframes fallback guarantees visibility even if JS never
runs, so a completely broken page is still readable. The transition
itself is 220ms ease-out.

On index.html, after sections render, scrollToHash() also runs —
handling deep links like index.html#events. The browser's native
hash-scrolling fires before sections are in the DOM, so we manually
scroll to the target after render (with short retry backoff for layout
settling).


================================================================================
PRINT SERVER INTEGRATION
================================================================================

A small Node process (in print-server/) runs on the snackbar PC. It is a
polling client — no inbound port is exposed. See print-server/README.md
for the full setup walkthrough.

Loops it runs:
  - POLL  every 5s  → GET /api/orders/pending → print → POST /printed
  - HEART every 30s → POST /api/print-server/heartbeat
  - UPDATE every 10m → git fetch + pull + restart on new commits

Order flow:
  1. Customer submits via menu.html → POST /api/orders.
  2. Order persists in D1 with status='pending'.
  3. Print server picks it up on next poll, prints, plays a chime,
     marks it 'printed' (or 'failed' with an error message).

Liveness:
  - GET /api/print-server/status considers the server "online" if a
    heartbeat arrived in the last 90s (lets us miss 2 of the 30s
    heartbeats before flipping to offline).
  - When admin → Settings → "Require Print Server for Orders" is on,
    js/menu.js refuses orders while the server is offline.

Offline alert email (cron-worker/worker.js):
  - Every 5 minutes the companion Worker checks heartbeat age.
  - If it exceeds settings.printServerOfflineAlertMinutes (default 10)
    AND no alert was sent in the last hour, send a Resend email to
    settings.printServerAlertEmail (or contactEmail if blank).

Auth:
  - Print-server endpoints use a static shared secret in
    `Authorization: Bearer ps:<PRINT_SERVER_SECRET>`. The same value
    must be set as a Cloudflare Pages secret AND in the snackbar PC's
    print-server/.env file.

Endpoints (live):
  POST /api/orders                       — public; customer submits order
  GET  /api/orders/pending               — print server polls    (ps-auth)
  POST /api/orders/:id/printed           — print server marks done (ps-auth)
  GET  /api/print-server/status          — public liveness probe
  POST /api/print-server/heartbeat       — print server pings    (ps-auth)


================================================================================
DEPLOYMENT & ENVIRONMENT
================================================================================

Required environment variables (Cloudflare Pages dashboard → Settings → Env):
  ADMIN_PASSWORD        Admin login password
  AUTH_SECRET           HMAC secret for token signing (separate from password)
  PRINT_SERVER_SECRET   Shared secret for the print-server PC. Set the same
                        value in print-server/.env on the snackbar PC.
  RESEND_API_KEY        For contact form emails AND offline-alert emails.
  RESEND_FROM           Verified sender email
  TURNSTILE_SECRET      Used by BOTH /api/contact AND /api/auth.
                        When set, enables bot protection on contact form
                        AND admin login. When unset, both fall back to
                        unprotected behavior.

The companion `cron-worker/` needs its own copies of RESEND_API_KEY,
RESEND_FROM, and PRINT_SERVER_SECRET (set with `wrangler secret put …`
from inside the cron-worker directory).

Required bindings (wrangler.toml / Pages dashboard → Settings → Bindings):
  MENU_KV               Workers KV namespace
  IMAGES_BUCKET         R2 bucket
  ORDERS_DB             D1 database — the cron-worker uses the same one

Turnstile site key:
  Stored in KV settings (turnstileSiteKey), editable in admin Settings tab.
  Exposed via the public GET /api/settings so both the contact form and
  the admin login can fetch it without auth.

To deploy the website:
  git push                      (Cloudflare auto-deploys on push)
    OR
  wrangler pages deploy .       (from repo root)

To deploy the cron-worker (separate from Pages — only needs to be run
when cron-worker/ changes):
  cd cron-worker
  wrangler deploy

To apply D1 schema changes:
  wrangler d1 execute esmeralda-orders --remote --file=./schema/d1_init.sql
  wrangler d1 execute esmeralda-orders --local  --file=./schema/d1_init.sql

The print server on the snackbar PC self-updates by `git pull`-ing this
repo every 10 minutes. So a `git push` to main also rolls out new print
server code to the snackbar PC. See print-server/README.md.


================================================================================
EMERGENCY ROLLBACK
================================================================================

If a deploy breaks the homepage:
  1. rename  index.legacy.html → index.html  (restores the pre-refactor page)
  2. push

If a deploy breaks the contact page:
  1. rename  contact.legacy.html → contact.html
  2. push

Both legacy files bypass the sections system entirely. The admin still works.
KV data is untouched.

If Turnstile is misbehaving and locking you out of admin:
  Unset TURNSTILE_SECRET in the Pages dashboard. Login immediately falls
  back to password-only. No code change needed.
