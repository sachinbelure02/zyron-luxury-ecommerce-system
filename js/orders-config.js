(function () {
    var h = window.location.hostname;
    window.TMV_PAYMENT_API_BASE = h
        ? window.location.protocol + '//' + h + ':3000'
        : 'http://127.0.0.1:3000';
})();
