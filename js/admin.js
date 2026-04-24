// ─── STATE ────────────────────────────────────────────────────────────────────
let authToken = sessionStorage.getItem('esm_admin_token') || null;
let menuItems = [];
let menuCategories = [];
let editingItem = null;
let pendingDeleteAction = null;
let newPhotoFile = null;
let clearExistingPhoto = false;

// ─── BOOT ─────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  if (authToken) showList();
  setupUploadArea('uploadArea', applyPhotoFile);
  setupUploadArea('eventUploadArea', applyEventPhotoFile);
});

function setupUploadArea(areaId, onFileFn) {
  const area = document.getElementById(areaId);
  if (!area) return;
  area.addEventListener('dragover', e => { e.preventDefault(); area.classList.add('drag-over'); });
  area.addEventListener('dragleave', () => area.classList.remove('drag-over'));
  area.addEventListener('drop', e => {
    e.preventDefault(); area.classList.remove('drag-over');
    const f = e.dataTransfer?.files?.[0];
    if (f) onFileFn(f);
  });
}

// ─── AUTH ─────────────────────────────────────────────────────────────────────
async function doLogin() {
  const pw  = document.getElementById('loginPassword').value;
  const btn = document.getElementById('loginBtn');
  const err = document.getElementById('loginError');

  if (!pw) { showLoginError('Please enter a password.'); return; }

  btn.disabled = true;
  btn.textContent = 'Signing in…';
  err.classList.remove('visible');

  try {
    const res  = await fetch('/api/auth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: pw }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Login failed.');
    authToken = data.token;
    sessionStorage.setItem('esm_admin_token', authToken);
    document.getElementById('loginPassword').value = '';
    showList();
  } catch (e) {
    showLoginError(e.message);
  } finally {
    btn.disabled = false;
    btn.textContent = 'Sign In';
  }
}

function showLoginError(msg) {
  const el = document.getElementById('loginError');
  el.textContent = msg;
  el.classList.add('visible');
}

function logout() {
  authToken = null;
  sessionStorage.removeItem('esm_admin_token');
  showPage('pageLogin');
  document.getElementById('navLogout').classList.remove('visible');
  document.getElementById('adminTabs').classList.remove('visible');
}

// ─── PAGE ROUTING ─────────────────────────────────────────────────────────────
function showPage(id) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.getElementById(id).classList.add('active');
}

let activeTab = 'menu';

// Map of tab key → tab button element id (since capitalization doesn't map cleanly)
const TAB_BTN_IDS = {
  storeinfo: 'tabStoreInfo',
  pages:     'tabPages',
  menu:      'tabMenu',
  events:    'tabEvents',
  settings:  'tabSettings'
};

function switchTab(tab) {
  // Unsaved-changes guard: when leaving the Pages tab with pending edits.
  if (activeTab === 'pages' && tab !== 'pages' && hasUnsavedPageChanges()) {
    if (!confirm('You have unsaved layout changes on this page. Leave without saving?')) return;
    // User opted to discard — clear the dirty state so subsequent checks don't re-prompt
    pageHomeOriginal = JSON.stringify(pageHomeSections);
  }
  activeTab = tab;
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  const btnId = TAB_BTN_IDS[tab];
  if (btnId) document.getElementById(btnId)?.classList.add('active');
  if (tab === 'storeinfo') {
    // Store Info combines the old Site Info, Hours, Contact Email, and Links.
    // Load both settings + hours in one trip; they share the same endpoint.
    showPage('pageStoreInfo');
    loadStoreInfo();
  }
  if (tab === 'pages')    { showPage('pagePages');    loadPagesList(); }
  if (tab === 'menu')     { showPage('pageList');     loadMenu(); }
  if (tab === 'events')   { showPage('pageEvents');   loadEvents(); }
  if (tab === 'settings') {
    // New Settings tab: tax, online ordering, print server, Turnstile.
    showPage('pageSettings');
    loadSettings();
  }
}

// Returns true if the current Pages admin state has unsaved changes
// (differs from what was last loaded/saved). Used by navigation guards.
function hasUnsavedPageChanges() {
  if (!pageHomeOriginal) return false;
  try {
    return pageHomeOriginal !== JSON.stringify(pageHomeSections);
  } catch (_) { return false; }
}

// Browser-level warning on refresh/close with pending Pages changes
window.addEventListener('beforeunload', function (e) {
  if (hasUnsavedPageChanges()) {
    e.preventDefault();
    // Modern browsers ignore custom text, but returning a truthy value still triggers the dialog
    e.returnValue = 'You have unsaved layout changes. Leave anyway?';
    return e.returnValue;
  }
});

async function showList() {
  document.getElementById('navLogout').classList.add('visible');
  document.getElementById('adminTabs').classList.add('visible');
  switchTab('storeinfo');
}

// ─── ORDERING UI HELPER ───────────────────────────────────────────────────────
function updateOrderingUI(enabled) {
  const toggle = document.getElementById('onlineOrderingToggle');
  const desc   = document.getElementById('orderingStatusDesc');
  if (toggle) toggle.checked = enabled;
  if (desc) {
    desc.textContent  = enabled ? 'Enabled' : 'Disabled';
    desc.style.color  = enabled ? '' : 'var(--cream-dim)';
  }
}

// ─── MENU API ─────────────────────────────────────────────────────────────────
async function loadMenu() {
  const container = document.getElementById('categoryContainer');
  container.innerHTML = '<div style="padding:40px;text-align:center;color:var(--cream-dim);font-style:italic"><span class="spinner"></span> Loading…</div>';

  // Load settings to initialise the online ordering toggle (if not already loaded)
  if (!settingsData) {
    try {
      const sRes = await apiFetch('/api/settings');
      if (sRes.ok) settingsData = await sRes.json();
    } catch(_) {}
  }
  updateOrderingUI(settingsData?.onlineOrdering !== false);

  try {
    const res  = await apiFetch('/api/menu');
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Could not load menu.');
    menuItems      = data.items      || [];
    menuCategories = data.categories || [];
    renderCategories();
  } catch (e) {
    container.innerHTML = `<div style="padding:24px;color:var(--danger);font-size:13px">Error: ${e.message}</div>`;
    if (e.message.includes('401') || e.message.includes('Unauthorized')) logout();
  }
}

// ─── RENDER CATEGORIES ────────────────────────────────────────────────────────
function renderCategories() {
  const container = document.getElementById('categoryContainer');
  if (!menuCategories.length) {
    container.innerHTML = '<div class="empty-state">No categories. Click "+ Category" to add one.</div>';
    return;
  }

  // Non-uncategorized first, then Uncategorized (id=0) last
  const sorted = [
    ...menuCategories.filter(c => c.id !== 0),
    menuCategories.find(c => c.id === 0),
  ].filter(Boolean);

  container.innerHTML = sorted.map(cat => renderCategoryBlock(cat)).join('');
}

function renderCategoryBlock(cat) {
  const isUncat = cat.id === 0;
  const items   = (cat.itemIds || []).map(id => menuItems.find(i => i.id === id)).filter(Boolean);
  const count   = items.length;

  const headerHandle = isUncat
    ? ''
    : `<span class="cat-drag-handle" draggable="true"
         ondragstart="onCatDragStart(event,${cat.id})"
         title="Drag to reorder">&#8942;&#8942;</span>`;

  const photoControl = isUncat ? '' : (cat.photo
    ? `<div class="cat-photo-control">
         <img class="cat-header-thumb" src="/images/${cat.photo}" alt=""/>
         <button class="btn-remove-cat-photo" onclick="removeCatPhoto(event,${cat.id})" title="Remove photo">&#215;</button>
       </div>`
    : `<label class="cat-photo-control cat-photo-empty" title="Add hero photo">
         <span class="cat-photo-icon">&#128247;</span>
         <input type="file" accept="image/jpeg,image/png,image/webp,image/gif" style="display:none"
           onchange="handleCatPhotoSelect(this,${cat.id})"/>
       </label>`);

  const headerName = isUncat
    ? `<span class="cat-name-text">Uncategorized</span>`
    : `<input class="cat-name-input" type="text" value="${esc(cat.name)}"
         data-cat-id="${cat.id}" data-orig="${esc(cat.name)}"
         onblur="saveCatName(this,${cat.id})"
         onkeydown="if(event.key==='Enter')this.blur();if(event.key==='Escape'){this.value=this.dataset.orig;this.blur();}"/>`;

  const deleteBtn = isUncat ? '' : `<button class="btn-delete-cat" onclick="promptDeleteCat(${cat.id})" title="Delete category">&#215;</button>`;

  const itemsHtml = count
    ? items.map(item => renderItemRow(item, cat.id)).join('')
    : `<div class="category-empty-zone" data-cat-id="${cat.id}">Drop items here</div>`;

  const descRow = isUncat ? '' : `
    <div class="cat-desc-row">
      <input class="cat-desc-input" type="text" value="${esc(cat.description || '')}"
        placeholder="Category description (optional)"
        data-cat-id="${cat.id}"
        onblur="saveCatDesc(this,${cat.id})"
        onkeydown="if(event.key==='Enter')this.blur()"/>
    </div>`;

  const footnotesRow = isUncat ? '' : `
    <div class="cat-footnotes-row">
      <input class="cat-footnotes-input" type="text" value="${esc(cat.footnotes || '')}"
        placeholder="Footnotes &mdash; shown after items (optional)"
        data-cat-id="${cat.id}"
        onblur="saveCatFootnotes(this,${cat.id})"
        onkeydown="if(event.key==='Enter')this.blur()"/>
    </div>`;

  return `<div class="category-block${isUncat ? ' cat-uncategorized' : ''}" data-cat-id="${cat.id}"
    ondragover="onCatBlockDragOver(event,${cat.id})"
    ondrop="onCatBlockDrop(event,${cat.id})"
    ondragend="onCatDragEnd(event)">
    <div class="category-header">
      ${headerHandle}
      ${photoControl}
      ${headerName}
      <span class="cat-item-count">${count} item${count!==1?'s':''}</span>
      ${deleteBtn}
    </div>
    ${descRow}
    <div class="category-items" data-cat-id="${cat.id}"
      ondragover="onCatItemsDragOver(event,${cat.id})"
      ondrop="onCatItemsDrop(event,${cat.id})">
      ${itemsHtml}
    </div>
    ${footnotesRow}
    <button class="btn-add-item-in-cat" onclick="openForm(null,${cat.id})">+ Add Item</button>
  </div>`;
}

function renderItemRow(item, catId) {
  const thumbHtml = item.photo
    ? `<div class="item-card-thumb"><img src="/images/${item.photo}" alt="" loading="lazy"/></div>`
    : '';
  return `<div class="item-row" draggable="true" data-item-id="${item.id}" data-cat-id="${catId}"
    ondragstart="onItemDragStart(event,${item.id},${catId})"
    ondragover="onItemDragOver(event,${item.id},${catId})"
    ondrop="onItemDrop(event,${item.id},${catId})"
    ondragend="onItemDragEnd(event)">
    <span class="item-drag-handle">&#8942;&#8942;</span>
    ${thumbHtml}
    <div class="item-card-body">
      <div class="item-card-title">${esc(item.name)}</div>
      <div class="item-card-price">$${Number(item.price).toFixed(2)}</div>
      <div class="item-card-actions">
        <button class="btn-edit" onclick="openForm(${item.id})">Edit</button>
        <button class="btn-delete" onclick="promptDeleteItem(${item.id},'${esc(item.name)}')">Delete</button>
      </div>
    </div>
  </div>`;
}

// ─── DRAG: ITEMS ──────────────────────────────────────────────────────────────
let dragType = null, dragItemId = null, dragSrcCatId = null, dragCatId = null;

function onItemDragStart(e, itemId, catId) {
  dragType = 'item'; dragItemId = itemId; dragSrcCatId = catId;
  e.currentTarget.classList.add('item-dragging');
  e.dataTransfer.effectAllowed = 'move';
  e.dataTransfer.setData('text/plain','item');
}
function onItemDragOver(e, targetItemId, targetCatId) {
  if (dragType !== 'item') return;
  e.preventDefault(); e.stopPropagation();
  clearItemDragOver(); clearCatDragOver();
  e.currentTarget.classList.add('item-drag-over');
}
function onItemDrop(e, targetItemId, targetCatId) {
  if (dragType !== 'item') return;
  e.preventDefault(); e.stopPropagation();
  if (dragItemId === targetItemId) return;
  moveItem(dragItemId, dragSrcCatId, targetCatId, targetItemId);
}
function onItemDragEnd(e) {
  clearItemDragOver(); clearCatDragOver();
  document.querySelectorAll('.item-dragging').forEach(el => el.classList.remove('item-dragging'));
  dragType = null;
}

// Drop on category items zone (empty area / end of list)
function onCatItemsDragOver(e, catId) {
  if (dragType !== 'item') return;
  e.preventDefault();
  clearItemDragOver(); clearCatDragOver();
  const zone = e.currentTarget.querySelector('.category-empty-zone');
  if (zone) zone.classList.add('drop-active');
  else e.currentTarget.classList.add('drop-active');
}
function onCatItemsDrop(e, catId) {
  if (dragType !== 'item') return;
  e.preventDefault();
  moveItem(dragItemId, dragSrcCatId, catId, null);
}

// Move item in category data, then re-render
function moveItem(itemId, srcCatId, dstCatId, beforeItemId) {
  const srcCat = menuCategories.find(c => c.id === srcCatId);
  const dstCat = menuCategories.find(c => c.id === dstCatId);
  if (!srcCat || !dstCat) return;
  // Remove from source
  srcCat.itemIds = srcCat.itemIds.filter(id => id !== itemId);
  // Insert into dest
  if (beforeItemId != null) {
    const idx = dstCat.itemIds.indexOf(beforeItemId);
    if (idx === -1) dstCat.itemIds.push(itemId);
    else dstCat.itemIds.splice(idx, 0, itemId);
  } else {
    if (!dstCat.itemIds.includes(itemId)) dstCat.itemIds.push(itemId);
  }
  renderCategories();
  saveFullState();
}

// ─── DRAG: CATEGORIES ─────────────────────────────────────────────────────────
function onCatDragStart(e, catId) {
  dragType = 'cat'; dragCatId = catId;
  e.currentTarget.closest('.category-block')?.classList.add('cat-dragging');
  e.dataTransfer.effectAllowed = 'move';
  e.dataTransfer.setData('text/plain','cat');
  e.stopPropagation();
}
function onCatBlockDragOver(e, targetCatId) {
  if (dragType !== 'cat' || targetCatId === dragCatId) return;
  e.preventDefault();
  clearCatDragOver();
  e.currentTarget.classList.add('cat-drag-over');
}
function onCatBlockDrop(e, targetCatId) {
  if (dragType !== 'cat') return;
  e.preventDefault();
  if (dragCatId === targetCatId) return;
  const srcIdx = menuCategories.findIndex(c => c.id === dragCatId);
  const tgtIdx = menuCategories.findIndex(c => c.id === targetCatId);
  if (srcIdx === -1 || tgtIdx === -1) return;
  const [moved] = menuCategories.splice(srcIdx, 1);
  menuCategories.splice(tgtIdx, 0, moved);
  renderCategories();
  saveFullState();
}
function onCatDragEnd(e) {
  clearCatDragOver();
  document.querySelectorAll('.cat-dragging').forEach(el => el.classList.remove('cat-dragging'));
  dragType = null;
}

