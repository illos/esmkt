/**
 * GET    /api/menu          — public, returns { items, categories }
 * POST   /api/menu          — create item   (auth required)
 * PUT    /api/menu          — update item   (auth required)
 * PATCH  /api/menu          — save full state: items + categories (auth required)
 * DELETE /api/menu          — delete item   (auth required)
 *
 * Required KV binding: MENU_KV
 * Required env vars:   AUTH_SECRET (or ADMIN_PASSWORD as fallback)
 *
 * Categories data structure:
 *   categories: [{ id: number, name: string, itemIds: number[] }]
 *   Category id=0 is the reserved "Uncategorized" bucket.
 *   Items deleted from a category move to id=0.
 */

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type',
};

// Default menu seeded into KV on first request
const SEED = {
  nextId:    9,
  nextCatId: 3,
  categories: [
    { id: 1, name: 'Sandwiches',      itemIds: [1, 2, 5, 7], photo: null, description: '' },
    { id: 2, name: 'Mains & Sides',   itemIds: [3, 4, 6, 8], photo: null, description: '' },
    { id: 0, name: 'Uncategorized',   itemIds: [],            photo: null, description: '' },
  ],
  items: [
    { id:1, name:'Classic Snackbar Sub',   price:9.50,  photo:null, description:'Stacked high on a fresh hoagie roll with your choice of meats, crisp lettuce, tomato, and our house mustard.', options:['Avocado +$1','Bacon +$1.50','Extra Cheese +$0.75','Jalapeños +$0.50','Double Meat +$2'], defaultOptions:[], choices:[] },
    { id:2, name:'BLT on Sourdough',   price:8.00,  photo:null, description:'Crispy applewood bacon, heirloom tomato, and romaine on thick-cut grilled sourdough.', options:['Avocado +$1','Fried Egg +$1','Extra Bacon +$1.50','Hot Sauce +$0'], defaultOptions:[], choices:[] },
    { id:3, name:'Green Chile Burger', price:11.00, photo:null, description:'1/3 lb hand-formed patty smothered in roasted Hatch green chile and pepper jack cheese.', options:['Extra Patty +$3','Bacon +$1.50','Mushrooms +$0.75','Caramelized Onions +$0.75','Extra Chile +$0.50'], defaultOptions:[], choices:[] },
    { id:4, name:'Breakfast Burrito',  price:8.50,  photo:null, description:'Scrambled eggs, potato, cheese, and salsa wrapped in a grilled flour tortilla. Fuel for the trail.', options:['Bacon +$1.50','Sausage +$1.50','Avocado +$1','Extra Salsa +$0','Green Chile +$0.75'], defaultOptions:[], choices:[] },
    { id:5, name:'Turkey & Swiss',     price:9.00,  photo:null, description:'Sliced turkey breast, Swiss cheese, honey mustard, and crunchy pickles on a toasted roll.', options:['Avocado +$1','Bacon +$1.50','Extra Turkey +$2','Sprouts +$0.50'], defaultOptions:[], choices:[] },
    { id:6, name:'Hot Dog',            price:4.50,  photo:null, description:'All-beef frank on a steamed bun. Simple, honest, good.', options:['Chili +$1','Cheese Sauce +$0.75','Jalapeños +$0.50','Mustard & Relish +$0','Onions +$0'], defaultOptions:[], choices:[] },
    { id:7, name:'Grilled Cheese',     price:6.50,  photo:null, description:'Two kinds of melted cheese on buttered sourdough, griddled golden brown.', options:['Tomato +$0.50','Bacon +$1.50','Jalapeños +$0.50'], defaultOptions:[], choices:[] },
    { id:8, name:'Green Salad',        price:7.00,  photo:null, description:'Fresh greens, cucumber, cherry tomatoes, and your choice of dressing.', options:['Grilled Chicken +$3','Avocado +$1','Extra Dressing +$0','Croutons +$0.50'], defaultOptions:[], choices:[] },
  ],
};

// ─── Route handlers ───────────────────────────────────────────────────────────

export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: CORS });
}

export async function onRequestGet({ env }) {
  const data = await getMenuData(env);
  return json({ items: data.items, categories: data.categories });
}

export async function onRequestPost({ request, env }) {
  if (!await isAuthorized(request, env)) return unauthorized();

  const { item, categoryId } = await request.json();
  const data = await getMenuData(env);

  item.id             = data.nextId++;
  item.photo          = item.photo          || null;
  item.options        = item.options        || [];
  item.defaultOptions = item.defaultOptions || [];
  item.choices        = item.choices        || [];
  data.items.push(item);

  // Add item to the requested category, or Uncategorized
  const targetCatId = categoryId != null ? Number(categoryId) : 0;
  const cat = data.categories.find(c => c.id === targetCatId)
           || data.categories.find(c => c.id === 0);
  if (cat) cat.itemIds.push(item.id);

  await env.MENU_KV.put('menu', JSON.stringify(data));
  return json({ item, categories: data.categories }, 201);
}

