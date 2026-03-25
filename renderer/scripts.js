// ============================================================
// script.js — BillPro Premium Billing System with Size Options
// ============================================================
'use strict';

// ── State ─────────────────────────────────────────────────────
const state = {
  products:          [],
  categories:        [],
  cart:              [],
  activeCategoryId:  null,
  historyPeriod:     'all',
  pendingImageFile:  null,
  oldImageFile:      null,
  currentImageFile:  null,
  selectedVariant:   null,
};

// ── Utils ─────────────────────────────────────────────────────
const $ = (sel, ctx = document) => ctx.querySelector(sel);
const $$ = (sel, ctx = document) => [...ctx.querySelectorAll(sel)];

const fmt = n => 'Rs ' + Number(n || 0).toFixed(2);
const escHtml = s => String(s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;')
  .replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const COLOR_PRESETS = [
  '#007AFF', '#34C759', '#FF9500', '#FF3B30',
  '#AF52DE', '#30B0C7', '#FF2D55', '#5856D6',
  '#8E8E93', '#A2845E', '#1C1C1E', '#FFD60A',
];

// ── Variant Management ─────────────────────────────────────────
let currentVariants = [];

// ── Toast ─────────────────────────────────────────────────────
let toastTimer = null;
const showToast = (msg, ms = 2200) => {
  const t = $('#toast');
  if (!t) return;
  $('#toastMsg').textContent = msg;
  t.classList.remove('hidden');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.add('hidden'), ms);
};

// ── Image cache ───────────────────────────────────────────────
const imgCache = new Map();

const getImageSrc = async (fileName) => {
  if (!fileName) return null;
  if (imgCache.has(fileName)) return imgCache.get(fileName);
  try {
    const src = await window.api.image.getBase64(fileName);
    if (src) {
      imgCache.set(fileName, src);
      return src;
    }
    return null;
  } catch (error) {
    console.error('Error loading image:', fileName, error);
    return null;
  }
};

const clearImageCache = (imageName) => {
  if (imageName && imgCache.has(imageName)) imgCache.delete(imageName);
};

const refreshAllImages = async (products) => {
  const imagePromises = products.filter(p => p && p.image).map(p => getImageSrc(p.image));
  await Promise.all(imagePromises);
};

// ════════════════════════════════════════════════════════════
// VARIANT PICKER MODAL
// ════════════════════════════════════════════════════════════
const showVariantPicker = (product) => {
  const modal = document.createElement('div');
  modal.className = 'modal-overlay-modern';
  modal.innerHTML = `
    <div class="modal-modern" style="max-width: 400px;">
      <div class="modal-header-modern">
        <h2 class="modal-title-modern">Select ${escHtml(product.name)} Size</h2>
        <button class="modal-close-modern" onclick="this.closest('.modal-overlay-modern').remove()">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none"><path d="M18 6L6 18M6 6l12 12" stroke="currentColor" stroke-width="2"/></svg>
        </button>
      </div>
      <div class="modal-body-modern">
        <div class="variant-grid" id="variantGrid"></div>
      </div>
    </div>
  `;
  
  const variantGrid = modal.querySelector('#variantGrid');
  variantGrid.innerHTML = product.variants.map(variant => `
    <button class="variant-option" data-variant='${JSON.stringify(variant)}'>
      <div class="variant-label">${escHtml(variant.size_label)}</div>
      <div class="variant-price">${fmt(variant.price)}</div>
    </button>
  `).join('');
  
  document.body.appendChild(modal);
  
  variantGrid.querySelectorAll('.variant-option').forEach(btn => {
    btn.addEventListener('click', () => {
      const variant = JSON.parse(btn.dataset.variant);
      addToCart(product, variant);
      modal.remove();
    });
  });
  
  modal.addEventListener('click', (e) => {
    if (e.target === modal) modal.remove();
  });
};

// ════════════════════════════════════════════════════════════
// NAVIGATION
// ════════════════════════════════════════════════════════════
const initNav = () => {
  const pageActions = {
    products:   loadProductsTable,
    categories: loadCategoriesPage,
    history:    loadHistory,
    dashboard:  loadDashboard,
    billing:    () => renderProductGrid(),
  };

  $$('.nav-item').forEach(btn => {
    btn.addEventListener('click', () => {
      const page = btn.dataset.page;
      $$('.nav-item').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      $$('.page').forEach(p => p.classList.remove('active'));
      $(`#page-${page}`).classList.add('active');
      if (pageActions[page]) pageActions[page]();
    });
  });

  updateSidebarDate();
  setInterval(updateSidebarDate, 60000);
};

const updateSidebarDate = () => {
  const el = $('#sidebarDate');
  if (el) {
    el.textContent = new Date().toLocaleDateString('en-US', {
      weekday: 'short', month: 'short', day: 'numeric',
    });
  }
};

// ════════════════════════════════════════════════════════════
// CATEGORIES
// ════════════════════════════════════════════════════════════
const refreshCategories = async () => {
  state.categories = await window.api.categories.getAll();
  return state.categories;
};

const getCatById = id => state.categories.find(c => c.id === id) || null;

const loadCategoriesPage = async () => {
  await refreshCategories();
  renderCategoriesGrid();
};

