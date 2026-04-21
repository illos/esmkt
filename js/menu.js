// ─── FALLBACK DATA ────────────────────────────────────────────────────────────
const MENU_FALLBACK = [
  { id:1, name:'Classic Deli Sub',   price:9.50,  photo:null, description:'Stacked high on a fresh hoagie roll with your choice of meats, crisp lettuce, tomato, and our house mustard.',
    options:[{name:'Bread',choices:['Hoagie Roll','Sourdough','Wheat']}],
    addons:['Avocado +$1','Bacon +$1.50','Extra Cheese +$0.75','Jalapeños +$0.50','Double Meat +$2'] },
  { id:2, name:'BLT on Sourdough',   price:8.00,  photo:null, description:'Crispy applewood bacon, heirloom tomato, and romaine on thick-cut grilled sourdough.',
    addons:['Avocado +$1','Fried Egg +$1','Extra Bacon +$1.50','Hot Sauce +$0'] },
  { id:3, name:'Green Chile Burger', price:11.00, photo:null, description:'1/3 lb hand-formed patty smothered in roasted Hatch green chile and pepper jack cheese.',
    addons:['Extra Patty +$3','Bacon +$1.50','Mushrooms +$0.75','Caramelized Onions +$0.75','Extra Chile +$0.50'] },
  { id:4, name:'Breakfast Burrito',  price:8.50,  photo:null, description:'Scrambled eggs, potato, cheese, and salsa wrapped in a grilled flour tortilla. Fuel for the trail.',
    addons:['Bacon +$1.50','Sausage +$1.50','Avocado +$1','Extra Salsa +$0','Green Chile +$0.75'] },
  { id:5, name:'Turkey & Swiss',     price:9.00,  photo:null, description:'Sliced turkey breast, Swiss cheese, honey mustard, and crunchy pickles on a toasted roll.',
    addons:['Avocado +$1','Bacon +$1.50','Extra Turkey +$2','Sprouts +$0.50'] },
  { id:6, name:'Hot Dog',            price:4.50,  photo:null, description:'All-beef frank on a steamed bun. Simple, honest, good.',
    addons:['Chili +$1','Cheese Sauce +$0.75','Jalapeños +$0.50','Mustard & Relish +$0','Onions +$0'] },
  { id:7, name:'Grilled Cheese',     price:6.50,  photo:null, description:'Two kinds of melted cheese on buttered sourdough, griddled golden brown.',
    addons:['Tomato +$0.50','Bacon +$1.50','Jalapeños +$0.50'] },
  { id:8, name:'Green Salad',        price:7.00,  photo:null, description:'Fresh greens, cucumber, cherry tomatoes, and your choice of dressing.',
    addons:['Grilled Chicken +$3','Avocado +$1','Extra Dressing +$0','Croutons +$0.50'] },
];

let MENU = [];
let MENU_CATEGORIES = [];

// Fallback deli hours (Mon–Sat 9am–3pm, Sun closed)
const DAYS_ARR = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
let deliHours = DAYS_ARR.map((d,i) => ({
  day: d,
  open:   i < 6 ? '09:00' : null,
  close:  i < 6 ? '15:00' : null,
  closed: i === 6,
}));

// ─── HELPERS ─────────────────────────────────────────────────────────────────
function fmt(n) { return '$' + Number(n).toFixed(2); }
function escHtml(s) {
  return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function fmt12(t) {
  if (!t) return '—';
  const [h, m] = t.split(':').map(Number);
  const ampm = h < 12 ? 'AM' : 'PM';
  const h12  = h % 12 || 12;
  return `${h12}:${String(m).padStart(2,'0')} ${ampm}`;
}

function deliHoursVary() {
  const open = deliHours.filter(h => !h.closed);
  if (!open.length) return false;
  const first = `${open[0].open}|${open[0].close}`;
  return open.some(h => `${h.open}|${h.close}` !== first);
}

function summarizeDeliDays() {
  const open   = deliHours.filter(h => !h.closed);
  const closed = deliHours.filter(h => h.closed);
  if (!closed.length) return 'Open Every Day';
  if (closed.length === 1) return `Closed ${closed[0].day}`;
  if (!open.length) return 'Closed Every Day';
  return `${open[0].day} \u2013 ${open[open.length - 1].day}`;
}

// ─── RENDER HERO HOURS ────────────────────────────────────────────────────────
function renderHeroHours() {
  const timeEl  = document.getElementById('heroHoursTime');
  const daysEl  = document.getElementById('heroHoursDays');
  const schedEl = document.getElementById('heroHoursSchedule');
  const openDays = deliHours.filter(h => !h.closed);
  const jsDay   = new Date().getDay();
  const todayIdx = jsDay === 0 ? 6 : jsDay - 1;

  if (!openDays.length) {
    timeEl.textContent  = 'Closed';
    daysEl.textContent  = 'All Days';
    timeEl.style.display = '';
    daysEl.style.display = '';
    schedEl.style.display = 'none';
    return;
  }

  if (deliHoursVary()) {
    timeEl.style.display = 'none';
    daysEl.style.display = 'none';
    schedEl.style.display = '';
    schedEl.innerHTML = deliHours.map((h, i) => {
      const timeStr = h.closed ? 'Closed' : `${fmt12(h.open)} \u2013 ${fmt12(h.close)}`;
      const cls = [
        i === todayIdx ? 'sch-today' : '',
        h.closed       ? 'sch-closed' : '',
      ].filter(Boolean).join(' ');
      return `<div class="hero-sch-row${cls ? ' '+cls : ''}">
        <span class="sch-day">${h.day}</span>
        <span class="sch-time">${timeStr}</span>
      </div>`;
    }).join('');
  } else {
    timeEl.style.display  = '';
    daysEl.style.display  = '';
    schedEl.style.display = 'none';
    timeEl.textContent = `${fmt12(openDays[0].open)} \u2013 ${fmt12(openDays[0].close)}`;
    daysEl.textContent = summarizeDeliDays();
  }
}

// ─── BOOT ────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  document.getElementById('footerYear').textContent = new Date().getFullYear();
  await initMenu();
});

