// ─── MENU DATA ────────────────────────────────────────────────────────────────
// Fallback used only if the API is unreachable
const MENU_FALLBACK = [
  { id:1, name:'Classic Snackbar Sub',   price:9.50,  photo:null, description:'Stacked high on a fresh hoagie roll with your choice of meats, crisp lettuce, tomato, and our house mustard.', addons:['Avocado +$1','Bacon +$1.50','Extra Cheese +$0.75','Jalapeños +$0.50','Double Meat +$2'] },
  { id:2, name:'BLT on Sourdough',   price:8.00,  photo:null, description:'Crispy applewood bacon, heirloom tomato, and romaine on thick-cut grilled sourdough.', addons:['Avocado +$1','Fried Egg +$1','Extra Bacon +$1.50','Hot Sauce +$0'] },
  { id:3, name:'Green Chile Burger', price:11.00, photo:null, description:'1/3 lb hand-formed patty smothered in roasted Hatch green chile and pepper jack cheese.', addons:['Extra Patty +$3','Bacon +$1.50','Mushrooms +$0.75','Caramelized Onions +$0.75','Extra Chile +$0.50'] },
  { id:4, name:'Breakfast Burrito',  price:8.50,  photo:null, description:'Scrambled eggs, potato, cheese, and salsa wrapped in a grilled flour tortilla. Fuel for the trail.', addons:['Bacon +$1.50','Sausage +$1.50','Avocado +$1','Extra Salsa +$0','Green Chile +$0.75'] },
  { id:5, name:'Turkey & Swiss',     price:9.00,  photo:null, description:'Sliced turkey breast, Swiss cheese, honey mustard, and crunchy pickles on a toasted roll.', addons:['Avocado +$1','Bacon +$1.50','Extra Turkey +$2','Sprouts +$0.50'] },
  { id:6, name:'Hot Dog',            price:4.50,  photo:null, description:'All-beef frank on a steamed bun. Simple, honest, good.', addons:['Chili +$1','Cheese Sauce +$0.75','Jalapeños +$0.50','Mustard & Relish +$0','Onions +$0'] },
  { id:7, name:'Grilled Cheese',     price:6.50,  photo:null, description:'Two kinds of melted cheese on buttered sourdough, griddled golden brown.', addons:['Tomato +$0.50','Bacon +$1.50','Jalapeños +$0.50'] },
  { id:8, name:'Green Salad',        price:7.00,  photo:null, description:'Fresh greens, cucumber, cherry tomatoes, and your choice of dressing.', addons:['Grilled Chicken +$3','Avocado +$1','Extra Dressing +$0','Croutons +$0.50'] },
];

let MENU = [];
let MENU_CATEGORIES = [];

// ─── HELPERS ─────────────────────────────────────────────────────────────────
function parseAddonPrice(label) {
  const m = String(label).match(/\+\$(\d+(?:\.\d+)?)/);
  return m ? parseFloat(m[1]) : 0;
}

function fmt(n) { return '$' + Number(n).toFixed(2); }

// ─── STATE ───────────────────────────────────────────────────────────────────
let cart = [];
let slideshowTimers = {};
let orderingOpen = false;          // true only when deli is open AND online ordering is enabled
let onlineOrderingEnabled = true;  // loaded from /api/settings
let sitePhone = '775-572-3200';    // loaded from /api/settings
let snackbarTaxRate = 0;            // loaded from /api/settings (0–100, percent)

// ─── BOOT ────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  document.getElementById('footerYear').textContent = new Date().getFullYear();
  // checkSnackbarHours and populatePickupTimes are called inside initMenu()
  // after loading snackbar hours from the API
  await initMenu();
});

// ─── SNACKBAR HOURS ──────────────────────────────────────────────────────────
// Fallback snackbar hours (Mon-Sat 9am-3pm, Sun closed)
const DAYS_ARR = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
let snackbarHours = DAYS_ARR.map((d,i) => ({ day:d, open:i<6?'09:00':null, close:i<6?'15:00':null, closed:i===6 }));

function toMins(t) { if (!t) return null; const [h,m]=t.split(':').map(Number); return h*60+m; }

function getTodaySnackbarHours() {
  const jsDay = new Date().getDay(); // 0=Sun
  const idx   = jsDay === 0 ? 6 : jsDay - 1;
  return snackbarHours[idx] || null;
}