const renderCategoriesGrid = () => {
  const grid = $('#categoriesGrid');
  if (!grid) return;
  
  if (state.categories.length === 0) {
    grid.innerHTML = `<div class="empty-state"><svg width="48" height="48" viewBox="0 0 24 24" fill="none"><path d="M3 7a2 2 0 012-2h3l2 2h9a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V7z" stroke="#A1A1AA" stroke-width="1.5"/></svg><p>No categories yet</p><span>Click "Add Category" to get started</span></div>`;
    return;
  }
  
  const countMap = {};
  state.products.forEach(p => {
    if (p.category_id) countMap[p.category_id] = (countMap[p.category_id] || 0) + 1;
  });
  
  grid.innerHTML = state.categories.map(cat => {
    const count = countMap[cat.id] || 0;
    const color = cat.color || '#007AFF';
    return `
      <div class="category-card" style="--cat-color:${color}">
        <div class="category-card-header">
          <div class="category-card-icon"><svg width="24" height="24" viewBox="0 0 24 24" fill="none"><path d="M3 7a2 2 0 012-2h3l2 2h9a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V7z" stroke="currentColor" stroke-width="1.8"/></svg></div>
          <span class="category-card-name">${escHtml(cat.name)}</span>
          <span class="color-dot" style="background:${color}"></span>
        </div>
        <p class="category-card-desc">${escHtml(cat.description || '—')}</p>
        <div class="category-card-meta">
          <span class="category-card-count">${count} product${count !== 1 ? 's' : ''}</span>
          <div class="category-card-actions">
            <button class="btn-edit-ghost btn-sm" data-cat-edit="${cat.id}">Edit</button>
            <button class="btn-danger-ghost btn-sm" data-cat-del="${cat.id}">Delete</button>
          </div>
        </div>
      </div>`;
  }).join('');

  $$('[data-cat-edit]', grid).forEach(btn => btn.addEventListener('click', () => openEditCategory(Number(btn.dataset.catEdit))));
  $$('[data-cat-del]', grid).forEach(btn => btn.addEventListener('click', () => deleteCategory(Number(btn.dataset.catDel))));
};

// Category Modal Functions
const initCategoryColorPicker = () => {
  const presetsEl = $('#colorPresets');
  const colorInput = $('#catColor');
  if (!presetsEl) return;
  
  presetsEl.innerHTML = COLOR_PRESETS.map(c => `<button class="color-preset-btn" data-color="${c}" style="background:${c}"></button>`).join('');
  $$('.color-preset-btn', presetsEl).forEach(btn => {
    btn.addEventListener('click', () => { colorInput.value = btn.dataset.color; highlightPreset(btn.dataset.color); });
  });
  colorInput.addEventListener('input', () => highlightPreset(colorInput.value));
};

const highlightPreset = hex => { $$('.color-preset-btn').forEach(b => b.classList.toggle('selected', b.dataset.color === hex)); };

const openAddCategory = () => {
  $('#categoryModalTitle').textContent = 'Add Category';
  $('#editCategoryId').value = '';
  $('#catName').value = '';
  $('#catDescription').value = '';
  $('#catColor').value = '#007AFF';
  highlightPreset('#007AFF');
  $('#categoryModal').classList.remove('hidden');
  setTimeout(() => $('#catName').focus(), 50);
};

const openEditCategory = id => {
  const cat = state.categories.find(c => c.id === id);
  if (!cat) return;
  $('#categoryModalTitle').textContent = 'Edit Category';
  $('#editCategoryId').value = cat.id;
  $('#catName').value = cat.name;
  $('#catDescription').value = cat.description || '';
  $('#catColor').value = cat.color || '#007AFF';
  highlightPreset(cat.color || '#007AFF');
  $('#categoryModal').classList.remove('hidden');
  setTimeout(() => $('#catName').focus(), 50);
};

const closeCategoryModal = () => $('#categoryModal').classList.add('hidden');

const saveCategory = async () => {
  const name = $('#catName').value.trim();
  const description = $('#catDescription').value.trim();
  const color = $('#catColor').value || '#007AFF';
  const editId = $('#editCategoryId').value;
  if (!name) return showToast('Category name is required');
  try {
    if (editId) {
      await window.api.categories.update({ id: Number(editId), name, description, color });
      showToast('✓ Category updated');
    } else {
      await window.api.categories.add({ name, description, color });
      showToast('✓ Category added');
    }
    closeCategoryModal();
    await refreshCategories();
    renderCategoriesGrid();
    await refreshProducts();
    buildCategoryTabs();
    renderProductGrid();
    populateCategorySelects();
    refreshProdTableCatFilter();
  } catch (err) {
    showToast('Error saving category');
  }
};

const deleteCategory = async id => {
  const cat = state.categories.find(c => c.id === id);
  if (!cat) return;
  const affectedCount = state.products.filter(p => p.category_id === id).length;
  const warning = affectedCount > 0 ? ` (${affectedCount} product${affectedCount !== 1 ? 's' : ''} will be uncategorised)` : '';
  if (!confirm(`Delete category "${cat.name}"?${warning}`)) return;
  try {
    await window.api.categories.delete(id);
    showToast('✓ Category deleted');
    await refreshCategories();
    renderCategoriesGrid();
    await refreshProducts();
    buildCategoryTabs();
    renderProductGrid();
    populateCategorySelects();
    refreshProdTableCatFilter();
  } catch (err) {
    showToast('Error deleting category');
  }
};

const initCategoryModal = () => {
  const modal = $('#categoryModal');
  if (!modal) return;
  $('#openAddCategory').addEventListener('click', openAddCategory);
  $('#closeCategoryModal').addEventListener('click', closeCategoryModal);
  $('#cancelCategoryModal').addEventListener('click', closeCategoryModal);
  $('#saveCategoryBtn').addEventListener('click', saveCategory);
  modal.addEventListener('click', e => { if (e.target === modal) closeCategoryModal(); });
  ['catName', 'catDescription'].forEach(id => $(`#${id}`).addEventListener('keydown', e => { if (e.key === 'Enter') saveCategory(); }));
  initCategoryColorPicker();
};

// ════════════════════════════════════════════════════════════
// BILLING
// ════════════════════════════════════════════════════════════
const refreshProducts = async () => {
  state.products = await window.api.products.getAll();
  imgCache.clear();
  await refreshAllImages(state.products);
};

const initBilling = async () => {
  await refreshCategories();
  await refreshProducts();
  buildCategoryTabs();
  await renderProductGrid();
};

