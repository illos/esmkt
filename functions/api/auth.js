/**
 * POST /api/auth
 * Validates the admin password and returns a signed session token.
 *
 * Required env vars (set in Cloudflare Pages dashboard):
 *   ADMIN_PASSWORD  — the password the admin enters
 *   AUTH_SECRET     — random secret used to sign tokens (generate any long random string)
 */

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

// Debug
export async function onRequestGet({ env }) {
  return Response.json({
    hasAdminPassword: !!env.ADMIN_PASSWORD,
    hasAuthSecret: !!env.AUTH_SECRET,
  });
}

export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: CORS });
}

export async function onRequestPost({ request, env }) {
  try {
    const { password } = await request.json();

    if (!env.ADMIN_PASSWORD) {
      return json({ error: 'ADMIN_PASSWORD is not configured. See setup instructions.' }, 500);
    }

    if (password !== env.ADMIN_PASSWORD) {
      return json({ error: 'Incorrect password.' }, 401);
    }

    const token = await createToken(env.AUTH_SECRET || env.ADMIN_PASSWORD);
    return json({ token });

  } catch (e) {
    return json({ error: e.message }, 500);
  }
}

// ─── Token helpers (shared pattern used by other functions) ──────────────────

export async function createToken(secret) {
  const ts  = Date.now().toString();
  const hmac = await sign(ts, secret);
  return `${ts}:${hmac}`;
}

async function sign(data, secret) {
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
