(() => {
  const TOKEN_KEY = 'oldphonestore_token';
  const USER_KEY = 'oldphonestore_user';

  const els = {
    login: document.getElementById('admin-login'),
    dash: document.getElementById('admin-dash'),
    form: document.getElementById('admin-login-form'),
    email: document.getElementById('admin-email'),
    password: document.getElementById('admin-password'),
    error: document.getElementById('admin-login-error'),
    dashSub: document.getElementById('dash-sub'),
    dashCards: document.getElementById('dash-cards'),
    ordersBody: document.getElementById('orders-body'),
    statusFilter: document.getElementById('order-status-filter'),
    refreshOrders: document.getElementById('refresh-orders'),
    timeoutScan: document.getElementById('timeout-scan'),
    logout: document.getElementById('admin-logout'),
    toast: document.getElementById('toast')
  };

  let token = localStorage.getItem(TOKEN_KEY) || '';

  function toast(msg) {
    els.toast.textContent = msg;
    els.toast.classList.add('show');
    clearTimeout(toast._t);
    toast._t = setTimeout(() => els.toast.classList.remove('show'), 2500);
  }

  async function api(path, options = {}) {
    const headers = {
      'Content-Type': 'application/json',
      ...(options.headers || {})
    };
    if (token) headers.Authorization = `Bearer ${token}`;
    const res = await fetch(path, { ...options, headers });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
    return data;
  }

  function showDash(show) {
    els.login.classList.toggle('hidden', show);
    els.dash.classList.toggle('hidden', !show);
  }

  async function loadDashboard() {
    const dash = await api('/api/admin/dashboard');
    els.dashSub.textContent = `Redis ${dash.redis ? 'ON' : 'OFF'} · users ${dash.users}`;
    els.dashCards.innerHTML = `
      <article class="dash-card"><h3>Inventory</h3><p>${dash.phones.in_stock}/${dash.phones.total} in stock</p></article>
      <article class="dash-card"><h3>Paid revenue</h3><p>$${Number(dash.revenue.paid_revenue).toFixed(2)}</p></article>
      <article class="dash-card"><h3>Orders</h3><p>${JSON.stringify(dash.orders_by_status)}</p></article>
      <article class="dash-card"><h3>Flash</h3><p>${dash.flash.map((f) => `${f.title}: ${f.sold}/${f.stock}`).join(' · ') || '—'}</p></article>
    `;
  }

  async function loadOrders() {
    const status = els.statusFilter.value;
    const q = status ? `?status=${encodeURIComponent(status)}` : '';
    const data = await api(`/api/admin/orders${q}`);
    els.ordersBody.innerHTML = '';
    for (const o of data.orders) {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${o.id}</td>
        <td>${o.order_no || '—'}</td>
        <td>$${Number(o.total).toFixed(2)}</td>
        <td><code>${o.status}</code></td>
        <td>${o.source || 'cart'}</td>
        <td class="actions"></td>
      `;
      const actions = tr.querySelector('.actions');
      for (const st of ['paid', 'shipped', 'completed', 'cancelled']) {
        if (st === o.status) continue;
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'btn ghost';
        btn.textContent = st;
        btn.addEventListener('click', async () => {
          try {
            await api(`/api/admin/orders/${o.id}/status`, {
              method: 'PATCH',
              body: JSON.stringify({ status: st })
            });
            toast(`Order #${o.id} → ${st}`);
            await loadOrders();
            await loadDashboard();
          } catch (err) {
            toast(err.message);
          }
        });
        actions.appendChild(btn);
      }
      els.ordersBody.appendChild(tr);
    }
  }

  els.form.addEventListener('submit', async (e) => {
    e.preventDefault();
    els.error.textContent = '';
    try {
      const data = await api('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({
          email: els.email.value.trim(),
          password: els.password.value
        })
      });
      if (data.user.role !== 'admin') {
        throw new Error('Not an admin account');
      }
      token = data.token;
      localStorage.setItem(TOKEN_KEY, token);
      localStorage.setItem(USER_KEY, JSON.stringify(data.user));
      showDash(true);
      await loadDashboard();
      await loadOrders();
    } catch (err) {
      els.error.textContent = err.message;
    }
  });

  els.logout.addEventListener('click', () => {
    token = '';
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    showDash(false);
  });

  els.refreshOrders.addEventListener('click', () => {
    loadOrders().catch((err) => toast(err.message));
  });

  els.statusFilter.addEventListener('change', () => {
    loadOrders().catch((err) => toast(err.message));
  });

  els.timeoutScan.addEventListener('click', async () => {
    try {
      const r = await api('/api/admin/orders/timeout-scan', { method: 'POST' });
      toast(`Cancelled ${r.cancelled} stale orders`);
      await loadOrders();
      await loadDashboard();
    } catch (err) {
      toast(err.message);
    }
  });

  // Auto enter if admin token already present
  (async () => {
    if (!token) return;
    try {
      const me = await api('/api/auth/me');
      if (me.user.role === 'admin') {
        showDash(true);
        await loadDashboard();
        await loadOrders();
      }
    } catch {
      /* stay on login */
    }
  })();
})();
