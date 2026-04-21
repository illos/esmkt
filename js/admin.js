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

function switchTab(tab) {
  activeTab = tab;
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  document.getElementById('tab' + tab.charAt(0).toUpperCase() + tab.slice(1))?.classList.add('active');
  if (tab === 'menu')   { showPage('pageList');   loadMenu(); }
  if (tab === 'hours')  { showPage('pageHours');  loadHours(); }
  if (tab === 'events') { showPage('pageEvents'); loadEvents(); }
}

async function showList() {
  document.getElementById('navLogout').classList.add('visible');
  document.getElementById('adminTabs').classList.add('visible');
  switchTab('menu');
}

// ─── MENU API ─────────────────────────────────────────────────────────────────
async function loadMenu() {
  const container = document.getElementById('categoryContainer');
  container.innerHTML = '<div style="padding:40px;text-align:center;color:var(--cream-dim);font-style:italic"><span class="spinner"></span> Loading…</div>';
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
function openForm(itemId) {
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

  // Add-ons (with default checkbox state)
  const editor = document.getElementById('addonsEditor');
  editor.innerHTML = '';
  const defaultSet = new Set(editingItem?.defaultAddons || []);
  (editingItem?.addons || []).forEach(a => addAddonRow(a, defaultSet.has(a)));

  // Options
  const optEditor = document.getElementById('optionsEditor');
  optEditor.innerHTML = '';
  (editingItem?.options || []).forEach(o => addOptionBlock(o));

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
    <input class="form-input" type="text" placeholder="Add-on name (e.g. Avocado)" value="${esc(addonName)}" data-addon-name/>
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
  const addons = [], defaultAddons = [];
  rows.forEach(row => {
    const name      = row.querySelector('[data-addon-name]').value.trim();
    const price     = parseFloat(row.querySelector('[data-addon-price]').value) || 0;
    const isDef     = row.querySelector('[data-addon-is-default]').checked;
    if (name) {
      const str = `${name} +$${price % 1 === 0 ? price : price.toFixed(2)}`;
      addons.push(str);
      if (isDef) defaultAddons.push(str);
    }
  });
  return { addons, defaultAddons };
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
  const options = [];
  blocks.forEach(block => {
    const name    = block.querySelector('[data-option-name]').value.trim();
    const choices = [...block.querySelectorAll('[data-choice]')]
      .map(i => i.value.trim()).filter(Boolean);
    if (name && choices.length) options.push({ name, choices });
  });
  return options;
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
    const { addons, defaultAddons } = collectAddons();
    const categoryId = parseInt(document.getElementById('fCategory').value) || 0;
    const item = {
      name, price, description: desc,
      photo: photoFilename,
      addons, defaultAddons,
      options: collectOptions(),
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

// ─── HOURS ────────────────────────────────────────────────────────────────────
let settingsData = null;

async function loadHours() {
  try {
    const res  = await apiFetch('/api/settings');
    const data = await res.json();
    settingsData = data;
    renderHoursTable('storeHoursBody', data.storeHours);
    renderHoursTable('deliHoursBody',  data.deliHours);
  } catch(e) { showToast('Could not load hours.', true); }
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
    const storeHours = collectHours('storeHoursBody', settingsData.storeHours);
    const deliHours  = collectHours('deliHoursBody',  settingsData.deliHours);
    const res = await apiFetch('/api/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ storeHours, deliHours }),
    });
    if (!res.ok) throw new Error('Save failed');
    settingsData = { storeHours, deliHours };
    showToast('Hours saved.');
  } catch(e) { showToast(e.message, true); }
  finally { btn.disabled = false; ind.style.display = 'none'; }
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
  document.getElementById('efTitle').value = editingEvent?.title       || '';
  document.getElementById('efDate').value  = editingEvent?.date        || '';
  document.getElementById('efDesc').value  = editingEvent?.description || '';
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
  const title = document.getElementById('efTitle').value.trim();
  const date  = document.getElementById('efDate').value;
  const desc  = document.getElementById('efDesc').value.trim();
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
    const event = { title, date, description: desc, photo: photoFilename };
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
    } else { events.push(data.event); }
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
