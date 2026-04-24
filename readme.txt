================================================================================
  ESMERALDA MARKET — WEBSITE PROJECT
  HWY 264 MM8, Dyer, NV 89010  |  775-572-3200
  Live:    https://esmeraldamarket.com
  Staging: https://esmkt.pages.dev
================================================================================

Full-featured website for Esmeralda Market — a gas station, grocery, and
snackbar in Fish Lake Valley, Nevada.

No build step. Plain HTML, CSS, and JS. Hosted on Cloudflare Pages (free tier)
with a serverless backend on Cloudflare Pages Functions, Workers KV, and R2.
Push the repo or run `wrangler pages deploy .` to deploy.


================================================================================
ARCHITECTURE AT A GLANCE
================================================================================

The site has two parts:

  1. PUBLIC PAGES — index.html, menu.html, contact.html
  2. ADMIN       — admin.html (password-protected)

Each public page is composed of SECTIONS. A section is a reusable building
block (hero, banner, hours card, services grid, etc.). Sections are defined
in js/sections.js and stored in KV per page; the admin lets you reorder,
edit, add, delete, and hide them without touching code.

  index.html     → fetches /api/pages/home    → sections rendered into <main>
  menu.html      → hand-authored (no sections yet)
  contact.html   → hand-authored (no sections yet)

The `home` page is fully sections-driven. Menu and Contact are still
hand-authored — their sections-driven refactors are future work.


================================================================================
FILE STRUCTURE
================================================================================

  index.html              Public homepage shell. Populated by js/index.js.
  index.legacy.html       Pre-refactor backup (for emergency rollback).
  menu.html               Snackbar ordering page.
  contact.html            Contact form page.
  admin.html              Admin UI. Password-gated.

  css/
    base.css              Shared resets, CSS vars, nav styles.
    index.css             Homepage-specific styles (all sections).
    menu.css              Menu/ordering styles.
    contact.css           Contact form styles.
    admin.css             Admin UI styles.

  js/
    nav.js                Nav hamburger overlay. Shared across public pages.
    sections.js           ★ Section type registry and render engine.
                            This is the heart of the refactor. See below.
    index.js              Homepage runtime. Fetches page sections + settings
                            + events, renders sections, wires behavior.
    menu.js               Menu/ordering runtime. Cart, checkout, order submit.
    contact.js            Contact form submission.
    admin.js              Admin UI runtime. Login, tabs, forms. Large file
                            (~2400 lines); see "ADMIN STRUCTURE" below.

  functions/api/          Cloudflare Pages Functions (serverless API routes).
    auth.js               POST login → HMAC token (8hr expiry).
    menu.js               GET/PUT the snackbar menu.
    events.js             GET/PUT/DELETE events.
    settings.js           GET/PUT site settings (phone, hours, quick links…).
    upload.js             POST image → R2 bucket → returns filename.
    contact.js            POST contact form → Resend email + Turnstile check.
    pages/[slug].js       ★ GET/PUT page sections by slug (home/menu/contact).
    print-server/
      status.js           Placeholder endpoint — reports print server status.

  functions/images/[filename].js
                          Serves uploaded images from R2.

  assets/                 Static images (logo, landscape photos, etc.).
  print-server/           Separate Node project (not wired in yet).
  readme.txt              This file.
  wrangler.toml           Cloudflare Pages config (KV + R2 bindings).


================================================================================
THE SECTIONS SYSTEM
================================================================================

js/sections.js defines ALL section types in one place — their schema, their
defaults, and their render function. Adding a new section type = adding an
entry to SECTION_TYPES there.

TYPES CURRENTLY DEFINED:
  hero          Custom  Large welcome block with photos + CTAs.
  events        Custom  Events grid with optional Facebook strip.
  hours         Custom  Market + Snackbar hours + location card.
  services      Custom  Grid of service icons (cold drinks, wifi, etc.).
  explore       Custom  Numbered trail of destination cards.
  banner        Generic Colored bar with icon, title, optional button.
  article       Generic Title + image + rich-text body + optional CTA.
  text          Generic Simple paragraph of connecting prose.
  heading       Generic Standalone heading (3 sizes, 3 alignments, rule).
  menu          Reserved  Not exposed in admin (placeholder for future).
  contact_form  Reserved  Not exposed in admin (placeholder for future).
  footer        Reserved  Not exposed in admin (placeholder for future).

