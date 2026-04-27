/**
 * Shared admin HMAC verifier. Used by admin-only endpoints (settings PUT,
 * menu CRUD, orders log, reprint, etc.).
 *
 * Wire format (set by /api/auth on successful login):
 *   Authorization: Bearer <unix_ms>:<hex_hmac_sha256(unix_ms, AUTH_SECRET)>
 *
 * Tokens expire 8 hours after issue. Older Pages Function files in this
 * project (settings.js, menu.js, etc.) inline this same verifier — kept
 * for backward compatibility, but new endpoints should import from here.
 */

export async function isAdminAuthorized(request, env) {
  const header = request.headers.get('Authorization') || '';
  if (!header.startsWith('Bearer ')) return false;
  const token = header.slice(7).trim();

  const [tsStr, providedHex] = token.split(':');
  if (!tsStr || !providedHex) return false;

  const ts = parseInt(tsStr, 10);
  if (!Number.isFinite(ts)) return false;
  const age = Date.now() - ts;
  if (age < 0 || age > 8 * 60 * 60 * 1000) return false;

  const secret = env.AUTH_SECRET || env.ADMIN_PASSWORD || '';
  if (!secret) return false;

  const expectedHex = await hmacHex(tsStr, secret);
  if (expectedHex.length !== providedHex.length) return false;
  let diff = 0;
  for (let i = 0; i < expectedHex.length; i++) {
    diff |= expectedHex.charCodeAt(i) ^ providedHex.charCodeAt(i);
  }
  return diff === 0;
}

async function hmacHex(data, secret) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(data));
  return Array.from(new Uint8Array(sig))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

export const ADMIN_CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type',
};

export function adminJson(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...ADMIN_CORS, 'Content-Type': 'application/json' },
  });
}

export function adminUnauthorized() {
  return adminJson({ error: 'Unauthorized' }, 401);
}
