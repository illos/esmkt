// ─── ICON MAP ─────────────────────────────────────────────────────────────────
const NAV_ICONS = {
  map:      `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 10c0 7-9 13-9 13S3 17 3 10a9 9 0 0118 0z"/><circle cx="12" cy="10" r="3"/></svg>`,
  menu:     `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><path d="M14 17h7M17 14v7"/></svg>`,
  compass:  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M12 2v2M12 20v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M2 12h2M20 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/></svg>`,
  calendar: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>`,
  clock:    `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>`,
  phone:    `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6.62 10.79a15.05 15.05 0 006.59 6.59l2.2-2.2a1 1 0 011.01-.24 11.47 11.47 0 003.58.57 1 1 0 011 1V21a1 1 0 01-1 1A17 17 0 013 5a1 1 0 011-1h3.5a1 1 0 011 1c0 1.25.2 2.45.57 3.58a1 1 0 01-.25 1.01z"/></svg>`,
  facebook: `<svg viewBox="0 0 24 24" fill="currentColor" stroke="none"><path d="M24 12.073C24 5.405 18.627 0 12 0S0 5.405 0 12.073C0 18.1 4.388 23.094 10.125 24v-8.437H7.078v-3.49h3.047V9.41c0-3.025 1.792-4.697 4.533-4.697 1.312 0 2.686.235 2.686.235v2.97h-1.513c-1.491 0-1.956.93-1.956 1.884v2.25h3.328l-.532 3.49h-2.796V24C19.612 23.094 24 18.1 24 12.073z"/></svg>`,
  home:     `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>`,
  star:     `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>`,
  link:     `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71"/></svg>`,
  gas:      `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 22V8l6-6h6l6 6v14"/><line x1="3" y1="11" x2="21" y2="11"/><path d="M9 22V12h6v10"/></svg>`,
  info:     `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>`,
};

const DEFAULT_QUICK_LINKS = [
  { id:'1', icon:'map',      text:'Get Directions', url:'https://maps.app.goo.gl/dhU5oMRYwXpTUhmY9' },
  { id:'2', icon:'menu',     text:'Snackbar Menu',  url:'menu.html' },
  { id:'3', icon:'compass',  text:'Explore',        url:'#explore' },
  { id:'4', icon:'calendar', text:'Events',         url:'#events' },
  { id:'5', icon:'clock',    text:'Store Hours',    url:'#hours' },
  { id:'6', icon:'phone',    text:'Call Us',        url:'tel:7755723200' },
  { id:'7', icon:'facebook', text:'Facebook',       url:'https://www.facebook.com/WhiteMountainsNV' },
];

function getNavIcon(name) {
  return NAV_ICONS[name] || NAV_ICONS['link'];
}

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

// ─── RENDER QUICK LINKS (overlay + footer) ───────────────────────────────────
function renderNavOverlayLinks(links) {
  const ql = links || DEFAULT_QUICK_LINKS;

  // Nav overlay
  const overlayEl = document.getElementById('navOverlayLinks');
  if (overlayEl) {
    overlayEl.innerHTML = ql.map(lk => {
      const icon   = getNavIcon(lk.icon);
      const isExt  = lk.url.startsWith('http');
      const target = isExt ? ' target="_blank" rel="noopener noreferrer"' : '';
      return `<a href="${escNavHtml(lk.url)}" class="nav-overlay-link"${target} onclick="closeNavOverlay()">
        ${icon}<span>${escNavHtml(lk.text)}</span>
      </a>`;
    }).join('');
  }

  // Footer quick links (present on menu.html and any other page using this script)
  const footerEl = document.getElementById('footerQuickLinks');
  if (footerEl) {
    footerEl.innerHTML = ql.map(lk => {
      const isExt  = lk.url.startsWith('http');
      const target = isExt ? ' target="_blank" rel="noopener noreferrer"' : '';
      return `<a href="${escNavHtml(lk.url)}" class="gf-link"${target}>${getNavIcon(lk.icon)}${escNavHtml(lk.text)}</a>`;
    }).join('');
  }
}

// ─── AUTO-INIT ────────────────────────────────────────────────────────────────
// Render defaults immediately; non-index pages also fetch settings for fresh links.
document.addEventListener('DOMContentLoaded', () => {
  renderNavOverlayLinks(DEFAULT_QUICK_LINKS);

  // index.html manages its own settings fetch and calls renderNavOverlayLinks() from index.js.
  // For all other pages (menu.html, etc.), fetch settings quietly here.
  if (!document.querySelector('.hero-v2')) {
    fetch('/api/settings')
      .then(r => r.ok ? r.json() : null)
      .then(data => { if (data?.quickLinks?.length) renderNavOverlayLinks(data.quickLinks); })
      .catch(() => {});
  }
});
