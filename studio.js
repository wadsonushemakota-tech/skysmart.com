/**
 * Project, website and sponsorship requests: any [data-service] link opens a form; the request is
 * sent to Sky Smart on WhatsApp or by email (nothing is stored on the server).
 */
(function () {
    const { escapeHtml, waLink, catalog, toast } = window.SkyShop;
    const biz = catalog.business;
    // Each group adapts the form wording; the service name is what the customer sees in the dropdown
    const GROUPS = [
        {
            kind: 'design', label: 'Design & print',
            services: ['T-shirt printing', 'Logo design', 'Brand identity', 'Social media', 'Posters & flyers', 'Packaging'],
            eyebrow: 'Sky Smart Design Studio', title: 'Tell us about your project',
            lead: "Describe what you have in mind and we'll reply with ideas and a quote.",
            placeholder: 'e.g. 20 navy T-shirts with our church logo on the front and a verse on the back',
            amountLabel: 'Quantity', amountPlaceholder: 'e.g. 20', intro: "I'd like to request",
        },
        {
            kind: 'digital', label: 'Websites & apps',
            services: ['Website', 'Online shop', 'Web application', 'Data & analytics', 'Other project'],
            eyebrow: 'Sky Smart Digital', title: 'Tell us about your website or app',
            lead: "What should it do, and who is it for? We'll reply with a plan, timeline and quote.",
            placeholder: 'e.g. A website for my salon with our services, prices, photos and WhatsApp booking',
            amountLabel: 'Budget', amountPlaceholder: 'e.g. $150', intro: "I'd like to start a project",
        },
        {
            kind: 'sponsor', label: 'Partnership',
            services: ['Sponsorship', 'Brand partnership'],
            eyebrow: 'Partner with Sky Smart', title: 'Sponsor or partner with us',
            lead: "Thank you for your interest! Tell us how you'd like to support or work with Sky Smart.",
            placeholder: 'e.g. I would like to sponsor kits for a community football team / partner on a promotion',
            amountLabel: 'Support amount', amountPlaceholder: 'e.g. $50 or in-kind', intro: "I'm interested in",
        },
    ];
    const groupOf = (service) => GROUPS.find((g) => g.services.includes(service)) || GROUPS[1];
    const $ = (sel, root = document) => root.querySelector(sel);
    let dlg = null;

    function build() {
        dlg = document.createElement('dialog');
        dlg.className = 'qv project-dlg';
        dlg.setAttribute('aria-labelledby', 'project-title');
        dlg.innerHTML = `
            <button type="button" class="dialog-close" aria-label="Close"><ion-icon name="close"></ion-icon></button>
            <div class="project-grid">
                <form class="project-form" novalidate>
                    <span class="eyebrow" id="p-eyebrow"></span>
                    <h2 id="project-title"></h2>
                    <p class="project-lead" id="p-lead"></p>
                    <div class="field">
                        <label for="p-service">What can we help with?</label>
                        <select id="p-service" name="service">${GROUPS.map((g) => `<optgroup label="${escapeHtml(g.label)}">${g.services.map((s) => `<option>${escapeHtml(s)}</option>`).join('')}</optgroup>`).join('')}</select>
                    </div>
                    <div class="field">
                        <label for="p-desc">What would you like?</label>
                        <textarea id="p-desc" name="description" rows="4" maxlength="1500" required></textarea>
                    </div>
                    <div class="field-row">
                        <div class="field">
                            <label for="p-qty"><span id="p-qty-label">Quantity</span> <span class="opt">(optional)</span></label>
                            <input id="p-qty" name="quantity" maxlength="40">
                        </div>
                        <div class="field">
                            <label for="p-date">Needed by <span class="opt">(optional)</span></label>
                            <input id="p-date" name="deadline" type="date">
                        </div>
                    </div>
                    <div class="field-row">
                        <div class="field">
                            <label for="p-name">Your name</label>
                            <input id="p-name" name="name" autocomplete="name" maxlength="60" required>
                        </div>
                        <div class="field">
                            <label for="p-phone">Phone <span class="opt">(optional)</span></label>
                            <input id="p-phone" name="phone" type="tel" autocomplete="tel" maxlength="30">
                        </div>
                    </div>
                    <div class="alert alert-error" role="alert" hidden></div>
                    <div class="project-send">
                        <button type="submit" class="btn btn-wa" data-via="whatsapp"><ion-icon name="logo-whatsapp"></ion-icon> Send on WhatsApp</button>
                        <button type="submit" class="btn btn-outline" data-via="email"><ion-icon name="mail-outline"></ion-icon> Send by email</button>
                    </div>
                    <p class="field-hint" style="margin-top:12px">Have a logo, photos or examples you like? Attach them in the WhatsApp chat after sending.</p>
                </form>
                <aside class="project-aside">
                    <img src="images/crest-mark.png" alt="" width="64" height="56">
                    <h3>Prefer to talk?</h3>
                    <p>Call or message us directly. We're happy to help you shape your idea.</p>
                    <a class="project-contact" href="tel:+263777076575"><ion-icon name="call-outline"></ion-icon><span><strong>Call us</strong>${escapeHtml(biz.phoneDisplay)}</span></a>
                    <a class="project-contact" href="https://wa.me/${biz.whatsapp}" target="_blank" rel="noopener"><ion-icon name="logo-whatsapp"></ion-icon><span><strong>WhatsApp</strong>${escapeHtml(biz.phoneDisplay)}</span></a>
                    <a class="project-contact" href="mailto:${escapeHtml(biz.email)}"><ion-icon name="mail-outline"></ion-icon><span><strong>Email</strong>${escapeHtml(biz.email)}</span></a>
                    <p class="project-where"><ion-icon name="location-outline"></ion-icon> ${escapeHtml(biz.city)}</p>
                </aside>
            </div>`;
        document.body.appendChild(dlg);

        $('.dialog-close', dlg).addEventListener('click', () => dlg.close());
        dlg.addEventListener('click', (e) => { if (e.target === dlg) dlg.close(); });

        const form = $('form', dlg);
        const error = $('.alert', form);
        form.elements.service.addEventListener('change', applyGroup);
        // Remember name/phone from checkout or a previous request
        try {
            const saved = JSON.parse(localStorage.getItem('skySmartCustomer') || 'null');
            if (saved) {
                form.elements.name.value = saved.name || '';
                form.elements.phone.value = saved.phone || '';
            }
        } catch (e) { /* ignore */ }

        form.addEventListener('submit', (e) => {
            e.preventDefault();
            const f = form.elements;
            const description = f.description.value.trim();
            const name = f.name.value.trim();
            if (!description || !name) {
                error.innerHTML = '<ion-icon name="alert-circle"></ion-icon><div>Please describe what you need and add your name.</div>';
                error.hidden = false;
                (description ? f.name : f.description).focus();
                return;
            }
            error.hidden = true;
            const deadline = f.deadline.value
                ? new Date(f.deadline.value + 'T00:00').toLocaleDateString([], { day: 'numeric', month: 'long', year: 'numeric' })
                : '';
            const g = groupOf(f.service.value);
            const details = [
                f.quantity.value.trim() ? `${g.amountLabel}: ${f.quantity.value.trim()}` : '',
                deadline ? `Needed by: ${deadline}` : '',
                `Name: ${name}`,
                f.phone.value.trim() ? `Phone: ${f.phone.value.trim()}` : '',
            ].filter(Boolean);
            const text = [`Hi Wadson! ${g.intro}: ${f.service.value}`, description, details.join('\n')].join('\n\n');
            const via = (e.submitter && e.submitter.dataset.via) || 'whatsapp';
            if (via === 'email') {
                window.location.href = `mailto:${biz.email}?subject=${encodeURIComponent(`${g.label} request: ${f.service.value}`)}&body=${encodeURIComponent(text)}`;
            } else {
                window.open(waLink(text), '_blank', 'noopener');
            }
            dlg.close();
            toast('Thanks! Your request is ready to send.');
        });
    }

    // Match the form wording to the chosen service
    function applyGroup() {
        const g = groupOf($('#p-service', dlg).value);
        $('#p-eyebrow', dlg).textContent = g.eyebrow;
        $('#project-title', dlg).textContent = g.title;
        $('#p-lead', dlg).textContent = g.lead;
        $('#p-desc', dlg).placeholder = g.placeholder;
        $('#p-qty-label', dlg).textContent = g.amountLabel;
        $('#p-qty', dlg).placeholder = g.amountPlaceholder;
    }

    function open(service) {
        if (!dlg) build();
        const select = $('#p-service', dlg);
        select.value = GROUPS.some((g) => g.services.includes(service)) ? service : 'Other project';
        applyGroup();
        $('.alert', dlg).hidden = true;
        if (typeof dlg.showModal === 'function') dlg.showModal();
        else dlg.setAttribute('open', '');
        $('#p-desc', dlg).focus();
    }

    // Copy buttons (e.g. EcoCash / bank numbers in the sponsor section)
    document.addEventListener('click', (e) => {
        const b = e.target.closest('[data-copy]');
        if (!b) return;
        const value = b.dataset.copy;
        const ask = () => window.prompt('Copy this:', value);
        if (navigator.clipboard) navigator.clipboard.writeText(value).then(() => toast(`Copied ${value}`), ask);
        else ask();
    });

    document.addEventListener('click', (e) => {
        const card = e.target.closest('[data-service]');
        if (!card) return;
        e.preventDefault();
        open(card.dataset.service);
    });

    window.SkyStudio = { open };
})();