function clearItemDragOver() { document.querySelectorAll('.item-drag-over').forEach(el => el.classList.remove('item-drag-over')); }
function clearCatDragOver()  { document.querySelectorAll('.cat-drag-over,.drop-active').forEach(el => el.classList.remove('cat-drag-over','drop-active')); }

// ─── CATEGORY MANAGEMENT ──────────────────────────────────────────────────────
function addCategory() {
  const newId = Math.max(...menuCategories.map(c => c.id), 0) + 1;
  const newCat = { id: newId, name: 'New Category', itemIds: [], photo: null, description: '' };
  const uncatIdx = menuCategories.findIndex(c => c.id === 0);
  if (uncatIdx !== -1) menuCategories.splice(uncatIdx, 0, newCat);
  else menuCategories.push(newCat);
  renderCategories();
  saveFullState();
  setTimeout(() => {
    const inp = document.querySelector(`.cat-name-input[data-cat-id="${newId}"]`);
    if (inp) { inp.select(); inp.focus(); }
  }, 40);
}

function saveCatName(input, catId) {
  const name = input.value.trim();
  if (!name) { input.value = input.dataset.orig; return; }
  const cat = menuCategories.find(c => c.id === catId);
  if (cat && cat.name !== name) { cat.name = name; input.dataset.orig = name; saveFullState(); }
}

function saveCatDesc(input, catId) {
  const desc = input.value.trim();
  const cat  = menuCategories.find(c => c.id === catId);
  if (cat && cat.description !== desc) { cat.description = desc; saveFullState(); }
}

function saveCatFootnotes(input, catId) {
  const footnotes = input.value.trim();
  const cat       = menuCategories.find(c => c.id === catId);
  if (cat && cat.footnotes !== footnotes) { cat.footnotes = footnotes; saveFullState(); }
}

async function handleCatPhotoSelect(input, catId) {
  const file = input.files?.[0];
  if (!file) return;
  if (!file.type.startsWith('image/')) { showToast('Please select an image file.', true); return; }
  if (file.size > 5 * 1024 * 1024) { showToast('Image must be under 5 MB.', true); return; }
  try {
    const fd = new FormData();
    fd.append('file', file);
    fd.append('itemName', `category-${catId}`);
    const res  = await apiFetch('/api/upload', { method: 'POST', body: fd });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Upload failed.');
    const cat = menuCategories.find(c => c.id === catId);
    if (cat) cat.photo = data.filename;
    renderCategories();
    saveFullState();
  } catch(e) { showToast(e.message, true); }
}

function removeCatPhoto(e, catId) {
  e.stopPropagation(); e.preventDefault();
  const cat = menuCategories.find(c => c.id === catId);
  if (cat) { cat.photo = null; renderCategories(); saveFullState(); }
}

function promptDeleteCat(catId) {
  const cat      = menuCategories.find(c => c.id === catId);
  const n        = cat?.itemIds.length || 0;
  const body     = n ? `Delete "${cat.name}"? ${n} item${n===1?'':'s'} will move to Uncategorized.`
                     : `Delete "${cat.name}"? This cannot be undone.`;
  showConfirmModal('Delete Category?', body, () => {
    const uncat = menuCategories.find(c => c.id === 0);
    if (uncat) cat.itemIds.forEach(id => { if (!uncat.itemIds.includes(id)) uncat.itemIds.push(id); });
    menuCategories = menuCategories.filter(c => c.id !== catId);
    renderCategories();
    saveFullState();
  });
}

async function saveFullState() {
  try {
    const res = await apiFetch('/api/menu', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ items: menuItems, categories: menuCategories }),
    });
    if (!res.ok) throw new Error('Save failed');
    showToast('Saved.');
  } catch (e) { showToast('Could not save.', true); }
}

// ─── ITEM FORM ─────────────────────────────────────────────────────────────────
function openForm(itemId, defaultCatId) {
  editingItem = itemId ? menuItems.find(m => m.id === itemId) || null : null;
  newPhotoFile = null;
  clearExistingPhoto = false;

  document.getElementById('formTitle').textContent = editingItem ? 'Edit Menu Item' : 'Add Menu Item';
  document.getElementById('fName').value  = editingItem?.name        || '';
  document.getElementById('fPrice').value = editingItem?.price != null ? editingItem.price : '';
  document.getElementById('fDesc').value  = editingItem?.description  || '';

  // Category selector
  const catSel = document.getElementById('fCategory');
  catSel.innerHTML = menuCategories
    .filter(c => c.id !== 0 || !menuCategories.some(x => x.id !== 0))
    .map(c => `<option value="${c.id}">${esc(c.name)}</option>`)
    .join('');
  // Always include Uncategorized as option
  if (!catSel.querySelector('option[value="0"]')) {
    catSel.innerHTML += '<option value="0">Uncategorized</option>';
  }
  if (editingItem) {
    const curCat = menuCategories.find(c => c.itemIds?.includes(editingItem.id));
    if (curCat) catSel.value = curCat.id;
  } else if (defaultCatId != null) {
    catSel.value = defaultCatId;
  } else {
    // Default to first non-uncategorized category
    const first = menuCategories.find(c => c.id !== 0);
    if (first) catSel.value = first.id;
    else catSel.value = 0;
  }

  // Photo state
  resetPhotoUI();
  const note = document.getElementById('currentImageNote');
  if (editingItem?.photo) {
    document.getElementById('imagePreview').src = `/images/${editingItem.photo}`;
    document.getElementById('previewWrap').classList.add('has-image');
    document.getElementById('uploadPlaceholder').style.display = 'none';
    note.textContent = 'Current photo shown above. Upload a new one to replace it, or click × to remove.';
  } else {
    note.textContent = '';
  }

  // Options checkbox editor (with default checkbox state)
  const editor = document.getElementById('addonsEditor');
  editor.innerHTML = '';
  const defaultSet = new Set(editingItem?.defaultOptions || []);
  (editingItem?.options || []).forEach(a => addAddonRow(a, defaultSet.has(a)));

  // Choices
  const optEditor = document.getElementById('optionsEditor');
  optEditor.innerHTML = '';
  (editingItem?.choices || []).forEach(o => addOptionBlock(o));

  showPage('pageForm');
}

function resetPhotoUI() {
  document.getElementById('photoFile').value = '';
  document.getElementById('imagePreview').src = '';
  document.getElementById('previewWrap').classList.remove('has-image');
  document.getElementById('uploadPlaceholder').style.display = '';
}

function handlePhotoSelect(input) {
  const f = input.files?.[0];
  if (f) applyPhotoFile(f);
}

function applyPhotoFile(file) {
  if (!file.type.startsWith('image/')) { showToast('Please select an image file.', true); return; }
  if (file.size > 5 * 1024 * 1024)    { showToast('Image must be under 5 MB.', true);   return; }
  newPhotoFile = file;
  clearExistingPhoto = false;
  const reader = new FileReader();
  reader.onload = e => {
    document.getElementById('imagePreview').src = e.target.result;
    document.getElementById('previewWrap').classList.add('has-image');
    document.getElementById('uploadPlaceholder').style.display = 'none';
    document.getElementById('currentImageNote').textContent = `Ready to upload: ${file.name}`;
  };
  reader.readAsDataURL(file);
}

function clearPhoto(e) {
  e.stopPropagation();
  e.preventDefault();
  newPhotoFile = null;
  clearExistingPhoto = true;
  resetPhotoUI();
  document.getElementById('currentImageNote').textContent = '';
}

// ─── ADD-ONS EDITOR ───────────────────────────────────────────────────────────
function addAddonRow(existingValue, isDefault) {
  const editor = document.getElementById('addonsEditor');
  let addonName = '', addonPrice = '';
  if (existingValue) {
    const m = String(existingValue).match(/^(.+?)\s*\+\$(\d+(?:\.\d+)?)$/);
    if (m) { addonName = m[1].trim(); addonPrice = m[2]; }
    else    { addonName = existingValue; }
  }
  const chk = isDefault ? 'checked' : '';
  const row = document.createElement('div');
  row.className = 'addon-row';
  row.innerHTML = `
    <input class="form-input" type="text" placeholder="Option name (e.g. Avocado)" value="${esc(addonName)}" data-addon-name/>
    <input class="form-input" type="number" placeholder="+$0.00" step="0.01" min="0" value="${addonPrice}" data-addon-price style="padding-left:10px"/>
    <label class="addon-default-wrap" title="Pre-selected for customers by default">
      <input type="checkbox" data-addon-is-default ${chk}/>
      <span class="addon-default-label-text">Default</span>
    </label>
    <button class="addon-remove" onclick="this.parentElement.remove()" title="Remove">&#215;</button>`;
  editor.appendChild(row);
}

function collectAddons() {
  const rows = document.querySelectorAll('#addonsEditor .addon-row');
  const options = [], defaultOptions = [];
  rows.forEach(row => {
    const name      = row.querySelector('[data-addon-name]').value.trim();
    const price     = parseFloat(row.querySelector('[data-addon-price]').value) || 0;
    const isDef     = row.querySelector('[data-addon-is-default]').checked;
    if (name) {
      const str = `${name} +$${price % 1 === 0 ? price : price.toFixed(2)}`;
      options.push(str);
      if (isDef) defaultOptions.push(str);
    }
  });
  return { options, defaultOptions };
}

// ─── OPTIONS EDITOR ──────────────────────────────────────────────────────────
// Option data structure: { name: "Bread", choices: ["Roll", "White", "Wheat"] }

function addOptionBlock(existing) {
  const editor = document.getElementById('optionsEditor');
  const block  = document.createElement('div');
  block.className = 'option-block';

  const name    = existing?.name    || '';
  const choices = existing?.choices || [];

  block.innerHTML = `
    <div class="option-block-header">
      <input class="form-input" type="text" placeholder="Option name (e.g. Bread)" value="${esc(name)}" data-option-name/>
      <button class="option-remove" onclick="this.closest('.option-block').remove()" title="Remove option">&#215;</button>
    </div>
    <div class="option-choices-label">Choices</div>
    <div class="option-choices"></div>
    <button class="btn-add-choice" onclick="addChoiceRow(this.previousElementSibling.previousElementSibling)">+ Add Choice</button>`;

  editor.appendChild(block);

  const choicesContainer = block.querySelector('.option-choices');
  choices.forEach(c => addChoiceRow(choicesContainer, c));
}

function addChoiceRow(container, value) {
  const row = document.createElement('div');
  row.className = 'option-choice-row';
  row.innerHTML = `
    <input class="form-input" type="text" placeholder="e.g. White Bread" value="${esc(value || '')}" data-choice/>
    <button class="option-remove" onclick="this.parentElement.remove()" title="Remove choice">&#215;</button>`;
  container.appendChild(row);
}

function collectOptions() {
  const blocks  = document.querySelectorAll('#optionsEditor .option-block');
  const choices = [];
  blocks.forEach(block => {
    const name    = block.querySelector('[data-option-name]').value.trim();
    const opts    = [...block.querySelectorAll('[data-choice]')]
      .map(i => i.value.trim()).filter(Boolean);
    if (name && opts.length) choices.push({ name, choices: opts });
  });
  return choices;
}

