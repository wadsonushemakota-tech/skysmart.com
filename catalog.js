/**
 * Sky Smart product catalogue: the single source of truth for products and prices.
 * Loaded by the pages (window.SKY_SMART_CATALOG) and by server.js (require) so order
 * totals are always computed from these prices, never from what the browser sends.
 *
 * To add a product: copy an entry, give it a new unique id, and put its photo in images/shop/.
 */
(function (root, factory) {
    const catalog = factory();
    if (typeof module === 'object' && module.exports) module.exports = catalog;
    else root.SKY_SMART_CATALOG = catalog;
})(typeof self !== 'undefined' ? self : this, function () {
    const SHOE_SIZES = ['6', '7', '8', '9', '10', '11', '12'];

    const categories = [
        { id: 'jordans', label: 'Jordans' },
        { id: 'nike', label: 'Nike' },
        { id: 'adidas', label: 'Adidas' },
        { id: 'sneakers', label: 'Sneakers' },
        { id: 'lifestyle', label: 'Lifestyle' },
    ];

    // `tags` are extra categories a product appears under when filtering
    const products = [
        { id: 'air-jordan-4', name: 'Air Jordan 4', price: 20, category: 'jordans', tags: ['sneakers', 'lifestyle'], image: 'images/shop/air-jordan-4.jpg', featured: true },
        { id: 'air-force-1-plain-white', name: 'Air Force 1 Plain White', price: 18, category: 'nike', tags: ['sneakers', 'lifestyle'], image: 'images/shop/air-force-1-plain-white.jpg', featured: true },
        { id: 'jordan-1', name: 'Jordan 1', price: 15, category: 'jordans', tags: ['sneakers'], image: 'images/shop/jordan-1.jpg', featured: true },
        { id: 'jordan-3', name: 'Jordan 3', price: 18, category: 'jordans', tags: ['sneakers'], image: 'images/shop/jordan-3.jpg', featured: true },
        { id: 'jordan-black-red', name: 'Jordan Black & Red', price: 18, category: 'jordans', tags: ['sneakers'], image: 'images/shop/jordan-black-red.avif', featured: true },
        { id: 'jordan-4-pinky', name: 'Jordan 4 Pinky', price: 20, category: 'jordans', tags: ['sneakers'], image: 'images/shop/jordan-4-pinky.jpg', featured: true },
        { id: 'nike-sb-dunk-red', name: 'Nike SB Dunk Red', price: 18, category: 'nike', tags: ['sneakers', 'lifestyle'], image: 'images/shop/nike-sb-dunk-red.jpg', featured: true },
        { id: 'nike-sb-dunk-black', name: 'Nike SB Dunk Black', price: 15, category: 'nike', tags: ['sneakers', 'lifestyle'], image: 'images/shop/nike-sb-dunk-black.jpg', featured: true },
        { id: 'nike-sb-dunk', name: 'Nike SB Dunk', price: 12, category: 'nike', tags: ['sneakers', 'lifestyle'], image: 'images/shop/nike-sb-dunk.jpg' },
        { id: 'air-force-1-pastel', name: 'Air Force 1', price: 10, category: 'nike', tags: ['sneakers', 'lifestyle'], image: 'images/shop/air-force-1-pastel.avif' },
        { id: 'air-force-1-black', name: 'Air Force 1 Black', price: 18, category: 'nike', tags: ['sneakers', 'lifestyle'], image: 'images/shop/air-force-1-black.jpg' },
        { id: 'reebok', name: 'Reebok', price: 25, category: 'sneakers', tags: ['lifestyle'], image: 'images/shop/reebok.jpg' },
        { id: 'fila', name: 'FILA', price: 18, category: 'sneakers', tags: ['lifestyle'], image: 'images/shop/fila.jpg' },
        { id: 'adidas', name: 'Adidas', price: 18, category: 'adidas', tags: ['sneakers', 'lifestyle'], image: 'images/shop/adidas.jpg' },
        { id: 'lv-original-quality', name: 'LV Original Quality', price: 18, category: 'lifestyle', tags: [], image: 'images/shop/lv-original-quality.jpg' },
    ].map((p) => ({ sizes: SHOE_SIZES, currency: 'USD', ...p }));

    const business = {
        name: 'Sky Smart',
        whatsapp: '263777076575',
        phoneDisplay: '+263 77 707 6575',
        email: 'wadsonushemakota@gmail.com',
        city: 'Bulawayo, Zimbabwe',
        payment: {
            ecocash: { number: '0777076575', name: 'Wadson Ushemakota' },
            bank: {
                accountName: 'Wadson Ushemakota',
                bank: 'BancABC',
                branchCode: 'K53',
                usdAccount: '92351448402134',
                zwgAccount: '92351443311235',
            },
        },
    };

    const byId = Object.fromEntries(products.map((p) => [p.id, p]));
    return { categories, products, byId, business };
});
