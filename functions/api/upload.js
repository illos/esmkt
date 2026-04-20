/**
 * POST /api/upload
 * Accepts a multipart/form-data request with a "file" field.
 * Stores the image in R2 and returns the filename.
 *
 * Required R2 binding: IMAGES_BUCKET
 * Required env vars:   AUTH_SECRET (or ADMIN_PASSWORD)
 *
 * Returns: { filename: "item-name-1234567890.jpg" }
 * Images are then served via GET /images/{filename}
 */

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type',
};

const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
const MAX_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB

export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: CORS });
}

export async function onRequestPost({ request, env }) {
  if (!await isAuthorized(request, env)) return json({ error: 'Unauthorized.' }, 401);

  const formData = await request.formData();
  const file     = formData.get('file');

  if (!file) return json({ error: 'No file provided.' }, 400);
  if (!ALLOWED_TYPES.includes(file.type)) return json({ error: 'Invalid file type. Use JPEG, PNG, WebP, or GIF.' }, 400);

  const buffer = await file.arrayBuffer();
  if (buffer.byteLength > MAX_SIZE_BYTES) return json({ error: 'File too large. Maximum size is 5 MB.' }, 400);

  // Build a unique filename: slug-timestamp.ext
  const ext      = file.name.split('.').pop().toLowerCase() || 'jpg';
  const slug     = (formData.get('itemName') || 'item')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 30);
  const filename = `${slug}-${Date.now()}.${ext}`;

  await env.IMAGES_BUCKET.put(filename, buffer, {
    httpMetadata: { contentType: file.type },
  });

  return json({ filename });
}

// ─── Auth (same logic as menu.js) ────────────────────────────────────────────

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
