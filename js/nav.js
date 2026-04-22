const DEFAULT_LINKS = [
  { id:'1', text:'Get Directions', url:'https://maps.app.goo.gl/dhU5oMRYwXpTUhmY9' },
  { id:'2', text:'Snackbar Menu',  url:'menu.html' },
  { id:'3', text:'Explore',        url:'#explore' },
  { id:'4', text:'Events',         url:'#events' },
  { id:'5', text:'Store Hours',    url:'#hours' },
  { id:'6', text:'Call Us',        url:'tel:7755723200' },
  { id:'7', text:'Facebook',       url:'https://www.facebook.com/WhiteMountainsNV' },
];

function escNavHtml(s) {
  return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ─── OVERLAY TOGGLE ───────────────────────────────────────────────────────────
function toggleNavOverlay() {
  const overlay = document.getElementById('navOverlay');
  const btn     = document.getElementById('navHamburger');
  if (!overlay || !btn) return;
  const isOpen = overlay.classList.toggle('is-open');
  btn.classList.toggle('is-open', isOpen);
  overlay.setAttribute('aria-hidden', String(!isOpen));
  document.body.style.overflow = isOpen ? 'hidden' : '';
}

function closeNavOverlay() {
  const overlay = document.getElementById('navOverlay');
  const btn     = document.getElementById('navHamburger');
  if (!overlay) return;
  overlay.classList.remove('is-open');
  if (btn) btn.classList.remove('is-open');
  overlay.setAttribute('aria-hidden', 'true');
  document.body.style.overflow = '';
}

document.addEventListener('keydown', e => { if (e.key === 'Escape') closeNavOverlay(); });

// ─── RENDER LINKS (overlay + footer) ─────────────────────────────────────────
function renderNavLinks(links) {
  const ql = links || DEFAULT_LINKS;

  // Nav overlay
  const overlayEl = document.getElementById('navOverlayLinks');
  if (overlayEl) {
    overlayEl.innerHTML = ql.map(lk => {
      const isExt  = lk.url.startsWith('http');
      const target = isExt ? ' target="_blank" rel="noopener noreferrer"' : '';
      return `<a href="${escNavHtml(lk.url)}" class="nav-overlay-link"${target} onclick="closeNavOverlay()">
        <span>${escNavHtml(lk.text)}</span>
      </a>`;
    }).join('');
  }

  // Footer quick links
  const footerEl = document.getElementById('footerQuickLinks');
  if (footerEl) {
    footerEl.innerHTML = ql.map(lk => {
      const isExt  = lk.url.startsWith('http');
      const target = isExt ? ' target="_blank" rel="noopener noreferrer"' : '';
      return `<a href="${escNavHtml(lk.url)}" class="gf-link"${target}>${escNavHtml(lk.text)}</a>`;
    }).join('');
  }
}

// ─── AUTO-INIT ────────────────────────────────────────────────────────────────
// Render defaults immediately; non-index pages also fetch settings for fresh links.
document.addEventListener('DOMContentLoaded', () => {
  renderNavLinks(DEFAULT_LINKS);

  // index.html manages its own settings fetch and calls renderNavLinks() from index.js.
  // For all other pages (menu.html, etc.), fetch settings quietly here.
  if (!document.querySelector('.hero-v2')) {
    fetch('/api/settings')
      .then(r => r.ok ? r.json() : null)
      .then(data => { if (data?.quickLinks?.length) renderNavLinks(data.quickLinks); })
      .catch(() => {});
  }
});
