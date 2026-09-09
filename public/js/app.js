(() => {
  const CART_KEY = 'oldphonestore_cart';
  const THEME_KEY = 'oldphonestore_theme';

  const els = {
    grid: document.getElementById('phone-grid'),
    empty: document.getElementById('empty-state'),
    stats: document.getElementById('inventory-stats'),
    form: document.getElementById('filter-form'),
    search: document.getElementById('search-input'),
    category: document.getElementById('category-filter'),
    condition: document.getElementById('condition-filter'),
    available: document.getElementById('available-filter'),
    resetFilters: document.getElementById('reset-filters'),
    themeToggle: document.getElementById('theme-toggle'),
    cartOpen: document.getElementById('cart-open'),
    cartClose: document.getElementById('cart-close'),
    cartDrawer: document.getElementById('cart-drawer'),
    cartItems: document.getElementById('cart-items'),
    cartEmpty: document.getElementById('cart-empty'),
    cartCount: document.getElementById('cart-count'),
    cartTotal: document.getElementById('cart-total'),
    checkoutBtn: document.getElementById('checkout-btn'),
    clearCart: document.getElementById('clear-cart'),
    checkoutName: document.getElementById('checkout-name'),
    checkoutEmail: document.getElementById('checkout-email'),
    toast: document.getElementById('toast'),
    apiStatus: document.getElementById('api-status'),
    detailDialog: document.getElementById('detail-dialog'),
    detailBody: document.getElementById('detail-body')
  };

  let phonesCache = [];
  let cart = loadCart();

  function loadCart() {
    try {
      return JSON.parse(localStorage.getItem(CART_KEY)) || [];
    } catch {
      return [];
    }
  }

  function saveCart() {
    localStorage.setItem(CART_KEY, JSON.stringify(cart));
    renderCart();
  }

  function escapeHtml(value) {
    return String(value)
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#39;');
  }

  function formatPrice(n) {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD'
    }).format(Number(n));
  }

  function stars(rating) {
    const filled = '★'.repeat(Number(rating) || 0);
    const empty = '☆'.repeat(5 - (Number(rating) || 0));
    return filled + empty;
  }

  function toast(message) {
    els.toast.textContent = message;
    els.toast.classList.add('show');
    clearTimeout(toast._t);
    toast._t = setTimeout(() => els.toast.classList.remove('show'), 2600);
  }

  async function api(path, options) {
    const res = await fetch(path, {
      headers: { 'Content-Type': 'application/json' },
      ...options
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(data.error || `Request failed (${res.status})`);
    }
    return data;
  }

  function applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    els.themeToggle.textContent = theme === 'light' ? 'Dark' : 'Light';
    els.themeToggle.setAttribute('aria-pressed', theme === 'dark' ? 'true' : 'false');
    localStorage.setItem(THEME_KEY, theme);
  }

  function initTheme() {
    const saved = localStorage.getItem(THEME_KEY);
    if (saved === 'light' || saved === 'dark') {
      applyTheme(saved);
      return;
    }
    applyTheme('dark');
  }

  function fillSelect(select, values, allLabel) {
    const current = select.value;
    select.innerHTML = '';
    const all = document.createElement('option');
    all.value = 'All';
    all.textContent = allLabel;
    select.appendChild(all);
    for (const value of values) {
      const opt = document.createElement('option');
      opt.value = value;
      opt.textContent = value;
      select.appendChild(opt);
    }
    if ([...select.options].some((o) => o.value === current)) {
      select.value = current;
    }
  }

  function phoneCard(phone, index) {
    const title = escapeHtml(phone.title);
    const sold = !phone.available;
    const article = document.createElement('article');
    article.className = `phone-card${sold ? ' sold' : ''}`;
    article.style.animationDelay = `${Math.min(index * 0.04, 0.4)}s`;
    article.innerHTML = `
      <div class="phone-media">
        <img src="${escapeHtml(phone.img)}" alt="${title}" loading="lazy" width="400" height="520">
      </div>
      <div class="phone-meta">
        <div class="phone-row">
          <span class="badge ${sold ? 'sold' : ''}">${sold ? 'Sold' : escapeHtml(phone.condition)}</span>
          <span class="rating" aria-label="Rating ${phone.rating} of 5">${stars(phone.rating)}</span>
        </div>
        <h3 class="phone-title">${title}</h3>
        <p class="phone-specs">${escapeHtml(phone.storage)} · ${escapeHtml(phone.color)} · ${phone.battery_health}% battery</p>
        <div class="phone-row">
          <span class="price">${formatPrice(phone.price)}</span>
          <span class="muted">${phone.year}</span>
        </div>
      </div>
      <div class="phone-actions">
        <button type="button" class="btn ghost" data-action="detail" data-id="${phone.id}">Details</button>
        <button type="button" class="btn primary" data-action="add" data-id="${phone.id}" ${sold ? 'disabled' : ''}>
          ${sold ? 'Sold out' : 'Add'}
        </button>
      </div>
    `;
    return article;
  }

  function renderPhones(phones) {
    phonesCache = phones;
    els.grid.innerHTML = '';
    if (!phones.length) {
      els.empty.classList.remove('hidden');
      return;
    }
    els.empty.classList.add('hidden');
    const frag = document.createDocumentFragment();
    phones.forEach((phone, i) => frag.appendChild(phoneCard(phone, i)));
    els.grid.appendChild(frag);
  }

  function highlightMatches(term) {
    if (!term) return;
    const needle = term.toLowerCase();
    [...els.grid.children].forEach((card) => {
      const title = card.querySelector('.phone-title')?.textContent.toLowerCase() || '';
      const specs = card.querySelector('.phone-specs')?.textContent.toLowerCase() || '';
      if (title.includes(needle) || specs.includes(needle)) {
        card.style.outline = '1px solid color-mix(in srgb, var(--accent) 55%, transparent)';
      }
    });
  }

  async function loadMeta() {
    const meta = await api('/api/phones/meta');
    fillSelect(els.category, meta.categories, 'All brands');
    fillSelect(els.condition, meta.conditions, 'Any');
    // Also allow filtering sold-out via category sentinel used by API
    const soldOpt = document.createElement('option');
    soldOpt.value = 'unavailable';
    soldOpt.textContent = 'Sold / unavailable';
    els.category.appendChild(soldOpt);

    const { total, in_stock, min_price, max_price } = meta.stats;
    els.stats.textContent = `${in_stock} in stock · ${total} listed · ${formatPrice(min_price)}–${formatPrice(max_price)}`;
  }

  async function loadPhones() {
    const params = new URLSearchParams();
    const q = els.search.value.trim();
    const category = els.category.value;
    const condition = els.condition.value;
    const available = els.available.value;

    if (q) params.set('q', q);
    if (category && category !== 'All') params.set('category', category);
    if (condition && condition !== 'All') params.set('condition', condition);
    if (available !== '') params.set('available', available);

    const data = await api(`/api/phones?${params.toString()}`);
    renderPhones(data.phones);
    highlightMatches(q);
  }

  function findPhone(id) {
    return phonesCache.find((p) => p.id === Number(id));
  }

  function addToCart(id) {
    const phone = findPhone(id);
    if (!phone) return;
    if (!phone.available) {
      toast('That phone is already sold.');
      return;
    }
    if (cart.some((item) => item.phone_id === phone.id)) {
      toast('Already in your cart.');
      return;
    }
    cart.push({
      phone_id: phone.id,
      title: phone.title,
      price: phone.price,
      img: phone.img,
      storage: phone.storage,
      condition: phone.condition,
      quantity: 1
    });
    saveCart();
    toast(`Added ${phone.title}`);
  }

  function removeFromCart(phoneId) {
    cart = cart.filter((item) => item.phone_id !== Number(phoneId));
    saveCart();
  }

  function renderCart() {
    const totalQty = cart.reduce((sum, item) => sum + item.quantity, 0);
    const totalPrice = cart.reduce((sum, item) => sum + item.price * item.quantity, 0);
    els.cartCount.textContent = String(totalQty);
    els.cartTotal.textContent = formatPrice(totalPrice);
    els.checkoutBtn.disabled = cart.length === 0;

    els.cartItems.innerHTML = '';
    if (!cart.length) {
      els.cartEmpty.classList.remove('hidden');
      return;
    }
    els.cartEmpty.classList.add('hidden');

    for (const item of cart) {
      const li = document.createElement('li');
      li.className = 'cart-item';
      li.innerHTML = `
        <img src="${escapeHtml(item.img)}" alt="">
        <div>
          <p class="cart-item-title">${escapeHtml(item.title)}</p>
          <p class="cart-item-meta">${escapeHtml(item.storage)} · ${escapeHtml(item.condition)}</p>
          <p class="cart-item-meta">${formatPrice(item.price)}</p>
        </div>
        <button type="button" class="btn ghost" data-remove="${item.phone_id}" aria-label="Remove">✕</button>
      `;
      els.cartItems.appendChild(li);
    }
  }

  function openCart() {
    els.cartDrawer.classList.add('open');
    els.cartDrawer.setAttribute('aria-hidden', 'false');
    els.cartOpen.setAttribute('aria-expanded', 'true');
  }

  function closeCart() {
    els.cartDrawer.classList.remove('open');
    els.cartDrawer.setAttribute('aria-hidden', 'true');
    els.cartOpen.setAttribute('aria-expanded', 'false');
  }

  function showDetail(id) {
    const phone = findPhone(id);
    if (!phone) return;
    els.detailBody.innerHTML = `
      <div class="detail-layout">
        <img src="${escapeHtml(phone.img)}" alt="${escapeHtml(phone.title)}">
        <div>
          <h3>${escapeHtml(phone.title)}</h3>
          <p class="price">${formatPrice(phone.price)}</p>
          <p><span class="badge ${phone.available ? '' : 'sold'}">${phone.available ? escapeHtml(phone.condition) : 'Sold'}</span></p>
          <p class="muted">${escapeHtml(phone.storage)} · ${escapeHtml(phone.color)} · ${phone.year}</p>
          <p>Battery health: <strong>${phone.battery_health}%</strong></p>
          <p>IMEI: ${escapeHtml(phone.imei_masked || '—')}</p>
          <p class="rating">${stars(phone.rating)}</p>
          <p>${escapeHtml(phone.description || '')}</p>
          <button type="button" class="btn primary" data-action="add" data-id="${phone.id}" ${phone.available ? '' : 'disabled'}>
            ${phone.available ? 'Add to cart' : 'Sold out'}
          </button>
        </div>
      </div>
    `;
    els.detailDialog.showModal();
  }

  async function checkout() {
    if (!cart.length) return;
    try {
      els.checkoutBtn.disabled = true;
      const result = await api('/api/orders', {
        method: 'POST',
        body: JSON.stringify({
          customer_name: els.checkoutName.value.trim() || undefined,
          customer_email: els.checkoutEmail.value.trim() || undefined,
          items: cart.map((item) => ({
            phone_id: item.phone_id,
            quantity: item.quantity
          }))
        })
      });
      cart = [];
      saveCart();
      closeCart();
      toast(`Order #${result.order_id} placed · ${formatPrice(result.total)}`);
      await loadMeta();
      await loadPhones();
    } catch (err) {
      toast(err.message);
      els.checkoutBtn.disabled = cart.length === 0;
    }
  }

  async function checkHealth() {
    try {
      const health = await api('/api/health');
      els.apiStatus.textContent = `ok · ${health.phones} phones in SQLite`;
    } catch {
      els.apiStatus.textContent = 'unreachable — start the server with npm start';
    }
  }

  // Events
  els.themeToggle.addEventListener('click', () => {
    const next = document.documentElement.getAttribute('data-theme') === 'light' ? 'dark' : 'light';
    applyTheme(next);
  });

  els.form.addEventListener('submit', (e) => {
    e.preventDefault();
    loadPhones().catch((err) => toast(err.message));
  });

  els.resetFilters.addEventListener('click', () => {
    els.form.reset();
    loadPhones().catch((err) => toast(err.message));
  });

  els.grid.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    const id = btn.getAttribute('data-id');
    if (btn.dataset.action === 'add') addToCart(id);
    if (btn.dataset.action === 'detail') showDetail(id);
  });

  els.detailBody.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-action="add"]');
    if (!btn) return;
    addToCart(btn.getAttribute('data-id'));
  });

  els.cartOpen.addEventListener('click', openCart);
  els.cartClose.addEventListener('click', closeCart);
  els.cartDrawer.addEventListener('click', (e) => {
    if (e.target === els.cartDrawer) closeCart();
  });

  els.cartItems.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-remove]');
    if (!btn) return;
    removeFromCart(btn.getAttribute('data-remove'));
  });

  els.clearCart.addEventListener('click', () => {
    if (!cart.length) return;
    if (confirm('Clear the entire cart?')) {
      cart = [];
      saveCart();
    }
  });

  els.checkoutBtn.addEventListener('click', () => {
    checkout().catch((err) => toast(err.message));
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeCart();
  });

  // Boot
  initTheme();
  renderCart();
  Promise.all([checkHealth(), loadMeta(), loadPhones()]).catch((err) => {
    toast(err.message);
    els.stats.textContent = 'Could not load inventory. Is the API running?';
  });
})();