// ─── LOAD MENU + SETTINGS FROM API ───────────────────────────────────────────
async function initMenu() {
  const grid = document.getElementById('menuGrid');
  grid.innerHTML = '<div class="menu-loading"><span>Loading menu…</span></div>';
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
        snackbarHours = sData.deliHours;
      }
      onlineOrderingEnabled = sData.onlineOrdering !== false;
      if (sData.phone)    sitePhone       = sData.phone;
      if (typeof sData.deliTax === 'number') snackbarTaxRate = sData.deliTax;

      // Apply dynamic phone to nav link
      const navPhone = document.getElementById('navPhone');
      if (navPhone && sData.phone) {
        const digits = sData.phone.replace(/\D/g, '');
        navPhone.textContent = sData.phone;
        navPhone.href = `tel:${digits}`;
      }
    }
  } catch (_) {
    MENU = MENU_FALLBACK;
  }
  populatePickupTimes();
  checkSnackbarHours();
  renderMenu();
}

// ─── SNACKBAR HOURS CHECK ────────────────────────────────────────────────────
function fmt12(t) {
  if (!t) return '—';
  const [h, m] = t.split(':').map(Number);
  const ampm = h < 12 ? 'AM' : 'PM';
  const h12  = h % 12 || 12;
  return `${h12}:${String(m).padStart(2,'0')} ${ampm}`;
}

function snackbarHoursVary() {
  const open = snackbarHours.filter(h => !h.closed);
  if (!open.length) return false;
  const first = `${open[0].open}|${open[0].close}`;
  return open.some(h => `${h.open}|${h.close}` !== first);
}

function summarizeSnackbarDays() {
  const open   = snackbarHours.filter(h => !h.closed);
  const closed = snackbarHours.filter(h => h.closed);
  if (!closed.length) return 'Open Every Day';
  if (closed.length === 1) return `Closed ${closed[0].day}`;
  if (!open.length) return 'Closed Every Day';
  return `${open[0].day} \u2013 ${open[open.length - 1].day}`;
}

function renderBannerHours() {
  const simpleEl   = document.getElementById('closedHoursSimple');
  const schedEl    = document.getElementById('closedHoursSchedule');
  const openDays   = snackbarHours.filter(h => !h.closed);

  if (!openDays.length) {
    document.getElementById('closedHoursTime').textContent = 'Closed';
    document.getElementById('closedHoursDays').textContent = 'All Days';
    simpleEl.style.display = ''; schedEl.style.display = 'none';
    return;
  }

  if (snackbarHoursVary()) {
    simpleEl.style.display = 'none';
    schedEl.style.display  = '';
    const now      = new Date();
    const todayIdx = now.getDay() === 0 ? 6 : now.getDay() - 1;
    schedEl.innerHTML = snackbarHours.map((h, i) => {
      const timeStr = h.closed ? 'Closed' : `${fmt12(h.open)} \u2013 ${fmt12(h.close)}`;
      const cls = [
        i === todayIdx ? 'sch-today' : '',
        h.closed ? 'sch-closed' : '',
      ].filter(Boolean).join(' ');
      return `<div class="closed-hours-schedule-row${cls ? ' '+cls : ''}">
        <span class="sch-day">${h.day}</span>
        <span class="sch-time">${timeStr}</span>
      </div>`;
    }).join('');
  } else {
    schedEl.style.display  = 'none';
    simpleEl.style.display = '';
    document.getElementById('closedHoursTime').textContent = `${fmt12(openDays[0].open)} \u2013 ${fmt12(openDays[0].close)}`;
    document.getElementById('closedHoursDays').textContent = summarizeSnackbarDays();
  }
}

// Returns a short hours summary, e.g. "Mon \u2013 Sat \u00a0 9:00 AM \u2013 3:00 PM"
function snackbarHoursShortSummary() {
  const openDays = snackbarHours.filter(h => !h.closed);
  if (!openDays.length) return '';
  const days = summarizeSnackbarDays();
  if (snackbarHoursVary()) return days;
  return `${days} &nbsp; ${fmt12(openDays[0].open)} &ndash; ${fmt12(openDays[0].close)}`;
}