const buildCategoryTabs = () => {
  const container = $('#categoryTabs');
  if (!container) return;
  container.innerHTML = '';
  const allBtn = document.createElement('button');
  allBtn.className = 'cat-btn' + (state.activeCategoryId === null ? ' active' : '');
  allBtn.textContent = 'All';
  allBtn.addEventListener('click', () => {
    state.activeCategoryId = null;
    $$('.cat-btn').forEach(b => b.classList.remove('active'));
    allBtn.classList.add('active');
    renderProductGrid();
  });
  container.appendChild(allBtn);

  state.categories.forEach(cat => {
    const btn = document.createElement('button');
    btn.className = 'cat-btn' + (state.activeCategoryId === cat.id ? ' active' : '');
    const swatch = document.createElement('span');
    swatch.className = 'cat-swatch';
    swatch.style.background = cat.color || '#007AFF';
    btn.appendChild(swatch);
    btn.appendChild(document.createTextNode(cat.name));
    btn.addEventListener('click', () => {
      state.activeCategoryId = cat.id;
      $$('.cat-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      renderProductGrid();
    });
    container.appendChild(btn);
  });
};

const renderProductGrid = async () => {
  const q = $('#productSearch').value.toLowerCase().trim();
  const grid = $('#productGrid');
  if (!grid) return;

  if (state.products.length === 0) {
    grid.innerHTML = `<div class="empty-state"><svg width="48" height="48" viewBox="0 0 24 24" fill="none"><path d="M20 7H4a1 1 0 00-1 1v10a1 1 0 001 1h16a1 1 0 001-1V8a1 1 0 00-1-1z" stroke="#A1A1AA" stroke-width="1.5"/><path d="M16 7V5a2 2 0 00-2-2h-4a2 2 0 00-2 2v2" stroke="#A1A1AA" stroke-width="1.5"/></svg><p>No products yet</p><span>Go to Products tab to add your first product</span></div>`;
    return;
  }

  let list = state.products;
  if (state.activeCategoryId !== null) list = list.filter(p => p.category_id === state.activeCategoryId);
  if (q) list = list.filter(p => p.name.toLowerCase().includes(q));

  if (list.length === 0) {
    grid.innerHTML = `<div class="empty-state"><p>No results found</p></div>`;
    return;
  }

  grid.innerHTML = list.map(p => {
    const catColor = p.category_color || '#8E8E93';
    const catName = p.category_name || p.category || 'General';
    const stockCls = p.stock <= 0 ? ' out-of-stock' : '';
    const imgSrc = p.image ? imgCache.get(p.image) : null;
    const hasVariants = p.hasVariants && p.variants && p.variants.length > 0;
    const priceDisplay = hasVariants 
      ? `From ${fmt(Math.min(...p.variants.map(v => v.price)))}`
      : fmt(p.price);
    
    const imgHTML = imgSrc
      ? `<div class="product-card-img"><img src="${imgSrc}" alt="${escHtml(p.name)}" loading="lazy" onerror="this.onerror=null; this.parentElement.className='product-card-img product-card-img--empty'; this.parentElement.innerHTML='<svg width=\'28\' height=\'28\' viewBox=\'0 0 24 24\' fill=\'none\'><rect x=\'3\' y=\'3\' width=\'18\' height=\'18\' rx=\'3\' stroke=\'#C7C7CC\' stroke-width=\'1.5\'/><circle cx=\'8.5\' cy=\'8.5\' r=\'1.5\' fill=\'#C7C7CC\'/><path d=\'M3 14l5-5 4 4 3-3 6 6\' stroke=\'#C7C7CC\' stroke-width=\'1.5\' stroke-linecap=\'round\' stroke-linejoin=\'round\'/></svg>';" /></div>`
      : `<div class="product-card-img product-card-img--empty"><svg width="28" height="28" viewBox="0 0 24 24" fill="none"><rect x="3" y="3" width="18" height="18" rx="3" stroke="#C7C7CC" stroke-width="1.5"/><circle cx="8.5" cy="8.5" r="1.5" fill="#C7C7CC"/><path d="M3 14l5-5 4 4 3-3 6 6" stroke="#C7C7CC" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg></div>`;

    return `<div class="product-card" data-id="${p.id}" data-has-variants="${hasVariants}" style="--cat-color:${catColor}">${imgHTML}<div class="product-card-cat">${escHtml(catName)}</div><div class="product-card-name">${escHtml(p.name)}</div><div class="product-card-price">${priceDisplay}</div><div class="product-card-stock${stockCls}">Stock: ${p.stock}</div></div>`;
  }).join('');

  $$('.product-card', grid).forEach(card => {
    card.addEventListener('click', () => {
      const prod = state.products.find(p => p.id === Number(card.dataset.id));
      if (prod) {
        if (prod.hasVariants && prod.variants && prod.variants.length > 0) {
          showVariantPicker(prod);
        } else {
          addToCart(prod);
        }
      }
    });
  });
};

// ── Cart Functions ────────────────────────────────────────────
const addToCart = (product, variant = null) => {
  const itemPrice = variant ? variant.price : product.price;
  const itemName = variant ? `${product.name} (${variant.size_label})` : product.name;
  const variantId = variant ? variant.id : null;
  
  const existing = state.cart.find(i => i.product_id === product.id && i.variant_id === variantId);
  if (existing) {
    existing.qty++;
    existing.total = existing.qty * existing.price;
  } else {
    state.cart.push({ 
      product_id: product.id, 
      variant_id: variantId,
      name: itemName, 
      price: itemPrice, 
      qty: 1, 
      total: itemPrice 
    });
  }
  renderCart();
  showToast(`${itemName} added to cart`);
};

const removeFromCart = (pid, vid = null) => {
  state.cart = state.cart.filter(i => !(i.product_id === pid && i.variant_id === vid));
  renderCart();
};

const updateQty = (pid, vid, delta) => {
  const item = state.cart.find(i => i.product_id === pid && i.variant_id === vid);
  if (!item) return;
  item.qty = Math.max(1, item.qty + delta);
  item.total = item.qty * item.price;
  renderCart();
};

const renderCart = () => {
  const container = $('#cartItems');
  if (!container) return;
  
  if (state.cart.length === 0) {
    container.innerHTML = `<div class="cart-empty"><svg width="48" height="48" viewBox="0 0 24 24" fill="none"><path d="M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4z" stroke="#D4D4D8" stroke-width="1.5"/><line x1="3" y1="6" x2="21" y2="6" stroke="#D4D4D8" stroke-width="1.5"/></svg><span>Cart is empty</span></div>`;
    updateTotals();
    return;
  }

  container.innerHTML = state.cart.map((item, idx) => `
    <div class="cart-item" data-cart-index="${idx}">
      <div class="cart-item-top">
        <span class="cart-item-name">${escHtml(item.name)}</span>
        <button class="cart-item-remove" data-remove-pid="${item.product_id}" data-remove-vid="${item.variant_id || ''}">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none"><path d="M18 6L6 18M6 6l12 12" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
        </button>
      </div>
      <div class="cart-item-bottom">
        <div class="qty-control">
          <button class="qty-btn" data-qty-pid="${item.product_id}" data-qty-vid="${item.variant_id || ''}" data-d="-1">−</button>
          <span class="qty-value">${item.qty}</span>
          <button class="qty-btn" data-qty-pid="${item.product_id}" data-qty-vid="${item.variant_id || ''}" data-d="1">+</button>
        </div>
        <span class="cart-item-price">${fmt(item.total)}</span>
      </div>
    </div>`).join('');

  $$('[data-remove-pid]', container).forEach(btn => {
    btn.addEventListener('click', () => {
      const pid = Number(btn.dataset.removePid);
      const vid = btn.dataset.removeVid ? Number(btn.dataset.removeVid) : null;
      removeFromCart(pid, vid);
    });
  });
  
  $$('[data-qty-pid]', container).forEach(btn => {
    btn.addEventListener('click', () => {
      const pid = Number(btn.dataset.qtyPid);
      const vid = btn.dataset.qtyVid ? Number(btn.dataset.qtyVid) : null;
      const delta = Number(btn.dataset.d);
      updateQty(pid, vid, delta);
    });
  });
  
  updateTotals();
};

const calcTotals = () => {
  const subtotal = state.cart.reduce((s, i) => s + i.total, 0);
  const discountPct = parseFloat($('#discountInput').value) || 0;
  const taxPct = parseFloat($('#taxInput').value) || 0;
  const discountAmt = subtotal * (discountPct / 100);
  const taxAmt = (subtotal - discountAmt) * (taxPct / 100);
  const total = subtotal - discountAmt + taxAmt;
  return { subtotal, discountPct, discountAmt, taxPct, taxAmt, total };
};

const updateTotals = () => {
  const { subtotal, total } = calcTotals();
  $('#subtotalDisplay').textContent = fmt(subtotal);
  $('#grandTotalDisplay').textContent = fmt(total);
};

const initCartControls = () => {
  $('#clearCart').addEventListener('click', () => { state.cart = []; renderCart(); });
  $('#discountInput').addEventListener('input', updateTotals);
  $('#taxInput').addEventListener('input', updateTotals);
  $('#generateInvoiceBtn').addEventListener('click', generateInvoice);
};

// ── Invoice Functions ─────────────────────────────────────────
const generateInvoice = async () => {
  if (state.cart.length === 0) return showToast('Add items to cart first');
  const { subtotal, discountPct, discountAmt, taxPct, taxAmt, total } = calcTotals();
  const customer = $('#customerName').value.trim() || 'Walk-in Customer';
  try {
    const res = await window.api.invoices.create({ customer, items: state.cart, subtotal, discount: discountAmt, tax: taxAmt, total });
    if (!res.success) throw new Error('Failed');
    renderInvoiceModal({ invoice_no: res.invoice_no, customer, items: state.cart, subtotal, discountPct, discountAmt, taxPct, taxAmt, total, created_at: new Date().toISOString() });
    state.cart = []; renderCart(); $('#customerName').value = ''; $('#discountInput').value = '0'; $('#taxInput').value = '0'; updateTotals();
    await refreshProducts(); await renderProductGrid();
    showToast('✓ Invoice generated');
  } catch (err) { showToast('Error generating invoice'); }
};

const renderInvoiceModal = inv => {
  $('#invoiceContent').innerHTML = buildReceiptHTML(inv);
  $('#invoiceModal').classList.remove('hidden');
};

const buildReceiptHTML = inv => {
  const d = new Date(inv.created_at);
  const dateStr = d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
  const timeStr = d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
  const rows = inv.items.map(item => `<tr><td style="padding:8px 0">${escHtml(item.name)}</td><td style="text-align:center">${item.qty}</td><td style="text-align:right">${fmt(item.price)}</td><td style="text-align:right">${fmt(item.total)}</td></tr>`).join('');
  return `<div class="rcpt-store"><div class="rcpt-store-name">Sip Soda</div><div class="rcpt-store-sub">Premium Billing System</div></div><hr class="rcpt-divider"/><div class="rcpt-meta"><div><span>Invoice</span><span><strong>${escHtml(inv.invoice_no)}</strong></span></div><div><span>Customer</span><span>${escHtml(inv.customer)}</span></div><div><span>Date</span><span>${dateStr}</span></div><div><span>Time</span><span>${timeStr}</span></div></div><hr class="rcpt-divider"/><table class="rcpt-table"><thead><tr><th>Item</th><th style="text-align:center">Qty</th><th style="text-align:right">Price</th><th style="text-align:right">Total</th></tr></thead><tbody>${rows}</tbody></table><hr class="rcpt-divider"/><div class="rcpt-totals"><div><span>Subtotal</span><span>${fmt(inv.subtotal)}</span></div>${inv.discountAmt > 0 ? `<div><span>Discount (${inv.discountPct}%)</span><span>-${fmt(inv.discountAmt)}</span></div>` : ''}${inv.taxAmt > 0 ? `<div><span>Tax (${inv.taxPct}%)</span><span>+${fmt(inv.taxAmt)}</span></div>` : ''}</div><div class="rcpt-grand"><span>TOTAL</span><span>${fmt(inv.total)}</span></div><hr class="rcpt-divider"/><div class="rcpt-thanks"><div>Thank you for your purchase!</div><div style="margin-top:4px;font-size:10px">Powered by Sip Soda</div></div>`;
};

const initInvoiceModal = () => {
  const modal = $('#invoiceModal');
  if (!modal) return;
  $('#closeInvoiceModal').addEventListener('click', () => modal.classList.add('hidden'));
  $('#printInvoiceBtn').addEventListener('click', () => window.print());
  modal.addEventListener('click', e => { if (e.target === modal) modal.classList.add('hidden'); });
};

// ════════════════════════════════════════════════════════════
// VARIANT MANAGER FOR PRODUCT MODAL
// ════════════════════════════════════════════════════════════
const renderVariantsList = () => {
  const variantsList = $('#variantsList');
  if (!variantsList) return;
  
  if (currentVariants.length === 0) {
    variantsList.innerHTML = '<div class="empty-variants" style="padding: 1rem; text-align: center; color: var(--text-secondary);">No size options added. Click "Add Size" to get started.</div>';
    return;
  }
  
  variantsList.innerHTML = currentVariants.map((variant, index) => `
    <div class="variant-item" data-index="${index}">
      <select class="variant-type" data-field="size_label" data-index="${index}">
        <option value="1 Scoop" ${variant.size_label === '1 Scoop' ? 'selected' : ''}>1 Scoop</option>
        <option value="2 Scoops" ${variant.size_label === '2 Scoops' ? 'selected' : ''}>2 Scoops</option>
        <option value="Small" ${variant.size_label === 'Small' ? 'selected' : ''}>Small</option>
        <option value="Medium" ${variant.size_label === 'Medium' ? 'selected' : ''}>Medium</option>
        <option value="Large" ${variant.size_label === 'Large' ? 'selected' : ''}>Large</option>
        <option value="Half Ltr" ${variant.size_label === 'Half Ltr' ? 'selected' : ''}>Half Ltr</option>
        <option value="Ltr" ${variant.size_label === 'Ltr' ? 'selected' : ''}>Ltr</option>
      </select>
      <input type="number" class="variant-price-input" data-field="price" data-index="${index}" value="${variant.price}" placeholder="Price" step="0.01" min="0" />
      <button class="remove-variant-btn" data-index="${index}">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
          <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" stroke-width="2"/>
        </svg>
      </button>
    </div>
  `).join('');
  
  // Add event listeners
  variantsList.querySelectorAll('.variant-type').forEach((select) => {
    select.addEventListener('change', (e) => {
      const idx = parseInt(select.dataset.index);
      currentVariants[idx].size_label = e.target.value;
      // Update size_type and size_value based on selection
      const label = e.target.value;
      if (label.includes('Scoop')) {
        currentVariants[idx].size_type = 'scoop';
        currentVariants[idx].size_value = label === '1 Scoop' ? '1' : '2';
      } else if (['Small', 'Medium', 'Large'].includes(label)) {
        currentVariants[idx].size_type = 'size';
        currentVariants[idx].size_value = label.toLowerCase();
      } else if (['Half Ltr', 'Ltr'].includes(label)) {
        currentVariants[idx].size_type = 'container';
        currentVariants[idx].size_value = label === 'Half Ltr' ? 'half_ltr' : 'ltr';
      }
    });
  });
  
  variantsList.querySelectorAll('.variant-price-input').forEach((input) => {
    input.addEventListener('change', (e) => {
      const idx = parseInt(input.dataset.index);
      currentVariants[idx].price = parseFloat(e.target.value) || 0;
    });
  });
  
  variantsList.querySelectorAll('.remove-variant-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const index = parseInt(btn.dataset.index);
      currentVariants.splice(index, 1);
      renderVariantsList();
    });
  });
};

