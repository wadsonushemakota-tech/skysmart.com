/** Track order page: looks up an order by number + phone via GET /api/orders/:code */
(function () {
    const { money, escapeHtml, waLink } = window.SkyShop;
    const $ = (sel) => document.querySelector(sel);
    const form = $('#track-form');
    const errorBox = $('#track-error');
    const apiUrl = (p) => (typeof window.skySmartApiUrl === 'function' ? window.skySmartApiUrl(p) : p);

    const STATUS_LABEL = {
        pending_payment: 'Awaiting payment',
        paid: 'Payment confirmed',
        ready: 'Ready for collection',
        shipped: 'On its way',
        completed: 'Completed',
        cancelled: 'Cancelled',
    };

    function timeline(order) {
        if (order.status === 'cancelled') {
            return '<p class="alert alert-error"><ion-icon name="close-circle"></ion-icon> This order was cancelled. Contact us on WhatsApp if you have questions.</p>';
        }
        const fulfil = order.deliveryMethod === 'delivery' ? ['shipped', 'On its way to you'] : ['ready', 'Ready for collection'];
        const steps = [
            ['pending_payment', 'Order placed'],
            ['paid', 'Payment confirmed'],
            fulfil,
            ['completed', order.deliveryMethod === 'delivery' ? 'Delivered' : 'Collected'],
        ];
        // "ready" and "shipped" sit at the same step
        const rank = { pending_payment: 0, paid: 1, ready: 2, shipped: 2, completed: 3 }[order.status] || 0;
        return '<ol class="timeline">' + steps.map(([, label], i) => {
            const cls = i < rank || order.status === 'completed' ? 'done' : i === rank ? 'current' : '';
            return `<li class="${cls}">${escapeHtml(label)}</li>`;
        }).join('') + '</ol>';
    }

    function render(order) {
        const placed = new Date(order.createdAt).toLocaleDateString([], { day: 'numeric', month: 'short', year: 'numeric' });
        $('#track-result').innerHTML = `
            <div class="card">
                <div style="display:flex;flex-wrap:wrap;justify-content:space-between;gap:10px;align-items:center">
                    <h2 style="margin:0">Order ${escapeHtml(order.code)}</h2>
                    <span class="status status-${escapeHtml(order.status)}">${escapeHtml(STATUS_LABEL[order.status] || order.status)}</span>
                </div>
                <p style="color:var(--muted);margin:6px 0 0">Placed ${escapeHtml(placed)} · ${order.deliveryMethod === 'delivery' ? 'Delivery to ' + escapeHtml(order.city || '') : 'Collection in Bulawayo'}</p>
                ${timeline(order)}
                <div class="summary-items" style="margin-top:8px">${order.items.map((i) => `
                    <div class="summary-item">
                        <img src="${escapeHtml(i.image)}" alt="">
                        <div><strong>${escapeHtml(i.name)}</strong><span>Size ${escapeHtml(i.size)} · Qty ${i.qty}</span></div>
                        <span>${money(i.price * i.qty)}</span>
                    </div>`).join('')}</div>
                <div class="summary-row total"><span>Total</span><span>${money(order.subtotal)}${order.deliveryMethod === 'delivery' ? ' + delivery' : ''}</span></div>
                <a class="btn btn-wa btn-block" style="margin-top:14px" target="_blank" rel="noopener"
                   href="${waLink(`Hi Sky Smart! I'm asking about my order ${order.code}.`)}"><ion-icon name="logo-whatsapp"></ion-icon> Ask about this order</a>
            </div>`;
    }

    async function lookup(code, phone) {
        errorBox.hidden = true;
        const btn = $('#track-btn');
        btn.disabled = true;
        btn.textContent = 'Looking up your order…';
        const slow = setTimeout(() => { btn.textContent = 'Waking up our server, this can take up to a minute…'; }, 5000);
        try {
            const res = await fetch(apiUrl(`/api/orders/${encodeURIComponent(code)}?phone=${encodeURIComponent(phone)}`));
            const body = await res.json().catch(() => ({}));
            if (!res.ok || !body.success) throw new Error(body.message || 'Could not find that order.');
            render(body.order);
        } catch (err) {
            $('#track-result').innerHTML = '';
            errorBox.innerHTML = '<ion-icon name="alert-circle"></ion-icon><div>' + escapeHtml(err.message) + '</div>';
            errorBox.hidden = false;
        } finally {
            clearTimeout(slow);
            btn.disabled = false;
            btn.innerHTML = '<ion-icon name="search-outline"></ion-icon> Find my order';
        }
    }

    form.addEventListener('submit', (e) => {
        e.preventDefault();
        let code = form.elements.code.value.trim().toUpperCase().replace(/\s+/g, '');
        if (/^SS[A-Z0-9]{6}$/.test(code)) code = 'SS-' + code.slice(2);
        form.elements.code.value = code;
        const phone = form.elements.phone.value.trim();
        if (!/^SS-[A-Z0-9]{6}$/.test(code) || phone.replace(/\D/g, '').length < 9) {
            errorBox.innerHTML = '<ion-icon name="alert-circle"></ion-icon><div>Enter your order number (like SS-7K2QX9) and the phone number you used.</div>';
            errorBox.hidden = false;
            return;
        }
        lookup(code, phone);
    });

    // Prefill from the link on the confirmation page, or this device's last order
    const params = new URLSearchParams(location.search);
    let last = null;
    try { last = JSON.parse(localStorage.getItem('skySmartLastOrder') || 'null'); } catch (e) { /* ignore */ }
    const code = params.get('code') || (last && last.code) || '';
    const phone = params.get('phone') || (last && last.phone) || '';
    form.elements.code.value = code;
    form.elements.phone.value = phone;
    if (params.get('code') && phone) lookup(code, phone);
})();
