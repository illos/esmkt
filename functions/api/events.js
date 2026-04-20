/**
 * GET    /api/events          — public, returns { events: [] }
 * POST   /api/events          — create event  (auth required)
 * PUT    /api/events          — update event  (auth required)
 * DELETE /api/events          — delete event  (auth required)
 *
 * Event shape: { id, title, description, date, photo }
 *   date: ISO date string "YYYY-MM-DD"
 *   photo: R2 filename or null
 *
 * Required KV binding:  MENU_KV  (key "events")
 * Required R2 binding:  IMAGES_BUCKET  (shared with menu photos)
 * Required env var:     AUTH_SECRET
 */

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type',
};

export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: CORS });
}

export async function onRequestGet({ env }) {
  const data = await getEventsData(env);
  return json({ events: data.events });
}

export async function onRequestPost({ request, env }) {
  if (!await isAuthorized(request, env)) return unauthorized();
  const { event } = await request.json();
  const data = await getEventsData(env);
  event.id    = data.nextId++;
  event.photo = event.photo || null;
  event.date  = event.date  || null;
  data.events.push(event);
  await env.MENU_KV.put('events', JSON.stringify(data));
  return json({ event }, 201);
}

export async function onRequestPut({ request, env }) {
  if (!await isAuthorized(request, env)) return unauthorized();
  const { event } = await request.json();
  const data = await getEventsData(env);
  const idx  = data.events.findIndex(e => e.id === event.id);
  if (idx === -1) return json({ error: 'Event not found.' }, 404);
  data.events[idx] = event;
  await env.MENU_KV.put('events', JSON.stringify(data));
  return json({ event });
}

export async function onRequestDelete({ request, env }) {
  if (!await isAuthorized(request, env)) return unauthorized();
  const { id } = await request.json();
  const data   = await getEventsData(env);
  const before = data.events.length;
  data.events  = data.events.filter(e => e.id !== Number(id));
  if (data.events.length === before) return json({ error: 'Event not found.' }, 404);
  await env.MENU_KV.put('events', JSON.stringify(data));
  return json({ success: true });
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function getEventsData(env) {
  const raw = await env.MENU_KV.get('events');
  if (!raw) return { events: [], nextId: 1 };
  return JSON.parse(raw);
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