// ─── SAVE ─────────────────────────────────────────────────────────────────────
async function saveItem() {
  const name  = document.getElementById('fName').value.trim();
  const price = parseFloat(document.getElementById('fPrice').value);
  const desc  = document.getElementById('fDesc').value.trim();

  if (!name)          { showToast('Item name is required.', true); return; }
  if (isNaN(price))   { showToast('A valid price is required.', true); return; }

  const saveBtn = document.getElementById('saveBtn');
  const indicator = document.getElementById('savingIndicator');
  saveBtn.disabled = true;
  indicator.style.display = 'flex';

  try {
    // 1. Upload photo if a new one was selected
    let photoFilename = editingItem?.photo || null;
    if (clearExistingPhoto) photoFilename = null;
    if (newPhotoFile) {
      const fd = new FormData();
      fd.append('file', newPhotoFile);
      fd.append('itemName', name);
      const upRes = await apiFetch('/api/upload', { method: 'POST', body: fd });
      const upData = await upRes.json();
      if (!upRes.ok) throw new Error(upData.error || 'Photo upload failed.');
      photoFilename = upData.filename;
    }

    // 2. Build item object
    const { options, defaultOptions } = collectAddons();
    const categoryId = parseInt(document.getElementById('fCategory').value) || 0;
    const item = {
      name, price, description: desc,
      photo: photoFilename,
      options, defaultOptions,
      choices: collectOptions(),
    };
    if (editingItem) item.id = editingItem.id;

    // 3. Create or update
    const method = editingItem ? 'PUT' : 'POST';
    const res    = await apiFetch('/api/menu', {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ item, categoryId }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Save failed.');
    // Update local state from server response
    if (data.item) {
      if (editingItem) {
        const idx = menuItems.findIndex(m => m.id === data.item.id);
        if (idx !== -1) menuItems[idx] = data.item; else menuItems.push(data.item);
      } else {
        menuItems.push(data.item);
      }
    }
    if (data.categories) menuCategories = data.categories;

    showToast(editingItem ? 'Item updated.' : 'Item added.');
    renderCategories();
    showPage('pageList');
  } catch (e) {
    showToast(e.message, true);
  } finally {
    saveBtn.disabled = false;
    indicator.style.display = 'none';
  }
}

// ─── DELETE ───────────────────────────────────────────────────────────────────
function showConfirmModal(title, body, onConfirm) {
  document.getElementById('deleteModalTitle').textContent = title;
  document.getElementById('deleteModalBody').textContent  = body;
  pendingDeleteAction = onConfirm;
  document.getElementById('deleteModal').classList.add('visible');
}

function closeDeleteModal() {
  pendingDeleteAction = null;
  document.getElementById('deleteModal').classList.remove('visible');
}

function confirmDelete() {
  if (pendingDeleteAction) pendingDeleteAction();
  closeDeleteModal();
}

function promptDeleteItem(id, name) {
  showConfirmModal('Delete Item?', `Delete "${name}"? This cannot be undone.`, async () => {
    try {
      const res  = await apiFetch('/api/menu', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Delete failed.');
      menuItems      = menuItems.filter(i => i.id !== id);
      menuCategories.forEach(c => { c.itemIds = (c.itemIds || []).filter(x => x !== id); });
      showToast('Item deleted.');
      renderCategories();
    } catch (e) { showToast(e.message, true); }
  });
}

// ─── SETTINGS & HOURS ────────────────────────────────────────────────────────
let settingsData = null;

// ─── STORE INFO TAB (phone + hours + contact email + links) ─────────────────
async function loadStoreInfo() {
  try {
    const res  = await apiFetch('/api/settings');
    const data = await res.json();
    settingsData = data;
    // Keep ordering UI in sync in case it's shown elsewhere (Settings tab)
    updateOrderingUI(data.onlineOrdering !== false);
    // Hours tables
    renderHoursTable('storeHoursBody',    data.storeHours);
    renderHoursTable('snackbarHoursBody', data.deliHours);
    // Site info (now just phone)
    const phone = document.getElementById('siPhone');
    if (phone && settingsData.phone != null) phone.value = settingsData.phone;
    // Contact email
    const email = document.getElementById('siContactEmail');
    if (email) email.value = settingsData.contactEmail ?? '';
    // Links
    renderAdminLinks(settingsData?.quickLinks);
  } catch (e) { showToast('Could not load store info.', true); }
}

// ─── SETTINGS TAB (tax + ordering + print server + turnstile) ────────────────
async function loadSettings() {
  try {
    const res  = await apiFetch('/api/settings');
    const data = await res.json();
    settingsData = data;
    updateOrderingUI(data.onlineOrdering !== false);
  } catch(e) { showToast('Could not load settings.', true); return; }

  // Tax
  const tax = document.getElementById('siDeliTax');
  if (tax && settingsData.deliTax != null) tax.value = settingsData.deliTax;

  // Turnstile
  const ts = document.getElementById('siTurnstileKey');
  if (ts) ts.value = settingsData.turnstileSiteKey ?? '';

  // Print server status + toggle
  loadPrintServerUI();
}

async function saveOnlineOrdering(enabled) {
  if (!settingsData) return;
  try {
    const res = await apiFetch('/api/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ onlineOrdering: enabled }),
    });
    if (!res.ok) throw new Error('Save failed');
    settingsData.onlineOrdering = enabled;
    updateOrderingUI(enabled);
    showToast(enabled ? 'Online ordering enabled.' : 'Online ordering disabled.');
  } catch(e) {
    showToast(e.message, true);
    updateOrderingUI(!enabled);
  }
}

function renderHoursTable(tbodyId, hours) {
  const tbody = document.getElementById(tbodyId);
  tbody.innerHTML = hours.map((h, i) => `
    <tr>
      <td class="hours-day-label">${h.day}</td>
      <td><input class="hours-time-input" type="time" value="${h.open || ''}" id="${tbodyId}-open-${i}" ${h.closed ? 'disabled' : ''}/></td>
      <td><input class="hours-time-input" type="time" value="${h.close || ''}" id="${tbodyId}-close-${i}" ${h.closed ? 'disabled' : ''}/></td>
      <td>
        <label class="hours-closed-wrap">
          <input type="checkbox" ${h.closed ? 'checked' : ''} onchange="toggleDayClosed('${tbodyId}',${i},this.checked)"/>
          Closed
        </label>
      </td>
    </tr>`).join('');
}

function toggleDayClosed(tbodyId, idx, closed) {
  const openEl  = document.getElementById(`${tbodyId}-open-${idx}`);
  const closeEl = document.getElementById(`${tbodyId}-close-${idx}`);
  openEl.disabled  = closed;
  closeEl.disabled = closed;
  if (closed) { openEl.value = ''; closeEl.value = ''; }
}

function collectHours(tbodyId, days) {
  return days.map((h, i) => {
    const closed = document.querySelector(`#${tbodyId} tr:nth-child(${i+1}) input[type="checkbox"]`).checked;
    const open   = document.getElementById(`${tbodyId}-open-${i}`).value  || null;
    const close  = document.getElementById(`${tbodyId}-close-${i}`).value || null;
    return { day: h.day, open: closed ? null : open, close: closed ? null : close, closed };
  });
}

async function saveHours() {
  if (!settingsData) return;
  const btn = document.getElementById('saveHoursBtn');
  const ind = document.getElementById('savingHoursIndicator');
  btn.disabled = true; ind.style.display = 'flex';
  try {
    const storeHours   = collectHours('storeHoursBody',   settingsData.storeHours);
    const snackbarHours = collectHours('snackbarHoursBody', settingsData.deliHours);
    const onlineOrdering = document.getElementById('onlineOrderingToggle')?.checked ?? (settingsData.onlineOrdering !== false);
    const res = await apiFetch('/api/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ storeHours, deliHours: snackbarHours, onlineOrdering }),
    });
    if (!res.ok) throw new Error('Save failed');
    settingsData = { storeHours, deliHours: snackbarHours, onlineOrdering };
    showToast('Hours saved.');
  } catch(e) { showToast(e.message, true); }
  finally { btn.disabled = false; ind.style.display = 'none'; }
}

// ─── SITE INFO ────────────────────────────────────────────────────────────────

async function loadSiteInfo() {
  // Lightweight — only phone is on the Store Info site-info card now.
  if (!settingsData) {
    try {
      const res = await apiFetch('/api/settings');
      if (res.ok) settingsData = await res.json();
    } catch(_) {}
  }
  if (!settingsData) return;
  const phone = document.getElementById('siPhone');
  if (phone && settingsData.phone != null) phone.value = settingsData.phone;
}

async function saveSiteInfo() {
  // Saves phone (Store Info tab) AND tax (Settings tab). Since both onblur
  // callbacks call this, we always pull the current value of whichever field
  // exists in the DOM. The settings API merges partial updates, so sending
  // only the present fields is safe.
  const btn = document.getElementById('saveSiteInfoBtn');
  const ind = document.getElementById('savingSiteInfoIndicator');
  if (btn) btn.disabled = true;
  if (ind) ind.style.display = 'flex';

  const phoneEl = document.getElementById('siPhone');
  const taxEl   = document.getElementById('siDeliTax');
  const body = {};
  if (phoneEl) body.phone   = phoneEl.value.trim();
  if (taxEl)   body.deliTax = parseFloat(taxEl.value) || 0;

  try {
    const res = await apiFetch('/api/settings', {
      method:  'PUT',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(body),
    });
    if (!res.ok) throw new Error('Save failed');
    if (settingsData) {
      if (body.phone   !== undefined) settingsData.phone   = body.phone;
      if (body.deliTax !== undefined) settingsData.deliTax = body.deliTax;
    }
    showToast('Saved.');
  } catch(e) {
    showToast(e.message, true);
  } finally {
    if (btn) btn.disabled = false;
    if (ind) ind.style.display = 'none';
  }
}

// ─── CONTACT EMAIL (Store Info tab) ─────────────────────────────────────────
async function saveContactSettings() {
  const btn = document.getElementById('saveContactSettingsBtn');
  const ind = document.getElementById('savingContactSettingsIndicator');
  if (btn) btn.disabled = true;
  if (ind) ind.style.display = 'flex';

  const contactEmail = document.getElementById('siContactEmail')?.value.trim() ?? '';

  try {
    const res = await apiFetch('/api/settings', {
      method:  'PUT',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ contactEmail }),
    });
    if (!res.ok) throw new Error('Save failed');
    if (settingsData) settingsData.contactEmail = contactEmail;
    showToast('Contact email saved.');
  } catch(e) {
    showToast(e.message, true);
  } finally {
    if (btn) btn.disabled = false;
    if (ind) ind.style.display = 'none';
  }
}

// ─── TURNSTILE KEY (Settings tab) ───────────────────────────────────────────
async function saveTurnstileKey() {
  const btn = document.getElementById('saveTurnstileBtn');
  const ind = document.getElementById('savingTurnstileIndicator');
  if (btn) btn.disabled = true;
  if (ind) ind.style.display = 'flex';

  const turnstileSiteKey = document.getElementById('siTurnstileKey')?.value.trim() ?? '';

  try {
    const res = await apiFetch('/api/settings', {
      method:  'PUT',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ turnstileSiteKey }),
    });
    if (!res.ok) throw new Error('Save failed');
    if (settingsData) settingsData.turnstileSiteKey = turnstileSiteKey;
    showToast('Turnstile key saved.');
  } catch(e) {
    showToast(e.message, true);
  } finally {
    if (btn) btn.disabled = false;
    if (ind) ind.style.display = 'none';
  }
}

// ─── EVENTS ───────────────────────────────────────────────────────────────────
let events = [];
let editingEvent = null;
let newEventPhotoFile = null;
let clearEventPhoto_flag = false;

async function loadEvents() {
  const container = document.getElementById('eventListContainer');
  container.innerHTML = '<div style="padding:40px;text-align:center;color:var(--cream-dim);font-style:italic"><span class="spinner"></span> Loading…</div>';
  try {
    const res  = await apiFetch('/api/events');
    const data = await res.json();
    events = data.events || [];
    renderEventList();
  } catch(e) { container.innerHTML = `<div style="padding:20px;color:var(--danger)">${e.message}</div>`; }
}

function renderEventList() {
  const container = document.getElementById('eventListContainer');
  if (!events.length) {
    container.innerHTML = '<div class="empty-state">No events yet. Click "+ Add Event" to create one.</div>';
    return;
  }
  container.innerHTML = `<div class="event-list">${events.map((ev, idx) => {
    const dateStr = ev.date ? new Date(ev.date + 'T12:00:00').toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'}) : '—';
    return `<div class="event-list-item" draggable="true" data-event-id="${ev.id}" data-event-idx="${idx}"
      ondragstart="onEventDragStart(event,${idx})"
      ondragover="onEventDragOver(event,${idx})"
      ondrop="onEventDrop(event,${idx})"
      ondragend="onEventDragEnd(event)">
      <span class="event-drag-handle" title="Drag to reorder">&#8942;&#8942;</span>
      <div>
        <div class="event-list-meta">${dateStr}</div>
        <div class="event-list-title">${esc(ev.title)}</div>
        <div class="event-list-desc">${esc(ev.description||'')}</div>
      </div>
      <div class="table-actions">
        <button class="btn-edit" onclick="openEventForm(${ev.id})">Edit</button>
        <button class="btn-delete" onclick="promptDeleteEvent(${ev.id},'${esc(ev.title)}')">Delete</button>
      </div>
    </div>`;
  }).join('')}</div>`;
}

// ─── EVENTS DRAG AND DROP ─────────────────────────────────────────────────────
let evDragSrcIdx = null;

function onEventDragStart(e, idx) {
  evDragSrcIdx = idx;
  e.currentTarget.classList.add('event-dragging');
  e.dataTransfer.effectAllowed = 'move';
  e.dataTransfer.setData('text/plain', 'event');
}
function onEventDragOver(e, idx) {
  if (evDragSrcIdx === null) return;
  e.preventDefault();
  document.querySelectorAll('.event-list-item').forEach(el => el.classList.remove('event-drag-over'));
  e.currentTarget.classList.add('event-drag-over');
}
function onEventDrop(e, destIdx) {
  e.preventDefault();
  if (evDragSrcIdx === null || evDragSrcIdx === destIdx) return;
  const [moved] = events.splice(evDragSrcIdx, 1);
  events.splice(destIdx, 0, moved);
  renderEventList();
  saveEventOrder();
}
function onEventDragEnd(e) {
  document.querySelectorAll('.event-list-item').forEach(el => {
    el.classList.remove('event-dragging', 'event-drag-over');
  });
  evDragSrcIdx = null;
}

async function saveEventOrder() {
  try {
    const res = await apiFetch('/api/events', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ events }),
    });
    if (!res.ok) throw new Error('Save failed');
    showToast('Order saved.');
  } catch(e) { showToast('Could not save order.', true); }
}

function openEventForm(eventId) {
  editingEvent = eventId ? events.find(e => e.id === eventId) || null : null;
  newEventPhotoFile = null; clearEventPhoto_flag = false;
  document.getElementById('eventFormTitle').textContent = editingEvent ? 'Edit Event' : 'Add Event';
  const todayStr = new Date().toISOString().slice(0, 10);
  document.getElementById('efTitle').value   = editingEvent?.title       || '';
  document.getElementById('efDate').value    = editingEvent?.date        || todayStr;
  document.getElementById('efDesc').value    = editingEvent?.description || '';
  document.getElementById('efCtaText').value = editingEvent?.ctaText     || '';
  document.getElementById('efCtaLink').value = editingEvent?.ctaLink     || '';
  resetEventPhotoUI();
  const note = document.getElementById('eventCurrentImageNote');
  if (editingEvent?.photo) {
    document.getElementById('eventImagePreview').src = `/images/${editingEvent.photo}`;
    document.getElementById('eventPreviewWrap').classList.add('has-image');
    document.getElementById('eventUploadPlaceholder').style.display = 'none';
    note.textContent = 'Current photo shown. Upload new to replace, or × to remove.';
  } else { note.textContent = ''; }
  showPage('pageEventForm');
}

function resetEventPhotoUI() {
  document.getElementById('eventPhotoFile').value = '';
  document.getElementById('eventImagePreview').src = '';
  document.getElementById('eventPreviewWrap').classList.remove('has-image');
  document.getElementById('eventUploadPlaceholder').style.display = '';
}

function handleEventPhotoSelect(input) {
  const f = input.files?.[0]; if (f) applyEventPhotoFile(f);
}
function applyEventPhotoFile(file) {
  if (!file.type.startsWith('image/')) { showToast('Please select an image file.', true); return; }
  if (file.size > 5*1024*1024)         { showToast('Image must be under 5 MB.', true);   return; }
  newEventPhotoFile = file; clearEventPhoto_flag = false;
  const reader = new FileReader();
  reader.onload = e => {
    document.getElementById('eventImagePreview').src = e.target.result;
    document.getElementById('eventPreviewWrap').classList.add('has-image');
    document.getElementById('eventUploadPlaceholder').style.display = 'none';
    document.getElementById('eventCurrentImageNote').textContent = `Ready to upload: ${file.name}`;
  };
  reader.readAsDataURL(file);
}
function clearEventPhoto(e) {
  e.stopPropagation(); e.preventDefault();
  newEventPhotoFile = null; clearEventPhoto_flag = true;
  resetEventPhotoUI();
  document.getElementById('eventCurrentImageNote').textContent = '';
}