// Returns just today's hours, e.g. "9:00 AM \u2013 3:00 PM" or "Closed Today"
function todayHoursText() {
  const today = getTodaySnackbarHours();
  if (!today || today.closed || !today.open || !today.close) return 'Closed Today';
  return `${fmt12(today.open)} &ndash; ${fmt12(today.close)}`;
}

function checkSnackbarHours() {
  const today = getTodaySnackbarHours();
  const now   = new Date();
  const mins  = now.getHours() * 60 + now.getMinutes();
  let snackbarIsOpen = false;
  if (today && !today.closed && today.open && today.close) {
    snackbarIsOpen = mins >= toMins(today.open) && mins < toMins(today.close);
  }

  const statusEl   = document.getElementById('headerStatus');
  const orderingEl = document.getElementById('orderingStatus');

  // Always show snackbar open/closed state
  if (statusEl) {
    if (snackbarIsOpen) {
      statusEl.className = 'header-status status-open';
      statusEl.innerHTML = `<span class="status-card-icon">&#10022;</span><span class="status-card-title">Snackbar Open</span><span class="status-card-sub">${todayHoursText()}</span>`;
    } else {
      statusEl.className = 'header-status status-closed';
      statusEl.innerHTML = `<span class="status-card-icon">&#10022;</span><span class="status-card-title">Snackbar Closed</span><span class="status-card-sub">${todayHoursText()}</span>`;
    }
  }

  // Show online ordering unavailable notice in addition if needed
  if (orderingEl) {
    if (!onlineOrderingEnabled) {
      orderingEl.style.display = '';
      orderingEl.innerHTML = `<span class="status-card-icon">&#10022;</span><span class="status-card-title">Online Ordering Unavailable</span><span class="status-card-sub">Call to order &nbsp;&middot;&nbsp; ${sitePhone}</span>`;
    } else {
      orderingEl.style.display = 'none';
    }
  }

  orderingOpen = snackbarIsOpen && onlineOrderingEnabled;
  document.getElementById('snackbarOpenContent').style.display = orderingOpen ? 'block' : 'none';
  // Floating cart is only meaningful when ordering is available
  if (!orderingOpen) document.getElementById('floatingCart').classList.remove('visible');
}

// ─── PICKUP TIME DROPDOWN ────────────────────────────────────────────────────
function populatePickupTimes() {
  const select = document.getElementById('pickupTime');
  if (!select) return;
  while (select.options.length > 1) select.remove(1);

  const today  = getTodaySnackbarHours();
  const START  = today && !today.closed && today.open  ? toMins(today.open)  : 9  * 60;
  const END    = today && !today.closed && today.close ? toMins(today.close) : 15 * 60;
  const STEP   = 30;
  const now    = new Date();
  const nowMins = now.getHours() * 60 + now.getMinutes();

  for (let m = START; m <= END; m += STEP) {
    if (m <= nowMins) continue;
    const h    = Math.floor(m / 60);
    const min  = m % 60;
    const ampm = h < 12 ? 'AM' : 'PM';
    const h12  = h % 12 || 12;
    const label = `${h12}:${String(min).padStart(2,'0')} ${ampm}`;
    const opt = document.createElement('option');
    opt.value = label; opt.textContent = label;
    select.appendChild(opt);
  }

  // If it's after closing all slots are gone — add a friendly note
  if (select.options.length === 1) {
    const opt = document.createElement('option');
    opt.value    = 'As soon as ready';
    opt.textContent = 'Snackbar closed — As soon as ready';
    opt.disabled = true;
    select.appendChild(opt);
  }
}

