/**
 * GET  /api/pages/:slug  — public, returns { sections: [...] }
 * PUT  /api/pages/:slug  — save sections (auth required)
 *
 * KV key format:  "page_<slug>"  (e.g. "page_home", "page_menu")
 *
 * On first GET for a slug that doesn't exist in KV yet, synthesizes defaults:
 *   - home:    full default homepage layout mirroring the legacy hand-authored HTML
 *   - others:  empty { sections: [] }
 *
 * Only whitelisted slugs are accepted — unknown slugs return 404. This is a
 * safety net while "+ New Page" is disabled in the admin. To add a new page
 * type, add its slug to PAGE_SLUGS below.
 *
 * Required KV binding:  MENU_KV
 * Required env var:     AUTH_SECRET  (HMAC signing secret)
 */

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, PUT, OPTIONS',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type',
};

// Only these slugs are accepted. Adding a new page type = add a slug here.
// (When "+ New Page" is enabled in a future phase, this check gets replaced
// with a lookup against a pages index KV key.)
const PAGE_SLUGS = ['home', 'menu', 'contact'];

// ─── DEFAULT SECTIONS PER SLUG ──────────────────────────────────────────────
// Home's defaults mirror the legacy hand-authored index.html byte-for-byte.
// Menu and Contact start empty — their hand-authored pages keep working as
// before until someone adds sections via the admin.
const HOME_DEFAULT_SECTIONS = [
  { id: 'sec_hero', type: 'hero', data: {
    eyebrow: 'Welcome to the',
    name: 'Esmeralda',
    subtitle: 'Market',
    tagline: 'Gas &nbsp;&middot;&nbsp; Groceries &nbsp;&middot;&nbsp; Snackbar',
    description: 'Your full-service desert outpost in Fish Lake Valley \u2014 gas up, stock the cooler, and grab a scratch-made snackbar sandwich before hitting the open road.',
    primary_cta_label: 'Order from the Snackbar',
    primary_cta_link: 'menu.html',
    bg_photo: null,
    store_photo: null,
    show_links_panel: true,
  }},
  { id: 'sec_banner_snack', type: 'banner', data: {
    title: 'Snackbar', subtitle: 'Hot Food &nbsp;&middot;&nbsp; Made Fresh Daily',
    icon: 'send', variant: 'snackbar',
    cta_label: 'See the Menu', cta_link: 'menu.html', show_star: false,
  }},
  { id: 'sec_events', type: 'events', data: {
    section_label: 'Whats new',
    heading: 'Upcoming Events',
    show_facebook_strip: true,
    facebook_url:   'https://www.facebook.com/WhiteMountainsNV',
    facebook_title: 'Follow us on Facebook',
    facebook_sub:   'Get the latest news, specials &amp; events from Esmeralda Market',
    facebook_cta:   'Follow Our Page',
  }},
  { id: 'sec_banner_fw', type: 'banner', data: {
    title: 'Fireworks', subtitle: 'Light up your Evening &nbsp;&middot;&nbsp; Sold year-round',
    icon: 'sparkles', variant: 'fireworks',
    cta_label: '', cta_link: '', show_star: true,
  }},
  { id: 'sec_hours', type: 'hours', data: {
    section_label: "We're here for you",
    heading: 'Business Hours',
    market_label:   'Market \u00b7 Gas',
    market_name:    'Esmeralda Market',
    snackbar_label: 'Hot Food \u00b7 Made Fresh Daily',
    snackbar_name:  'Snackbar',
    show_location_card: true,
    address_line_1: 'HWY 264, Mile Marker 8',
    address_line_2: 'Dyer, NV&nbsp;&nbsp;89010',
    address_sub:    'Fish Lake Valley \u00b7 Esmeralda County, NV',
    maps_url: 'https://maps.app.goo.gl/dhU5oMRYwXpTUhmY9',
  }},
  { id: 'sec_banner_fuel', type: 'banner', data: {
    title: '24-Hour Fuel', subtitle: 'Gas &amp; Diesel &nbsp;&middot;&nbsp; Always Open',
    icon: 'fuel', variant: 'fuel',
    cta_label: '', cta_link: '', show_star: true,
  }},
  { id: 'sec_services', type: 'services', data: {
    section_label: 'What We Offer',
    heading: 'Services',
    items: [
      { icon: 'drink',        label: 'Cold Drinks' },
      { icon: 'shopping-bag', label: 'Groceries' },
      { icon: 'box',          label: 'Daily Essentials' },
      { icon: 'snowflake',    label: 'Ice' },
      { icon: 'coffee',       label: 'Fresh Coffee' },
      { icon: 'bottle',       label: 'Beer & Liquor' },
      { icon: 'leaf',         label: 'Tobacco' },
      { icon: 'mountains',    label: 'Snacks' },
      { icon: 'restroom',     label: 'Restrooms' },
      { icon: 'wifi',         label: 'Free WiFi' },
    ],
  }},
  { id: 'sec_banner_exp', type: 'banner', data: {
    title: 'Exploring Esmeralda', subtitle: 'Off the Beaten Path &nbsp;&middot;&nbsp; Fish Lake Valley, NV',
    icon: 'compass', variant: 'explore',
    cta_label: '', cta_link: '', show_star: false,
  }},
  { id: 'sec_explore', type: 'explore', data: {
    lede: 'Come visit us and explore this little stretch of rural Nevada \u2014 wide open skies, wild horses, ancient forests, and natural hot springs, all within a short drive of the Market. In this little dust bowl there\u2019s always "on more" dirt road to explore.',
    stops: [
      { layout: 'hero',       tag: 'Come Explore The High Desert',         title: 'Welcome to Fish Lake Valley',      description: 'Sprawling across 30 miles of open high desert, Fish Lake Valley is home to free-roaming wild mustang herds, vast alkali flats, and some of the most dramatic big-sky scenery in the American West. Miles of side-by-side and OHV trails wind through the basin \u2014 and on a quiet evening out here, the silence is complete. Esmeralda Market is your basecamp for all of it.', image: 'assets/fish-lake-valley-1.webp' },
      { layout: 'text-left',  tag: 'Decompress in these beautiful springs', title: 'Fish Lake Valley Hot Springs', description: 'One of the Great Basin\u2019s best-kept secrets \u2014 free, remote, and gloriously uncrowded. These geothermal pools rise right from the desert floor and offer a long, steaming soak beneath an enormous Nevada sky. Best at sunrise or after dark, when warm water meets cool desert air in a way you won\u2019t forget.', image: 'assets/hotsprings.webp' },
      { layout: 'text-right', tag: 'Fishing with a view',                  title: 'Trail Canyon Reservoir',           description: 'Wind up into the White Mountains and you\u2019ll find this quiet alpine pond tucked among juniper and pinyon pine. Stocked with rainbow trout and ringed by sweeping views of the valley floor below, Trail Canyon Reservoir is a perfect half-day escape from the summer heat \u2014 bring a rod and stay a while.', image: 'assets/trail-canyon-resevior.webp' },
      { layout: 'text-left',  tag: 'Brave the climb',                      title: 'Boundary Peak Trailhead',          description: 'Nevada\u2019s highest point at 13,147 feet, Boundary Peak towers over the valley from the White Mountain crest. The trailhead is just up the road \u2014 fuel up and grab a sandwich before setting out on the state\u2019s ultimate summit hike. It\u2019s roughly 8 miles round trip with 4,000 feet of gain. The views from the top stretch into four states.', image: 'assets/boundery-1.webp' },
      { layout: 'text-right', tag: '"If these trees could talk"',          title: 'Bristlecone Pine Forest',          description: 'High in the White Mountains live some of the oldest organisms on Earth. The Ancient Bristlecone Pine Forest holds trees more than 5,000 years old \u2014 gnarled, wind-twisted, and achingly beautiful. They were already ancient when the pyramids were built. Standing among them in the alpine quiet puts the scale of human time in sharp, humbling perspective.', image: 'assets/bristlecone-pine-forest.webp' },
    ],
    trail_strip_text: 'Make sure you stop in at the Market before hitting the trails \u2014 stock up on fuel, cold drinks, and a fresh-made snackbar sandwich to keep you going.',
  }},
  { id: 'sec_banner_bye', type: 'banner', data: {
    title: 'See You Soon', subtitle: 'HWY 264 Mile Marker 8 &nbsp;&middot;&nbsp; Dyer, NV 89010',
    icon: 'map-pin', variant: 'see-you',
    cta_label: 'Get Directions', cta_link: 'https://maps.app.goo.gl/dhU5oMRYwXpTUhmY9', show_star: false,
  }},
];

