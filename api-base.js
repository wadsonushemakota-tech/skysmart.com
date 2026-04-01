(function (w) {
    var raw =
        typeof w.__SKY_SMART_API_ORIGIN__ !== 'undefined' ? w.__SKY_SMART_API_ORIGIN__ : '';
    raw = String(raw || '')
        .trim()
        .replace(/\/+$/, '');
    w.skySmartApiOrigin = raw;
    w.skySmartApiUrl = function (path) {
        path = path || '/';
        if (path.charAt(0) !== '/') path = '/' + path;
        return raw + path;
    };
    w.skySmartAssetUrl = function (url) {
        if (url == null || url === '') return url;
        url = String(url);
        if (/^https?:\/\//i.test(url) || url.indexOf('data:') === 0 || url.indexOf('blob:') === 0) {
            return url;
        }
        if (url.charAt(0) !== '/') return w.skySmartApiUrl('/' + url);
        return w.skySmartApiUrl(url);
    };
})(window);
