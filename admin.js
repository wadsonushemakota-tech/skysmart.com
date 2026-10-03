/** Orders dashboard (admin.html): lists orders and updates their status. Needs ADMIN_KEY. */
(function () {
    const { money, escapeHtml, toast } = window.SkyShop;
    const $ = (sel) => document.querySelector(sel);
    const KEY_STORE = 'skySmartAdminKey';
    const apiUrl = (p) => (typeof window.skySmartApiUrl === 'function' ? window.skySmartApiUrl(p) : p);
    let adminKey = sessionStorage.getItem(KEY_STORE) || '';
    let orders = [];
    let filter = '';
    let timer = null;

    const STATUS_LABEL = {
        pending_payment: 'Awaiting payment', paid: 'Paid', ready: 'Ready for collection',
        shipped: 'On the way', completed: 'Completed', cancelled: 'Cancelled',
    };
    const PAYMENT_LABEL = { ecocash: 'EcoCash', bank: 'Bank transfer', cash: 'Cash' };

    // Next actions offered for each status
    function actionsFor(o) {
        const fulfil = o.deliveryMethod === 'delivery' ? ['shipped', 'Mark on the way'] : ['ready', 'Mark ready for collection'];
        switch (o.status) {
            case 'pending_payment': return [['paid', 'Mark paid'], ['cancelled', 'Cancel']];
            case 'paid': return [fulfil, ['cancelled', 'Cancel']];
            case 'ready':
            case 'shipped': return [['completed', 'Mark completed']];
            case 'cancelled': return [['pending_payment', 'Reopen']];
            default: return [];
        }
    }

    // A ready-to-send WhatsApp message for the customer, matching the order status
    function customerMessage(o) {
        const first = (o.customerName || '').split(' ')[0];
        const total = money(o.subtotal);
        switch (o.status) {
            case 'pending_payment':
                return `Hi ${first}, thank you for your Sky Smart order ${o.code} (${total}). ` +
                    (o.paymentMethod === 'cash' ? `We'll confirm a ${o.deliveryMethod === 'delivery' ? 'delivery' : 'collection'} time with you.` : 'Please send your proof of payment when done.');
            case 'paid': return `Hi ${first}, we've received your payment for order ${o.code}. We're getting it ready now.`;
            case 'ready': return `Hi ${first}, your order ${o.code} is ready for collection in Bulawayo.`;
            case 'shipped': return `Hi ${first}, your order ${o.code} is on its way to you.`;
            case 'completed': return `Hi ${first}, thank you for shopping with Sky Smart! We hope you love your order ${o.code}.`;
            default: return `Hi ${first}, this is Sky Smart about your order ${o.code}.`;
        }
    }

    function waNumber(phone) {
        let d = String(phone || '').replace(/\D/g, '');
        if (d.startsWith('0')) d = '263' + d.slice(1); // local Zimbabwe numbers
        return d;
    }

    async function api(path, options = {}) {
        const res = await fetch(apiUrl(path), {
            ...options,
            headers: { 'Content-Type': 'application/json', 'x-admin-key': adminKey, ...(options.headers || {}) },
        });
        const body = await res.json().catch(() => ({}));
        if (!res.ok || !body.success) throw Object.assign(new Error(body.message || `Request failed (${res.status})`), { status: res.status });
        return body;
    }

    function render() {
        const list = filter ? orders.filter((o) => o.status === filter) : orders;
        $('#stat-pending').textContent = orders.filter((o) => o.status === 'pending_payment').length;
        $('#stat-paid').textContent = orders.filter((o) => o.status === 'paid').length;
        $('#stat-out').textContent = orders.filter((o) => o.status === 'ready' || o.status === 'shipped').length;
        $('#stat-revenue').textContent = money(orders.filter((o) => ['paid', 'ready', 'shipped', 'completed'].includes(o.status)).reduce((s, o) => s + o.subtotal, 0));
        $('#orders').innerHTML = list.length ? list.map((o) => `
            <article class="order-row" data-code="${escapeHtml(o.code)}">
                <div class="order-row-head">
                    <h3>${escapeHtml(o.code)} · ${money(o.subtotal)}</h3>
                    <span class="status status-${escapeHtml(o.status)}">${escapeHtml(STATUS_LABEL[o.status] || o.status)}</span>
                </div>
                <div class="order-meta">
                    <span><ion-icon name="person-outline"></ion-icon> ${escapeHtml(o.customerName)}</span>
                    <a href="tel:${escapeHtml(o.phone)}">${escapeHtml(o.phone)}</a>
                    ${o.email ? `<a href="mailto:${escapeHtml(o.email)}">${escapeHtml(o.email)}</a>` : ''}
                    <span>${escapeHtml(PAYMENT_LABEL[o.paymentMethod] || o.paymentMethod)}</span>
                    <span>${o.deliveryMethod === 'delivery' ? 'Deliver to ' + escapeHtml([o.address, o.city].filter(Boolean).join(', ')) : 'Collection'}</span>
                    <span>${escapeHtml(new Date(o.createdAt).toLocaleString([], { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }))}</span>
                </div>
                <div class="order-items">${o.items.map((i) => `<div>${i.qty} × ${escapeHtml(i.name)} (size ${escapeHtml(i.size)}) · ${money(i.price * i.qty)}</div>`).join('')}
                    ${o.notes ? `<div style="color:var(--muted)">Note: ${escapeHtml(o.notes)}</div>` : ''}</div>
                <div class="order-actions">
                    <a class="btn btn-wa btn-sm" target="_blank" rel="noopener" href="https://wa.me/${waNumber(o.phone)}?text=${encodeURIComponent(customerMessage(o))}"><ion-icon name="logo-whatsapp"></ion-icon> Message customer</a>
                    ${actionsFor(o).map(([s, label]) => `<button type="button" class="btn ${s === 'cancelled' ? 'btn-outline' : 'btn-primary'} btn-sm" data-set="${s}">${label}</button>`).join('')}
                </div>
            </article>`).join('')
            : '<div class="card" style="text-align:center;color:var(--muted)">No orders here yet.</div>';
    }

    async function load() {
        $('#dash-error').hidden = true;
        try {
            const body = await api('/api/admin/orders');
            orders = body.orders;
            render();
            $('#refreshed').textContent = 'Updated ' + new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            return true;
        } catch (err) {
            if (err.status === 401) {
                signOut('Wrong admin key.');
                return false;
            }
            $('#dash-error').innerHTML = '<ion-icon name="alert-circle"></ion-icon><div>' + escapeHtml(err.message) + '</div>';
            $('#dash-error').hidden = false;
            return false;
        }
    }

    function showDashboard() {
        $('#admin-login').hidden = true;
        $('#dashboard').hidden = false;
        load();
        clearInterval(timer);
        timer = setInterval(load, 60000);
    }

    function signOut(message) {
        clearInterval(timer);
        adminKey = '';
        sessionStorage.removeItem(KEY_STORE);
        $('#dashboard').hidden = true;
        $('#admin-login').hidden = false;
        const err = $('#login-error');
        err.textContent = message || '';
        err.hidden = !message;
    }

    $('#admin-login').addEventListener('submit', async (e) => {
        e.preventDefault();
        adminKey = $('#admin-key').value.trim();
        if (!adminKey) return;
        const btn = e.submitter || $('#admin-login button');
        btn.disabled = true;
        btn.textContent = 'Signing in…';
        try {
            await api('/api/admin/orders?status=paid');
            sessionStorage.setItem(KEY_STORE, adminKey);
            $('#admin-key').value = '';
            showDashboard();
        } catch (err) {
            signOut(err.status === 401 ? 'Wrong admin key.' : err.message);
        } finally {
            btn.disabled = false;
            btn.textContent = 'Open dashboard';
        }
    });

    $('#orders').addEventListener('click', async (e) => {
        const b = e.target.closest('[data-set]');
        if (!b) return;
        const code = b.closest('[data-code]').dataset.code;
        const status = b.dataset.set;
        if (status === 'cancelled' && !window.confirm(`Cancel order ${code}?`)) return;
        b.disabled = true;
        try {
            await api(`/api/admin/orders/${encodeURIComponent(code)}`, { method: 'PATCH', body: JSON.stringify({ status }) });
            const o = orders.find((x) => x.code === code);
            if (o) o.status = status;
            render();
            toast(`${code}: ${STATUS_LABEL[status]}`);
        } catch (err) {
            toast(err.message);
            b.disabled = false;
        }
    });

    $('#status-filter').addEventListener('click', (e) => {
        const c = e.target.closest('.chip');
        if (!c) return;
        filter = c.dataset.status;
        document.querySelectorAll('#status-filter .chip').forEach((x) => x.classList.toggle('active', x === c));
        render();
    });
    $('#refresh').addEventListener('click', load);
    $('#logout').addEventListener('click', () => signOut());

    if (adminKey) showDashboard();
})();