function defaultsForSlug(slug) {
  if (slug === 'home') return { sections: HOME_DEFAULT_SECTIONS };
  return { sections: [] };
}

// ─── Route handlers ──────────────────────────────────────────────────────────

export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: CORS });
}

export async function onRequestGet({ env, params }) {
  const slug = String(params.slug || '');
  if (!PAGE_SLUGS.includes(slug)) return json({ error: 'Unknown page.' }, 404);

  const kvKey = 'page_' + slug;
  const raw = await env.MENU_KV.get(kvKey);
  if (raw) {
    try {
      const data = JSON.parse(raw);
      return json({ sections: Array.isArray(data.sections) ? data.sections : [] });
    } catch (_) {
      // Corrupt data — fall through and return defaults (don't overwrite KV here;
      // that could stomp on data that's recoverable).
    }
  }
  // First run for this slug: seed KV with defaults so admin sees them on first open
  const defaults = defaultsForSlug(slug);
  await env.MENU_KV.put(kvKey, JSON.stringify(defaults));
  return json(defaults);
}

export async function onRequestPut({ request, env, params }) {
  const slug = String(params.slug || '');
  if (!PAGE_SLUGS.includes(slug)) return json({ error: 'Unknown page.' }, 404);

  if (!await isAuthorized(request, env)) return unauthorized();

  const body = await request.json();
  if (!Array.isArray(body.sections)) {
    return json({ error: 'Body must include a "sections" array.' }, 400);
  }

  // Light validation: each section needs an id and a type. Anything else is
  // passed through as-is so admin can add fields without a schema migration.
  const sections = body.sections
    .filter(s => s && typeof s === 'object')
    .map(s => ({
      id:   String(s.id || cryptoRandomId()),
      type: String(s.type || ''),
      data: s.data && typeof s.data === 'object' ? s.data : {},
    }))
    .filter(s => s.type);

  await env.MENU_KV.put('page_' + slug, JSON.stringify({ sections }));
  return json({ success: true, sections });
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function cryptoRandomId() {
  // Short, URL-safe random id for sections created without one
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  return 'sec_' + Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
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
  const secret = env.AUTH_SECRET || env.ADMIN_PASSWORD || '';
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(tsStr));
  const expected = Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, '0')).join('');
  // Constant-time compare
  if (expected.length !== hex.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) {
    diff |= expected.charCodeAt(i) ^ hex.charCodeAt(i);
  }
  return diff === 0;
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
