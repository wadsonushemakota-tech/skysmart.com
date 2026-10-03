/**
 * Design Studio project requests: any [data-service] card opens a form; the request is sent
 * to Sky Smart on WhatsApp or by email (nothing is stored on the server).
 */
(function () {
    const { escapeHtml, waLink, catalog, toast } = window.SkyShop;
    const biz = catalog.business;
    const SERVICES = ['T-shirt printing', 'Logo design', 'Brand identity', 'Social media', 'Posters & flyers', 'Packaging', 'Something else'];
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
                    <span class="eyebrow">Sky Smart Design Studio</span>
                    <h2 id="project-title">Tell us about your project</h2>
                    <p class="project-lead">Describe what you have in mind and we'll reply with ideas and a quote.</p>
                    <div class="field">
                        <label for="p-service">Service</label>
                        <select id="p-service" name="service">${SERVICES.map((s) => `<option>${escapeHtml(s)}</option>`).join('')}</select>
                    </div>
                    <div class="field">
                        <label for="p-desc">What would you like?</label>
                        <textarea id="p-desc" name="description" rows="4" maxlength="1500" required
                            placeholder="e.g. 20 navy T-shirts with our church logo on the front and a verse on the back"></textarea>
                    </div>
                    <div class="field-row">
                        <div class="field">
                            <label for="p-qty">Quantity <span class="opt">(optional)</span></label>
                            <input id="p-qty" name="quantity" inputmode="numeric" maxlength="20" placeholder="e.g. 20">
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
                    <p class="field-hint" style="margin-top:12px">Have a logo or reference photo? Attach it in the WhatsApp chat after sending.</p>
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
            const text = [
                `Hi Sky Smart! I'd like to request: ${f.service.value}`,
                '',
                description,
                '',
                f.quantity.value.trim() ? `Quantity: ${f.quantity.value.trim()}` : '',
                deadline ? `Needed by: ${deadline}` : '',
                `Name: ${name}`,
                f.phone.value.trim() ? `Phone: ${f.phone.value.trim()}` : '',
            ].join('\n').replace(/\n{3,}/g, '\n\n').trim();
            const via = (e.submitter && e.submitter.dataset.via) || 'whatsapp';
            if (via === 'email') {
                window.location.href = `mailto:${biz.email}?subject=${encodeURIComponent('Design request: ' + f.service.value)}&body=${encodeURIComponent(text)}`;
            } else {
                window.open(waLink(text), '_blank', 'noopener');
            }
            dlg.close();
            toast('Thanks! Your request is ready to send.');
        });
    }

    function open(service) {
        if (!dlg) build();
        const select = $('#p-service', dlg);
        select.value = SERVICES.includes(service) ? service : 'Something else';
        $('.alert', dlg).hidden = true;
        if (typeof dlg.showModal === 'function') dlg.showModal();
        else dlg.setAttribute('open', '');
        $('#p-desc', dlg).focus();
    }

    document.addEventListener('click', (e) => {
        const card = e.target.closest('[data-service]');
        if (!card) return;
        e.preventDefault();
        open(card.dataset.service);
    });

    window.SkyStudio = { open };
})();