const loadPreset = (preset) => {
  switch(preset) {
    case 'scoop':
      currentVariants = [
        { size_type: 'scoop', size_value: '1', size_label: '1 Scoop', price: 0 },
        { size_type: 'scoop', size_value: '2', size_label: '2 Scoops', price: 0 }
      ];
      break;
    case 'size':
      currentVariants = [
        { size_type: 'size', size_value: 'small', size_label: 'Small', price: 0 },
        { size_type: 'size', size_value: 'medium', size_label: 'Medium', price: 0 },
        { size_type: 'size', size_value: 'large', size_label: 'Large', price: 0 }
      ];
      break;
    case 'container':
      currentVariants = [
        { size_type: 'container', size_value: 'half_ltr', size_label: 'Half Ltr', price: 0 },
        { size_type: 'container', size_value: 'ltr', size_label: 'Ltr', price: 0 }
      ];
      break;
  }
  renderVariantsList();
  $('#hasVariants').checked = true;
  $('#variantManager').classList.remove('hidden');
};

const initVariantManager = () => {
  const hasVariantsCheckbox = $('#hasVariants');
  const variantManager = $('#variantManager');
  const addVariantBtn = $('#addVariantBtn');
  
  if (!hasVariantsCheckbox) return;
  
  hasVariantsCheckbox.addEventListener('change', (e) => {
    if (e.target.checked) {
      variantManager.classList.remove('hidden');
      if (currentVariants.length === 0) {
        loadPreset('size');
      }
    } else {
      variantManager.classList.add('hidden');
      currentVariants = [];
    }
  });
  
  addVariantBtn?.addEventListener('click', () => {
    currentVariants.push({
      size_type: 'size',
      size_value: 'custom',
      size_label: 'New Size',
      price: 0
    });
    renderVariantsList();
  });
  
  // Preset buttons
  $$('.preset-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const preset = btn.dataset.preset;
      loadPreset(preset);
    });
  });
};

