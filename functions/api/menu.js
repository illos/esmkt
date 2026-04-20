/**
 * GET    /api/menu          — public, returns full menu
 * POST   /api/menu          — create item  (auth required)
 * PUT    /api/menu          — update item  (auth required)
 * DELETE /api/menu          — delete item  (auth required)
 *
 * Required KV binding: MENU_KV
 * Required env vars:   AUTH_SECRET (or ADMIN_PASSWORD as fallback)
 */

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type',
};

// Default menu seeded into KV on first request
const SEED = {
  nextId: 9,
  items: [
    { id:1, name:'Classic Deli Sub',   price:9.50,  photo:null, description:'Stacked high on a fresh hoagie roll with your choice of meats, crisp lettuce, tomato, and our house mustard.', addons:['Avocado +$1','Bacon +$1.50','Extra Cheese +$0.75','Jalapeños +$0.50','Double Meat +$2'] },
    { id:2, name:'BLT on Sourdough',   price:8.00,  photo:null, description:'Crispy applewood bacon, heirloom tomato, and romaine on thick-cut grilled sourdough.', addons:['Avocado +$1','Fried Egg +$1','Extra Bacon +$1.50','Hot Sauce +$0'] },
    { id:3, name:'Green Chile Burger', price:11.00, photo:null, description:'1/3 lb hand-formed patty smothered in roasted Hatch green chile and pepper jack cheese.', addons:['Extra Patty +$3','Bacon +$1.50','Mushrooms +$0.75','Caramelized Onions +$0.75','Extra Chile +$0.50'] },
    { id:4, name:'Breakfast Burrito',  price:8.50,  photo:null, description:'Scrambled eggs, potato, cheese, and salsa wrapped in a grilled flour tortilla. Fuel for the trail.', addons:['Bacon +$1.50','Sausage +$1.50','Avocado +$1','Extra Salsa +$0','Green Chile +$0.75'] },
    { id:5, name:'Turkey & Swiss',     price:9.00,  photo:null, description:'Sliced turkey breast, Swiss cheese, honey mustard, and crunchy pickles on a toasted roll.', addons:['Avocado +$1','Bacon +$1.50','Extra Turkey +$2','Sprouts +$0.50'] },
    { id:6, name:'Hot Dog',            price:4.50,  photo:null, description:'All-beef frank on a steamed bun. Simple, honest, good.', addons:['Chili +$1','Cheese Sauce +$0.75','Jalapeños +$0.50','Mustard & Relish +$0','Onions +$0'] },
    { id:7, name:'Grilled Cheese',     price:6.50,  photo:null, description:'Two kinds of melted cheese on buttered sourdough, griddled golden brown.', addons:['Tomato +$0.50','Bacon +$1.50','Jalapeños +$0.50'] },
    { id:8, name:'Green Salad',        price:7.00,  photo:null, description:'Fresh greens, cucumber, cherry tomatoes, and your choice of dressing.', addons:['Grilled Chicken +$3','Avocado +$1','Extra Dressing +$0','Croutons +$0.50'] },
  ],
};

// ─── Route handlers ───────────────────────────────────────────────────────────

export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: CORS });
}

export async function onRequestGet({ env }) {
  const data = await getMenuData(env);
  return json({ items: data.items });
}

export async function onRequestPost({ request, env }) {
  if (!await isAuthorized(request, env)) return unauthorized();

  const item = await request.json();
  const data = await getMenuData(env);

  item.id = data.nextId++;
  item.photo = item.photo || null;
  item.addons = item.addons || [];
  data.items.push(item);

  await env.MENU_KV.put('menu', JSON.stringify(data));
  return json(item, 201);
}

export async function onRequestPut({ request, env }) {
  if (!await isAuthorized(request, env)) return unauthorized();

  const updated = await request.json();
  const data    = await getMenuData(env);
  const idx     = data.items.findIndex(i => i.id === updated.id);

  if (idx === -1) return json({ error: 'Item not found.' }, 404);

  data.items[idx] = updated;
  await env.MENU_KV.put('menu', JSON.stringify(data));
  return json(updated);
}

export async function onRequestDelete({ request, env }) {
  if (!await isAuthorized(request, env)) return unauthorized();

  const { id } = await request.json();
  const data   = await getMenuData(env);
  const before = data.items.length;

  data.items = data.items.filter(i => i.id !== Number(id));

  if (data.items.length === before) return json({ error: 'Item not found.' }, 404);

  await env.MENU_KV.put('menu', JSON.stringify(data));
  return json({ success: true });
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function getMenuData(env) {
  const raw = await env.MENU_KV.get('menu');
  if (!raw) {
    await env.MENU_KV.put('menu', JSON.stringify(SEED));
    return JSON.parse(JSON.stringify(SEED));
  }
  return JSON.parse(raw);
}

async function isAuthorized(request, env) {
  const header = request.headers.get('Authorization') || '';
  const token  = header.replace('Bearer ', '').trim();
  if (!token) return false;

  const [ts, providedHmac] = token.split(':');
  if (!ts || !providedHmac) return false;

  // Reject tokens older than 8 hours
  if (Date.now() - parseInt(ts) > 8 * 60 * 60 * 1000) return false;

  const secret = env.AUTH_SECRET || env.ADMIN_PASSWORD;
  const expectedHmac = await hmac(ts, secret);

  // Constant-time comparison
  if (expectedHmac.length !== providedHmac.length) return false;
  let diff = 0;
  for (let i = 0; i < expectedHmac.length; i++) {
    diff |= expectedHmac.charCodeAt(i) ^ providedHmac.charCodeAt(i);
  }
  return diff === 0;
}

async function hmac(data, secret) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  );
  const buf = await crypto.subtle.sign('HMAC', key, enc.encode(data));
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
}

function json(data, status = 200) {
  return Response.json(data, { status, headers: CORS });
}

function unauthorized() {
  return json({ error: 'Unauthorized.' }, 401);
}
