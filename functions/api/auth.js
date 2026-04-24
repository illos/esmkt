/**
 * POST /api/auth
 * Validates the admin password and returns a signed session token.
 *
 * Turnstile protection:
 *   If TURNSTILE_SECRET is configured on the server, the client must also
 *   send a valid `turnstileToken` in the POST body (obtained from the widget
 *   on the login page). Verification happens BEFORE the password check so
 *   bots can't brute-force the password even on failed-auth responses.
 *   If TURNSTILE_SECRET is NOT configured, the token is ignored and login
 *   falls back to password-only (matching the graceful-degradation pattern
 *   used by /api/contact).
 *
 * Required env vars (set in Cloudflare Pages dashboard):
 *   ADMIN_PASSWORD   — the password the admin enters
 *   AUTH_SECRET      — random secret used to sign tokens (generate any long random string)
 *   TURNSTILE_SECRET — (optional) Cloudflare Turnstile secret key. Enables bot protection.
 */

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: CORS });
}

export async function onRequestPost({ request, env }) {
  try {
    const { password, turnstileToken } = await request.json();

    if (!env.ADMIN_PASSWORD) {
      return json({ error: 'ADMIN_PASSWORD is not configured. See setup instructions.' }, 500);
    }

    // Turnstile check (only enforced when the server is configured).
    // Runs before the password check so a bot can't distinguish "wrong
    // password" from "missing token" via timing or response diffs.
    if (env.TURNSTILE_SECRET) {
      if (!turnstileToken) {
        return json({ error: 'Please complete the bot check.' }, 400);
      }
      const tsRes = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ secret: env.TURNSTILE_SECRET, response: turnstileToken }),
      });
      const tsData = await tsRes.json();
      if (!tsData.success) {
        return json({ error: 'Bot verification failed. Please try again.' }, 400);
      }
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