// ════════════════════════════════════════════════════════════
// PRODUCTS PAGE
// ════════════════════════════════════════════════════════════
let allProductsCache = [];

const populateCategorySelects = () => {
  const sel = $('#prodCategorySelect');
  if (!sel) return;
  const current = sel.value;
  sel.innerHTML = '<option value="">No category</option>';
  state.categories.forEach(cat => { const opt = document.createElement('option'); opt.value = cat.id; opt.textContent = cat.name; if (String(cat.id) === current) opt.selected = true; sel.appendChild(opt); });
};

const refreshProdTableCatFilter = () => {
  const sel = $('#prodTableCatFilter');
  if (!sel) return;
  const current = sel.value;
  sel.innerHTML = '<option value="">All Categories</option>';
  state.categories.forEach(cat => { const opt = document.createElement('option'); opt.value = cat.id; opt.textContent = cat.name; if (String(cat.id) === current) opt.selected = true; sel.appendChild(opt); });
};

const loadProductsTable = async () => {
  await refreshCategories();
  populateCategorySelects();
  refreshProdTableCatFilter();
  allProductsCache = await window.api.products.getAll();
  imgCache.clear();
  await refreshAllImages(allProductsCache);
  renderProductsTable(allProductsCache);
};

const getFilteredProducts = () => {
  const q = $('#prodTableSearch').value.toLowerCase();
  const catId = $('#prodTableCatFilter').value;
  return allProductsCache.filter(p => {
    const matchQ = !q || p.name.toLowerCase().includes(q) || (p.category || '').toLowerCase().includes(q);
    const matchCat = !catId || String(p.category_id) === catId;
    return matchQ && matchCat;
  });
};

