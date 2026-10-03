/**
 * Sky Smart shared storefront script (every page).
 * Header menu/search, product grids, quick view, shopping bag, toasts, reveal-on-scroll.
 * Products and prices come from catalog.js (window.SKY_SMART_CATALOG).
 */
(function () {
    const catalog = window.SKY_SMART_CATALOG;
    if (!catalog) {
        console.error('catalog.js must load before shop.js');
        return;
    }
    const BAG_KEY = 'skySmartBag';
    const MAX_QTY = 10;
    const $ = (sel, root = document) => root.querySelector(sel);
    const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

    function escapeHtml(s) {
        return String(s == null ? '' : s)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }

    const money = (n) => '$' + Number(n).toFixed(2).replace(/\.00$/, '');
    const categoryLabel = (id) => (catalog.categories.find((c) => c.id === id) || { label: id }).label;
    const waLink = (text) => `https://wa.me/${catalog.business.whatsapp}?text=${encodeURIComponent(text)}`;

    // ---------- Bag store (localStorage; prices always looked up from the catalogue) ----------
    function readBag() {
        try {
            const raw = JSON.parse(localStorage.getItem(BAG_KEY) || '[]');
            return Array.isArray(raw)
                ? raw.filter((l) => catalog.byId[l.id] && catalog.byId[l.id].sizes.includes(String(l.size)))
                    .map((l) => ({ id: l.id, size: String(l.size), qty: Math.min(MAX_QTY, Math.max(1, parseInt(l.qty, 10) || 1)) }))
                : [];
        } catch (e) {
            return [];
        }
    }

    let bag = readBag();
    const listeners = [];

    function saveBag() {
        try { localStorage.setItem(BAG_KEY, JSON.stringify(bag)); } catch (e) { /* private mode */ }
        listeners.forEach((fn) => fn(bag));
    }

    const bagApi = {
        items: () => bag.map((l) => ({ ...l, product: catalog.byId[l.id] })),
        count: () => bag.reduce((n, l) => n + l.qty, 0),
        subtotal: () => bag.reduce((s, l) => s + catalog.byId[l.id].price * l.qty, 0),
        add(id, size, qty = 1) {
            const line = bag.find((l) => l.id === id && l.size === size);
            if (line) line.qty = Math.min(MAX_QTY, line.qty + qty);
            else bag.push({ id, size, qty: Math.min(MAX_QTY, qty) });
            saveBag();
        },
        setQty(id, size, qty) {
            const line = bag.find((l) => l.id === id && l.size === size);
            if (!line) return;
            if (qty <= 0) bag = bag.filter((l) => l !== line);
            else line.qty = Math.min(MAX_QTY, qty);
            saveBag();
        },
        remove(id, size) {
            bag = bag.filter((l) => !(l.id === id && l.size === size));
            saveBag();
        },
        clear() {
            bag = [];
            saveBag();
        },
        onChange(fn) { listeners.push(fn); },
    };

    // Keep tabs in sync
    window.addEventListener('storage', (e) => {
        if (e.key === BAG_KEY) {
            bag = readBag();
            listeners.forEach((fn) => fn(bag));
        }
    });

    // ---------- Toasts ----------
    function toast(message, action) {
        let stack = $('.toast-stack');
        if (!stack) {
            stack = document.createElement('div');
            stack.className = 'toast-stack';
            stack.setAttribute('role', 'status');
            stack.setAttribute('aria-live', 'polite');
            document.body.appendChild(stack);
        }
        const el = document.createElement('div');
        el.className = 'toast';
        el.innerHTML = '<ion-icon name="checkmark-circle"></ion-icon><span></span>';
        el.querySelector('span').textContent = message;
        if (action) {
            const b = document.createElement('button');
            b.type = 'button';
            b.textContent = action.label;
            b.addEventListener('click', () => { action.onClick(); el.remove(); });
            el.appendChild(b);
        }
        stack.appendChild(el);
        setTimeout(() => el.remove(), 3800);
    }

    // ---------- Header: menu, search, bag count ----------
    function setupHeader() {
        const nav = $('.main-nav');
        const scrim = getScrim();
        $$('[data-menu-open]').forEach((b) => b.addEventListener('click', () => {
            nav.classList.add('open');
            scrim.classList.add('show');
            document.body.style.overflow = 'hidden';
        }));
        const closeMenu = () => {
            if (!nav) return;
            nav.classList.remove('open');
            if (!$('.bag.open')) {
                scrim.classList.remove('show');
                document.body.style.overflow = '';
            }
        };
        $$('[data-menu-close]').forEach((b) => b.addEventListener('click', closeMenu));
        if (nav) $$('a', nav).forEach((a) => a.addEventListener('click', closeMenu));

        const search = $('.header-search');
        $$('[data-search-toggle]').forEach((b) => b.addEventListener('click', () => {
            search.classList.toggle('open');
            if (search.classList.contains('open')) $('input', search).focus();
        }));

        // Mark the current page in the nav
        const page = location.pathname.split('/').pop() || 'index.html';
        $$('.main-nav a').forEach((a) => {
            const href = a.getAttribute('href');
            if (href === page || (page === 'index.html' && href === 'index.html')) a.setAttribute('aria-current', 'page');
        });

        $$('[data-bag-open]').forEach((b) => b.addEventListener('click', (e) => { e.preventDefault(); openBag(); }));
        updateBagCount(false);
        bagApi.onChange(() => updateBagCount(true));
    }

    function updateBagCount(animate) {
        const n = bagApi.count();
        $$('.bag-count').forEach((el) => {
            el.textContent = n > 99 ? '99+' : String(n);
            el.hidden = n === 0;
            if (animate) {
                el.classList.remove('bump');
                void el.offsetWidth;
                el.classList.add('bump');
            }
        });
    }

    function getScrim() {
        let scrim = $('.scrim');
        if (!scrim) {
            scrim = document.createElement('div');
            scrim.className = 'scrim';
            document.body.appendChild(scrim);
            scrim.addEventListener('click', () => {
                closeBag();
                const nav = $('.main-nav.open');
                if (nav) nav.classList.remove('open');
                scrim.classList.remove('show');
                document.body.style.overflow = '';
            });
        }
        return scrim;
    }

    // ---------- Bag drawer ----------
    let bagEl = null;

    function buildBag() {
        bagEl = document.createElement('aside');
        bagEl.className = 'bag';
        bagEl.setAttribute('aria-label', 'Shopping bag');
        bagEl.innerHTML = `
            <div class="bag-head">
                <h2>Your bag</h2>
                <button type="button" class="icon-btn" data-bag-close aria-label="Close bag"><ion-icon name="close"></ion-icon></button>
            </div>
            <div class="bag-items"></div>
            <div class="bag-foot">
                <div class="bag-total"><span>Subtotal</span><strong class="bag-subtotal"></strong></div>
                <small>Delivery is arranged after you order. Collection in Bulawayo is free.</small>
                <a href="checkout.html" class="btn btn-primary btn-block">Checkout <ion-icon name="arrow-forward"></ion-icon></a>
                <button type="button" class="btn btn-outline btn-block" data-bag-close>Continue shopping</button>
            </div>`;
        document.body.appendChild(bagEl);
        $$('[data-bag-close]', bagEl).forEach((b) => b.addEventListener('click', closeBag));
        document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && bagEl.classList.contains('open')) closeBag(); });

        $('.bag-items', bagEl).addEventListener('click', (e) => {
            const row = e.target.closest('[data-line]');
            if (!row) return;
            const { id, size } = row.dataset;
            const line = bag.find((l) => l.id === id && l.size === size);
            if (!line) return;
            if (e.target.closest('[data-inc]')) bagApi.setQty(id, size, line.qty + 1);
            else if (e.target.closest('[data-dec]')) bagApi.setQty(id, size, line.qty - 1);
            else if (e.target.closest('[data-remove]')) {
                const removed = { ...line };
                bagApi.remove(id, size);
                toast(`Removed ${catalog.byId[id].name}`, { label: 'Undo', onClick: () => bagApi.add(removed.id, removed.size, removed.qty) });
            }
        });
        bagApi.onChange(renderBag);
        renderBag();
    }

    function renderBag() {
        if (!bagEl) return;
        const items = bagApi.items();
        const list = $('.bag-items', bagEl);
        const foot = $('.bag-foot', bagEl);
        if (!items.length) {
            list.innerHTML = `<div class="bag-empty"><ion-icon name="bag-handle-outline"></ion-icon>
                <p>Your bag is empty.</p><a href="products.html" class="btn btn-primary">Start shopping</a></div>`;
            foot.hidden = true;
            return;
        }
        foot.hidden = false;
        list.innerHTML = items.map(({ id, size, qty, product }) => `
            <div class="bag-item" data-line data-id="${escapeHtml(id)}" data-size="${escapeHtml(size)}">
                <img src="${escapeHtml(product.image)}" alt="" loading="lazy">
                <div>
                    <h3>${escapeHtml(product.name)}</h3>
                    <div class="meta">Size ${escapeHtml(size)} · ${money(product.price)} each</div>
                    <div class="qty" aria-label="Quantity">
                        <button type="button" data-dec aria-label="Decrease quantity">−</button>
                        <output>${qty}</output>
                        <button type="button" data-inc aria-label="Increase quantity" ${qty >= MAX_QTY ? 'disabled' : ''}>+</button>
                    </div>
                </div>
                <div>
                    <div class="bag-line-total">${money(product.price * qty)}</div>
                    <button type="button" class="bag-remove" data-remove>Remove</button>
                </div>
            </div>`).join('');
        $('.bag-subtotal', bagEl).textContent = money(bagApi.subtotal());
    }

    function openBag() {
        if (!bagEl) buildBag();
        renderBag();
        bagEl.classList.add('open');
        getScrim().classList.add('show');
        document.body.style.overflow = 'hidden';
        $('[data-bag-close]', bagEl).focus();
    }

    function closeBag() {
        if (!bagEl) return;
        bagEl.classList.remove('open');
        if (!$('.main-nav.open')) {
            getScrim().classList.remove('show');
            document.body.style.overflow = '';
        }
    }

    // ---------- Quick view ----------
    let qv = null;
    let qvState = { id: null, size: null, qty: 1 };

    function buildQuickView() {
        qv = document.createElement('dialog');
        qv.className = 'qv';
        qv.setAttribute('aria-label', 'Product details');
        qv.innerHTML = `
            <button type="button" class="dialog-close" aria-label="Close"><ion-icon name="close"></ion-icon></button>
            <div class="qv-grid">
                <div class="qv-media"><img alt=""></div>
                <div class="qv-info">
                    <span class="p-cat"></span>
                    <h2></h2>
                    <div class="qv-price"></div>
                    <div class="qv-label">Choose your size <span>UK sizes</span></div>
                    <div class="sizes" role="group" aria-label="Sizes"></div>
                    <div class="size-hint" aria-live="polite"></div>
                    <div class="qv-label">Quantity</div>
                    <div class="qty">
                        <button type="button" data-qv-dec aria-label="Decrease quantity">−</button>
                        <output>1</output>
                        <button type="button" data-qv-inc aria-label="Increase quantity">+</button>
                    </div>
                    <div class="qv-actions">
                        <button type="button" class="btn btn-primary btn-block" data-qv-add><ion-icon name="bag-add-outline"></ion-icon> Add to bag</button>
                        <a class="btn btn-outline btn-block" data-qv-wa target="_blank" rel="noopener"><ion-icon name="logo-whatsapp"></ion-icon> Ask about this pair</a>
                    </div>
                    <p class="qv-note"><ion-icon name="information-circle-outline"></ion-icon> Not sure about your size? Message us on WhatsApp and we'll help you choose.</p>
                </div>
            </div>`;
        document.body.appendChild(qv);
        $('.dialog-close', qv).addEventListener('click', () => qv.close());
        qv.addEventListener('click', (e) => { if (e.target === qv) qv.close(); });
        $('.sizes', qv).addEventListener('click', (e) => {
            const b = e.target.closest('.size-btn');
            if (!b) return;
            qvState.size = b.dataset.size;
            $$('.size-btn', qv).forEach((x) => x.setAttribute('aria-pressed', x === b ? 'true' : 'false'));
            $('.size-hint', qv).textContent = '';
        });
        const setQty = (q) => {
            qvState.qty = Math.min(MAX_QTY, Math.max(1, q));
            $('.qty output', qv).textContent = qvState.qty;
        };
        $('[data-qv-dec]', qv).addEventListener('click', () => setQty(qvState.qty - 1));
        $('[data-qv-inc]', qv).addEventListener('click', () => setQty(qvState.qty + 1));
        $('[data-qv-add]', qv).addEventListener('click', () => {
            if (!qvState.size) {
                $('.size-hint', qv).textContent = 'Please choose a size first.';
                $('.size-btn', qv).focus();
                return;
            }
            const p = catalog.byId[qvState.id];
            bagApi.add(p.id, qvState.size, qvState.qty);
            qv.close();
            toast(`${p.name} (size ${qvState.size}) added to your bag`, { label: 'View bag', onClick: openBag });
        });
    }

    function openProduct(id) {
        const p = catalog.byId[id];
        if (!p) return;
        if (!qv) buildQuickView();
        qvState = { id, size: null, qty: 1 };
        const img = $('.qv-media img', qv);
        img.src = p.image;
        img.alt = p.name;
        $('.p-cat', qv).textContent = categoryLabel(p.category);
        $('h2', qv).textContent = p.name;
        $('.qv-price', qv).textContent = money(p.price);
        $('.sizes', qv).innerHTML = p.sizes.map((s) => `<button type="button" class="size-btn" data-size="${escapeHtml(s)}" aria-pressed="false">${escapeHtml(s)}</button>`).join('');
        $('.size-hint', qv).textContent = '';
        $('.qty output', qv).textContent = '1';
        $('[data-qv-wa]', qv).href = waLink(`Hi Sky Smart! I'm interested in the ${p.name} (${money(p.price)}). Is it available in my size?`);
        if (typeof qv.showModal === 'function') qv.showModal();
        else qv.setAttribute('open', '');
    }

    // ---------- Product grids ----------
    function productCard(p) {
        return `
            <article class="p-card">
                <button type="button" class="p-media" data-open="${escapeHtml(p.id)}" aria-label="View ${escapeHtml(p.name)}">
                    <img src="${escapeHtml(p.image)}" alt="${escapeHtml(p.name)}" loading="lazy">
                    <span class="p-quick">Quick view</span>
                </button>
                <div class="p-body">
                    <span class="p-cat">${escapeHtml(categoryLabel(p.category))}</span>
                    <h3 class="p-name">${escapeHtml(p.name)}</h3>
                    <div class="p-foot">
                        <span class="p-price">${money(p.price)}</span>
                        <button type="button" class="p-add" data-open="${escapeHtml(p.id)}"><ion-icon name="bag-add-outline"></ion-icon> Add</button>
                    </div>
                </div>
            </article>`;
    }

    function setupGrids() {
        $$('[data-product-grid]').forEach((grid) => {
            const limit = parseInt(grid.dataset.limit, 10) || 0;
            const featuredOnly = grid.hasAttribute('data-featured');
            const toolbar = grid.dataset.toolbar ? $(grid.dataset.toolbar) : null;
            const countEl = grid.dataset.count ? $(grid.dataset.count) : null;
            const params = new URLSearchParams(location.search);
            const state = {
                category: params.get('cat') || 'all',
                q: (params.get('q') || '').trim(),
                sort: 'featured',
            };

            function render() {
                let list = catalog.products.slice();
                if (featuredOnly) list = list.filter((p) => p.featured);
                if (state.category !== 'all') list = list.filter((p) => p.category === state.category || p.tags.includes(state.category));
                if (state.q) {
                    const q = state.q.toLowerCase();
                    list = list.filter((p) => (p.name + ' ' + p.category + ' ' + p.tags.join(' ')).toLowerCase().includes(q));
                }
                if (state.sort === 'price-asc') list.sort((a, b) => a.price - b.price);
                if (state.sort === 'price-desc') list.sort((a, b) => b.price - a.price);
                if (state.sort === 'name') list.sort((a, b) => a.name.localeCompare(b.name));
                if (limit) list = list.slice(0, limit);
                grid.innerHTML = list.length
                    ? list.map(productCard).join('')
                    : `<div class="empty-state"><ion-icon name="search-outline"></ion-icon>
                        <p>No products match${state.q ? ` “${escapeHtml(state.q)}”` : ''}.</p>
                        <a class="btn btn-outline btn-sm" href="${waLink(`Hi Sky Smart! I'm looking for ${state.q || 'a pair of shoes'}. Do you have it?`)}" target="_blank" rel="noopener">Ask us on WhatsApp</a></div>`;
                if (countEl) countEl.textContent = `${list.length} ${list.length === 1 ? 'product' : 'products'}`;
            }

            if (toolbar) {
                const chips = $('.chips', toolbar);
                if (chips) {
                    chips.innerHTML = [{ id: 'all', label: 'All' }, ...catalog.categories]
                        .map((c) => `<button type="button" class="chip" data-cat="${c.id}" aria-pressed="false">${escapeHtml(c.label)}</button>`).join('');
                    const sync = () => $$('.chip', chips).forEach((c) => {
                        const on = c.dataset.cat === state.category;
                        c.classList.toggle('active', on);
                        c.setAttribute('aria-pressed', on ? 'true' : 'false');
                    });
                    chips.addEventListener('click', (e) => {
                        const c = e.target.closest('.chip');
                        if (!c) return;
                        state.category = c.dataset.cat;
                        sync();
                        render();
                    });
                    sync();
                }
                const search = $('[data-search]', toolbar);
                if (search) {
                    search.value = state.q;
                    search.addEventListener('input', () => { state.q = search.value.trim(); render(); });
                }
                const sort = $('[data-sort]', toolbar);
                if (sort) sort.addEventListener('change', () => { state.sort = sort.value; render(); });
            }

            grid.addEventListener('click', (e) => {
                const b = e.target.closest('[data-open]');
                if (b) openProduct(b.dataset.open);
            });
            render();
        });
    }

    // ---------- Reveal on scroll ----------
    function setupReveal() {
        const els = $$('.reveal');
        if (!('IntersectionObserver' in window)) {
            els.forEach((el) => el.classList.add('in'));
            return;
        }
        const io = new IntersectionObserver((entries) => entries.forEach((en) => {
            if (en.isIntersecting) {
                en.target.classList.add('in');
                io.unobserve(en.target);
            }
        }), { threshold: 0.12, rootMargin: '0px 0px -40px 0px' });
        els.forEach((el) => io.observe(el));
    }

    // ---------- Founder dialog ----------
    function setupDialogs() {
        $$('[data-dialog-open]').forEach((b) => b.addEventListener('click', () => {
            const d = document.getElementById(b.dataset.dialogOpen);
            if (d && typeof d.showModal === 'function') d.showModal();
        }));
        $$('dialog[data-closable]').forEach((d) => {
            d.addEventListener('click', (e) => { if (e.target === d || e.target.closest('[data-dialog-close]')) d.close(); });
        });
    }

    function init() {
        setupHeader();
        setupGrids();
        setupReveal();
        setupDialogs();
        $$('[data-year]').forEach((el) => { el.textContent = new Date().getFullYear(); });
        // Open the bag directly via #bag (e.g. from another page)
        if (location.hash === '#bag') openBag();
    }

    window.SkyShop = { catalog, bag: bagApi, money, escapeHtml, waLink, toast, openProduct, openBag, closeBag, categoryLabel };

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();
})();