async function saveEvent() {
  const title   = document.getElementById('efTitle').value.trim();
  const date    = document.getElementById('efDate').value;
  const desc    = document.getElementById('efDesc').value.trim();
  const ctaText = document.getElementById('efCtaText').value.trim();
  const ctaLink = document.getElementById('efCtaLink').value.trim();
  if (!title) { showToast('Event title is required.', true); return; }
  if (!date)  { showToast('Please select a date.', true);   return; }
  const saveBtn = document.getElementById('saveEventBtn');
  const ind     = document.getElementById('savingEventIndicator');
  saveBtn.disabled = true; ind.style.display = 'flex';
  try {
    let photoFilename = editingEvent?.photo || null;
    if (clearEventPhoto_flag) photoFilename = null;
    if (newEventPhotoFile) {
      const fd = new FormData();
      fd.append('file', newEventPhotoFile);
      fd.append('itemName', title);
      const upRes  = await apiFetch('/api/upload', { method: 'POST', body: fd });
      const upData = await upRes.json();
      if (!upRes.ok) throw new Error(upData.error || 'Photo upload failed.');
      photoFilename = upData.filename;
    }
    const event = { title, date, description: desc, photo: photoFilename,
                    ctaText: ctaText || null, ctaLink: ctaLink || null };
    if (editingEvent) event.id = editingEvent.id;
    const method = editingEvent ? 'PUT' : 'POST';
    const res    = await apiFetch('/api/events', {
      method, headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ event }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Save failed.');
    if (editingEvent) {
      const idx = events.findIndex(e => e.id === data.event.id);
      if (idx !== -1) events[idx] = data.event; else events.push(data.event);
    } else { events.unshift(data.event); }
    showToast(editingEvent ? 'Event updated.' : 'Event added.');
    renderEventList();
    showPage('pageEvents');
  } catch(e) { showToast(e.message, true); }
  finally { saveBtn.disabled = false; ind.style.display = 'none'; }
}

function promptDeleteEvent(id, title) {
  showConfirmModal('Delete Event?', `Delete "${title}"? This cannot be undone.`, async () => {
    try {
      const res  = await apiFetch('/api/events', {
        method: 'DELETE', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Delete failed.');
      events = events.filter(e => e.id !== id);
      renderEventList();
      showToast('Event deleted.');
    } catch(e) { showToast(e.message, true); }
  });
}

// ─── API HELPER ───────────────────────────────────────────────────────────────
function apiFetch(url, options = {}) {
  const headers = options.headers || {};
  if (authToken) headers['Authorization'] = `Bearer ${authToken}`;
  // Don't set Content-Type for FormData — browser sets it with boundary
  return fetch(url, { ...options, headers });
}

// ─── UTILS ────────────────────────────────────────────────────────────────────
function esc(str) {
  return String(str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

let toastTimer;
function showToast(msg, isError) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.toggle('error', !!isError);
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 3000);
}

// ─── LINKS ADMIN ─────────────────────────────────────────────────────────────
const DEFAULT_LINKS = [
  { id:'1', text:'Get Directions', url:'https://maps.app.goo.gl/dhU5oMRYwXpTUhmY9' },
  { id:'2', text:'Snackbar Menu',  url:'menu.html' },
  { id:'3', text:'Explore',        url:'#explore' },
  { id:'4', text:'Events',         url:'#events' },
  { id:'5', text:'Store Hours',    url:'#hours' },
  { id:'6', text:'Call Us',        url:'tel:7755723200' },
  { id:'7', text:'Facebook',       url:'https://www.facebook.com/WhiteMountainsNV' },
];

// ─── QL drag state ────────────────────────────────────────────────────────────
let qlDragIdx = null;

function renderAdminLinks(links) {
  const list = document.getElementById('quickLinksList');
  if (!list) return;
  const ql = (links && links.length) ? links : DEFAULT_LINKS;
  list.innerHTML = ql.map((lk, i) => buildQlRow(lk, i)).join('');
}

function buildQlRow(lk, idx) {
  const iconName = lk.icon || '';
  const iconSvg  = iconName && ADMIN_LINK_ICONS[iconName] ? ADMIN_LINK_ICONS[iconName] : '';
  const iconPickerGrid = Object.entries(ADMIN_LINK_ICONS).map(([name, svg]) =>
    `<button type="button" class="ql-icon-opt${name === iconName ? ' selected' : ''}"
       data-icon-name="${name}" title="${name}"
       onclick="selectLinkIcon(this)">${svg}</button>`
  ).join('');

  return `<div class="ql-row" draggable="true" data-idx="${idx}"
      ondragstart="onQlDragStart(event,${idx})"
      ondragover="onQlDragOver(event,${idx})"
      ondrop="onQlDrop(event,${idx})"
      ondragend="onQlDragEnd(event)">
    <span class="ql-drag-handle" title="Drag to reorder">&#8942;&#8942;</span>
    <button type="button" class="ql-icon-btn" data-icon="${iconName}"
      onclick="toggleIconPicker(this)" title="Set icon">
      ${iconSvg || '<span class="ql-icon-none">&#8212;</span>'}
    </button>
    <input  class="form-input ql-text" type="text" placeholder="Link text" value="${esc(lk.text)}"/>
    <input  class="form-input ql-url"  type="text" placeholder="URL or #anchor" value="${esc(lk.url)}"/>
    <button class="ql-btn-remove" onclick="removeLink(${idx})" title="Remove">&#215;</button>
    <div class="ql-icon-picker" style="display:none">
      <button type="button" class="ql-icon-opt ql-icon-none-opt${!iconName ? ' selected' : ''}"
        data-icon-name="" title="No icon" onclick="selectLinkIcon(this)">&#8212;</button>
      ${iconPickerGrid}
    </div>
  </div>`;
}

// Icon dict mirrored from nav.js so admin.js stays self-contained
const ADMIN_LINK_ICONS = {
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

function toggleIconPicker(btn) {
  const picker = btn.closest('.ql-row').querySelector('.ql-icon-picker');
  const isOpen = picker.style.display !== 'none';
  // Close all other open pickers first
  document.querySelectorAll('.ql-icon-picker').forEach(p => { p.style.display = 'none'; });
  picker.style.display = isOpen ? 'none' : '';
}

function selectLinkIcon(optBtn) {
  const picker  = optBtn.closest('.ql-icon-picker');
  const row     = optBtn.closest('.ql-row');
  const iconBtn = row.querySelector('.ql-icon-btn');
  const name    = optBtn.dataset.iconName || '';
  const svg     = name ? (ADMIN_LINK_ICONS[name] || '') : '';

  iconBtn.dataset.icon = name;
  iconBtn.innerHTML    = svg || '<span class="ql-icon-none">&#8212;</span>';
  picker.querySelectorAll('.ql-icon-opt').forEach(b => b.classList.remove('selected'));
  optBtn.classList.add('selected');
  picker.style.display = 'none';
}


// Prevent drag starting from inputs (so typing still works)
function onQlDragStart(e, idx) {
  if (e.target.tagName.toUpperCase() === 'INPUT') { e.preventDefault(); return; }
  qlDragIdx = idx;
  e.currentTarget.classList.add('ql-dragging');
  e.dataTransfer.effectAllowed = 'move';
  e.dataTransfer.setData('text/plain', String(idx));
}
function onQlDragOver(e, idx) {
  if (qlDragIdx === null || qlDragIdx === idx) return;
  e.preventDefault();
  document.querySelectorAll('.ql-drag-over').forEach(el => el.classList.remove('ql-drag-over'));
  e.currentTarget.classList.add('ql-drag-over');
}
function onQlDrop(e, targetIdx) {
  if (qlDragIdx === null || qlDragIdx === targetIdx) return;
  e.preventDefault();
  const current = collectAdminLinks();
  const [moved] = current.splice(qlDragIdx, 1);
  current.splice(targetIdx, 0, moved);
  qlDragIdx = null;
  renderAdminLinks(current);
}
function onQlDragEnd(e) {
  qlDragIdx = null;
  document.querySelectorAll('.ql-dragging,.ql-drag-over').forEach(el =>
    el.classList.remove('ql-dragging','ql-drag-over')
  );
}

function collectAdminLinks() {
  const rows = document.querySelectorAll('#quickLinksList .ql-row');
  return Array.from(rows).map((row, i) => ({
    id:   String(i + 1),
    text: row.querySelector('.ql-text').value.trim(),
    url:  row.querySelector('.ql-url').value.trim(),
    icon: row.querySelector('.ql-icon-btn')?.dataset.icon || '',
  })).filter(lk => lk.text && lk.url);
}

function addLink() {
  const current = collectAdminLinks();
  current.push({ id: String(Date.now()), text: '', url: '' });
  renderAdminLinks(current);
  const rows = document.querySelectorAll('#quickLinksList .ql-row');
  rows[rows.length - 1]?.querySelector('.ql-text')?.focus();
}

function removeLink(idx) {
  const current = collectAdminLinks();
  current.splice(idx, 1);
  renderAdminLinks(current);
}

async function saveLinks() {
  const btn = document.getElementById('saveQuickLinksBtn');
  const ind = document.getElementById('savingQuickLinksIndicator');
  if (btn) btn.disabled = true;
  if (ind) ind.style.display = 'flex';
  try {
    const quickLinks = collectAdminLinks();
    if (!quickLinks.length) { showToast('Add at least one link before saving.', true); return; }
    const res = await apiFetch('/api/settings', {
      method:  'PUT',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ quickLinks }),
    });
    if (!res.ok) throw new Error('Save failed');
    if (settingsData) settingsData.quickLinks = quickLinks;
    showToast('Links saved.');
  } catch(e) {
    showToast(e.message, true);
  } finally {
    if (btn) btn.disabled = false;
    if (ind) ind.style.display = 'none';
  }
}

// ─── PAGES ADMIN (master/detail) ─────────────────────────────────────────────
// Pages tab flow:
//   1. switchTab('pages')     → shows pagePages (master list of pages)
//   2. openPageEditor(slug)   → shows pagePageEditor (sections list for that page)
//   3. back button            → switchTab('pages')
//
// Each page slug maps to a KV key "page_<slug>" via /api/pages/<slug>.
// Phase 3 scope: reorder + per-field editing (editing is built on top of this in a follow-up file).

// Registry of pages available in the admin. "+ New Page" is disabled for now,
// so this list is fixed. Adding a new page type = add an entry here AND add
// the slug to PAGE_SLUGS in functions/api/pages/[slug].js.
const ADMIN_PAGES = [
  { slug: 'home',    title: 'Home',    icon: '\uD83C\uDFE0' }, // 🏠
  { slug: 'menu',    title: 'Menu',    icon: '\uD83C\uDF54' }, // 🍔
  { slug: 'contact', title: 'Contact', icon: '\u2709'         } // ✉
];

// Editor state — which page is open and what its sections look like
let currentPageSlug    = null;
let pageHomeSections   = [];     // kept name for backward-compat with other code; now holds "current page" sections
let pageHomeOriginal   = null;   // snapshot for dirty-check
let dragSectionId      = null;

// ─── MASTER LIST: list of pages ──────────────────────────────────────────────
async function loadPagesList() {
  const container = document.getElementById('pagesList');
  if (!container) return;
  container.innerHTML = '<div style="padding:40px;text-align:center;color:var(--cream-dim);font-style:italic"><span class="spinner"></span> Loading&hellip;</div>';

  // Fetch section counts for each page in parallel. Failures degrade to "—".
  const results = await Promise.all(ADMIN_PAGES.map(async p => {
    try {
      const res = await fetch('/api/pages/' + p.slug);
      if (!res.ok) return { ...p, count: null };
      const data = await res.json();
      return { ...p, count: Array.isArray(data.sections) ? data.sections.length : 0 };
    } catch (_) {
      return { ...p, count: null };
    }
  }));

  container.innerHTML = results.map(p => renderPageListRow(p)).join('');
}

function renderPageListRow(p) {
  const countStr = p.count == null
    ? '<span style="color:var(--brand-red)">failed to load</span>'
    : `${p.count} section${p.count !== 1 ? 's' : ''}`;
  return `
    <div class="category-block" style="cursor:pointer;transition:border-color 0.15s,background 0.15s" onclick="openPageEditor('${esc(p.slug)}')"
      onmouseover="this.style.borderColor='var(--gold-dark)'"
      onmouseout="this.style.borderColor=''">
      <div class="category-header" style="gap:12px">
        <span style="font-size:20px;width:28px;text-align:center;flex-shrink:0">${p.icon}</span>
        <div style="flex:1;min-width:0;display:flex;flex-direction:column;gap:2px">
          <span style="font-family:'Oswald',sans-serif;font-size:15px;color:var(--gold);letter-spacing:1px;text-transform:uppercase">${esc(p.title)}</span>
          <span style="font-size:12px;color:var(--cream-dim)">${countStr}</span>
        </div>
        <span style="color:rgba(184,176,160,0.4);font-size:18px;flex-shrink:0">&rsaquo;</span>
      </div>
    </div>
  `;
}

// ─── DETAIL VIEW: sections for a specific page ───────────────────────────────
function openPageEditor(slug) {
  const pageMeta = ADMIN_PAGES.find(p => p.slug === slug);
  if (!pageMeta) { showToast('Unknown page.', true); return; }
  currentPageSlug = slug;

  const titleEl = document.getElementById('pageEditorTitle');
  if (titleEl) titleEl.textContent = pageMeta.title + ' — Sections';

  showPage('pagePageEditor');
  loadCurrentPage();
}

async function loadCurrentPage() {
  if (!currentPageSlug) return;
  const container = document.getElementById('sectionsList');
  if (!container) return;
  container.innerHTML = '<div style="padding:40px;text-align:center;color:var(--cream-dim);font-style:italic"><span class="spinner"></span> Loading&hellip;</div>';
  try {
    const res = await fetch('/api/pages/' + currentPageSlug);
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const data = await res.json();
    pageHomeSections = Array.isArray(data.sections) ? data.sections : [];
    pageHomeOriginal = JSON.stringify(pageHomeSections);
    renderPageSections();
    updatePageHomeDirty();
  } catch (err) {
    container.innerHTML = `<div style="padding:40px;text-align:center;color:var(--brand-red)">Failed to load sections: ${esc(err.message)}</div>`;
  }
}

function renderPageSections() {
  const container = document.getElementById('sectionsList');
  if (!container) return;
  if (!pageHomeSections.length) {
    container.innerHTML = '<div style="padding:40px;text-align:center;color:var(--cream-dim);font-style:italic">No sections on this page yet.</div>';
    return;
  }
  container.innerHTML = pageHomeSections.map((s, idx) => renderSectionRow(s, idx)).join('');
}

function renderSectionRow(section, idx) {
  const T = (window.SECTIONS && window.SECTIONS.TYPES && window.SECTIONS.TYPES[section.type]) || null;
  const icon     = T ? T.icon  : '\u25A1';
  const label    = T ? T.label : section.type;
  const category = T ? T.category : '';
  const summary  = window.SECTIONS ? window.SECTIONS.sectionSummary(section) : '';
  const id       = esc(section.id || '');
  const editable = T && T.schema && Object.keys(T.schema).length > 0;
  const isHidden = section.hidden === true;

  const catBadge = category === 'reserved'
    ? '<span style="display:inline-block;font-size:9px;letter-spacing:1px;text-transform:uppercase;color:var(--cream-dim);border:1px solid var(--charcoal-border);padding:1px 6px;border-radius:2px;margin-left:8px;opacity:0.6">reserved</span>'
    : '';
  const hiddenBadge = isHidden
    ? '<span style="display:inline-block;font-size:9px;letter-spacing:1px;text-transform:uppercase;color:rgba(230,120,110,0.9);border:1px solid rgba(170,60,50,0.4);padding:1px 6px;border-radius:2px;margin-left:8px">hidden</span>'
    : '';

  // When a row is hidden, dim the content side but keep actions fully visible
  const contentDimStyle = isHidden ? 'opacity:0.5' : '';

  const clickAttr = editable
    ? `onclick="openSectionEditor('${id}')" style="cursor:pointer"`
    : '';

  // SVG eye icons — open when visible, slashed when hidden
  const eyeIconOpen = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>';
  const eyeIconSlash = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>';
  const eyeBtn = `
    <button type="button" title="${isHidden ? 'Show on page' : 'Hide from page'}"
      onclick="event.stopPropagation(); toggleSectionHidden('${id}')"
      style="background:transparent;border:1px solid var(--charcoal-border);color:${isHidden ? 'rgba(230,120,110,0.9)' : 'var(--cream-dim)'};width:32px;height:32px;border-radius:3px;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;padding:0;flex-shrink:0">
      ${isHidden ? eyeIconSlash : eyeIconOpen}
    </button>`;

  const deleteBtn = `
    <button type="button" title="Delete section"
      onclick="event.stopPropagation(); promptDeleteSection('${id}')"
      style="background:transparent;border:1px solid rgba(170,60,50,0.5);color:rgba(230,120,110,0.9);width:32px;height:32px;border-radius:3px;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;padding:0;flex-shrink:0;font-size:16px">&times;</button>`;

  return `
    <div class="category-block" data-section-id="${id}" ${clickAttr}
      ondragover="onSectionDragOver(event,'${id}')"
      ondrop="onSectionDrop(event,'${id}')"
      ondragend="onSectionDragEnd(event)">
      <div class="category-header" style="gap:10px">
        <span class="cat-drag-handle" draggable="true"
          ondragstart="onSectionDragStart(event,'${id}')"
          onclick="event.stopPropagation()"
          title="Drag to reorder">&#8942;&#8942;</span>
        <span style="font-size:18px;width:24px;text-align:center;flex-shrink:0;${contentDimStyle}">${icon}</span>
        <div style="flex:1;min-width:0;display:flex;flex-direction:column;gap:2px;${contentDimStyle}">
          <div style="display:flex;align-items:center;gap:8px;min-width:0">
            <span style="font-family:'Oswald',sans-serif;font-size:14px;color:var(--gold);letter-spacing:1px;text-transform:uppercase;flex-shrink:0">${esc(label)}</span>
            ${catBadge}
            ${hiddenBadge}
          </div>
          <div style="font-size:12px;color:var(--cream-dim);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(summary)}</div>
        </div>
        <span style="font-size:11px;color:rgba(184,176,160,0.4);letter-spacing:1px;font-family:'Oswald',sans-serif;flex-shrink:0;${contentDimStyle}">#${idx + 1}</span>
        ${eyeBtn}
        ${deleteBtn}
      </div>
    </div>
  `;
}

// ─── Section drag handlers ───────────────────────────────────────────────────
function onSectionDragStart(e, sectionId) {
  dragSectionId = sectionId;
  e.currentTarget.closest('.category-block')?.classList.add('cat-dragging');
  e.dataTransfer.effectAllowed = 'move';
  e.dataTransfer.setData('text/plain', 'section');
  e.stopPropagation();
}

function onSectionDragOver(e, targetSectionId) {
  if (!dragSectionId || targetSectionId === dragSectionId) return;
  e.preventDefault();
  clearSectionDragOver();
  e.currentTarget.classList.add('cat-drag-over');
}

function onSectionDrop(e, targetSectionId) {
  if (!dragSectionId) return;
  e.preventDefault();
  if (dragSectionId === targetSectionId) return;
  const srcIdx = pageHomeSections.findIndex(s => s.id === dragSectionId);
  const tgtIdx = pageHomeSections.findIndex(s => s.id === targetSectionId);
  if (srcIdx === -1 || tgtIdx === -1) return;
  const [moved] = pageHomeSections.splice(srcIdx, 1);
  pageHomeSections.splice(tgtIdx, 0, moved);
  renderPageSections();
  updatePageHomeDirty();
}

function onSectionDragEnd() {
  clearSectionDragOver();
  document.querySelectorAll('.cat-dragging').forEach(el => el.classList.remove('cat-dragging'));
  dragSectionId = null;
}

function clearSectionDragOver() {
  document.querySelectorAll('.cat-drag-over').forEach(el => el.classList.remove('cat-drag-over'));
}

// ─── Dirty-state gating for Save button ──────────────────────────────────────
function updatePageHomeDirty() {
  const btn = document.getElementById('savePageHomeBtn');
  if (!btn) return;
  const dirty = pageHomeOriginal !== JSON.stringify(pageHomeSections);
  btn.disabled = !dirty;
  btn.style.opacity = dirty ? '1'   : '0.5';
  btn.style.cursor  = dirty ? 'pointer' : 'not-allowed';
}

// ─── Save ────────────────────────────────────────────────────────────────────
async function savePageHome() {
  if (!currentPageSlug) return;
  const btn = document.getElementById('savePageHomeBtn');
  const ind = document.getElementById('savingPageHomeIndicator');
  if (btn && btn.disabled) return;
  if (btn) btn.disabled = true;
  if (ind) ind.style.display = 'inline-flex';
  try {
    const res = await apiFetch('/api/pages/' + currentPageSlug, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sections: pageHomeSections })
    });
    if (!res.ok) {
      const txt = await res.text();
      throw new Error(res.status === 401 ? 'Session expired — please sign in again.' : (txt || ('HTTP ' + res.status)));
    }
    const data = await res.json();
    pageHomeSections = Array.isArray(data.sections) ? data.sections : pageHomeSections;
    pageHomeOriginal = JSON.stringify(pageHomeSections);
    renderPageSections();
    updatePageHomeDirty();
    showToast('Sections saved.');
  } catch (err) {
    showToast(err.message, true);
  } finally {
    if (btn) btn.disabled = pageHomeOriginal === JSON.stringify(pageHomeSections);
    if (ind) ind.style.display = 'none';
  }
}

