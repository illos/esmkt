/**
 * Shared helper for endpoints that the print server (the headless PC at the
 * snackbar) calls. The print server authenticates with a static shared
 * secret loaded from env.PRINT_SERVER_SECRET.
 *
 * Wire format:
 *   Authorization: Bearer ps:<secret>
 *
 * Why a separate auth from the admin HMAC tokens:
 *   - Admin tokens expire every 8h and require an interactive login flow.
 *   - The print server is unattended, so it needs a long-lived credential.
 *   - Compromise of the print-server secret only gives access to the orders
 *     queue + heartbeat, not the full admin surface.
 *
 * Folders starting with "_" in /functions are NOT exposed as routes by
 * Cloudflare Pages, so this file is import-only.
 */

/** Standard CORS headers used by print-server endpoints. */
export const PS_CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type',
};

/** Build a JSON Response with PS_CORS attached. */
export function psJson(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...PS_CORS, 'Content-Type': 'application/json' },
  });
}

/** 401 helper. */
export function psUnauthorized() {
  return psJson({ error: 'Unauthorized' }, 401);
}

/**
 * Verify a request bears a valid `Authorization: Bearer ps:<secret>` header
 * matching env.PRINT_SERVER_SECRET. Constant-time comparison.
 *
 * Returns true only if the header is present, well-formed, and the secret
 * matches. Returns false (without throwing) on any other condition.
 */
export function isPrintServerAuthorized(request, env) {
  if (!env.PRINT_SERVER_SECRET) return false;
  const header = request.headers.get('Authorization') || '';
  if (!header.startsWith('Bearer ')) return false;
  const token = header.slice(7).trim();
  if (!token.startsWith('ps:')) return false;
  const provided = token.slice(3);
  const expected = env.PRINT_SERVER_SECRET;
  // Constant-time comparison
  if (provided.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < provided.length; i++) {
    diff |= provided.charCodeAt(i) ^ expected.charCodeAt(i);
  }
  return diff === 0;
}
