document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('footerYear').textContent = new Date().getFullYear();
  initContact();
});

// ─── INIT ─────────────────────────────────────────────────────────────────────
async function initContact() {
  // Fetch settings to get the Turnstile site key
  try {
    const res  = await fetch('/api/settings');
    const data = res.ok ? await res.json() : null;
    if (data?.phone) {
      const digits = data.phone.replace(/\D/g, '');
      const numEl  = document.getElementById('callUsBannerPhone');
      const btnEl  = document.getElementById('callUsBannerBtn');
      if (numEl) { numEl.textContent = data.phone; numEl.href = `tel:${digits}`; }
      if (btnEl) { btnEl.href = `tel:${digits}`; }
    }
    if (data?.turnstileSiteKey) {
      renderTurnstile(data.turnstileSiteKey);
    } else {
      // No site key configured — hide the widget row
      document.getElementById('turnstileWidget').closest('.turnstile-wrap')?.remove();
    }
  } catch(_) {
    document.getElementById('turnstileWidget').closest('.turnstile-wrap')?.remove();
  }
}

// ─── TURNSTILE (explicit render) ──────────────────────────────────────────────
let turnstileToken = null;

function renderTurnstile(sitekey) {
  // Wait for the Turnstile script to be ready
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
  const err = document.getElementById('contactError');

  const name    = document.getElementById('contactName').value.trim();
  const email   = document.getElementById('contactEmail').value.trim();
  const message = document.getElementById('contactMessage').value.trim();

  // Client-side check for Turnstile (only if widget is present)
  const widgetPresent = !!document.getElementById('turnstileWidget').parentElement?.querySelector('iframe');
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
    // Reset Turnstile so user can try again
    if (typeof window.turnstile !== 'undefined') window.turnstile.reset();
    turnstileToken = null;
  } finally {
    btn.disabled    = false;
    btn.textContent = 'Send Message';
  }
}

function showError(msg) {
  const el = document.getElementById('contactError');
  el.textContent = msg;
  el.classList.toggle('visible', !!msg);
}

function showSuccess() {
  document.getElementById('contactForm').style.display    = 'none';
  document.getElementById('contactSuccess').style.display = '';
}

function resetContactForm() {
  document.getElementById('contactName').value    = '';
  document.getElementById('contactEmail').value   = '';
  document.getElementById('contactMessage').value = '';
  turnstileToken = null;
  if (typeof window.turnstile !== 'undefined') window.turnstile.reset();
  document.getElementById('contactForm').style.display    = '';
  document.getElementById('contactSuccess').style.display = 'none';
  showError('');
}