export async function onRequestPut({ request, env }) {
  if (!await isAuthorized(request, env)) return unauthorized();

  const { item: updated, categoryId } = await request.json();
  const data = await getMenuData(env);
  const idx  = data.items.findIndex(i => i.id === updated.id);

  if (idx === -1) return json({ error: 'Item not found.' }, 404);

  data.items[idx] = updated;

  // Move to a different category only if the target differs from the current one
  if (categoryId != null) {
    const newCatId    = Number(categoryId);
    const currentCat  = data.categories.find(c => c.itemIds.includes(updated.id));
    if (!currentCat || currentCat.id !== newCatId) {
      data.categories.forEach(c => { c.itemIds = c.itemIds.filter(id => id !== updated.id); });
      const cat = data.categories.find(c => c.id === newCatId)
               || data.categories.find(c => c.id === 0);
      if (cat && !cat.itemIds.includes(updated.id)) cat.itemIds.push(updated.id);
    }
  }

  await env.MENU_KV.put('menu', JSON.stringify(data));
  return json({ item: updated, categories: data.categories });
}

export async function onRequestPatch({ request, env }) {
  // Saves the full menu state: items array + categories array
  if (!await isAuthorized(request, env)) return unauthorized();

  const body = await request.json();
  const data = await getMenuData(env);

  if (Array.isArray(body.items))      data.items      = body.items;
  if (Array.isArray(body.categories)) data.categories = body.categories;

  await env.MENU_KV.put('menu', JSON.stringify(data));
  return json({ success: true });
}

export async function onRequestDelete({ request, env }) {
  if (!await isAuthorized(request, env)) return unauthorized();

  const { id } = await request.json();
  const data   = await getMenuData(env);
  const itemId = Number(id);
  const before = data.items.length;

  data.items = data.items.filter(i => i.id !== itemId);
  if (data.items.length === before) return json({ error: 'Item not found.' }, 404);

  // Remove item from all categories
  data.categories.forEach(c => { c.itemIds = c.itemIds.filter(i => i !== itemId); });

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
  const data = JSON.parse(raw);

  // ── Migration: add categories if missing (old data) ──────────────────────
  if (!data.categories) {
    data.nextCatId  = 2;
    data.categories = [
      { id: 1, name: 'Menu', itemIds: data.items.map(i => i.id), photo: null, description: '' },
      { id: 0, name: 'Uncategorized', itemIds: [], photo: null, description: '' },
    ];
  }

  // ── Ensure Uncategorized category always exists ───────────────────────────
  if (!data.categories.find(c => c.id === 0)) {
    data.categories.push({ id: 0, name: 'Uncategorized', itemIds: [], photo: null, description: '' });
  }

  // ── Ensure nextCatId exists ───────────────────────────────────────────────
  if (!data.nextCatId) {
    data.nextCatId = Math.max(...data.categories.map(c => c.id), 1) + 1;
  }

  // ── Ensure categories have photo + description fields ────────────────────
  data.categories = data.categories.map(cat => ({ photo: null, description: '', footnotes: '', ...cat }));

  // ── Migrate items: rename old field names and ensure new fields exist ────
  // Old schema: addons=string[], defaultAddons=string[], options=object[]
  // New schema: options=string[], defaultOptions=string[], choices=object[]
  data.items = data.items.map(item => {
    const { addons, defaultAddons, options, choices, defaultOptions, ...rest } = item;
    if (addons !== undefined) {
      // Old-format item — rename fields
      return {
        ...rest,
        options:        addons        || [],
        defaultOptions: defaultAddons || [],
        choices:        options       || [],
      };
    }
    // Already new-format — ensure fields exist
    return { options: [], defaultOptions: [], choices: [], ...rest };
  });

  return data;
}

async function isAuthorized(request, env) {
  const header = request.headers.get('Authorization') || '';
  const token  = header.replace('Bearer ', '').trim();
  if (!token) return false;

  const [ts, providedHmac] = token.split(':');
  if (!ts || !providedHmac) return false;

  if (Date.now() - parseInt(ts) > 8 * 60 * 60 * 1000) return false;

  const secret = env.AUTH_SECRET || env.ADMIN_PASSWORD;
  const expectedHmac = await hmac(ts, secret);

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