const renderProductsTable = products => {
  const tbody = $('#productsTableBody');
  if (!tbody) return;
  
  if (products.length === 0) { 
    tbody.innerHTML = `<tr><td colspan="7" class="table-loading">No products found</td></tr>`; 
    return; 
  }
  
  tbody.innerHTML = products.map((p, i) => {
    const catColor = p.category_color || '#8E8E93';
    const catName = p.category_name || p.category || 'General';
    const imgSrc = p.image ? imgCache.get(p.image) : null;
    const hasVariants = p.hasVariants && p.variants && p.variants.length > 0;
    const priceDisplay = hasVariants 
      ? `From ${fmt(Math.min(...p.variants.map(v => v.price)))}`
      : fmt(p.price);
    const variantBadge = hasVariants ? '<span class="badge-variant" style="font-size:10px; margin-left:6px;">📏 Sizes</span>' : '';
    const imgCell = imgSrc ? `<img src="${imgSrc}" class="table-product-img" alt="${escHtml(p.name)}" onerror="this.onerror=null; this.parentElement.innerHTML='<div class=\'table-product-img table-product-img--empty\'><svg width=\'16\' height=\'16\' viewBox=\'0 0 24 24\' fill=\'none\'><rect x=\'3\' y=\'3\' width=\'18\' height=\'18\' rx=\'3\' stroke=\'#C7C7CC\' stroke-width=\'1.5\'/><circle cx=\'8.5\' cy=\'8.5\' r=\'1.5\' fill=\'#C7C7CC\'/><path d=\'M3 14l5-5 4 4 3-3 6 6\' stroke=\'#C7C7CC\' stroke-width=\'1.5\' stroke-linecap=\'round\' stroke-linejoin=\'round\'/></svg></div>';" />` : `<div class="table-product-img table-product-img--empty"><svg width="16" height="16" viewBox="0 0 24 24" fill="none"><rect x="3" y="3" width="18" height="18" rx="3" stroke="#C7C7CC" stroke-width="1.5"/><circle cx="8.5" cy="8.5" r="1.5" fill="#C7C7CC"/><path d="M3 14l5-5 4 4 3-3 6 6" stroke="#C7C7CC" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg></div>`;
    
    return `eures
      <td style="width:60px">${imgCell}</td>
      <td style="color:var(--label3);font-size:12px">${i + 1}</td>
      <td><strong>${escHtml(p.name)}</strong>${variantBadge}</td>
      <td><span class="badge-cat" style="background:color-mix(in srgb,${catColor} 15%,white);color:${catColor}"><span class="cat-dot" style="background:${catColor}"></span>${escHtml(catName)}</span></td>
      <td><strong>${priceDisplay}</strong></td>
      <td><span class="badge ${p.stock > 0 ? 'badge-green' : 'badge-zinc'}">${p.stock}</span></td>
      <td><button class="btn-edit-ghost" data-edit="${p.id}">Edit</button><button class="btn-danger-ghost" data-del="${p.id}">Delete</button></td>
    </tr>`;
  }).join('');
  
  $$('[data-edit]', tbody).forEach(btn => btn.addEventListener('click', () => openEditProduct(Number(btn.dataset.edit))));
  $$('[data-del]', tbody).forEach(btn => btn.addEventListener('click', () => deleteProduct(Number(btn.dataset.del))));
};
const initProductSearch = () => {
  $('#prodTableSearch').addEventListener('input', () => renderProductsTable(getFilteredProducts()));
  $('#prodTableCatFilter').addEventListener('change', () => renderProductsTable(getFilteredProducts()));
};

// ── Product Modal Image Functions ──────────────────────────────
const updateModalImagePreview = (src) => {
  const preview = $('#prodImagePreview');
  const removeBtn = $('#removeImageBtn');
  if (!preview) return;
  if (src) {
    preview.innerHTML = `<img src="${src}" alt="Product image" style="width:100%;height:100%;object-fit:cover;" />`;
    preview.classList.add('has-image');
    if (removeBtn) removeBtn.classList.remove('hidden');
  } else {
    preview.innerHTML = `<svg width="32" height="32" viewBox="0 0 24 24" fill="none"><rect x="3" y="3" width="18" height="18" rx="3" stroke="#C7C7CC" stroke-width="1.5"/><circle cx="8.5" cy="8.5" r="1.5" fill="#C7C7CC"/><path d="M3 14l5-5 4 4 3-3 6 6" stroke="#C7C7CC" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg><span>Click to add photo</span>`;
    preview.classList.remove('has-image');
    if (removeBtn) removeBtn.classList.add('hidden');
  }
};

const initProductImagePicker = () => {
  const preview = $('#prodImagePreview');
  const removeBtn = $('#removeImageBtn');
  if (!preview) return;
  preview.addEventListener('click', async (e) => {
    e.preventDefault(); e.stopPropagation();
    try {
      const fileName = await window.api.image.pick();
      if (!fileName) return;
      if (state.pendingImageFile) await window.api.image.delete(state.pendingImageFile);
      state.pendingImageFile = fileName;
      state.currentImageFile = fileName;
      clearImageCache(fileName);
      const src = await getImageSrc(fileName);
      updateModalImagePreview(src);
      showToast('Image loaded successfully');
    } catch (error) { showToast('Error loading image'); }
  });
  if (removeBtn) {
    removeBtn.addEventListener('click', async (e) => {
      e.preventDefault(); e.stopPropagation();
      if (state.pendingImageFile) { await window.api.image.delete(state.pendingImageFile); state.pendingImageFile = null; }
      else if (state.currentImageFile) state.oldImageFile = state.currentImageFile;
      state.currentImageFile = null;
      updateModalImagePreview(null);
      showToast('Image removed');
    });
  }
};

// ── Product Modal ─────────────────────────────────────────────
const openAddProduct = () => {
  $('#productModalTitle').textContent = 'Add Product';
  $('#editProductId').value = '';
  $('#prodName').value = '';
  $('#prodPrice').value = '';
  $('#prodStock').value = '';
  $('#prodCategorySelect').value = '';
  currentVariants = [];
  $('#hasVariants').checked = false;
  $('#variantManager').classList.add('hidden');
  if (state.pendingImageFile) window.api.image.delete(state.pendingImageFile);
  state.pendingImageFile = null; state.oldImageFile = null; state.currentImageFile = null;
  updateModalImagePreview(null);
  $('#productModal').classList.remove('hidden');
  setTimeout(() => $('#prodName').focus(), 50);
};