// ─── RENDER MENU ─────────────────────────────────────────────────────────────
function renderItemCard(item) {
  const defaultSet = new Set(item.defaultAddons || []);

  // Add-ons: interactive checkboxes when ordering is open; inline list when closed
  const addonsHTML = item.addons?.length ? (
    orderingOpen
      ? `<details class="addon-dropdown">
          <summary class="addon-summary">Add-ons <span class="addon-arrow">&#9662;</span></summary>
          <ul class="addons-list">${item.addons.map(a => {
            const isDefault = defaultSet.has(a);
            return `<li class="addon-item${isDefault?' checked':''}" data-default="${isDefault}"><label><input type="checkbox"${isDefault?' checked':''} onchange="syncAddon(this)"/><span>${a}</span></label></li>`;
          }).join('')}</ul>
        </details>`
      : `<div class="addons-display">
          <span class="addons-display-label">Add-ons</span>
          <span class="addons-display-items">${item.addons.join(' &middot; ')}</span>
        </div>`
  ) : '';

  // Options: select dropdowns when ordering is open; ordered list per option when closed
  const optionsHTML = item.options?.length ? (
    orderingOpen
      ? `<div class="item-options">${item.options.map(opt => `
          <div class="option-select-group">
            <label class="option-select-label">${opt.name}</label>
            <select class="option-select" data-option-name="${opt.name}">
              ${opt.choices.map(c => `<option value="${c}">${c}</option>`).join('')}
            </select>
          </div>`).join('')}
        </div>`
      : `<div class="options-display">${item.options.map(opt => `
          <div class="option-display-group">
            <span class="option-display-name">${opt.name}</span>
            <ol class="option-display-list">${opt.choices.map(c => `<li>${c}</li>`).join('')}</ol>
          </div>`).join('')}
        </div>`
  ) : '';

  const card = document.createElement('div');
  card.id = `card-${item.id}`;

  const addBtn = orderingOpen
    ? `<button class="btn-add-plus" onclick="addToCart(${item.id})">+</button>` : '';

  if (item.photo) {
    card.className = 'menu-card';
    card.innerHTML = `
      <div class="card-slideshow" id="slideshow-${item.id}">
        <div class="slide active"><img src="/images/${item.photo}" alt="${item.name}" loading="lazy"/></div>
        <div class="card-price-add card-price-add--overlay">
          <span class="card-price">${fmt(item.price)}</span>
          ${addBtn}
        </div>
      </div>
      <div class="card-body">
        <div class="card-name">${item.name}</div>
        ${item.description ? `<div class="card-desc">${item.description}</div>` : ''}
        ${optionsHTML}
        ${addonsHTML}
      </div>`;
  } else {
    card.className = 'menu-card no-photo';
    card.innerHTML = `
      <div class="card-body">
        <div class="card-name-price">
          <div class="card-name">${item.name}</div>
          <div class="card-price-add">
            <span class="card-price">${fmt(item.price)}</span>
            ${addBtn}
          </div>
        </div>
        ${item.description ? `<div class="card-desc">${item.description}</div>` : ''}
        ${optionsHTML}
        ${addonsHTML}
      </div>`;
  }
  return card;
}

function renderMenu() {
  const grid = document.getElementById('menuGrid');
  grid.innerHTML = '';
  if (!MENU.length) { grid.innerHTML = '<div class="menu-loading">No menu items.</div>'; return; }

  const cats = MENU_CATEGORIES.filter(c => c.id !== 0 || c.itemIds?.length);
  const sortedCats = [...cats.filter(c => c.id !== 0), ...cats.filter(c => c.id === 0)];
  const placedIds = new Set();

  if (sortedCats.length > 1 || (sortedCats.length === 1 && sortedCats[0].id !== 0)) {
    sortedCats.forEach(cat => {
      const catItems = (cat.itemIds || []).map(id => MENU.find(i => i.id === id)).filter(Boolean);
      if (!catItems.length) return;

      const wrap = document.createElement('div');
      wrap.className = 'cat-header-wrap';

      if (cat.photo) {
        const hero = document.createElement('div');
        hero.className = 'cat-hero-img';
        hero.innerHTML = `<img src="/images/${cat.photo}" alt="${cat.name}"/>`;
        wrap.appendChild(hero);
      }

      const heading = document.createElement('div');
      heading.className = 'menu-category-heading';
      heading.innerHTML = `<span class="cat-heading-star">&#10022;</span>${cat.name}<span class="cat-heading-star">&#10022;</span>`;
      wrap.appendChild(heading);

      if (cat.description) {
        const desc = document.createElement('div');
        desc.className = 'cat-header-desc';
        desc.textContent = cat.description;
        wrap.appendChild(desc);
      }

      grid.appendChild(wrap);

      catItems.forEach(item => { grid.appendChild(renderItemCard(item)); placedIds.add(item.id); });

      if (cat.footnotes) {
        const footWrap = document.createElement('div');
        footWrap.className = 'cat-footer-wrap';
        const footText = document.createElement('div');
        footText.className = 'cat-footer-notes';
        footText.textContent = cat.footnotes;
        footWrap.appendChild(footText);
        grid.appendChild(footWrap);
      }
    });
    MENU.filter(i => !placedIds.has(i.id)).forEach(item => grid.appendChild(renderItemCard(item)));
  } else {
    MENU.forEach(item => grid.appendChild(renderItemCard(item)));
  }
}