// ─── LOAD DATA FROM API ───────────────────────────────────────────────────────
async function initMenu() {
  try {
    const [menuRes, settingsRes] = await Promise.all([
      fetch('/api/menu'),
      fetch('/api/settings'),
    ]);
    if (menuRes.ok) {
      const data = await menuRes.json();
      MENU = data.items || [];
      MENU_CATEGORIES = data.categories || [];
    } else {
      MENU = MENU_FALLBACK;
    }
    if (settingsRes.ok) {
      const sData = await settingsRes.json();
      if (Array.isArray(sData.deliHours) && sData.deliHours.length === 7) {
        deliHours = sData.deliHours;
      }
    }
  } catch (_) {
    MENU = MENU_FALLBACK;
  }
  renderHeroHours();
  renderMenu();
}

// ─── RENDER MENU ─────────────────────────────────────────────────────────────
function renderMenu() {
  const grid = document.getElementById('menuGrid');
  grid.innerHTML = '';
  if (!MENU.length) {
    grid.innerHTML = '<div class="menu-loading">No menu items available.</div>';
    return;
  }

  const cats      = MENU_CATEGORIES.filter(c => c.id !== 0 || c.itemIds?.length);
  const sortedCats = [...cats.filter(c => c.id !== 0), ...cats.filter(c => c.id === 0)];
  const placedIds  = new Set();

  function renderCard(item) {
    // Photo or placeholder
    const imgHTML = item.photo
      ? `<img class="card-img" src="/images/${escHtml(item.photo)}" alt="${escHtml(item.name)}" loading="lazy"/>`
      : `<div class="card-img-placeholder">&#10022;</div>`;

    // Options: "Bread: Roll · White · Wheat"
    const optionsHTML = item.options?.length
      ? `<div class="card-options-list">${item.options.map(opt =>
          `<div class="card-option-row">
            <span class="card-option-name">${escHtml(opt.name)}:</span>
            <span class="card-option-choices">${opt.choices.map(c => escHtml(c)).join(' &middot; ')}</span>
          </div>`
        ).join('')}</div>` : '';

    // Add-ons: bulleted list
    const addonsHTML = item.addons?.length
      ? `<div class="card-addons-row">
          <span class="card-addons-label">Options:</span>${item.addons.map(a => escHtml(a)).join(' &middot; ')}
        </div>` : '';

    const card = document.createElement('div');
    card.className = 'menu-card';
    card.innerHTML = `
      <div class="card-img-wrap">
        ${imgHTML}
        <div class="price-badge">${fmt(item.price)}</div>
      </div>
      <div class="card-body">
        <div class="card-name">${escHtml(item.name)}</div>
        ${item.description ? `<div class="card-desc">${escHtml(item.description)}</div>` : ''}
        ${optionsHTML}
        ${addonsHTML}
      </div>`;
    return card;
  }

  if (sortedCats.length > 1 || (sortedCats.length === 1 && sortedCats[0].id !== 0)) {
    sortedCats.forEach(cat => {
      const catItems = (cat.itemIds || []).map(id => MENU.find(i => i.id === id)).filter(Boolean);
      if (!catItems.length) return;

      // Wrap heading + first 2 cards (one row) in .cat-anchor so they can't
      // be split across pages in print. display:contents on screen makes the
      // wrapper invisible — children slot into the outer grid as normal.
      const anchor = document.createElement('div');
      anchor.className = 'cat-anchor';

      const heading = document.createElement('div');
      heading.className = 'menu-category-heading';
      heading.textContent = cat.name;
      anchor.appendChild(heading);

      // First row (up to 2 cards) goes inside the anchor
      const firstRow = catItems.slice(0, 2);
      firstRow.forEach(item => { anchor.appendChild(renderCard(item)); placedIds.add(item.id); });
      grid.appendChild(anchor);

      // Remaining cards go directly into the outer grid
      catItems.slice(2).forEach(item => { grid.appendChild(renderCard(item)); placedIds.add(item.id); });
    });
    MENU.filter(i => !placedIds.has(i.id)).forEach(item => grid.appendChild(renderCard(item)));
  } else {
    MENU.forEach(item => grid.appendChild(renderCard(item)));
  }
}