const openEditProduct = async id => {
  const p = allProductsCache.find(x => x.id === id);
  if (!p) return;
  $('#productModalTitle').textContent = 'Edit Product';
  $('#editProductId').value = p.id;
  $('#prodName').value = p.name;
  $('#prodPrice').value = p.price;
  $('#prodStock').value = p.stock;
  $('#prodCategorySelect').value = p.category_id || '';
  
  // Load variants if any
  currentVariants = p.variants || [];
  if (currentVariants.length > 0) {
    $('#hasVariants').checked = true;
    $('#variantManager').classList.remove('hidden');
    renderVariantsList();
  } else {
    $('#hasVariants').checked = false;
    $('#variantManager').classList.add('hidden');
  }
  
  if (state.pendingImageFile) { window.api.image.delete(state.pendingImageFile); state.pendingImageFile = null; }
  state.oldImageFile = null;
  state.currentImageFile = p.image || null;
  if (p.image) { const src = await getImageSrc(p.image); updateModalImagePreview(src); }
  else updateModalImagePreview(null);
  $('#productModal').classList.remove('hidden');
  setTimeout(() => $('#prodName').focus(), 50);
};

const closeProductModal = async () => {
  if (state.pendingImageFile) { await window.api.image.delete(state.pendingImageFile); state.pendingImageFile = null; }
  state.oldImageFile = null; state.currentImageFile = null;
  currentVariants = [];
  $('#hasVariants').checked = false;
  $('#variantManager').classList.add('hidden');
  $('#productModal').classList.add('hidden');
};

const saveProduct = async () => {
  const name = $('#prodName').value.trim();
  const price = parseFloat($('#prodPrice').value);
  const stock = parseInt($('#prodStock').value, 10) || 0;
  const editId = $('#editProductId').value;
  const catSelVal = $('#prodCategorySelect').value;
  const category_id = catSelVal ? Number(catSelVal) : null;
  const catObj = category_id ? getCatById(category_id) : null;
  const category = catObj ? catObj.name : 'General';
  const hasVariants = $('#hasVariants').checked;
  
  if (!name) return showToast('Product name is required');
  if (!hasVariants && (isNaN(price) || price < 0)) return showToast('Enter a valid price');
  if (hasVariants && currentVariants.length === 0) return showToast('Add at least one size option');
  if (hasVariants) {
    const invalidVariants = currentVariants.filter(v => v.price <= 0);
    if (invalidVariants.length > 0) return showToast('All size options must have a valid price');
  }
  
  const imageToSave = state.currentImageFile || null;
  
  try {
    const productData = {
      name, price, stock, category, category_id, image: imageToSave,
      hasVariants,
      variants: hasVariants ? currentVariants : []
    };
    
    if (editId) {
      if (state.oldImageFile && state.oldImageFile !== imageToSave) { 
        await window.api.image.delete(state.oldImageFile); 
        clearImageCache(state.oldImageFile); 
      }
      await window.api.products.update({ id: Number(editId), ...productData });
      showToast('✓ Product updated');
    } else {
      await window.api.products.add(productData);
      showToast('✓ Product added');
    }
    
    state.pendingImageFile = null; 
    state.oldImageFile = null; 
    state.currentImageFile = null;
    currentVariants = [];
    $('#hasVariants').checked = false;
    $('#variantManager').classList.add('hidden');
    $('#productModal').classList.add('hidden');
    await loadProductsTable(); 
    await refreshProducts(); 
    buildCategoryTabs(); 
    await renderProductGrid();
    
  } catch (err) { 
    console.error(err);
    showToast('Error saving product'); 
  }
};

const deleteProduct = async id => {
  const p = allProductsCache.find(x => x.id === id);
  if (!p || !confirm(`Delete "${p.name}"?`)) return;
  try {
    await window.api.products.delete(id);
    if (p.image) clearImageCache(p.image);
    showToast('✓ Product deleted');
    await loadProductsTable(); await refreshProducts(); buildCategoryTabs(); await renderProductGrid();
  } catch (err) { showToast('Error deleting product'); }
};

const initProductModal = () => {
  const modal = $('#productModal');
  if (!modal) return;
  $('#openAddProduct').addEventListener('click', openAddProduct);
  $('#closeProductModal').addEventListener('click', closeProductModal);
  $('#cancelProductModal').addEventListener('click', closeProductModal);
  $('#saveProductBtn').addEventListener('click', saveProduct);
  modal.addEventListener('click', e => { if (e.target === modal) closeProductModal(); });
  ['prodName', 'prodPrice', 'prodStock'].forEach(id => $(`#${id}`).addEventListener('keydown', e => { if (e.key === 'Enter') saveProduct(); }));
  initProductImagePicker();
  initVariantManager();
};

// ════════════════════════════════════════════════════════════
// HISTORY PAGE WITH CLEAR HISTORY FEATURE
// ════════════════════════════════════════════════════════════
const loadHistory = async () => {
  const tbody = $('#historyTableBody');
  if (!tbody) return;
  tbody.innerHTML = '<tr><td colspan="6" class="table-loading">Loading…</td></tr>';
  const invoices = await window.api.invoices.getAll({ period: state.historyPeriod });
  if (invoices.length === 0) { tbody.innerHTML = '<tr><td colspan="6" class="table-loading">No invoices found</td></tr>'; return; }
  tbody.innerHTML = invoices.map(inv => {
    const d = new Date(inv.created_at);
    const ds = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    const ts = d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
    return `<tr><td><span class="badge badge-zinc">${escHtml(inv.invoice_no)}</span></td><td>${escHtml(inv.customer || 'Walk-in Customer')}</td><td><span class="badge badge-zinc">${inv.item_count} item${inv.item_count !== 1 ? 's' : ''}</span></td><td><strong>${fmt(inv.total)}</strong></td><td style="color:var(--label3);font-size:12.5px">${ds} ${ts}</td><td><button class="btn-edit-ghost" data-reprint="${inv.id}">View</button></td></tr>`;
  }).join('');
  $$('[data-reprint]', tbody).forEach(btn => btn.addEventListener('click', () => reprintInvoice(Number(btn.dataset.reprint))));
};

