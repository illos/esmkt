// ─── MENU DATA ────────────────────────────────────────────────────────────────
// Fallback used only if the API is unreachable
const MENU_FALLBACK = [
  { id:1, name:'Classic Deli Sub',   price:9.50,  photo:null, description:'Stacked high on a fresh hoagie roll with your choice of meats, crisp lettuce, tomato, and our house mustard.', addons:['Avocado +$1','Bacon +$1.50','Extra Cheese +$0.75','Jalapeños +$0.50','Double Meat +$2'] },
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

// ─── BOOT ────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  document.getElementById('footerYear').textContent = new Date().getFullYear();
  // checkDeliHours and populatePickupTimes are called inside initMenu()
  // after loading deli hours from the API
  await initMenu();
});

// ─── DELI HOURS ──────────────────────────────────────────────────────────────
// Fallback deli hours (Mon-Sat 9am-3pm, Sun closed)
const DAYS_ARR = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
let deliHours = DAYS_ARR.map((d,i) => ({ day:d, open:i<6?'09:00':null, close:i<6?'15:00':null, closed:i===6 }));

function toMins(t) { if (!t) return null; const [h,m]=t.split(':').map(Number); return h*60+m; }

function getTodayDeliHours() {
  const jsDay = new Date().getDay(); // 0=Sun
  const idx   = jsDay === 0 ? 6 : jsDay - 1;
  return deliHours[idx] || null;
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
        deliHours = sData.deliHours;
      }
    }
  } catch (_) {
    MENU = MENU_FALLBACK;
  }
  populatePickupTimes();
  checkDeliHours();
  renderMenu();
}

// ─── DELI HOURS CHECK ────────────────────────────────────────────────────────
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

function renderBannerHours() {
  const simpleEl   = document.getElementById('closedHoursSimple');
  const schedEl    = document.getElementById('closedHoursSchedule');
  const openDays   = deliHours.filter(h => !h.closed);

  if (!openDays.length) {
    document.getElementById('closedHoursTime').textContent = 'Closed';
    document.getElementById('closedHoursDays').textContent = 'All Days';
    simpleEl.style.display = ''; schedEl.style.display = 'none';
    return;
  }

  if (deliHoursVary()) {
    simpleEl.style.display = 'none';
    schedEl.style.display  = '';
    const now      = new Date();
    const todayIdx = now.getDay() === 0 ? 6 : now.getDay() - 1;
    schedEl.innerHTML = deliHours.map((h, i) => {
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
    document.getElementById('closedHoursDays').textContent = summarizeDeliDays();
  }
}

function checkDeliHours() {
  const today = getTodayDeliHours();
  const now   = new Date();
  const mins  = now.getHours() * 60 + now.getMinutes();
  let isOpen  = false;
  if (today && !today.closed && today.open && today.close) {
    isOpen = mins >= toMins(today.open) && mins < toMins(today.close);
  }
  renderBannerHours();
  document.getElementById('deliClosedBanner').classList.toggle('visible', !isOpen);
  document.getElementById('deliOpenContent').style.display = isOpen ? 'block' : 'none';
}

// ─── PICKUP TIME DROPDOWN ────────────────────────────────────────────────────
function populatePickupTimes() {
  const select = document.getElementById('pickupTime');
  if (!select) return;
  while (select.options.length > 1) select.remove(1);

  const today  = getTodayDeliHours();
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
    opt.textContent = 'Deli closed — As soon as ready';
    opt.disabled = true;
    select.appendChild(opt);
  }
}

// ─── RENDER MENU ─────────────────────────────────────────────────────────────
function renderMenu() {
  const grid = document.getElementById('menuGrid');
  grid.innerHTML = '';
  if (!MENU.length) { grid.innerHTML = '<div class="menu-loading">No menu items.</div>'; return; }

  // Build ordered list of items per category
  const cats = MENU_CATEGORIES.filter(c => c.id !== 0 || c.itemIds?.length);
  const sortedCats = [...cats.filter(c => c.id !== 0), ...cats.filter(c => c.id === 0)];
  const placedIds = new Set();

  function renderItemCard(item) {
    const defaultSet = new Set(item.defaultAddons || []);
    const addonsHTML = item.addons?.length ? `
      <details class="addon-dropdown">
        <summary class="addon-summary">Add-ons <span class="addon-arrow">&#9662;</span></summary>
        <ul class="addons-list">${item.addons.map(a => {
          const isDefault = defaultSet.has(a);
          return `<li class="addon-item${isDefault?' checked':''}" data-default="${isDefault}"><label><input type="checkbox"${isDefault?' checked':''} onchange="syncAddon(this)"/><span>${a}</span></label></li>`;
        }).join('')}</ul>
      </details>` : '';

    const optionsHTML = item.options?.length ? `
      <div class="item-options">${item.options.map(opt => `
        <div class="option-select-group">
          <label class="option-select-label">${opt.name}</label>
          <select class="option-select" data-option-name="${opt.name}">
            ${opt.choices.map(c => `<option value="${c}">${c}</option>`).join('')}
          </select>
        </div>`).join('')}
      </div>` : '';

    const slideContent = item.photo
      ? `<div class="slide active"><img src="/images/${item.photo}" alt="${item.name}" loading="lazy"/></div>`
      : `<div class="slide active"><div class="slide-placeholder">&#10022;</div></div>`;

    const card = document.createElement('div');
    card.className = 'menu-card';
    card.id = `card-${item.id}`;
    card.innerHTML = `
      <div class="card-slideshow" id="slideshow-${item.id}">
        ${slideContent}
        <div class="price-badge">${fmt(item.price)}</div>
      </div>
      <div class="card-body">
        <div class="card-name">${item.name}</div>
        <div class="card-desc">${item.description || ''}</div>
        ${optionsHTML}
        ${addonsHTML}
        <button class="btn-add" onclick="addToCart(${item.id})">Add to Order</button>
      </div>`;
    return card;
  }

  if (sortedCats.length > 1 || (sortedCats.length === 1 && sortedCats[0].id !== 0)) {
    // Render with category headings
    sortedCats.forEach(cat => {
      const catItems = (cat.itemIds || []).map(id => MENU.find(i => i.id === id)).filter(Boolean);
      if (!catItems.length) return;
      const heading = document.createElement('div');
      heading.className = 'menu-category-heading';
      heading.textContent = cat.name;
      grid.appendChild(heading);
      catItems.forEach(item => { grid.appendChild(renderItemCard(item)); placedIds.add(item.id); });
    });
    // Any items not in any category
    MENU.filter(i => !placedIds.has(i.id)).forEach(item => grid.appendChild(renderItemCard(item)));
  } else {
    // No categories — just flat list
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
  document.getElementById('floatingCart').classList.add('visible');

  const btn = card.querySelector('.btn-add');
  btn.textContent = '&#10022; Added';
  btn.classList.add('added');
  setTimeout(() => { btn.textContent = 'Add to Order'; btn.classList.remove('added'); }, 1500);

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
  const grandEl   = document.getElementById('orderGrandTotal');
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

  const subtotal = calcSubtotal();
  const tax      = Math.round(subtotal * 0.0685 * 100) / 100;
  const grand    = Math.round((subtotal + tax) * 100) / 100;

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
  const tax      = Math.round(subtotal * 0.0685 * 100) / 100;
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
    subtotal, tax, total,
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
  html += `<div class="receipt-row"><span>Tax (6.85%)</span><span>${fmt(order.tax)}</span></div>`;
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

// ─── PRINT ───────────────────────────────────────────────────────────────────
function printReceipt() {
  window.print();
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