EACH SECTION TYPE PROVIDES:
  label         Display name in the admin
  icon          Emoji/glyph for the admin list
  description   One-line explainer for the add-section picker
  category      'custom' | 'generic' | 'reserved'
  schema        Object of { fieldName: { type, label, ... } } — drives the
                admin form builder. Field types: text, longtext, boolean,
                select, number, image, icon, list, richtext.
  defaults      Seed data for new instances
  render        fn(data, ctx) → HTML string

PAGE DATA SHAPE (stored in KV):
  page_home: {
    sections: [
      { id: "sec_xyz", type: "hero", data: {...}, hidden?: true },
      ...
    ]
  }

The admin is generic — any section type added to sections.js gets a working
editor form automatically, because the form builder reads the schema.


================================================================================
KV KEYS
================================================================================

  settings            Site settings (phone, hours, links, flags)
  menu                Snackbar menu (categories + items)
  events              Events list
  page_home           Homepage sections array
  page_menu           Menu page sections (empty today)
  page_contact        Contact page sections (empty today)
  print_server_last_seen  Unix ms of last print-server heartbeat (future)

All keys are in the MENU_KV binding defined in wrangler.toml.


================================================================================
ADMIN STRUCTURE
================================================================================

admin.html has five tabs:

  Settings   Phone, tax rate, hero description, buttons, hero bg photo,
             contact email, Turnstile key, quick links, print server card
  Hours      Store and Snackbar hour tables
  Pages      ★ Master list of pages → click one → sections list
               (drag to reorder / click row to edit / + Add Section /
                eye icon to hide / × to delete / Save Layout to persist)
  Menu       Snackbar menu item CRUD
  Events     Events CRUD

Auth: password → /api/auth → HMAC token in sessionStorage. All PUT/POST/DELETE
requests send Authorization: Bearer ts:hmac and have an 8-hour expiry.


================================================================================
FUTURE INTEGRATION: PRINT SERVER
================================================================================

Planned but not yet deployed. A small Node process runs on the snackbar PC:

  - Polls /api/orders (not yet built) for pending orders
  - Prints them to a thermal receipt printer
  - POSTs /api/print-server/heartbeat every 30s to prove it's alive

The Settings → Print Server card in admin shows status (offline/online/
not configured) and lets the owner toggle "require print server for orders".

When that toggle is on, js/menu.js will refuse to accept orders if the
print server hasn't heartbeated recently. The gate exists as a
commented-out block in menu.js — uncomment it to enable.

Endpoints reserved:
  GET  /api/print-server/status        — returns current state (live today)
  POST /api/print-server/heartbeat     — (not built)


================================================================================
DEPLOYMENT & ENVIRONMENT
================================================================================

Required environment variables (Cloudflare Pages dashboard → Settings → Env):
  ADMIN_PASSWORD        Admin login password
  AUTH_SECRET           HMAC secret for token signing (separate from password)
  RESEND_API_KEY        For contact form emails
  RESEND_FROM           Verified sender email
  TURNSTILE_SECRET      For contact form bot protection

Required bindings (wrangler.toml / Pages dashboard → Settings → Bindings):
  MENU_KV               Workers KV namespace
  IMAGES_BUCKET         R2 bucket

To deploy:
  git push                      (Cloudflare auto-deploys on push)
    OR
  wrangler pages deploy .       (from repo root)


================================================================================
EMERGENCY ROLLBACK
================================================================================

If a deploy breaks the homepage:
  1. rename  index.legacy.html → index.html  (restores the pre-refactor page)
  2. remove the <main id="sections"></main> line if present
  3. push

This bypasses the sections system entirely. The admin still works.
KV data is untouched.