// ─── SECTION EDITOR (form builder) ───────────────────────────────────────────
// Opens a detail view to edit one section's fields, reading the schema from
// window.SECTIONS.TYPES[type].schema. Supports these field types:
//   text, longtext, boolean, select, number, image, icon, list, richtext
//
// State flow:
//   1. openSectionEditor(sectionId)   — clones the section into editingSection
//   2. renderSectionEditor()          — renders form from schema into #sectionEditorForm
//   3. user edits fields              — each onChange writes to editingSection.data
//   4. saveEditingSection()           — writes editingSection back into pageHomeSections[],
//                                        PUTs the full sections[] to the API, then navigates back
//   5. backToPageEditor()             — returns to the sections list for currentPageSlug

let editingSection = null;    // working copy of the section under edit
let editingSectionIdx = -1;   // index in pageHomeSections[] (for splicing back)

// Counter for unique field IDs (so nested list-item fields don't collide across renders)
let _formFieldIdCounter = 0;
function nextFieldId() { _formFieldIdCounter++; return 'ff_' + _formFieldIdCounter; }

// ─── Navigation ──────────────────────────────────────────────────────────────
function openSectionEditor(sectionId) {
  // Unsaved-changes guard: if the page has pending reorders/adds/deletes/hides,
  // warn before navigating into the per-section editor because returning will
  // show fresh data (potentially discarding in-progress list edits).
  if (hasUnsavedPageChanges() && !confirm('You have unsaved layout changes. Opening the section editor will keep them in memory, but they\'re not saved yet. Continue?')) {
    return;
  }

  const idx = pageHomeSections.findIndex(s => s.id === sectionId);
  if (idx < 0) { showToast('Section not found.', true); return; }
  editingSectionIdx = idx;
  editingSection    = JSON.parse(JSON.stringify(pageHomeSections[idx])); // deep clone

  const T = window.SECTIONS && window.SECTIONS.TYPES && window.SECTIONS.TYPES[editingSection.type];
  const typeLabel = T ? T.label : editingSection.type;

  const titleEl = document.getElementById('sectionEditorTitle');
  if (titleEl) titleEl.textContent = 'Edit ' + typeLabel + ' \u00b7 Position #' + (idx + 1);

  showPage('pageSectionEditor');
  renderSectionEditor();
}

function backToPageEditor() {
  editingSection = null;
  editingSectionIdx = -1;
  showPage('pagePageEditor');
}

// ─── Main form render ────────────────────────────────────────────────────────
function renderSectionEditor() {
  const container = document.getElementById('sectionEditorForm');
  if (!container || !editingSection) return;

  const T = window.SECTIONS && window.SECTIONS.TYPES && window.SECTIONS.TYPES[editingSection.type];
  if (!T || !T.schema) {
    container.innerHTML = '<p style="color:var(--cream-dim);font-style:italic;padding:20px 0">No editable fields for this section type.</p>';
    return;
  }

  const schema = T.schema;
  const keys = Object.keys(schema);
  if (keys.length === 0) {
    container.innerHTML = '<p style="color:var(--cream-dim);font-style:italic;padding:20px 0">No editable fields for this section type.</p>';
    return;
  }

  _formFieldIdCounter = 0;

  // Build ordered list, respecting pairWith (wraps two fields in a 50/50 row)
  const skip = new Set();
  const html = [];
  for (const key of keys) {
    if (skip.has(key)) continue;
    const def = schema[key];
    if (def.pairWith && schema[def.pairWith]) {
      const k2  = def.pairWith;
      const def2 = schema[k2];
      skip.add(k2);
      // Render each as normal, then wrap the two HTML chunks in a pair row.
      // Each renderFormField returns a `.form-group-full` wrapper; we swap it
      // for a flex child so the 50/50 row works.
      const a = renderFormField(key, def,  editingSection.data[key]);
      const b = renderFormField(k2,  def2, editingSection.data[k2]);
      html.push('<div class="form-pair-row">' + a + b + '</div>');
    } else {
      html.push(renderFormField(key, def, editingSection.data[key]));
    }
  }
  container.innerHTML = html.join('');

  // Post-render hooks: wire up anything that needs DOM access after innerHTML replacement.
  keys.forEach(key => {
    const def = schema[key];
    if (def.type === 'image') initImageField(key);
    if (def.type === 'richtext') initRichTextField(key);
    if (def.type === 'list') initListField(key, def);
  });
}

// ─── Read/write helpers ──────────────────────────────────────────────────────
function updateFieldValue(key, value) {
  if (!editingSection) return;
  editingSection.data[key] = value;
}

// ─── Field type: text ────────────────────────────────────────────────────────
function renderFormField(key, def, value) {
  switch (def.type) {
    case 'text':     return fieldText(key, def, value);
    case 'longtext': return fieldLongtext(key, def, value);
    case 'boolean':  return fieldBoolean(key, def, value);
    case 'select':   return fieldSelect(key, def, value);
    case 'number':   return fieldNumber(key, def, value);
    case 'image':    return fieldImage(key, def, value);
    case 'icon':     return fieldIcon(key, def, value);
    case 'list':     return fieldList(key, def, value);
    case 'richtext': return fieldRichText(key, def, value);
    case 'layoutButtons': return fieldLayoutButtons(key, def, value);
    default:         return '<!-- unknown field type: ' + esc(def.type) + ' -->';
  }
}

function fieldText(key, def, value) {
  const ph = def.placeholder ? ` placeholder="${esc(def.placeholder)}"` : '';
  return `
    <div class="form-group-full" style="margin-bottom:16px">
      <label class="form-label" for="f_${esc(key)}">${esc(def.label || key)}</label>
      <input class="form-input" type="text" id="f_${esc(key)}" value="${esc(value || '')}"${ph}
        oninput="updateFieldValue('${esc(key)}', this.value)"/>
    </div>
  `;
}

function fieldLongtext(key, def, value) {
  const ph = def.placeholder ? ` placeholder="${esc(def.placeholder)}"` : '';
  return `
    <div class="form-group-full" style="margin-bottom:16px">
      <label class="form-label" for="f_${esc(key)}">${esc(def.label || key)}</label>
      <textarea class="form-textarea" id="f_${esc(key)}" style="min-height:100px"${ph}
        oninput="updateFieldValue('${esc(key)}', this.value)">${esc(value || '')}</textarea>
    </div>
  `;
}

function fieldNumber(key, def, value) {
  const ph = def.placeholder ? ` placeholder="${esc(def.placeholder)}"` : '';
  return `
    <div class="form-group-full" style="margin-bottom:16px">
      <label class="form-label" for="f_${esc(key)}">${esc(def.label || key)}</label>
      <input class="form-input" type="number" id="f_${esc(key)}" value="${esc(value != null ? value : '')}"${ph}
        oninput="updateFieldValue('${esc(key)}', this.value === '' ? null : Number(this.value))"/>
    </div>
  `;
}

function fieldBoolean(key, def, value) {
  // Default true if defaultValue says so AND value is undefined
  const isOn = value === undefined ? (def.defaultValue === true) : !!value;
  return `
    <div class="form-group-full" style="margin-bottom:16px;display:flex;align-items:center;justify-content:space-between;gap:16px;padding:10px 14px;border:1px solid var(--charcoal-border);border-radius:4px">
      <label class="form-label" for="f_${esc(key)}" style="margin:0;cursor:pointer">${esc(def.label || key)}</label>
      <label class="toggle-switch" style="flex-shrink:0">
        <input type="checkbox" id="f_${esc(key)}" ${isOn ? 'checked' : ''}
          onchange="updateFieldValue('${esc(key)}', this.checked)"/>
        <span class="toggle-slider"></span>
      </label>
    </div>
  `;
}

function fieldSelect(key, def, value) {
  const opts = (def.options || []).map(o => {
    const v = esc(o.value);
    const l = esc(o.label || o.value);
    return `<option value="${v}"${o.value === value ? ' selected' : ''}>${l}</option>`;
  }).join('');
  return `
    <div class="form-group-full" style="margin-bottom:16px">
      <label class="form-label" for="f_${esc(key)}">${esc(def.label || key)}</label>
      <select class="form-input" id="f_${esc(key)}" style="cursor:pointer"
        onchange="updateFieldValue('${esc(key)}', this.value)">${opts}</select>
    </div>
  `;
}

