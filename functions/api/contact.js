/**
 * POST /api/contact
 *
 * Verifies Cloudflare Turnstile, then sends a contact-form email via Resend.
 *
 * Required Cloudflare Pages environment variables (set in dashboard):
 *   RESEND_API_KEY   — API key from resend.com
 *   RESEND_FROM      — Verified sender address, e.g. "Esmeralda Market <contact@esmeralda.market>"
 *   TURNSTILE_SECRET — Secret key from Cloudflare Turnstile dashboard
 *
 * Required KV settings key (set in admin):
 *   contactEmail     — Destination address for form submissions
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
  let body;
  try { body = await request.json(); } catch(_) { return error('Invalid request.'); }

  const { name, email, message, turnstileToken } = body;

  // ── Field validation ──────────────────────────────────────────────────────
  if (!name?.trim())    return error('Name is required.');
  if (!email?.trim())   return error('Email address is required.');
  if (!message?.trim()) return error('Message is required.');
  if (!turnstileToken)  return error('Please complete the bot check.');

  // ── Turnstile verification ────────────────────────────────────────────────
  if (!env.TURNSTILE_SECRET) return error('Contact form is not configured (missing TURNSTILE_SECRET).');

  const tsRes  = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ secret: env.TURNSTILE_SECRET, response: turnstileToken }),
  });
  const tsData = await tsRes.json();
  if (!tsData.success) return error('Bot verification failed. Please try again.');

  // ── Load destination email from KV settings ───────────────────────────────
  const raw      = await env.MENU_KV.get('settings');
  const settings = raw ? JSON.parse(raw) : {};
  const to       = settings.contactEmail?.trim();
  if (!to) return error('Contact form is not configured. Please try calling us instead.');

  // ── Send via Resend ───────────────────────────────────────────────────────
  if (!env.RESEND_API_KEY) return error('Contact form is not configured (missing RESEND_API_KEY).');

  const fromAddr = env.RESEND_FROM || `Contact Form <noreply@${new URL(request.url).hostname}>`;

  const emailRes = await fetch('https://api.resend.com/emails', {
    method:  'POST',
    headers: {
      'Authorization': `Bearer ${env.RESEND_API_KEY}`,
      'Content-Type':  'application/json',
    },
    body: JSON.stringify({
      from:     fromAddr,
      to:       [to],
      reply_to: `${name.trim()} <${email.trim()}>`,
      subject:  `Contact Form: Message from ${name.trim()}`,
      text:     `Name: ${name.trim()}\nEmail: ${email.trim()}\n\n---\n\n${message.trim()}`,
      html:     `<p><strong>Name:</strong> ${esc(name)}</p>
                 <p><strong>Email:</strong> <a href="mailto:${esc(email)}">${esc(email)}</a></p>
                 <hr style="border:none;border-top:1px solid #ccc;margin:16px 0"/>
                 <p style="white-space:pre-wrap">${esc(message)}</p>`,
    }),
  });

  if (!emailRes.ok) {
    const errBody = await emailRes.text().catch(() => '');
    console.error('Resend error:', emailRes.status, errBody);
    return error('Failed to send your message. Please try again or call us directly.');
  }

  return json({ success: true });
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
function esc(s) {
  return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });
}
function error(msg, status = 400) {
  return json({ error: msg }, status);
}
