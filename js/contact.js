// contact.js — sections-driven contact page bootstrap
//
// The contact page is a sections-driven shell now. On load we:
//   1. Fetch /api/pages/contact and render its sections into #sections
//   2. Fetch /api/settings to populate footer phone and Turnstile site key
//   3. Initialize the contact form (which is rendered as part of the sections)
//
// Form submit + success handling + Turnstile rendering live below. They bind
// to DOM IDs that the contact_form section emits: #contactForm, #contactName,
// #contactEmail, #contactMessage, #turnstileWidget, #contactError, #sendBtn,
// #contactSuccess.

document.addEventListener('DOMContentLoaded', async () => {
  const yearEl = document.getElementById('footerYear');
  if (yearEl) yearEl.textContent = new Date().getFullYear();

  // Step 1: Render sections. Done before init so the form IDs exist.
  try {
    await renderContactSections();
  } catch (_) { /* render function handles its own error state */ }

  // Page-load fade-in: reveal once sections are in the DOM (success or error).
  document.body.classList.remove('page-loading');
  document.body.classList.add('page-loaded');

  // Step 2 + 3: Load settings and wire up the form.
  initContact();
});

async function renderContactSections() {
  const container = document.getElementById('sections');
  if (!container || !window.SECTIONS) return;
  try {
    const res  = await fetch('/api/pages/contact');
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const data = await res.json();
    const sections = Array.isArray(data.sections) ? data.sections : [];
    window.SECTIONS.renderSectionList(sections, container);
  } catch (err) {
    container.innerHTML = '<section class="section"><div class="section-inner"><p style="color:var(--cream-dim);text-align:center;padding:40px 0">Unable to load contact page. Please refresh or try again later.</p></div></section>';
    console.error('Contact sections load failed:', err);
  }
}

// ─── INIT ─────────────────────────────────────────────────────────────────────
async function initContact() {
  try {
    const res  = await fetch('/api/settings');
    const data = res.ok ? await res.json() : null;

    // Footer phone sync (if footer has the element).
    if (data?.phone) {
      const digits = data.phone.replace(/\D/g, '');
      const footerPhoneEl = document.getElementById('footerPhone');
      if (footerPhoneEl) {
        footerPhoneEl.href = `tel:${digits}`;
        // Replace trailing text node with new phone number, keeping the icon.
        const textNode = Array.from(footerPhoneEl.childNodes).find(n => n.nodeType === 3 && n.textContent.trim());
        if (textNode) textNode.textContent = data.phone;
      }
    }

    // Turnstile init
    const widget = document.getElementById('turnstileWidget');
    if (data?.turnstileSiteKey && widget) {
      renderTurnstile(data.turnstileSiteKey);
    } else if (widget) {
      widget.closest('.turnstile-wrap')?.remove();
    }
  } catch(_) {
    document.getElementById('turnstileWidget')?.closest('.turnstile-wrap')?.remove();
  }
}

// ─── TURNSTILE (explicit render) ──────────────────────────────────────────────
let turnstileToken = null;

function renderTurnstile(sitekey) {
  function tryRender() {
    if (typeof window.turnstile === 'undefined') {
      setTimeout(tryRender, 100);
      return;
    }
    window.turnstile.render('#turnstileWidget', {
      sitekey,
      theme:    'dark',
      callback: token  => { turnstileToken = token; },
      'expired-callback': () => { turnstileToken = null; },
      'error-callback':   () => { turnstileToken = null; },
    });
  }
  tryRender();
}

// ─── FORM SUBMIT ──────────────────────────────────────────────────────────────
async function submitContact(e) {
  e.preventDefault();
  const btn = document.getElementById('sendBtn');

  const name    = document.getElementById('contactName').value.trim();
  const email   = document.getElementById('contactEmail').value.trim();
  const message = document.getElementById('contactMessage').value.trim();

  // Client-side check for Turnstile (only if widget is present)
  const widgetPresent = !!document.getElementById('turnstileWidget')?.parentElement?.querySelector('iframe');
  if (widgetPresent && !turnstileToken) {
    showError('Please complete the "I\'m not a robot" check.');
    return;
  }

  showError('');
  btn.disabled    = true;
  btn.textContent = 'Sending\u2026';

  try {
    const res  = await fetch('/api/contact', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ name, email, message, turnstileToken: turnstileToken || '' }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Something went wrong. Please try again.');
    showSuccess();
  } catch(ex) {
    showError(ex.message);
    if (typeof window.turnstile !== 'undefined') window.turnstile.reset();
    turnstileToken = null;
  } finally {
    btn.disabled    = false;
    btn.textContent = 'Send Message';
  }
}

function showError(msg) {
  const el = document.getElementById('contactError');
  if (!el) return;
  el.textContent = msg;
  el.classList.toggle('visible', !!msg);
}

function showSuccess() {
  const form    = document.getElementById('contactForm');
  const success = document.getElementById('contactSuccess');
  if (form)    form.style.display    = 'none';
  if (success) success.style.display = '';
}

function resetContactForm() {
  const n = document.getElementById('contactName');
  const e = document.getElementById('contactEmail');
  const m = document.getElementById('contactMessage');
  if (n) n.value = '';
  if (e) e.value = '';
  if (m) m.value = '';
  turnstileToken = null;
  if (typeof window.turnstile !== 'undefined') window.turnstile.reset();
  const form    = document.getElementById('contactForm');
  const success = document.getElementById('contactSuccess');
  if (form)    form.style.display    = '';
  if (success) success.style.display = 'none';
  showError('');
}