// ─── Field type: layoutButtons ──────────────────────────────────────────────
// Inline icon-button row for choosing between 2-3 layout variants. Currently
// used by Explore stops for picking hero/text-right/text-left. Each option
// renders as a small schematic SVG showing where the image and text sit.
function layoutSchematic(value) {
  // Returns an SVG that schematically shows the layout. All three layouts
  // use the same 40x24 viewBox with a photo rectangle (gold) and a text
  // rectangle (muted cream).
  const photoStyle = 'fill:currentColor;opacity:0.9';
  const textStyle  = 'fill:rgba(184,176,160,0.55)';
  switch (value) {
    case 'hero':
      // Image on top (wide), text below (wide)
      return '<svg viewBox="0 0 40 24" xmlns="http://www.w3.org/2000/svg" style="width:28px;height:18px">'
        +   '<rect x="2" y="2"  width="36" height="12" rx="1" style="' + photoStyle + '"/>'
        +   '<rect x="2" y="16" width="22" height="1.5" rx="0.5" style="' + textStyle + '"/>'
        +   '<rect x="2" y="19" width="28" height="1.5" rx="0.5" style="' + textStyle + '"/>'
        +   '<rect x="2" y="22" width="18" height="1.5" rx="0.5" style="' + textStyle + '"/>'
        + '</svg>';
    case 'text-right':
      // Image left, text right
      return '<svg viewBox="0 0 40 24" xmlns="http://www.w3.org/2000/svg" style="width:28px;height:18px">'
        +   '<rect x="2"  y="2" width="16" height="20" rx="1" style="' + photoStyle + '"/>'
        +   '<rect x="22" y="5"  width="14" height="1.5" rx="0.5" style="' + textStyle + '"/>'
        +   '<rect x="22" y="10" width="16" height="1.5" rx="0.5" style="' + textStyle + '"/>'
        +   '<rect x="22" y="15" width="12" height="1.5" rx="0.5" style="' + textStyle + '"/>'
        +   '<rect x="22" y="20" width="10" height="1.5" rx="0.5" style="' + textStyle + '"/>'
        + '</svg>';
    case 'text-left':
      // Image right, text left
      return '<svg viewBox="0 0 40 24" xmlns="http://www.w3.org/2000/svg" style="width:28px;height:18px">'
        +   '<rect x="22" y="2" width="16" height="20" rx="1" style="' + photoStyle + '"/>'
        +   '<rect x="4"  y="5"  width="14" height="1.5" rx="0.5" style="' + textStyle + '"/>'
        +   '<rect x="2"  y="10" width="16" height="1.5" rx="0.5" style="' + textStyle + '"/>'
        +   '<rect x="6"  y="15" width="12" height="1.5" rx="0.5" style="' + textStyle + '"/>'
        +   '<rect x="8"  y="20" width="10" height="1.5" rx="0.5" style="' + textStyle + '"/>'
        + '</svg>';
    default:
      return '';
  }
}

function fieldLayoutButtons(key, def, value) {
  const opts = def.options || [];
  const buttons = opts.map(o => {
    const isSelected = o.value === value;
    return `
      <button type="button"
        onclick="updateFieldValue('${esc(key)}', '${esc(o.value)}'); refreshLayoutButtons('${esc(key)}', '${esc(o.value)}')"
        title="${esc(o.label)}"
        data-layout-key="${esc(key)}" data-layout-value="${esc(o.value)}"
        style="flex:1;display:inline-flex;align-items:center;justify-content:center;height:42px;border:1px solid ${isSelected ? 'var(--gold)' : 'var(--charcoal-border)'};border-radius:3px;background:${isSelected ? 'rgba(201,169,110,0.12)' : 'transparent'};color:${isSelected ? 'var(--gold)' : 'var(--cream-dim)'};cursor:pointer;padding:0;transition:border-color 0.15s,background 0.15s,color 0.15s">
        ${layoutSchematic(o.value)}
      </button>
    `;
  }).join('');
  return `
    <div class="form-group-full" style="margin-bottom:16px">
      <label class="form-label">${esc(def.label || key)}</label>
      <div style="display:flex;gap:6px">${buttons}</div>
    </div>
  `;
}

function refreshLayoutButtons(key, selectedValue) {
  const btns = document.querySelectorAll(`[data-layout-key="${key}"]`);
  btns.forEach(b => {
    const isThis = b.getAttribute('data-layout-value') === selectedValue;
    b.style.borderColor = isThis ? 'var(--gold)' : 'var(--charcoal-border)';
    b.style.background  = isThis ? 'rgba(201,169,110,0.12)' : 'transparent';
    b.style.color       = isThis ? 'var(--gold)' : 'var(--cream-dim)';
  });
}

function refreshListItemLayoutButtons(group, selectedValue) {
  const btns = document.querySelectorAll(`[data-li-layout-group="${group}"]`);
  btns.forEach(b => {
    const isThis = b.getAttribute('data-li-layout-value') === selectedValue;
    b.style.borderColor = isThis ? 'var(--gold)' : 'var(--charcoal-border)';
    b.style.background  = isThis ? 'rgba(201,169,110,0.12)' : 'transparent';
    b.style.color       = isThis ? 'var(--gold)' : 'var(--cream-dim)';
  });
}


// ─── Field type: image ───────────────────────────────────────────────────────
// Reuses the existing upload endpoint (/api/upload) and image preview pattern.
// On change, uploads the file, stores the returned filename in the field value.
function fieldImage(key, def, value) {
  const areaId  = `imgArea_${esc(key)}`;
  const fileId  = `imgFile_${esc(key)}`;
  const placeholderId = `imgPlaceholder_${esc(key)}`;
  const previewWrapId = `imgPreviewWrap_${esc(key)}`;
  const previewImgId  = `imgPreview_${esc(key)}`;

  const hasImage = !!value;
  const imgSrc = hasImage ? (value.indexOf('/') >= 0 ? value : '/images/' + value) : '';

  return `
    <div class="form-group-full" style="margin-bottom:16px">
      <label class="form-label">${esc(def.label || key)}</label>
      <div class="image-upload-area" id="${areaId}">
        <input type="file" id="${fileId}" accept="image/jpeg,image/png,image/webp,image/gif"
          onchange="handleSectionImageSelect(this, '${esc(key)}')"/>
        <div class="upload-placeholder" id="${placeholderId}" style="${hasImage ? 'display:none' : ''}">
          <span class="upload-icon">&#128247;</span>
          <span class="upload-label">Click or drag to upload</span>
          <span class="upload-hint">JPEG, PNG, WebP or GIF &middot; Max 5 MB</span>
        </div>
        <div class="image-preview-wrap" id="${previewWrapId}" style="${hasImage ? '' : 'display:none'}">
          <img class="image-preview" id="${previewImgId}" src="${esc(imgSrc)}" alt="Preview"/>
          <button class="image-preview-remove" onclick="clearSectionImage(event, '${esc(key)}')" title="Remove photo">&#215;</button>
        </div>
      </div>
    </div>
  `;
}

// Wires up the drag-and-drop behavior for the generated image area.
function initImageField(key) {
  const areaId = `imgArea_${key}`;
  const area = document.getElementById(areaId);
  if (!area) return;
  area.addEventListener('dragover', e => { e.preventDefault(); area.classList.add('drag-over'); });
  area.addEventListener('dragleave', () => area.classList.remove('drag-over'));
  area.addEventListener('drop', e => {
    e.preventDefault(); area.classList.remove('drag-over');
    const f = e.dataTransfer.files && e.dataTransfer.files[0];
    if (f) handleSectionImageSelectFile(f, key);
  });
}

async function handleSectionImageSelect(input, key) {
  const f = input.files && input.files[0];
  if (!f) return;
  await handleSectionImageSelectFile(f, key);
  input.value = ''; // allow re-selecting the same file
}

async function handleSectionImageSelectFile(file, key) {
  if (file.size > 5 * 1024 * 1024) { showToast('Image is over 5 MB.', true); return; }
  const placeholderEl = document.getElementById(`imgPlaceholder_${key}`);
  const previewWrapEl = document.getElementById(`imgPreviewWrap_${key}`);
  const previewImgEl  = document.getElementById(`imgPreview_${key}`);

  // Show local preview immediately
  const reader = new FileReader();
  reader.onload = e => {
    if (previewImgEl) previewImgEl.src = e.target.result;
    if (placeholderEl) placeholderEl.style.display = 'none';
    if (previewWrapEl) previewWrapEl.style.display = '';
  };
  reader.readAsDataURL(file);

  // Upload to /api/upload
  const fd = new FormData();
  fd.append('file', file);
  try {
    const res = await apiFetch('/api/upload', { method: 'POST', body: fd });
    if (!res.ok) throw new Error('Upload failed (HTTP ' + res.status + ')');
    const data = await res.json();
    const filename = data.filename || data.key || data.path || '';
    if (!filename) throw new Error('Upload response missing filename');
    updateFieldValue(key, filename);
    // Swap preview src to the served URL now that it's uploaded
    if (previewImgEl) previewImgEl.src = '/images/' + filename;
  } catch (err) {
    showToast('Image upload failed: ' + err.message, true);
    // Revert the preview
    const currentVal = editingSection && editingSection.data[key];
    if (!currentVal) {
      if (placeholderEl) placeholderEl.style.display = '';
      if (previewWrapEl) previewWrapEl.style.display = 'none';
    }
  }
}

function clearSectionImage(event, key) {
  event.preventDefault();
  event.stopPropagation();
  updateFieldValue(key, null);
  const placeholderEl = document.getElementById(`imgPlaceholder_${key}`);
  const previewWrapEl = document.getElementById(`imgPreviewWrap_${key}`);
  if (placeholderEl) placeholderEl.style.display = '';
  if (previewWrapEl) previewWrapEl.style.display = 'none';
}

// ─── Field type: icon ────────────────────────────────────────────────────────
// Renders a grid of SVG icons from the iconSet list. Clicking selects one.
function fieldIcon(key, def, value) {
  // Popover-style icon picker. Shows a button with the current icon + name.
  // Clicking toggles a floating grid panel below the button. The panel is
  // rendered inside the same wrapper so it's easy to dismiss on outside click.
  const iconSet = def.iconSet || [];
  const currentSvg  = value && window.SECTIONS ? window.SECTIONS.svgIcon(value) : '';
  const currentName = value || '';

  const tiles = iconSet.map(name => {
    const svg = window.SECTIONS ? window.SECTIONS.svgIcon(name) : '';
    const isSelected = name === value;
    return `
      <button type="button"
        onclick="selectIcon('${esc(key)}', '${esc(name)}')"
        title="${esc(name)}"
        data-icon-key="${esc(key)}" data-icon-name="${esc(name)}"
        style="width:42px;height:42px;display:inline-flex;align-items:center;justify-content:center;border:1px solid ${isSelected ? 'var(--gold)' : 'var(--charcoal-border)'};border-radius:4px;background:${isSelected ? 'rgba(201,169,110,0.12)' : 'transparent'};color:${isSelected ? 'var(--gold)' : 'var(--cream-dim)'};cursor:pointer;padding:0;transition:border-color 0.15s,background 0.15s,color 0.15s">
        <span style="width:22px;height:22px;display:inline-flex">${svg}</span>
      </button>
    `;
  }).join('');

  return `
    <div class="form-group-full" style="margin-bottom:16px">
      <label class="form-label">${esc(def.label || key)}</label>
      <div class="icon-picker" data-icon-picker-key="${esc(key)}" style="position:relative">
        <button type="button" class="icon-picker-trigger"
          onclick="toggleIconPicker('${esc(key)}', event)"
          style="display:inline-flex;align-items:center;gap:10px;padding:8px 12px;border:1px solid var(--charcoal-border);border-radius:4px;background:var(--charcoal-card);color:var(--cream);cursor:pointer;min-width:160px;transition:border-color 0.15s">
          <span style="width:22px;height:22px;display:inline-flex;color:var(--gold);flex-shrink:0" data-icon-picker-preview="${esc(key)}">${currentSvg || '<span style=\"font-size:18px;color:var(--cream-dim)\">\u25A1</span>'}</span>
          <span style="font-size:13px;color:var(--cream);letter-spacing:0.5px;flex:1;text-align:left" data-icon-picker-name="${esc(key)}">${esc(currentName) || '<span style=\"color:var(--cream-dim)\">Choose an icon</span>'}</span>
          <span style="color:var(--cream-dim);font-size:10px">&#9662;</span>
        </button>
        <div class="icon-picker-panel" id="iconPickerPanel_${esc(key)}"
          style="display:none;position:absolute;top:calc(100% + 4px);left:0;z-index:30;background:var(--charcoal-card);border:1px solid var(--charcoal-border);border-radius:4px;padding:10px;box-shadow:0 8px 24px rgba(0,0,0,0.5);max-width:340px">
          <div style="display:flex;flex-wrap:wrap;gap:6px">${tiles}</div>
        </div>
      </div>
    </div>
  `;
}

function toggleIconPicker(key, event) {
  if (event) event.stopPropagation();
  const panel = document.getElementById('iconPickerPanel_' + key);
  if (!panel) return;
  const opening = panel.style.display === 'none';
  // Close all other icon pickers first
  document.querySelectorAll('.icon-picker-panel').forEach(p => p.style.display = 'none');
  if (opening) panel.style.display = 'block';
}

// Global outside-click handler: close any open icon picker
document.addEventListener('click', function (e) {
  if (!e.target.closest('.icon-picker')) {
    document.querySelectorAll('.icon-picker-panel').forEach(p => p.style.display = 'none');
  }
});

function selectIcon(key, iconName) {
  updateFieldValue(key, iconName);
  // Update tile visuals (for when the panel is still open briefly)
  const tiles = document.querySelectorAll(`[data-icon-key="${key}"]`);
  tiles.forEach(t => {
    const isThis = t.getAttribute('data-icon-name') === iconName;
    t.style.borderColor = isThis ? 'var(--gold)' : 'var(--charcoal-border)';
    t.style.background  = isThis ? 'rgba(201,169,110,0.12)' : 'transparent';
    t.style.color       = isThis ? 'var(--gold)' : 'var(--cream-dim)';
  });
  // Update the trigger button's preview + name
  const preview = document.querySelector(`[data-icon-picker-preview="${key}"]`);
  const name    = document.querySelector(`[data-icon-picker-name="${key}"]`);
  if (preview && window.SECTIONS) preview.innerHTML = window.SECTIONS.svgIcon(iconName);
  if (name) name.textContent = iconName;
  // Close the panel
  const panel = document.getElementById('iconPickerPanel_' + key);
  if (panel) panel.style.display = 'none';
}

// ─── Field type: list (repeatable sub-fields) ───────────────────────────────
function fieldList(key, def, value) {
  // value should be an array. Render as stacked item cards with sub-fields.
  return `
    <div class="form-group-full" style="margin-bottom:16px">
      <label class="form-label">${esc(def.label || key)}</label>
      <div id="listContainer_${esc(key)}" style="display:flex;flex-direction:column;gap:12px">
        <!-- populated by initListField -->
      </div>
      <button type="button" class="btn-add-item" style="margin-top:12px"
        onclick="addListItem('${esc(key)}')">+ Add Item</button>
    </div>
  `;
}

function initListField(key, def) {
  renderListItems(key, def);
}

