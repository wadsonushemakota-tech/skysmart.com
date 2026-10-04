/** Orders dashboard (admin.html): lists orders and updates their status. Needs ADMIN_KEY. */
(function () {
    const { money, escapeHtml, toast } = window.SkyShop;
    const $ = (sel) => document.querySelector(sel);
    const KEY_STORE = 'skySmartAdminKey';
    const SEEN_STORE = 'skySmartSeenOrders';
    const POLL_MS = 30000;
    const apiUrl = (p) => (typeof window.skySmartApiUrl === 'function' ? window.skySmartApiUrl(p) : p);
    // Remembered on this device (the owner's phone) so the installed app opens straight to the orders
    const store = {
        get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
        set(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* private mode */ } },
        del(k) { try { localStorage.removeItem(k); } catch (e) { /* ignore */ } },
    };
    let adminKey = store.get(KEY_STORE) || '';
    let orders = [];
    let filter = '';
    let timer = null;
    let seen = null; // order codes already known on this device; null until the first load
    const fresh = new Set(); // orders that arrived while the dashboard was open

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
            <article class="order-row${fresh.has(o.code) ? ' is-new' : ''}" data-code="${escapeHtml(o.code)}">
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
            detectNewOrders();
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
        alertsStatus();
        load();
        clearInterval(timer);
        timer = setInterval(load, POLL_MS);
    }

    // ---------- New-order alerts: chime, notification, title badge, highlighted rows ----------
    function detectNewOrders() {
        if (seen === null) {
            // First load on this device: remember what exists; alert only for orders newer than last visit
            let saved = null;
            try { saved = JSON.parse(store.get(SEEN_STORE) || 'null'); } catch (e) { /* ignore */ }
            seen = new Set(saved || orders.map((o) => o.code));
        }
        const arrived = orders.filter((o) => !seen.has(o.code));
        arrived.forEach((o) => { seen.add(o.code); fresh.add(o.code); });
        store.set(SEEN_STORE, JSON.stringify(Array.from(seen).slice(-500)));
        if (arrived.length) announce(arrived);
        updateTitle();
    }

    function updateTitle() {
        document.title = (fresh.size ? `(${fresh.size}) New order${fresh.size > 1 ? 's' : ''} · ` : '') + 'Orders Dashboard | Sky Smart';
    }

    let audioCtx = null;
    function chime() {
        try {
            audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
            if (audioCtx.state === 'suspended') audioCtx.resume();
            // Three rising notes
            [659.25, 783.99, 1046.5].forEach((freq, i) => {
                const t = audioCtx.currentTime + i * 0.18;
                const osc = audioCtx.createOscillator();
                const gain = audioCtx.createGain();
                osc.type = 'sine';
                osc.frequency.value = freq;
                gain.gain.setValueAtTime(0.0001, t);
                gain.gain.exponentialRampToValueAtTime(0.4, t + 0.02);
                gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.45);
                osc.connect(gain).connect(audioCtx.destination);
                osc.start(t);
                osc.stop(t + 0.5);
            });
        } catch (e) { /* sound not available */ }
        if (navigator.vibrate) navigator.vibrate([200, 100, 200]);
    }

    async function notify(title, body) {
        if (!('Notification' in window) || Notification.permission !== 'granted') return;
        const options = { body, icon: 'images/app-icon-192.png', badge: 'images/app-icon-192.png', tag: 'sky-smart-order', renotify: true };
        try {
            // Android Chrome only allows notifications through the service worker
            const reg = navigator.serviceWorker && (await navigator.serviceWorker.getRegistration());
            if (reg) return reg.showNotification(title, options);
            new Notification(title, options);
        } catch (e) { /* ignore */ }
    }

    function announce(arrived) {
        chime();
        const first = arrived[0];
        const title = arrived.length === 1
            ? `🛍️ New order ${first.code}: ${money(first.subtotal)}`
            : `🛍️ ${arrived.length} new orders`;
        const body = arrived.length === 1
            ? `${first.customerName}: ${first.items.map((i) => `${i.qty}× ${i.name} (size ${i.size})`).join(', ')}`
            : arrived.map((o) => `${o.code} ${money(o.subtotal)} from ${o.customerName}`).join('\n');
        notify(title, body);
        toast(arrived.length === 1 ? `New order ${first.code} from ${first.customerName}` : `${arrived.length} new orders`);
    }

    function alertsStatus() {
        const dot = $('#alert-dot');
        const status = $('#alert-status');
        const btn = $('#enable-alerts');
        if (!('Notification' in window)) {
            status.textContent = 'Sound alerts are on while this page is open. This browser does not support pop-up notifications.';
            dot.classList.add('on');
            btn.hidden = true;
            return;
        }
        const p = Notification.permission;
        dot.classList.toggle('on', p === 'granted');
        btn.hidden = p === 'granted';
        status.textContent = p === 'granted'
            ? `On. Checking every ${POLL_MS / 1000} seconds; you'll hear a chime and get a notification for each new order while the dashboard is open.`
            : p === 'denied'
                ? 'Notifications are blocked for this site. Allow them in your browser settings (site settings → Notifications). Sound alerts still work while the page is open.'
                : 'Off. Turn on to hear a sound and get a notification when an order arrives.';
    }

    $('#enable-alerts').addEventListener('click', async () => {
        chime(); // also unlocks sound playback, which browsers only allow after a tap
        if ('Notification' in window && Notification.permission === 'default') await Notification.requestPermission();
        alertsStatus();
        if ('Notification' in window && Notification.permission === 'granted') notify('Order alerts are on ✅', "You'll be notified here when a new order arrives.");
    });
    $('#test-alert').addEventListener('click', () => {
        chime();
        notify('🛍️ Test alert', 'This is how a new order alert will look and sound.');
    });

    // ---------- Install as an app ----------
    if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
    let installPrompt = null;
    window.addEventListener('beforeinstallprompt', (e) => {
        e.preventDefault();
        installPrompt = e;
        $('#install-app').hidden = false;
    });
    $('#install-app').addEventListener('click', async () => {
        if (!installPrompt) return;
        installPrompt.prompt();
        const choice = await installPrompt.userChoice;
        if (choice.outcome === 'accepted') toast('Installed! Open "SS Orders" from your home screen.');
        installPrompt = null;
        $('#install-app').hidden = true;
    });
    window.addEventListener('appinstalled', () => { $('#install-app').hidden = true; });
    const standalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone;
    if (/iphone|ipad|ipod/i.test(navigator.userAgent) && !standalone) $('#ios-hint').hidden = false;

    function signOut(message) {
        clearInterval(timer);
        adminKey = '';
        store.del(KEY_STORE);
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
            store.set(KEY_STORE, adminKey);
            $('#admin-key').value = '';
            showDashboard();
        } catch (err) {
            signOut(err.status === 401 ? 'Wrong admin key.' : err.message);
        } finally {
            btn.disabled = false;
            btn.textContent = 'Open dashboard';
        }
    });

    // Tapping a highlighted new order marks it as seen
    $('#orders').addEventListener('click', (e) => {
        const row = e.target.closest('.order-row.is-new');
        if (!row) return;
        fresh.delete(row.dataset.code);
        row.classList.remove('is-new');
        updateTitle();
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
