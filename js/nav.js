// ─── LINK ICONS ──────────────────────────────────────────────────────────────
// All icons use currentColor so they inherit the link's color and can be
// tinted via CSS. Keep stroke-width consistent at 1.5.
const LINK_ICONS = {
  'map-pin':      `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 10c0 7-9 13-9 13S3 17 3 10a9 9 0 0118 0z"/><circle cx="12" cy="10" r="3"/></svg>`,
  'utensils':     `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M3 2v7c0 1.1.9 2 2 2h4a2 2 0 002-2V2"/><path d="M7 2v20"/><path d="M21 15V2a5 5 0 00-5 5v6c0 1.1.9 2 2 2h3zm0 0v7"/></svg>`,
  'compass':      `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76"/></svg>`,
  'star':         `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>`,
  'clock':        `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>`,
  'phone':        `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M6.62 10.79a15.05 15.05 0 006.59 6.59l2.2-2.2a1 1 0 011.01-.24 11.47 11.47 0 003.58.57 1 1 0 011 1V21a1 1 0 01-1 1A17 17 0 013 5a1 1 0 011-1h3.5a1 1 0 011 1c0 1.25.2 2.45.57 3.58a1 1 0 01-.25 1.01z"/></svg>`,
  'mail':         `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>`,
  'home':         `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>`,
  'shopping-bag': `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 01-8 0"/></svg>`,
  'calendar':     `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>`,
  'zap':          `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>`,
  'info':         `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>`,
  'globe':        `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z"/></svg>`,
  'share':        `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>`,
  'tag':          `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20.59 13.41l-7.17 7.17a2 2 0 01-2.83 0L2 12V2h10l8.59 8.59a2 2 0 010 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/></svg>`,
  'arrow-right':  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>`,
};

// Returns the SVG string for a given icon name, or '' if none/unknown.
function getLinkIcon(name) {
  return (name && LINK_ICONS[name]) ? LINK_ICONS[name] : '';
}

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
      const icon   = getLinkIcon(lk.icon);
      return `<a href="${escNavHtml(lk.url)}" class="nav-overlay-link"${target} onclick="closeNavOverlay()">
        ${icon}<span>${escNavHtml(lk.text)}</span>
      </a>`;
    }).join('');
  }

  // Footer quick links
  const footerEl = document.getElementById('footerQuickLinks');
  if (footerEl) {
    footerEl.innerHTML = ql.map(lk => {
      const isExt  = lk.url.startsWith('http');
      const target = isExt ? ' target="_blank" rel="noopener noreferrer"' : '';
      const icon   = getLinkIcon(lk.icon);
      return `<a href="${escNavHtml(lk.url)}" class="gf-link"${target}>${icon}${escNavHtml(lk.text)}</a>`;
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