function renderListItems(key, def) {
  const container = document.getElementById(`listContainer_${key}`);
  if (!container || !editingSection) return;
  const items = Array.isArray(editingSection.data[key]) ? editingSection.data[key] : [];
  const itemSchema = def.itemSchema || {};
  const itemKeys = Object.keys(itemSchema);
  const layout = def.listLayout === 'grid' ? 'grid' : 'stack';

  if (items.length === 0) {
    container.innerHTML = '<div style="padding:20px;text-align:center;color:var(--cream-dim);font-style:italic;border:1px dashed var(--charcoal-border);border-radius:4px">No items yet. Click + Add Item below.</div>';
    container.style.display = 'block';
    return;
  }

  if (layout === 'grid') {
    // Compact grid layout matching the front-end visual. Each tile has a
    // drag handle (top-right), delete (top-left), large icon-popover, and a
    // label input below. Reordering is drag-and-drop, not ↑↓ buttons.
    container.style.display = 'grid';
    container.style.gridTemplateColumns = 'repeat(auto-fill, minmax(140px, 1fr))';
    container.style.gap = '10px';
    container.innerHTML = items.map((item, idx) => {
      const subFields = itemKeys.map(subKey => {
        const subDef = itemSchema[subKey];
        const subVal = item[subKey];
        return renderListItemField(key, idx, subKey, subDef, subVal);
      }).join('');
      return `
        <div class="list-tile" data-list-item-idx="${idx}" data-list-key="${esc(key)}"
          draggable="true"
          ondragstart="onListItemDragStart(event, '${esc(key)}', ${idx})"
          ondragover="onListItemDragOver(event, '${esc(key)}', ${idx})"
          ondrop="onListItemDrop(event, '${esc(key)}', ${idx})"
          ondragend="onListItemDragEnd(event)"
          style="position:relative;padding:10px 8px 8px;border:1px solid var(--charcoal-border);border-radius:4px;background:var(--charcoal-card);cursor:grab">
          <button type="button" title="Remove" onclick="event.stopPropagation(); removeListItem('${esc(key)}', ${idx})"
            style="position:absolute;top:4px;left:4px;background:transparent;border:none;color:rgba(230,120,110,0.8);width:22px;height:22px;cursor:pointer;font-size:16px;line-height:1;padding:0;z-index:2">&times;</button>
          <span title="Drag to reorder"
            style="position:absolute;top:4px;right:6px;color:rgba(184,176,160,0.5);font-size:14px;pointer-events:none">&#8942;&#8942;</span>
          ${subFields}
        </div>
      `;
    }).join('');
  } else {
    // Original stacked-card layout with ↑↓ reorder buttons. Used by Explore.
    container.style.display = 'flex';
    container.style.flexDirection = 'column';
    container.style.gap = '12px';
    container.style.gridTemplateColumns = '';
    container.innerHTML = items.map((item, idx) => {
      const subFields = itemKeys.map(subKey => {
        const subDef = itemSchema[subKey];
        const subVal = item[subKey];
        return renderListItemField(key, idx, subKey, subDef, subVal);
      }).join('');
      const canUp = idx > 0;
      const canDown = idx < items.length - 1;
      return `
        <div class="category-block" data-list-item-idx="${idx}" style="padding:12px">
          <div style="display:flex;align-items:center;gap:8px;margin-bottom:12px;padding-bottom:10px;border-bottom:1px solid var(--charcoal-border)">
            <span style="font-family:'Oswald',sans-serif;font-size:11px;color:var(--gold);letter-spacing:2px;text-transform:uppercase;flex:1">#${idx + 1}</span>
            <button type="button" title="Move up"   onclick="moveListItem('${esc(key)}', ${idx}, -1)" ${canUp   ? '' : 'disabled'} style="background:transparent;border:1px solid var(--charcoal-border);color:${canUp   ? 'var(--cream)' : 'rgba(255,255,255,0.2)'};width:30px;height:30px;border-radius:3px;cursor:${canUp   ? 'pointer' : 'not-allowed'};font-size:14px">&uarr;</button>
            <button type="button" title="Move down" onclick="moveListItem('${esc(key)}', ${idx},  1)" ${canDown ? '' : 'disabled'} style="background:transparent;border:1px solid var(--charcoal-border);color:${canDown ? 'var(--cream)' : 'rgba(255,255,255,0.2)'};width:30px;height:30px;border-radius:3px;cursor:${canDown ? 'pointer' : 'not-allowed'};font-size:14px">&darr;</button>
            <button type="button" title="Remove"    onclick="removeListItem('${esc(key)}', ${idx})" style="background:transparent;border:1px solid rgba(170,60,50,0.5);color:rgba(230,120,110,0.9);width:30px;height:30px;border-radius:3px;cursor:pointer;font-size:16px">&times;</button>
          </div>
          ${subFields}
        </div>
      `;
    }).join('');
  }

  // Post-render: wire image / richtext sub-fields (icon pickers work via data attrs)
  items.forEach((item, idx) => {
    itemKeys.forEach(subKey => {
      const subDef = itemSchema[subKey];
      if (subDef.type === 'image') initListItemImageField(key, idx, subKey);
    });
  });
}

// ─── Drag-drop reorder for grid-layout list items ───────────────────────────
let _draggingListItem = null;

function onListItemDragStart(e, listKey, idx) {
  _draggingListItem = { listKey, idx };
  e.dataTransfer.effectAllowed = 'move';
  e.dataTransfer.setData('text/plain', 'listitem');
  e.currentTarget.style.opacity = '0.4';
}

function onListItemDragOver(e, listKey, idx) {
  if (!_draggingListItem || _draggingListItem.listKey !== listKey) return;
  e.preventDefault();
  e.dataTransfer.dropEffect = 'move';
}

function onListItemDrop(e, listKey, idx) {
  if (!_draggingListItem || _draggingListItem.listKey !== listKey) return;
  e.preventDefault();
  const fromIdx = _draggingListItem.idx;
  const toIdx = idx;
  if (fromIdx === toIdx) return;
  const arr = editingSection && editingSection.data[listKey];
  if (!Array.isArray(arr)) return;
  const [moved] = arr.splice(fromIdx, 1);
  arr.splice(toIdx, 0, moved);
  const T = window.SECTIONS && window.SECTIONS.TYPES && window.SECTIONS.TYPES[editingSection.type];
  const def = T && T.schema && T.schema[listKey];
  if (def) renderListItems(listKey, def);
}

function onListItemDragEnd(e) {
  _draggingListItem = null;
  document.querySelectorAll('.list-tile').forEach(t => t.style.opacity = '');
}

// A list-item field: same as top-level but with scoped IDs and callbacks.
function renderListItemField(listKey, itemIdx, fieldKey, def, value) {
  const inputId = `li_${listKey}_${itemIdx}_${fieldKey}`;
  switch (def.type) {
    case 'text': {
      const ph = def.placeholder ? ` placeholder="${esc(def.placeholder)}"` : '';
      return `
        <div style="margin-bottom:10px">
          <label class="form-label" for="${inputId}" style="font-size:10px">${esc(def.label || fieldKey)}</label>
          <input class="form-input" type="text" id="${inputId}" value="${esc(value || '')}"${ph}
            oninput="updateListItemValue('${esc(listKey)}', ${itemIdx}, '${esc(fieldKey)}', this.value)"/>
        </div>
      `;
    }
    case 'longtext': {
      const ph = def.placeholder ? ` placeholder="${esc(def.placeholder)}"` : '';
      return `
        <div style="margin-bottom:10px">
          <label class="form-label" for="${inputId}" style="font-size:10px">${esc(def.label || fieldKey)}</label>
          <textarea class="form-textarea" id="${inputId}" style="min-height:70px"${ph}
            oninput="updateListItemValue('${esc(listKey)}', ${itemIdx}, '${esc(fieldKey)}', this.value)">${esc(value || '')}</textarea>
        </div>
      `;
    }
    case 'select': {
      const opts = (def.options || []).map(o =>
        `<option value="${esc(o.value)}"${o.value === value ? ' selected' : ''}>${esc(o.label || o.value)}</option>`
      ).join('');
      return `
        <div style="margin-bottom:10px">
          <label class="form-label" for="${inputId}" style="font-size:10px">${esc(def.label || fieldKey)}</label>
          <select class="form-input" id="${inputId}" style="cursor:pointer"
            onchange="updateListItemValue('${esc(listKey)}', ${itemIdx}, '${esc(fieldKey)}', this.value)">${opts}</select>
        </div>
      `;
    }
    case 'layoutButtons': {
      const group = `${listKey}_${itemIdx}_${fieldKey}`;
      const buttons = (def.options || []).map(o => {
        const isSelected = o.value === value;
        return `
          <button type="button"
            onclick="updateListItemValue('${esc(listKey)}', ${itemIdx}, '${esc(fieldKey)}', '${esc(o.value)}'); refreshListItemLayoutButtons('${esc(group)}', '${esc(o.value)}')"
            title="${esc(o.label)}"
            data-li-layout-group="${esc(group)}" data-li-layout-value="${esc(o.value)}"
            style="flex:1;display:inline-flex;align-items:center;justify-content:center;height:38px;border:1px solid ${isSelected ? 'var(--gold)' : 'var(--charcoal-border)'};border-radius:3px;background:${isSelected ? 'rgba(201,169,110,0.12)' : 'transparent'};color:${isSelected ? 'var(--gold)' : 'var(--cream-dim)'};cursor:pointer;padding:0">
            ${layoutSchematic(o.value)}
          </button>
        `;
      }).join('');
      return `
        <div style="margin-bottom:10px">
          <label class="form-label" style="font-size:10px">${esc(def.label || fieldKey)}</label>
          <div style="display:flex;gap:4px">${buttons}</div>
        </div>
      `;
    }
    case 'icon': {
      const iconSet = def.iconSet || [];
      const group   = `${listKey}_${itemIdx}_${fieldKey}`;
      const currentSvg  = value && window.SECTIONS ? window.SECTIONS.svgIcon(value) : '';
      const currentName = value || '';
      const tiles = iconSet.map(name => {
        const svg = window.SECTIONS ? window.SECTIONS.svgIcon(name) : '';
        const isSelected = name === value;
        return `
          <button type="button"
            onclick="selectListItemIcon('${esc(listKey)}', ${itemIdx}, '${esc(fieldKey)}', '${esc(name)}')"
            title="${esc(name)}"
            data-li-icon-key="${esc(group)}" data-li-icon-name="${esc(name)}"
            style="width:38px;height:38px;display:inline-flex;align-items:center;justify-content:center;border:1px solid ${isSelected ? 'var(--gold)' : 'var(--charcoal-border)'};border-radius:3px;background:${isSelected ? 'rgba(201,169,110,0.12)' : 'transparent'};color:${isSelected ? 'var(--gold)' : 'var(--cream-dim)'};cursor:pointer;padding:0">
            <span style="width:18px;height:18px;display:inline-flex">${svg}</span>
          </button>
        `;
      }).join('');
      return `
        <div style="margin-bottom:10px">
          <label class="form-label" style="font-size:10px">${esc(def.label || fieldKey)}</label>
          <div class="icon-picker" data-icon-picker-key="${esc(group)}" style="position:relative">
            <button type="button" class="icon-picker-trigger"
              onclick="toggleIconPicker('li_${esc(group)}', event)"
              style="display:inline-flex;align-items:center;gap:8px;padding:6px 10px;border:1px solid var(--charcoal-border);border-radius:3px;background:var(--charcoal-card);color:var(--cream);cursor:pointer;min-width:140px">
              <span style="width:18px;height:18px;display:inline-flex;color:var(--gold);flex-shrink:0" data-li-icon-picker-preview="${esc(group)}">${currentSvg || '<span style=\"font-size:14px;color:var(--cream-dim)\">\u25A1</span>'}</span>
              <span style="font-size:12px;color:var(--cream);flex:1;text-align:left" data-li-icon-picker-name="${esc(group)}">${esc(currentName) || '<span style=\"color:var(--cream-dim)\">Icon</span>'}</span>
              <span style="color:var(--cream-dim);font-size:9px">&#9662;</span>
            </button>
            <div class="icon-picker-panel" id="iconPickerPanel_li_${esc(group)}"
              style="display:none;position:absolute;top:calc(100% + 4px);left:0;z-index:30;background:var(--charcoal-card);border:1px solid var(--charcoal-border);border-radius:4px;padding:8px;box-shadow:0 8px 24px rgba(0,0,0,0.5);max-width:300px">
              <div style="display:flex;flex-wrap:wrap;gap:4px">${tiles}</div>
            </div>
          </div>
        </div>
      `;
    }
    case 'image': {
      const hasImage = !!value;
      const imgSrc = hasImage ? (value.indexOf('/') >= 0 ? value : '/images/' + value) : '';
      return `
        <div style="margin-bottom:10px">
          <label class="form-label" style="font-size:10px">${esc(def.label || fieldKey)}</label>
          <div class="image-upload-area" id="liImgArea_${esc(listKey)}_${itemIdx}_${esc(fieldKey)}" style="min-height:100px">
            <input type="file" id="liImgFile_${esc(listKey)}_${itemIdx}_${esc(fieldKey)}" accept="image/jpeg,image/png,image/webp,image/gif"
              onchange="handleListItemImageSelect(this, '${esc(listKey)}', ${itemIdx}, '${esc(fieldKey)}')"/>
            <div class="upload-placeholder" id="liImgPh_${esc(listKey)}_${itemIdx}_${esc(fieldKey)}" style="${hasImage ? 'display:none' : ''}">
              <span class="upload-icon">&#128247;</span>
              <span class="upload-label">Click or drag to upload</span>
            </div>
            <div class="image-preview-wrap" id="liImgPw_${esc(listKey)}_${itemIdx}_${esc(fieldKey)}" style="${hasImage ? '' : 'display:none'}">
              <img class="image-preview" id="liImgPv_${esc(listKey)}_${itemIdx}_${esc(fieldKey)}" src="${esc(imgSrc)}" alt="Preview"/>
              <button class="image-preview-remove" onclick="clearListItemImage(event, '${esc(listKey)}', ${itemIdx}, '${esc(fieldKey)}')" title="Remove photo">&#215;</button>
            </div>
          </div>
        </div>
      `;
    }
    case 'boolean': {
      const isOn = value === undefined ? (def.defaultValue === true) : !!value;
      return `
        <div style="margin-bottom:10px;display:flex;align-items:center;justify-content:space-between;gap:12px;padding:8px 12px;border:1px solid var(--charcoal-border);border-radius:3px">
          <label class="form-label" style="font-size:10px;margin:0">${esc(def.label || fieldKey)}</label>
          <label class="toggle-switch" style="flex-shrink:0">
            <input type="checkbox" ${isOn ? 'checked' : ''}
              onchange="updateListItemValue('${esc(listKey)}', ${itemIdx}, '${esc(fieldKey)}', this.checked)"/>
            <span class="toggle-slider"></span>
          </label>
        </div>
      `;
    }
    default: return '<!-- unsupported list-item field type: ' + esc(def.type) + ' -->';
  }
}

function initListItemImageField(listKey, itemIdx, fieldKey) {
  const areaId = `liImgArea_${listKey}_${itemIdx}_${fieldKey}`;
  const area = document.getElementById(areaId);
  if (!area) return;
  area.addEventListener('dragover', e => { e.preventDefault(); area.classList.add('drag-over'); });
  area.addEventListener('dragleave', () => area.classList.remove('drag-over'));
  area.addEventListener('drop', e => {
    e.preventDefault(); area.classList.remove('drag-over');
    const f = e.dataTransfer.files && e.dataTransfer.files[0];
    if (f) handleListItemImageSelectFile(f, listKey, itemIdx, fieldKey);
  });
}

function updateListItemValue(listKey, itemIdx, fieldKey, value) {
  if (!editingSection) return;
  if (!Array.isArray(editingSection.data[listKey])) return;
  if (!editingSection.data[listKey][itemIdx]) return;
  editingSection.data[listKey][itemIdx][fieldKey] = value;
}

