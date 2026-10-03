/**
 * Checkout page: collects details, sends the order to POST /api/orders (the server prices it
 * from catalog.js), then shows payment instructions for the chosen method.
 */
(function () {
    const { bag, money, escapeHtml, waLink, catalog, toast } = window.SkyShop;
    const biz = catalog.business;
    const $ = (sel) => document.querySelector(sel);
    const form = $('#checkout-form');
    const errorBox = $('#checkout-error');
    const CUSTOMER_KEY = 'skySmartCustomer';
    const LAST_ORDER_KEY = 'skySmartLastOrder';

    const apiUrl = (p) => (typeof window.skySmartApiUrl === 'function' ? window.skySmartApiUrl(p) : p);
    const store = {
        get(k) { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch (e) { return null; } },
        set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* ignore */ } },
    };

    function showView() {
        const empty = bag.count() === 0 && $('#confirmation').hidden;
        $('#checkout-empty').hidden = !empty;
        form.hidden = empty || !$('#confirmation').hidden;
    }

    function renderSummary() {
        const items = bag.items();
        $('#summary-items').innerHTML = items.map(({ product, size, qty }) => `
            <div class="summary-item">
                <img src="${escapeHtml(product.image)}" alt="">
                <div><strong>${escapeHtml(product.name)}</strong><span>Size ${escapeHtml(size)} · Qty ${qty}</span></div>
                <span>${money(product.price * qty)}</span>
            </div>`).join('') +
            '<a href="#bag" class="field-hint" id="edit-bag" style="color:var(--blue)">Edit bag</a>';
        $('#edit-bag').addEventListener('click', (e) => { e.preventDefault(); window.SkyShop.openBag(); });
        const subtotal = bag.subtotal();
        const delivery = form.elements.delivery.value === 'delivery';
        $('#sum-subtotal').textContent = money(subtotal);
        $('#sum-delivery').textContent = delivery ? 'Confirmed on WhatsApp' : 'Free collection';
        $('#sum-total').textContent = money(subtotal) + (delivery ? ' + delivery' : '');
        $('#wa-order').href = waLink(orderText(collect(), null));
        showView();
    }

    function collect() {
        const f = form.elements;
        return {
            customer: { name: f.name.value.trim(), phone: f.phone.value.trim(), email: f.email.value.trim() },
            delivery: { method: f.delivery.value, address: f.address.value.trim(), city: f.city.value.trim() },
            payment: f.payment.value,
            notes: f.notes.value.trim(),
            items: bag.items().map(({ id, size, qty }) => ({ id, size, qty })),
        };
    }

    const PAYMENT_LABEL = { ecocash: 'EcoCash', bank: 'Bank transfer', cash: 'Cash' };

    // Plain-text order for WhatsApp (fallback, or the "order on WhatsApp" link)
    function orderText(data, code) {
        const lines = bag.items().map(({ product, size, qty }) => `• ${product.name}, size ${size} x${qty}: ${money(product.price * qty)}`);
        return [
            code ? `Hi Sky Smart! I've placed order ${code}.` : 'Hi Sky Smart! I would like to order:',
            ...lines,
            `Total: ${money(bag.subtotal())}${data.delivery.method === 'delivery' ? ' + delivery' : ''}`,
            data.customer.name ? `Name: ${data.customer.name}` : '',
            data.delivery.method === 'delivery'
                ? `Delivery to: ${[data.delivery.address, data.delivery.city].filter(Boolean).join(', ')}`
                : 'Collection in Bulawayo',
            `Payment: ${PAYMENT_LABEL[data.payment]}`,
        ].filter(Boolean).join('\n');
    }

    function validate(data) {
        const f = form.elements;
        const problems = [];
        const mark = (el, bad) => el.setAttribute('aria-invalid', bad ? 'true' : 'false');
        mark(f.name, data.customer.name.length < 2);
        if (data.customer.name.length < 2) problems.push([f.name, 'Please enter your full name.']);
        const digits = data.customer.phone.replace(/\D/g, '');
        mark(f.phone, digits.length < 9 || digits.length > 15);
        if (digits.length < 9 || digits.length > 15) problems.push([f.phone, 'Please enter a valid phone number.']);
        const badEmail = data.customer.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.customer.email);
        mark(f.email, badEmail);
        if (badEmail) problems.push([f.email, 'Please check your email address.']);
        if (data.delivery.method === 'delivery') {
            mark(f.address, !data.delivery.address);
            mark(f.city, !data.delivery.city);
            if (!data.delivery.address) problems.push([f.address, 'Please enter your delivery address.']);
            if (!data.delivery.city) problems.push([f.city, 'Please enter your city or town.']);
        }
        return problems;
    }

    function showError(html) {
        errorBox.innerHTML = '<ion-icon name="alert-circle"></ion-icon><div>' + html + '</div>';
        errorBox.hidden = false;
        errorBox.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }

    async function placeOrder(data) {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 75000);
        try {
            const res = await fetch(apiUrl('/api/orders'), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data),
                signal: controller.signal,
            });
            const body = await res.json().catch(() => ({}));
            if (!res.ok || !body.success) throw Object.assign(new Error(body.message || 'Could not place the order.'), { status: res.status });
            return body.order;
        } finally {
            clearTimeout(timeout);
        }
    }

    form.addEventListener('change', (e) => {
        if (e.target.name === 'delivery') {
            $('#address-fields').hidden = form.elements.delivery.value !== 'delivery';
            renderSummary();
        }
        if (e.target.name === 'payment') renderSummary();
    });

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        errorBox.hidden = true;
        const data = collect();
        if (!data.items.length) return showView();
        const problems = validate(data);
        if (problems.length) {
            showError(problems.map(([, m]) => escapeHtml(m)).join('<br>'));
            problems[0][0].focus();
            return;
        }
        store.set(CUSTOMER_KEY, { name: data.customer.name, phone: data.customer.phone, email: data.customer.email, address: data.delivery.address, city: data.delivery.city });

        const btn = $('#place-order');
        btn.disabled = true;
        btn.innerHTML = 'Placing order…';
        // The free server sleeps when idle; warn if it takes a while to wake
        const slow = setTimeout(() => { btn.innerHTML = 'Waking up our server, this can take up to a minute…'; }, 5000);
        try {
            const order = await placeOrder(data);
            store.set(LAST_ORDER_KEY, { code: order.code, phone: data.customer.phone });
            bag.clear();
            showConfirmation(order, data);
        } catch (err) {
            const waHref = waLink(orderText(data, null));
            const msg = err.name === 'AbortError' ? 'Our server took too long to respond.' : escapeHtml(err.message);
            showError(`${msg} Your bag is saved. You can try again, or
                <a href="${waHref}" target="_blank" rel="noopener" style="color:inherit;font-weight:700">send this order on WhatsApp</a> instead.`);
        } finally {
            clearTimeout(slow);
            btn.disabled = false;
            btn.innerHTML = 'Place order <ion-icon name="arrow-forward"></ion-icon>';
        }
    });

    // ---------- Confirmation ----------
    function copyButton(value, label) {
        return `<button type="button" class="copy-inline" data-copy="${escapeHtml(value)}" aria-label="Copy ${escapeHtml(label)}">Copy</button>`;
    }

    function paymentBlock(order, data) {
        const total = money(order.subtotal);
        const delivery = data.delivery.method === 'delivery';
        const waitFee = delivery
            ? `<li>Wait for our WhatsApp message confirming the <strong>delivery fee</strong>, then pay the order total plus delivery.</li>`
            : '';
        const amount = delivery ? `${total} + delivery` : total;
        if (order.paymentMethod === 'ecocash') {
            return `
                <h2><ion-icon name="phone-portrait-outline"></ion-icon> Pay with EcoCash</h2>
                <ol class="pay-steps">
                    ${waitFee}
                    <li>Dial <strong>*151#</strong> or open your EcoCash app and choose <strong>Send Money</strong>.</li>
                    <li>Send <strong>${escapeHtml(amount)}</strong> to <strong>${escapeHtml(biz.payment.ecocash.number)}</strong> (${escapeHtml(biz.payment.ecocash.name)}).</li>
                    <li>Use your order number <strong>${escapeHtml(order.code)}</strong> as the reference if asked.</li>
                    <li>Send us the confirmation message or a screenshot on WhatsApp.</li>
                </ol>
                <dl class="pay-detail">
                    <dt>EcoCash number</dt><dd>${escapeHtml(biz.payment.ecocash.number)}</dd>${copyButton(biz.payment.ecocash.number, 'EcoCash number')}
                    <dt>Name</dt><dd>${escapeHtml(biz.payment.ecocash.name)}</dd><span></span>
                    <dt>Amount</dt><dd>${escapeHtml(amount)}</dd><span></span>
                    <dt>Reference</dt><dd>${escapeHtml(order.code)}</dd>${copyButton(order.code, 'order number')}
                </dl>`;
        }
        if (order.paymentMethod === 'bank') {
            const b = biz.payment.bank;
            return `
                <h2><ion-icon name="business-outline"></ion-icon> Pay by bank transfer</h2>
                <ol class="pay-steps">
                    ${waitFee}
                    <li>Transfer <strong>${escapeHtml(amount)}</strong> to the account below from your bank app or branch.</li>
                    <li>Use <strong>${escapeHtml(order.code)}</strong> as the payment reference.</li>
                    <li>Send us the proof of payment on WhatsApp.</li>
                </ol>
                <dl class="pay-detail">
                    <dt>Bank</dt><dd>${escapeHtml(b.bank)} · Branch ${escapeHtml(b.branchCode)}</dd><span></span>
                    <dt>Account name</dt><dd>${escapeHtml(b.accountName)}</dd><span></span>
                    <dt>USD account</dt><dd>${escapeHtml(b.usdAccount)}</dd>${copyButton(b.usdAccount, 'USD account number')}
                    <dt>ZWG account</dt><dd>${escapeHtml(b.zwgAccount)}</dd>${copyButton(b.zwgAccount, 'ZWG account number')}
                    <dt>Reference</dt><dd>${escapeHtml(order.code)}</dd>${copyButton(order.code, 'order number')}
                </dl>`;
        }
        return `
            <h2><ion-icon name="cash-outline"></ion-icon> Pay with cash</h2>
            <ol class="pay-steps">
                <li>We'll message you on WhatsApp to confirm your order${delivery ? ', the delivery fee' : ''} and a ${delivery ? 'delivery' : 'collection'} time.</li>
                <li>Pay <strong>${escapeHtml(amount)}</strong> in cash when you ${delivery ? 'receive your order' : 'collect in Bulawayo'}.</li>
            </ol>`;
    }

    function showConfirmation(order, data) {
        const first = (order.customerName || '').split(' ')[0];
        const proofText = order.paymentMethod === 'cash'
            ? `Hi Sky Smart! I've placed order ${order.code} (${money(order.subtotal)}) and will pay cash on ${data.delivery.method === 'delivery' ? 'delivery' : 'collection'}.`
            : `Hi Sky Smart! I've placed order ${order.code} (${money(order.subtotal)}). Here is my proof of payment:`;
        const trackHref = `track.html?code=${encodeURIComponent(order.code)}&phone=${encodeURIComponent(data.customer.phone)}`;
        const el = $('#confirmation');
        el.innerHTML = `
            <div class="confirm-head">
                <div class="confirm-check"><ion-icon name="checkmark"></ion-icon></div>
                <h2 style="font-size:2.2rem;margin:0 0 6px">Thank you${first ? ', ' + escapeHtml(first) : ''}!</h2>
                <p style="color:var(--muted);margin:0">Your order has been placed. Keep your order number:</p>
                <div class="order-code">${escapeHtml(order.code)} <button type="button" class="copy-btn" data-copy="${escapeHtml(order.code)}">Copy</button></div>
            </div>
            <div class="card" style="margin-bottom:20px">
                ${paymentBlock(order, data)}
                <a class="btn btn-wa btn-block" href="${waLink(proofText)}" target="_blank" rel="noopener">
                    <ion-icon name="logo-whatsapp"></ion-icon> ${order.paymentMethod === 'cash' ? 'Confirm my order on WhatsApp' : 'Send proof of payment on WhatsApp'}
                </a>
            </div>
            <div class="card" style="margin-bottom:20px">
                <h2>Order ${escapeHtml(order.code)}</h2>
                <div class="summary-items">${order.items.map((i) => `
                    <div class="summary-item">
                        <img src="${escapeHtml(i.image)}" alt="">
                        <div><strong>${escapeHtml(i.name)}</strong><span>Size ${escapeHtml(i.size)} · Qty ${i.qty}</span></div>
                        <span>${money(i.price * i.qty)}</span>
                    </div>`).join('')}</div>
                <div class="summary-row"><span>${data.delivery.method === 'delivery' ? 'Delivery to ' + escapeHtml(data.delivery.city) : 'Collection'}</span><span>${data.delivery.method === 'delivery' ? 'Fee on WhatsApp' : 'Free'}</span></div>
                <div class="summary-row total"><span>Total</span><span>${money(order.subtotal)}${data.delivery.method === 'delivery' ? ' + delivery' : ''}</span></div>
            </div>
            <div style="display:flex;flex-wrap:wrap;gap:10px;justify-content:center">
                <a class="btn btn-primary" href="${trackHref}"><ion-icon name="locate-outline"></ion-icon> Track this order</a>
                <a class="btn btn-outline" href="products.html">Continue shopping</a>
            </div>`;
        form.hidden = true;
        $('#checkout-empty').hidden = true;
        el.hidden = false;
        window.scrollTo({ top: 0, behavior: 'smooth' });
        el.focus({ preventScroll: true });
    }

    document.addEventListener('click', (e) => {
        const b = e.target.closest('[data-copy]');
        if (!b) return;
        const value = b.dataset.copy;
        const done = () => toast(`Copied ${value}`);
        if (navigator.clipboard) navigator.clipboard.writeText(value).then(done, () => window.prompt('Copy this:', value));
        else window.prompt('Copy this:', value);
    });

    // Prefill from the last checkout on this device
    const saved = store.get(CUSTOMER_KEY);
    if (saved) {
        const f = form.elements;
        f.name.value = saved.name || '';
        f.phone.value = saved.phone || '';
        f.email.value = saved.email || '';
        f.address.value = saved.address || '';
        f.city.value = saved.city || '';
    }
    bag.onChange(renderSummary);
    renderSummary();
})();