// ─── ADDONS ──────────────────────────────────────────────────────────────────
function syncAddon(cb) {
  cb.closest('.addon-item').classList.toggle('checked', cb.checked);
}

// ─── CART ────────────────────────────────────────────────────────────────────
function addToCart(itemId) {
  const item   = MENU.find(m => m.id === itemId);
  const card   = document.getElementById(`card-${itemId}`);
  const addons = [...card.querySelectorAll('.addon-item.checked span')]
    .map(s => s.textContent)
    .map(label => ({ label, price: parseAddonPrice(label) }));

  // Collect selected options (name: choice pairs, no price effect)
  const options = [...card.querySelectorAll('.option-select')]
    .map(sel => ({ name: sel.dataset.optionName, choice: sel.value }));

  cart.push({ item, addons, options, cartId: Date.now() + Math.random() });
  showToast(`${item.name} added to order`);
  renderOrder();
  document.getElementById('orderPanel').classList.add('visible');
  if (orderingOpen) document.getElementById('floatingCart').classList.add('visible');

  const btn = card.querySelector('.btn-add-plus');
  btn.textContent = '✓';
  btn.classList.add('added');
  setTimeout(() => { btn.textContent = '+'; btn.classList.remove('added'); }, 1500);

  // Reset addons to their default state
  card.querySelectorAll('.addon-item').forEach(el => {
    const isDef = el.dataset.default === 'true';
    el.classList.toggle('checked', isDef);
    const cb = el.querySelector('input[type="checkbox"]');
    if (cb) cb.checked = isDef;
  });
}

function removeFromCart(cartId) {
  cart = cart.filter(c => c.cartId !== cartId);
  renderOrder();
  if (!cart.length) document.getElementById('floatingCart').classList.remove('visible');
}

// ─── ORDER PANEL ─────────────────────────────────────────────────────────────
function renderOrder() {
  const list      = document.getElementById('orderList');
  const totalEl   = document.getElementById('orderTotal');
  const taxEl     = document.getElementById('taxAmount');
  const taxLabelEl = document.getElementById('taxLabel');
  const grandEl   = document.getElementById('orderGrandTotal');
  if (taxLabelEl) taxLabelEl.textContent = snackbarTaxRate ? `Tax (${snackbarTaxRate}%)` : 'Tax';
  const badge     = document.getElementById('cartBadge');
  const float     = document.getElementById('cartBubbleFloat');
  const secTitle  = document.getElementById('orderSectionTitle');

  badge.textContent = cart.length;
  float.textContent = cart.length;
  if (secTitle) secTitle.style.display = cart.length ? 'flex' : 'none';

  if (!cart.length) {
    list.innerHTML = '<li class="order-empty">Your order is empty.</li>';
    totalEl.textContent = '$0.00';
    if (taxEl) taxEl.textContent = '$0.00';
    if (grandEl) grandEl.textContent = '$0.00';
    return;
  }

  list.innerHTML = cart.map(c => {
    const addonsTotal = c.addons.reduce((s, a) => s + (a.price || 0), 0);
    const lineTotal   = c.item.price + addonsTotal;
    const addonsText  = c.addons.length
      ? `<div class="order-addons">${c.addons.map(a => a.label).join(', ')}</div>` : '';
    const optionsText = c.options?.length
      ? `<div class="order-addons">${c.options.map(o => `${o.name}: ${o.choice}`).join(' &middot; ')}</div>` : '';
    return `<li class="order-item">
      <div class="order-item-info">
        <div class="order-item-name">${c.item.name}</div>${optionsText}${addonsText}
      </div>
      <span class="order-item-price">${fmt(lineTotal)}</span>
      <button class="btn-remove-item" onclick="removeFromCart(${c.cartId})">&#215;</button>
    </li>`;
  }).join('');

  const subtotal  = calcSubtotal();
  const taxFrac   = snackbarTaxRate / 100;
  const tax       = Math.round(subtotal * taxFrac * 100) / 100;
  const grand     = Math.round((subtotal + tax) * 100) / 100;

  totalEl.textContent = fmt(subtotal);
  if (taxEl)   taxEl.textContent   = fmt(tax);
  if (grandEl) grandEl.textContent = fmt(grand);
}