const reprintInvoice = async id => {
  const inv = await window.api.invoices.getById(id);
  if (!inv) return showToast('Invoice not found');
  const base = inv.subtotal - inv.discount;
  $('#invoiceContent').innerHTML = buildReceiptHTML({
    invoice_no: inv.invoice_no, customer: inv.customer, items: inv.items, subtotal: inv.subtotal,
    discountPct: inv.subtotal > 0 ? ((inv.discount / inv.subtotal) * 100).toFixed(1) : 0,
    discountAmt: inv.discount, taxPct: base > 0 ? ((inv.tax / base) * 100).toFixed(1) : 0,
    taxAmt: inv.tax, total: inv.total, created_at: inv.created_at,
  });
  $('#invoiceModal').classList.remove('hidden');
};

// ── CLEAR HISTORY FEATURE ─────────────────────────────────────
let clearHistoryModal = null;

const showClearHistoryModal = () => {
  if (!clearHistoryModal) {
    clearHistoryModal = $('#clearHistoryModal');
    if (!clearHistoryModal) return;
    
    $('#closeClearHistoryModal')?.addEventListener('click', closeClearHistoryModal);
    $('#cancelClearHistoryModal')?.addEventListener('click', closeClearHistoryModal);
    $('#clearAllBtn')?.addEventListener('click', confirmClearAll);
    $('#applyDateRangeBtn')?.addEventListener('click', clearByDateRange);
    
    $$('[data-days]').forEach(btn => {
      btn.addEventListener('click', () => clearOlderThan(parseInt(btn.dataset.days)));
    });
  }
  clearHistoryModal.classList.remove('hidden');
};

const closeClearHistoryModal = () => {
  if (clearHistoryModal) clearHistoryModal.classList.add('hidden');
};

const confirmClearAll = async () => {
  const confirmed = confirm('⚠️ WARNING: This will delete ALL invoice history permanently!\n\nThis action cannot be undone.\n\nAre you sure you want to continue?');
  if (!confirmed) return;
  try {
    showToast('Clearing all history...');
    const result = await window.api.invoices.clearAll();
    if (result.success) {
      showToast(`✓ Cleared ${result.count} invoices`);
      closeClearHistoryModal();
      await loadHistory();
      await loadDashboard();
    } else showToast('Error clearing history');
  } catch (error) { showToast('Error clearing history'); }
};

const clearOlderThan = async (days) => {
  const confirmed = confirm(`⚠️ Delete all invoices older than ${days} days?\n\nThis action cannot be undone.`);
  if (!confirmed) return;
  try {
    showToast(`Clearing invoices older than ${days} days...`);
    const result = await window.api.invoices.clearOlderThan(days);
    if (result.success) {
      showToast(`✓ Cleared ${result.count} invoices`);
      closeClearHistoryModal();
      await loadHistory();
      await loadDashboard();
    } else showToast('Error clearing history');
  } catch (error) { showToast('Error clearing history'); }
};

const clearByDateRange = async () => {
  const startDate = $('#startDate').value;
  const endDate = $('#endDate').value;
  if (!startDate || !endDate) return showToast('Please select both start and end dates');
  if (startDate > endDate) return showToast('Start date must be before end date');
  const confirmed = confirm(`⚠️ Delete invoices from ${startDate} to ${endDate}?\n\nThis action cannot be undone.`);
  if (!confirmed) return;
  try {
    showToast('Clearing invoices by date range...');
    const result = await window.api.invoices.clearByDate(startDate, endDate);
    if (result.success) {
      showToast(`✓ Cleared ${result.count} invoices`);
      closeClearHistoryModal();
      await loadHistory();
      await loadDashboard();
    } else showToast('Error clearing history');
  } catch (error) { showToast('Error clearing history'); }
};

const initHistoryFilter = () => {
  $$('#historyFilter .tab-modern').forEach(btn => {
    btn.addEventListener('click', () => {
      $$('#historyFilter .tab-modern').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      state.historyPeriod = btn.dataset.period;
      loadHistory();
    });
  });
  $('#clearHistoryBtn')?.addEventListener('click', showClearHistoryModal);
};

// ════════════════════════════════════════════════════════════
// DASHBOARD
// ════════════════════════════════════════════════════════════
const loadDashboard = async () => {
  const summary = await window.api.invoices.getSummary();
  $('#statTodayRev').textContent = fmt(summary.today.revenue);
  $('#statMonthRev').textContent = fmt(summary.month.revenue);
  $('#statTodayCount').textContent = summary.today.count;
  $('#statProducts').textContent = summary.totalProducts;

  const recent = await window.api.invoices.getAll({});
  const tbody = $('#dashRecentInvoices');
  if (!tbody) return;
  if (recent.length === 0) { tbody.innerHTML = '<tr><td colspan="4" class="table-loading">No invoices yet</td></tr>'; return; }
  tbody.innerHTML = recent.slice(0, 8).map(inv => {
    const d = new Date(inv.created_at);
    const ds = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    const ts = d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
    return `<tr><td><span class="badge badge-zinc">${escHtml(inv.invoice_no)}</span></td><td>${escHtml(inv.customer || 'Walk-in Customer')}</td><td><strong>${fmt(inv.total)}</strong></td><td style="color:var(--label3);font-size:12.5px">${ds} ${ts}</td></tr>`;
  }).join('');
};

// ════════════════════════════════════════════════════════════
// INIT
// ════════════════════════════════════════════════════════════
document.addEventListener('DOMContentLoaded', async () => {
  console.log('🚀 BillPro Premium Initializing...');
  if (!window.api) { console.error('❌ API not available!'); showToast('Error: API not available'); return; }
  initNav();
  await initBilling();
  populateCategorySelects();
  $('#productSearch').addEventListener('input', () => renderProductGrid());
  initCartControls();
  initProductModal();
  initProductSearch();
  initInvoiceModal();
  initHistoryFilter();
  initCategoryModal();
  await loadDashboard();
  console.log('✅ BillPro Premium Ready!');
});