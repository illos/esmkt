// ─── ICON RENDERING (Lucide) ──────────────────────────────────────────────────
// Map old short names → Lucide names for backwards compatibility
const NAV_ICON_ALIASES = {
  map:      'map-pin',
  menu:     'utensils',
  compass:  'compass',
  calendar: 'calendar',
  clock:    'clock',
  phone:    'phone',
  facebook: 'facebook',
  home:     'home',
  star:     'star',
  link:     'link',
  gas:      'fuel',
  info:     'info',
};

const DEFAULT_QUICK_LINKS = [
  { id:'1', icon:'map-pin',   text:'Get Directions', url:'https://maps.app.goo.gl/dhU5oMRYwXpTUhmY9' },
  { id:'2', icon:'utensils',  text:'Snackbar Menu',  url:'menu.html' },
  { id:'3', icon:'compass',   text:'Explore',        url:'#explore' },
  { id:'4', icon:'calendar',  text:'Events',         url:'#events' },
  { id:'5', icon:'clock',     text:'Store Hours',    url:'#hours' },
  { id:'6', icon:'phone',     text:'Call Us',        url:'tel:7755723200' },
  { id:'7', icon:'facebook',  text:'Facebook',       url:'https://www.facebook.com/WhiteMountainsNV' },
];

// lucide.icons[name] returns [[tag, attrs], ...] — build SVG string from that
function lucideToSvg(name, size, sw) {
  try {
    if (typeof lucide === 'undefined') return null;
    const nodes = lucide.icons?.[name];
    if (!Array.isArray(nodes) || !nodes.length) return null;
    const children = nodes.map(([tag, attrs]) =>
      `<${tag} ${Object.entries(attrs || {}).map(([k, v]) => `${k}="${v}"`).join(' ')}/>`
    ).join('');
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round">${children}</svg>`;
  } catch(e) { return null; }
}

function getNavIcon(name) {
  const resolved = NAV_ICON_ALIASES[name] || name;
  return lucideToSvg(resolved, 16, 1.5)
    || `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71"/></svg>`;
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
