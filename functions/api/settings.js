/**
 * GET  /api/settings  — public, returns { storeHours, deliHours (snackbar hours), deliTax (snackbar tax), ... }
 * PUT  /api/settings  — save settings (auth required)
 *
 * Hours array: 7 entries Mon(0)–Sun(6)
 *   [{ day: "Mon", open: "08:30", close: "19:30", closed: false }, ...]
 *
 * NOTE: KV keys "deliHours" and "deliTax" are preserved for backward compatibility.
 * They are displayed in the UI as "Snackbar Hours" and "Snackbar Tax" respectively.
 *
 * Required KV binding:  MENU_KV  (same namespace, key "settings")
 * Required env var:     AUTH_SECRET
 */

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, PUT, OPTIONS',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type',
};

const DAYS = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];

const DEFAULT_QUICK_LINKS = [
  { id:'1', icon:'map',      text:'Get Directions', url:'https://maps.app.goo.gl/dhU5oMRYwXpTUhmY9' },
  { id:'2', icon:'menu',     text:'Snackbar Menu',  url:'menu.html' },
  { id:'3', icon:'compass',  text:'Explore',        url:'#explore' },
  { id:'4', icon:'calendar', text:'Events',         url:'#events' },
  { id:'5', icon:'clock',    text:'Store Hours',    url:'#hours' },
  { id:'6', icon:'phone',    text:'Call Us',        url:'tel:7755723200' },
  { id:'7', icon:'facebook', text:'Facebook',       url:'https://www.facebook.com/WhiteMountainsNV' },
];

const DEFAULT_SETTINGS = {
  storeHours: DAYS.map(day => ({ day, open: '08:30', close: '19:30', closed: false })),
  deliHours:  DAYS.map((day, i) => ({
    day,
    open:   i < 6 ? '09:00' : null,
    close:  i < 6 ? '15:00' : null,
    closed: i === 6,   // Sunday closed
  })),
  onlineOrdering:  true,
  phone:           '775-572-3200',
  deliTax:         0,
  heroDescription: 'Your full-service desert outpost in Fish Lake Valley — gas up, stock the cooler, and grab a scratch-made snackbar sandwich before hitting the open road.',
  heroButtonText: 'Order from the Snackbar',
  heroButtonLink: 'menu.html',
  heroBgPhoto: null,
  quickLinks: DEFAULT_QUICK_LINKS,
  contactEmail:     '',
  turnstileSiteKey: '',
  // Phase 5: print-server placeholder. When true, online ordering will require a
  // running print server to accept orders. Currently wired but not enforced —
  // menu.js has a commented-out gate ready for when the server is deployed.
  printServerRequired: false,
};

export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: CORS });
}

export async function onRequestGet({ env }) {
  const raw  = await env.MENU_KV.get('settings');
  const data = raw ? JSON.parse(raw) : DEFAULT_SETTINGS;
  // Migration: ensure both arrays have 7 entries
  return json(migrateSettings(data));
}

export async function onRequestPut({ request, env }) {
  if (!await isAuthorized(request, env)) return unauthorized();
  const body = await request.json();

  // Merge with existing data so partial saves don't wipe unrelated fields
  const raw      = await env.MENU_KV.get('settings');
  const existing = raw ? migrateSettings(JSON.parse(raw)) : { ...DEFAULT_SETTINGS };

  const data = {
    ...existing,
    ...(body.storeHours     !== undefined && { storeHours:     validateHours(body.storeHours) }),
    ...(body.deliHours      !== undefined && { deliHours:      validateHours(body.deliHours) }),
    ...(body.onlineOrdering !== undefined && { onlineOrdering: body.onlineOrdering !== false }),
    ...(body.phone          !== undefined && { phone:          String(body.phone).trim() }),
    ...(body.deliTax        !== undefined && { deliTax:        parseFloat(body.deliTax) || 0 }),
    ...(body.heroDescription !== undefined && { heroDescription: String(body.heroDescription) }),
    ...(body.heroButtonText !== undefined && { heroButtonText: String(body.heroButtonText) }),
    ...(body.heroButtonLink !== undefined && { heroButtonLink: String(body.heroButtonLink) }),
    ...(body.heroBgPhoto      !== undefined && { heroBgPhoto:      body.heroBgPhoto === null ? null : String(body.heroBgPhoto) }),
    ...(body.quickLinks        !== undefined && { quickLinks:        Array.isArray(body.quickLinks) ? body.quickLinks : existing.quickLinks }),
    ...(body.contactEmail      !== undefined && { contactEmail:      String(body.contactEmail).trim() }),
    ...(body.turnstileSiteKey  !== undefined && { turnstileSiteKey:  String(body.turnstileSiteKey).trim() }),
    ...(body.printServerRequired !== undefined && { printServerRequired: body.printServerRequired === true }),
  };

  await env.MENU_KV.put('settings', JSON.stringify(data));
  return json({ success: true });
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function migrateSettings(data) {
  const merge = (stored, defaults) => {
    if (!Array.isArray(stored) || stored.length !== 7) return defaults;
    return stored.map((entry, i) => ({ ...defaults[i], ...entry }));
  };
  return {
    storeHours:      merge(data.storeHours, DEFAULT_SETTINGS.storeHours),
    deliHours:       merge(data.deliHours,  DEFAULT_SETTINGS.deliHours),
    onlineOrdering:  data.onlineOrdering !== false,
    phone:           data.phone           ?? DEFAULT_SETTINGS.phone,
    deliTax:         typeof data.deliTax === 'number' ? data.deliTax : DEFAULT_SETTINGS.deliTax,
    heroDescription: data.heroDescription ?? DEFAULT_SETTINGS.heroDescription,
    heroButtonText: data.heroButtonText ?? DEFAULT_SETTINGS.heroButtonText,
    heroButtonLink: data.heroButtonLink ?? DEFAULT_SETTINGS.heroButtonLink,
    heroBgPhoto: data.heroBgPhoto ?? null,
    quickLinks:       Array.isArray(data.quickLinks) ? data.quickLinks : DEFAULT_QUICK_LINKS,
    contactEmail:     data.contactEmail     ?? '',
    turnstileSiteKey: data.turnstileSiteKey ?? '',
    printServerRequired: data.printServerRequired === true,
  };
}

function validateHours(arr) {
  if (!Array.isArray(arr)) return DEFAULT_SETTINGS.storeHours;
  return arr.slice(0, 7).map((entry, i) => ({
    day:    DAYS[i] || entry.day,
    open:   entry.closed ? null : (entry.open  || null),
    close:  entry.closed ? null : (entry.close || null),
    closed: !!entry.closed,
  }));
}

async function isAuthorized(request, env) {
  const header = request.headers.get('Authorization') || '';
  const token  = header.startsWith('Bearer ') ? header.slice(7) : '';
  if (!token) return false;
  const [tsStr, hex] = token.split(':');
  if (!tsStr || !hex) return false;
  const ts  = parseInt(tsStr, 10);
  const age = Date.now() - ts;
  if (age < 0 || age > 8 * 60 * 60 * 1000) return false;
  const secret  = env.AUTH_SECRET || env.ADMIN_PASSWORD || '';
  const key     = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig     = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(tsStr));
  const expected = Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2,'0')).join('');
  return expected === hex;
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}

function unauthorized() {
  return json({ error: 'Unauthorized' }, 401);
}