function calcSubtotal() {
  return cart.reduce((s, c) => s + c.item.price + c.addons.reduce((a, x) => a + (x.price || 0), 0), 0);
}

function scrollToOrder() {
  document.getElementById('orderPanel').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// ─── SUBMIT ORDER ─────────────────────────────────────────────────────────────
function submitOrder() {
  const name     = document.getElementById('custName').value.trim();
  const phone    = document.getElementById('custPhone').value.trim();
  const notes    = document.getElementById('custNotes').value.trim();
  const pickup   = document.getElementById('pickupTime').value || 'As soon as ready';

  if (!name)        { showToast('Please enter your name');         return; }
  if (!phone)       { showToast('Please enter your phone number'); return; }
  if (!cart.length) { showToast('Your order is empty');            return; }

  const subtotal = calcSubtotal();
  const tax      = Math.round(subtotal * (snackbarTaxRate / 100) * 100) / 100;
  const total    = Math.round((subtotal + tax) * 100) / 100;
  const orderId  = 'ESM-' + Date.now().toString(36).toUpperCase();
  const ts       = new Date();

  // ─── Order object (ready for API integration) ──────────────────────────────
  const order = {
    id:             orderId,
    timestamp:      ts.toISOString(),
    customer_name:  name,
    customer_phone: phone,
    pickup_time:    pickup,
    notes:          notes,
    items: cart.map(c => ({
      id:           c.item.id,
      name:         c.item.name,
      base_price:   c.item.price,
      options:      c.options || [],
      addons:       c.addons.map(a => a.label),
      addons_total: c.addons.reduce((s, a) => s + (a.price || 0), 0),
    })),
    subtotal, tax, total, taxRate: snackbarTaxRate,
  };

  // ─────────────────────────────────────────────────────────────────────────
  // TODO — FUTURE INTEGRATIONS (uncomment when ready):
  //
  // 1. Log to Google Sheets via Apps Script Web App:
  //    fetch('https://script.google.com/macros/s/YOUR_DEPLOYMENT_ID/exec', {
  //      method: 'POST',
  //      body: JSON.stringify(order),
  //    });
  //
  // 2. Send to local print server (Node.js running on deli PC):
  //    fetch('http://localhost:3000/print', {
  //      method: 'POST',
  //      headers: { 'Content-Type': 'application/json' },
  //      body: JSON.stringify(order),
  //    });
  // ─────────────────────────────────────────────────────────────────────────

  buildReceipt(order);

  document.getElementById('checkoutForm').style.display = 'none';
  document.getElementById('orderSuccess').classList.add('visible');
  document.getElementById('floatingCart').classList.remove('visible');
  document.getElementById('orderSectionTitle').style.display = 'none';
}

// ─── BUILD RECEIPT ────────────────────────────────────────────────────────────
function buildReceipt(order) {
  const lines = document.getElementById('receiptLines');
  const meta  = document.getElementById('receiptMeta');

  // ── Pickup time banner (top, large) ──
  let html = `
    <div class="receipt-pickup">
      <span class="receipt-pickup-label">Desired Pickup Time</span>
      <span class="receipt-pickup-value">${order.pickup_time}</span>
    </div>`;

  // ── Item lines ──
  order.items.forEach(it => {
    html += `<div class="receipt-row item"><span>${it.name}</span><span>${fmt(it.base_price)}</span></div>`;
    (it.options || []).forEach(o => {
      html += `<div class="receipt-row addon"><span style="color:var(--gold-light)">${o.name}: ${o.choice}</span></div>`;
    });
    it.addons.forEach(a => {
      html += `<div class="receipt-row addon"><span>${a}</span></div>`;
    });
    if (it.addons_total > 0) {
      html += `<div class="receipt-row addon"><span style="margin-left:auto">Add-ons</span><span>${fmt(it.addons_total)}</span></div>`;
    }
  });

  // ── Totals ──
  html += `<div class="receipt-row" style="padding-top:8px;border-top:1px solid var(--charcoal-border)">
              <span>Subtotal</span><span>${fmt(order.subtotal)}</span></div>`;
  html += `<div class="receipt-row"><span>Tax${order.taxRate ? ` (${order.taxRate}%)` : ''}</span><span>${fmt(order.tax)}</span></div>`;
  html += `<div class="receipt-row total-line"><span>Total</span><span>${fmt(order.total)}</span></div>`;
  lines.innerHTML = html;

  // ── Customer info below the totals ──
  const d = new Date(order.timestamp);
  meta.innerHTML = `
    <span><strong>Order #:</strong> ${order.id}</span>
    <span><strong>Name:</strong> ${order.customer_name}</span>
    <span><strong>Phone:</strong> ${order.customer_phone}</span>
    ${order.notes ? `<span><strong>Notes:</strong> ${order.notes}</span>` : ''}
    <span><strong>Ordered at:</strong> ${d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</span>`;
}

// ─── PRINT RECEIPT ────────────────────────────────────────────────────────────
function printReceipt() {
  window.print();
}

// ─── PRINT MENU ───────────────────────────────────────────────────────────────
function printMenu() {
  const win = window.open('', '_blank');
  if (!win) { showToast('Please allow pop-ups to print the menu.'); return; }

  function piCard(item) {
    const addonsText = item.addons?.length
      ? `<div class="pi-addons"><span class="pi-label">Add-ons:</span> ${item.addons.join(' · ')}</div>` : '';
    const optsText = item.options?.length
      ? item.options.map(o => `<div class="pi-addons"><span class="pi-label">${o.name}:</span> ${o.choices.join(', ')}</div>`).join('') : '';
    const descText = item.description ? `<div class="pi-desc">${item.description}</div>` : '';
    const bodyContent = `
      <div class="pi-name-price">
        <span class="pi-name">${item.name}</span>
        <span class="pi-price">$${Number(item.price).toFixed(2)}</span>
      </div>
      ${descText}${optsText}${addonsText}`;
    if (item.photo) {
      return `<div class="pi-card"><div class="pi-img"><img src="/images/${item.photo}" alt="${item.name}"/></div><div class="pi-body">${bodyContent}</div></div>`;
    }
    return `<div class="pi-card no-photo"><div class="pi-body">${bodyContent}</div></div>`;
  }

  let html = '';
  const cats = MENU_CATEGORIES.filter(c => c.id !== 0 || c.itemIds?.length);
  const sorted = [...cats.filter(c => c.id !== 0), ...cats.filter(c => c.id === 0)];
  const placed = new Set();

  if (sorted.length > 1 || (sorted.length === 1 && sorted[0].id !== 0)) {
    sorted.forEach(cat => {
      const items = (cat.itemIds || []).map(id => MENU.find(i => i.id === id)).filter(Boolean);
      if (!items.length) return;
      html += `<div class="pm-cat-wrap">`;
      if (cat.photo) html += `<div class="pm-cat-hero"><img src="/images/${cat.photo}" alt="${cat.name}"/></div>`;
      html += `<div class="pm-cat-name"><span class="pm-cat-star">&#10022;</span>${cat.name}<span class="pm-cat-star">&#10022;</span></div>`;
      if (cat.description) html += `<div class="pm-cat-desc">${cat.description}</div>`;
      html += `<div class="pm-cat-items">${items.map(item => { placed.add(item.id); return piCard(item); }).join('')}</div>`;
      if (cat.footnotes) html += `<div class="pm-cat-footnotes">${cat.footnotes}</div>`;
      html += `</div>`;
    });
    MENU.filter(i => !placed.has(i.id)).forEach(item => { html += piCard(item); });
  } else {
    MENU.forEach(item => { html += piCard(item); });
  }

  win.document.write(`<!DOCTYPE html>
<html lang="en"><head>
<meta charset="UTF-8"/>
<title>Esmeralda Market — Snackbar Menu</title>
<link href="https://fonts.googleapis.com/css2?family=Oswald:wght@400;500;600;700&family=Source+Sans+3:wght@300;400;600&display=swap" rel="stylesheet"/>
<style>
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
@page{margin:0.4cm 0.5cm}
body{background:#F5F3EF;color:#1A1A18;font-family:'Source Sans 3',sans-serif;print-color-adjust:exact;-webkit-print-color-adjust:exact}
.pm-header{text-align:center;padding:12px 0 10px;border-bottom:2px solid #C9A96E;margin-bottom:14px}
.pm-header-name{font-family:'Oswald',sans-serif;font-size:28px;font-weight:700;letter-spacing:8px;text-transform:uppercase;color:#1A1A18;display:block;line-height:1}
.pm-header-name span{color:#7A5C28}
.pm-header-sub{font-family:'Oswald',sans-serif;font-size:10px;letter-spacing:5px;text-transform:uppercase;color:#7A5C28;display:block;margin-top:4px}
.pm-grid{padding:0 0 10px}
.pm-cat-wrap{break-inside:avoid;page-break-inside:avoid;margin-top:16px}
.pm-cat-wrap:first-child{margin-top:0}
.pm-cat-hero{height:130px;overflow:hidden;border-radius:4px 4px 0 0}
.pm-cat-hero img{width:100%;height:100%;object-fit:cover;display:block}
.pm-cat-items{columns:2;column-gap:8px}
.pm-cat-name{font-family:'Oswald',sans-serif;font-size:14px;letter-spacing:5px;text-transform:uppercase;color:#7A5C28;padding:8px 0 6px;display:flex;align-items:center;justify-content:center;gap:10px}
.pm-cat-name::before{content:'';flex:1;height:1px;background:linear-gradient(to right,transparent,#C9A96E)}
.pm-cat-name::after{content:'';flex:1;height:1px;background:linear-gradient(to left,transparent,#C9A96E)}
.pm-cat-star{color:#C9A96E;font-size:9px;flex-shrink:0;line-height:1}
.pm-cat-desc{font-size:10px;color:#6B6357;text-align:center;padding:0 16px 6px;font-style:italic;line-height:1.4}
.pm-cat-footnotes{font-size:10px;color:#6B6357;text-align:center;padding:6px 16px 2px;font-style:italic;line-height:1.4;border-top:1px solid #E0DAD0;margin-top:4px}
.pi-card{background:#FFF;border:1px solid #D8D3CA;border-radius:3px;overflow:hidden;break-inside:avoid;margin-bottom:8px}
.pi-img{height:100px;overflow:hidden}
.pi-img img{width:100%;height:100%;object-fit:cover;display:block}
.pi-body{padding:7px 10px 8px;display:flex;flex-direction:column;gap:3px}
.pi-name-price{display:flex;align-items:flex-start;justify-content:space-between;gap:6px}
.pi-name{font-family:'Oswald',sans-serif;font-size:13px;font-weight:600;letter-spacing:1px;text-transform:uppercase;color:#1A1A18;line-height:1.2}
.pi-price{font-family:'Oswald',sans-serif;font-size:12px;font-weight:600;color:#7A5C28;white-space:nowrap;background:#F5F3EF;border:1px solid #C9A96E;padding:1px 6px;border-radius:2px;flex-shrink:0}
.pi-desc{font-size:11px;color:#6A6460;font-style:italic;line-height:1.35}
.pi-addons{font-size:10px;color:#6A6460;line-height:1.35}
.pi-label{font-family:'Oswald',sans-serif;font-size:8px;letter-spacing:2px;text-transform:uppercase;color:#7A5C28;margin-right:2px}
@media print{*{print-color-adjust:exact;-webkit-print-color-adjust:exact}}
</style>
</head><body>
<div class="pm-header">
  <span class="pm-header-name">ESMERALDA Market</span>
  <span class="pm-header-sub">Snackbar Menu &nbsp;&middot;&nbsp; Call to Order &nbsp;&middot;&nbsp; ${sitePhone}</span>
</div>
<div class="pm-grid">${html}</div>
</body></html>`);
  win.document.close();
  setTimeout(() => { win.focus(); win.print(); }, 600);
}

// ─── NEW ORDER ───────────────────────────────────────────────────────────────
function startNewOrder() {
  cart = [];
  ['custName','custPhone','custNotes'].forEach(id => document.getElementById(id).value = '');
  populatePickupTimes();
  document.getElementById('checkoutForm').style.display = 'flex';
  document.getElementById('orderSuccess').classList.remove('visible');
  document.getElementById('orderPanel').classList.remove('visible');
  document.getElementById('orderSectionTitle').style.display = 'none';
  renderOrder();
}

// ─── TOAST ───────────────────────────────────────────────────────────────────
let toastTimer;
function showToast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 2500);
}