function selectListItemIcon(listKey, itemIdx, fieldKey, iconName) {
  updateListItemValue(listKey, itemIdx, fieldKey, iconName);
  const group = `${listKey}_${itemIdx}_${fieldKey}`;
  const tiles = document.querySelectorAll(`[data-li-icon-key="${group}"]`);
  tiles.forEach(t => {
    const isThis = t.getAttribute('data-li-icon-name') === iconName;
    t.style.borderColor = isThis ? 'var(--gold)' : 'var(--charcoal-border)';
    t.style.background  = isThis ? 'rgba(201,169,110,0.12)' : 'transparent';
    t.style.color       = isThis ? 'var(--gold)' : 'var(--cream-dim)';
  });
  // Update the trigger button's preview + name
  const preview = document.querySelector(`[data-li-icon-picker-preview="${group}"]`);
  const name    = document.querySelector(`[data-li-icon-picker-name="${group}"]`);
  if (preview && window.SECTIONS) preview.innerHTML = window.SECTIONS.svgIcon(iconName);
  if (name) name.textContent = iconName;
  // Close the panel
  const panel = document.getElementById('iconPickerPanel_li_' + group);
  if (panel) panel.style.display = 'none';
}

async function handleListItemImageSelect(input, listKey, itemIdx, fieldKey) {
  const f = input.files && input.files[0];
  if (!f) return;
  await handleListItemImageSelectFile(f, listKey, itemIdx, fieldKey);
  input.value = '';
}

async function handleListItemImageSelectFile(file, listKey, itemIdx, fieldKey) {
  if (file.size > 5 * 1024 * 1024) { showToast('Image is over 5 MB.', true); return; }
  const phId = `liImgPh_${listKey}_${itemIdx}_${fieldKey}`;
  const pwId = `liImgPw_${listKey}_${itemIdx}_${fieldKey}`;
  const pvId = `liImgPv_${listKey}_${itemIdx}_${fieldKey}`;
  const phEl = document.getElementById(phId);
  const pwEl = document.getElementById(pwId);
  const pvEl = document.getElementById(pvId);

  const reader = new FileReader();
  reader.onload = e => {
    if (pvEl) pvEl.src = e.target.result;
    if (phEl) phEl.style.display = 'none';
    if (pwEl) pwEl.style.display = '';
  };
  reader.readAsDataURL(file);

  const fd = new FormData();
  fd.append('file', file);
  try {
    const res = await apiFetch('/api/upload', { method: 'POST', body: fd });
    if (!res.ok) throw new Error('Upload failed (HTTP ' + res.status + ')');
    const data = await res.json();
    const filename = data.filename || data.key || data.path || '';
    if (!filename) throw new Error('Upload response missing filename');
    updateListItemValue(listKey, itemIdx, fieldKey, filename);
    if (pvEl) pvEl.src = '/images/' + filename;
  } catch (err) {
    showToast('Image upload failed: ' + err.message, true);
  }
}

function clearListItemImage(event, listKey, itemIdx, fieldKey) {
  event.preventDefault();
  event.stopPropagation();
  updateListItemValue(listKey, itemIdx, fieldKey, null);
  const phEl = document.getElementById(`liImgPh_${listKey}_${itemIdx}_${fieldKey}`);
  const pwEl = document.getElementById(`liImgPw_${listKey}_${itemIdx}_${fieldKey}`);
  if (phEl) phEl.style.display = '';
  if (pwEl) pwEl.style.display = 'none';
}

function addListItem(listKey) {
  if (!editingSection) return;
  const T = window.SECTIONS && window.SECTIONS.TYPES && window.SECTIONS.TYPES[editingSection.type];
  const def = T && T.schema && T.schema[listKey];
  if (!def) return;
  // Build an empty item from the itemSchema defaults
  const newItem = {};
  const itemSchema = def.itemSchema || {};
  Object.keys(itemSchema).forEach(subKey => {
    const subDef = itemSchema[subKey];
    if (subDef.type === 'boolean')    newItem[subKey] = subDef.defaultValue === true;
    else if (subDef.type === 'select') newItem[subKey] = (subDef.options && subDef.options[0] && subDef.options[0].value) || '';
    else if (subDef.type === 'number') newItem[subKey] = null;
    else                               newItem[subKey] = '';
  });
  if (!Array.isArray(editingSection.data[listKey])) editingSection.data[listKey] = [];
  editingSection.data[listKey].push(newItem);
  renderListItems(listKey, def);
}

function removeListItem(listKey, itemIdx) {
  if (!editingSection) return;
  const T = window.SECTIONS && window.SECTIONS.TYPES && window.SECTIONS.TYPES[editingSection.type];
  const def = T && T.schema && T.schema[listKey];
  if (!def) return;
  if (!Array.isArray(editingSection.data[listKey])) return;
  if (!confirm('Remove this item?')) return;
  editingSection.data[listKey].splice(itemIdx, 1);
  renderListItems(listKey, def);
}

function moveListItem(listKey, itemIdx, delta) {
  if (!editingSection) return;
  const T = window.SECTIONS && window.SECTIONS.TYPES && window.SECTIONS.TYPES[editingSection.type];
  const def = T && T.schema && T.schema[listKey];
  if (!def) return;
  const arr = editingSection.data[listKey];
  if (!Array.isArray(arr)) return;
  const j = itemIdx + delta;
  if (j < 0 || j >= arr.length) return;
  const [moved] = arr.splice(itemIdx, 1);
  arr.splice(j, 0, moved);
  renderListItems(listKey, def);
}

// ─── Field type: richtext (Trix) ────────────────────────────────────────────
function fieldRichText(key, def, value) {
  const inputId = `rtInput_${esc(key)}`;
  const editorId = `rtEditor_${esc(key)}`;
  return `
    <div class="form-group-full" style="margin-bottom:16px">
      <label class="form-label">${esc(def.label || key)}</label>
      <input type="hidden" id="${inputId}" value="${esc(value || '')}"/>
      <trix-editor id="${editorId}" input="${inputId}" style="background:var(--charcoal-card);color:var(--cream);border:1px solid var(--charcoal-border);border-radius:4px;min-height:140px;padding:10px"></trix-editor>
    </div>
  `;
}

function initRichTextField(key) {
  const editor = document.getElementById(`rtEditor_${key}`);
  if (!editor) return;
  // Trix dispatches 'trix-change' whenever the content changes
  editor.addEventListener('trix-change', () => {
    const input = document.getElementById(`rtInput_${key}`);
    if (input) updateFieldValue(key, input.value);
  });
}

// ─── Save ────────────────────────────────────────────────────────────────────
async function saveEditingSection() {
  if (!editingSection || editingSectionIdx < 0 || !currentPageSlug) {
    showToast('Nothing to save.', true);
    return;
  }

  const btn = document.getElementById('saveSectionBtn');
  const ind = document.getElementById('savingSectionIndicator');
  if (btn) btn.disabled = true;
  if (ind) ind.style.display = 'inline-flex';

  // Replace the section in the working list with our edited copy
  const updatedSections = pageHomeSections.slice();
  updatedSections[editingSectionIdx] = JSON.parse(JSON.stringify(editingSection));

  try {
    const res = await apiFetch('/api/pages/' + currentPageSlug, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sections: updatedSections })
    });
    if (!res.ok) {
      const txt = await res.text();
      throw new Error(res.status === 401 ? 'Session expired — please sign in again.' : (txt || ('HTTP ' + res.status)));
    }
    const data = await res.json();
    pageHomeSections = Array.isArray(data.sections) ? data.sections : updatedSections;
    pageHomeOriginal = JSON.stringify(pageHomeSections);
    showToast('Section saved.');
    // Navigate back to the list with fresh data
    editingSection = null;
    editingSectionIdx = -1;
    showPage('pagePageEditor');
    renderPageSections();
    updatePageHomeDirty();
  } catch (err) {
    showToast(err.message, true);
  } finally {
    if (btn) btn.disabled = false;
    if (ind) ind.style.display = 'none';
  }
}

// ─── PHASE 4 — Add / Delete / Hide sections ──────────────────────────────────
// These operations all mutate the in-memory pageHomeSections list and trigger
// the dirty check; they do NOT persist to the server until the user clicks
// "Save Layout" on the page editor. This matches the reorder flow from Phase 2.

// Simple unique-id generator for new sections
function newSectionId() {
  return 'sec_' + Math.random().toString(16).slice(2, 10) + Date.now().toString(16).slice(-4);
}

// ─── ADD SECTION ─────────────────────────────────────────────────────────────
function openAddSectionModal() {
  if (!window.SECTIONS || !window.SECTIONS.TYPES) return;
  const grid = document.getElementById('addSectionGrid');
  if (!grid) return;

  // Filter: exclude 'reserved' types (menu, contact_form, footer).
  // Order: custom types first, then generic, each group alphabetical by label
  const types = Object.keys(window.SECTIONS.TYPES)
    .map(key => ({ key, ...window.SECTIONS.TYPES[key] }))
    .filter(t => t.category !== 'reserved');

  const custom  = types.filter(t => t.category === 'custom').sort((a, b) => a.label.localeCompare(b.label));
  const generic = types.filter(t => t.category === 'generic').sort((a, b) => a.label.localeCompare(b.label));
  const ordered = [...custom, ...generic];

  grid.innerHTML = ordered.map(t => `
    <button type="button" onclick="addSectionOfType('${esc(t.key)}')"
      style="text-align:left;padding:14px;border:1px solid var(--charcoal-border);border-radius:4px;background:var(--charcoal-card);color:var(--cream);cursor:pointer;display:flex;flex-direction:column;gap:6px;transition:border-color 0.15s,background 0.15s"
      onmouseover="this.style.borderColor='var(--gold-dark)'; this.style.background='rgba(201,169,110,0.05)'"
      onmouseout="this.style.borderColor=''; this.style.background='var(--charcoal-card)'">
      <div style="display:flex;align-items:center;gap:10px">
        <span style="font-size:20px;width:24px;text-align:center;flex-shrink:0">${t.icon || '\u25A1'}</span>
        <span style="font-family:'Oswald',sans-serif;font-size:13px;color:var(--gold);letter-spacing:1.5px;text-transform:uppercase">${esc(t.label)}</span>
      </div>
      <div style="font-size:11px;color:var(--cream-dim);line-height:1.5">${esc(t.description || '')}</div>
    </button>
  `).join('');

  document.getElementById('addSectionModal').classList.add('visible');
}

function closeAddSectionModal() {
  const modal = document.getElementById('addSectionModal');
  if (modal) modal.classList.remove('visible');
}

function addSectionOfType(typeKey) {
  const T = window.SECTIONS && window.SECTIONS.TYPES && window.SECTIONS.TYPES[typeKey];
  if (!T) { showToast('Unknown section type.', true); return; }

  // Deep-clone the defaults so subsequent edits don't mutate the registry
  const defaults = T.defaults ? JSON.parse(JSON.stringify(T.defaults)) : {};

  pageHomeSections.push({
    id:   newSectionId(),
    type: typeKey,
    data: defaults
  });

  closeAddSectionModal();
  renderPageSections();
  updatePageHomeDirty();
  showToast('Section added. Click Save Layout to persist.');

  // Scroll to bottom so the user sees the new row
  const list = document.getElementById('sectionsList');
  if (list) list.scrollIntoView({ behavior: 'smooth', block: 'end' });
}

// ─── DELETE SECTION ──────────────────────────────────────────────────────────
function promptDeleteSection(sectionId) {
  const idx = pageHomeSections.findIndex(s => s.id === sectionId);
  if (idx < 0) { showToast('Section not found.', true); return; }
  const section = pageHomeSections[idx];
  const T = window.SECTIONS && window.SECTIONS.TYPES && window.SECTIONS.TYPES[section.type];
  const label = T ? T.label : section.type;
  showConfirmModal(
    'Delete Section?',
    `Remove the "${label}" section at position #${idx + 1}? You'll still need to click Save Layout to persist this deletion.`,
    () => {
      pageHomeSections.splice(idx, 1);
      renderPageSections();
      updatePageHomeDirty();
      showToast('Section removed. Click Save Layout to persist.');
    }
  );
}

// ─── HIDE / SHOW SECTION ─────────────────────────────────────────────────────
function toggleSectionHidden(sectionId) {
  const section = pageHomeSections.find(s => s.id === sectionId);
  if (!section) return;
  section.hidden = !section.hidden;
  renderPageSections();
  updatePageHomeDirty();
  showToast(section.hidden ? 'Section hidden. Click Save Layout to persist.' : 'Section shown. Click Save Layout to persist.');
}

// ─── PRINT SERVER (Phase 5 placeholder) ──────────────────────────────────────
// The Print Server card in Settings. Shows server status (not configured /
// offline / online) and offers a "require for orders" toggle. The print
// server itself doesn't exist yet — this UI is scaffolding.
async function loadPrintServerUI() {
  // 1. Status indicator — pull current status from the placeholder endpoint
  const statusDesc = document.getElementById('printServerStatusDesc');
  const statusDot  = document.getElementById('printServerStatusDot');
  if (statusDesc && statusDot) {
    try {
      const res  = await fetch('/api/print-server/status');
      const data = await res.json();
      if (!data.configured) {
        statusDesc.textContent = 'Not configured (no heartbeat ever received)';
        statusDot.style.background = 'rgba(184,176,160,0.4)'; // gray
      } else if (data.online) {
        const s = data.secondsSinceLastSeen || 0;
        statusDesc.textContent = 'Online \u00b7 last heartbeat ' + formatAgo(s);
        statusDot.style.background = 'rgba(80,180,120,0.9)'; // green
      } else {
        const s = data.secondsSinceLastSeen || 0;
        statusDesc.textContent = 'Offline \u00b7 last heartbeat ' + formatAgo(s);
        statusDot.style.background = 'rgba(230,120,110,0.9)'; // red
      }
    } catch (_) {
      statusDesc.textContent = 'Could not reach status endpoint';
      statusDot.style.background = 'rgba(230,120,110,0.9)';
    }
  }

  // 2. Require-print-server toggle — reflect current settings value
  const toggle = document.getElementById('printServerRequiredToggle');
  if (toggle && settingsData) {
    toggle.checked = settingsData.printServerRequired === true;
  }
}

function formatAgo(seconds) {
  if (seconds < 60) return seconds + 's ago';
  if (seconds < 3600) return Math.floor(seconds / 60) + 'm ago';
  if (seconds < 86400) return Math.floor(seconds / 3600) + 'h ago';
  return Math.floor(seconds / 86400) + 'd ago';
}

async function savePrintServerRequired(enabled) {
  if (!settingsData) return;
  try {
    const res = await apiFetch('/api/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ printServerRequired: enabled === true }),
    });
    if (!res.ok) throw new Error('Save failed');
    settingsData.printServerRequired = enabled === true;
    showToast(enabled ? 'Print server will be required for orders.' : 'Print server requirement disabled.');
  } catch (e) {
    showToast(e.message, true);
    // Revert toggle
    const toggle = document.getElementById('printServerRequiredToggle');
    if (toggle) toggle.checked = !enabled;
  }
}
