/**
 * LocalStorage wishlist — listing pages + wishlist.html only.
 * No Firebase.
 */
(function () {
    'use strict';

    var STORAGE_KEY = 'wishlist';

    var CATEGORY_BY_PAGE = {
        'men.html': 'Men',
        'women.html': 'Women',
        'handbags.html': 'Handbags',
        'shoes.html': 'Shoes',
        'watches.html': 'Watches',
        'jewellery.html': 'Jewellery'
    };

    function safeDetailHref(href) {
        if (!href || typeof href !== 'string') return '#';
        var t = href.trim();
        if (/^javascript:/i.test(t) || t.indexOf('<') !== -1) return '#';
        return t;
    }

    function categoryFromPath() {
        var file = (window.location.pathname.split('/').pop() || '').toLowerCase();
        return CATEGORY_BY_PAGE[file] || 'Products';
    }

    function normalizeStoredItem(item, index) {
        if (!item || typeof item !== 'object') return null;
        var title = String(item.title != null ? item.title : item.name || '').trim();
        var price = String(item.price != null ? item.price : '').trim();
        var image = String(item.image || '').trim();
        var detailHref = safeDetailHref(item.detailHref || '');
        var category = String(item.category || '').trim();
        var key = item.key != null ? String(item.key).trim() : '';
        if (!key) {
            var m = /[?&]id=([^&]+)/.exec(detailHref);
            if (m) key = decodeURIComponent(m[1]);
        }
        if (!key && title) key = 'legacy-' + index + '-' + title.replace(/\s+/g, '-').slice(0, 48);
        if (!title || !key) return null;
        return { key: key, title: title, price: price, image: image, category: category, detailHref: detailHref || '#' };
    }

    function getWishlist() {
        try {
            var raw = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
            if (!Array.isArray(raw)) return [];
            var out = [];
            var seen = {};
            for (var i = 0; i < raw.length; i++) {
                var n = normalizeStoredItem(raw[i], i);
                if (n && !seen[n.key]) {
                    seen[n.key] = true;
                    out.push(n);
                }
            }
            return out;
        } catch (e) {
            return [];
        }
    }

    function saveWishlist(items) {
        if (!Array.isArray(items)) return;
        localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
        try {
            window.dispatchEvent(new CustomEvent('wishlist-changed'));
        } catch (err) { /* ignore */ }
    }

    function isWishlisted(productKey) {
        if (!productKey) return false;
        var k = String(productKey);
        var list = getWishlist();
        for (var i = 0; i < list.length; i++) {
            if (list[i].key === k) return true;
        }
        return false;
    }

    function addToWishlist(productData) {
        if (!productData || !productData.key) return getWishlist();
        var list = getWishlist();
        for (var i = 0; i < list.length; i++) {
            if (list[i].key === productData.key) return list;
        }
        list.push({
            key: String(productData.key),
            title: String(productData.title || ''),
            price: String(productData.price || ''),
            image: String(productData.image || ''),
            category: String(productData.category || ''),
            detailHref: safeDetailHref(productData.detailHref) || '#'
        });
        saveWishlist(list);
        return list;
    }

    function removeFromWishlist(productKey) {
        if (!productKey) return getWishlist();
        var k = String(productKey);
        var list = getWishlist().filter(function (item) {
            return item.key !== k;
        });
        saveWishlist(list);
        return list;
    }

    function toggleWishlist(productData) {
        if (!productData || !productData.key) return false;
        if (isWishlisted(productData.key)) {
            removeFromWishlist(productData.key);
            return false;
        }
        addToWishlist(productData);
        return true;
    }

    function parseProductFromCard(card) {
        var key = (card.getAttribute('data-product-id') || '').trim();
        if (!key) {
            try {
                var u = new URL(card.getAttribute('href') || '', window.location.href);
                key = u.searchParams.get('id') || '';
            } catch (e) {
                key = '';
            }
        }
        var titleEl = card.querySelector('.product-name');
        var priceEl = card.querySelector('.product-price');
        var imgEl = card.querySelector('.product-image');
        var title = titleEl ? titleEl.textContent.trim() : '';
        var price = priceEl ? priceEl.textContent.trim() : '';
        var image = imgEl ? (imgEl.getAttribute('src') || '').trim() : '';
        var detailHref = (card.getAttribute('href') || '').trim();
        return {
            key: key,
            title: title,
            price: price,
            image: image,
            category: categoryFromPath(),
            detailHref: detailHref
        };
    }

    function heartSvg() {
        return '<svg class="wishlist-heart-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M12.1 21.35l-1.1-1.02C5.14 14.88 2 11.98 2 8.5 2 5.91 3.99 4 6.5 4c1.74 0 3.41.81 4.5 2.09C12.09 4.81 13.76 4 15.5 4 18.01 4 20 5.91 20 8.5c0 3.48-3.14 6.38-8.9 11.83l-1.0 1.02z"/></svg>';
    }

    function setHeartPressed(btn, pressed) {
        btn.setAttribute('aria-pressed', pressed ? 'true' : 'false');
        btn.setAttribute('aria-label', pressed ? 'Remove from favourites' : 'Add to favourites');
    }

    function updateAllListingHearts() {
        document.querySelectorAll('.wishlist-heart-btn[data-wishlist-key]').forEach(function (btn) {
            var key = btn.getAttribute('data-wishlist-key');
            setHeartPressed(btn, isWishlisted(key));
        });
    }

    function initListingWishlist() {
        var grid = document.querySelector('main.handbag-grid-container');
        if (!grid) return;

        var cards = grid.querySelectorAll(':scope > a.product-card');
        cards.forEach(function (card) {
            if (card.closest('.product-card-shell')) return;

            var data = parseProductFromCard(card);
            if (!data.key) return;

            var shell = document.createElement('div');
            shell.className = 'product-card-shell';
            card.parentNode.insertBefore(shell, card);
            shell.appendChild(card);

            var btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'wishlist-heart-btn';
            btn.setAttribute('data-wishlist-key', data.key);
            btn.innerHTML = heartSvg();
            setHeartPressed(btn, isWishlisted(data.key));

            btn.addEventListener('click', function (e) {
                e.preventDefault();
                e.stopPropagation();
                var d = parseProductFromCard(card);
                if (!d.key) return;
                var nowOn = toggleWishlist(d);
                setHeartPressed(btn, nowOn);
            });

            shell.appendChild(btn);
        });

        window.addEventListener('wishlist-changed', updateAllListingHearts);
        window.addEventListener('storage', function (e) {
            if (e.key === STORAGE_KEY) updateAllListingHearts();
        });
    }

    function renderWishlistPage() {
        var pageContent = document.querySelector('.page-content');
        if (!pageContent) return;

        var items = getWishlist();
        var existingList = document.getElementById('wishlist-list');
        if (existingList) existingList.remove();

        var emptyState = pageContent.querySelector('.empty-state');
        if (items.length === 0) {
            if (emptyState) emptyState.style.display = '';
            return;
        }

        if (emptyState) emptyState.style.display = 'none';

        var listWrapper = document.createElement('div');
        listWrapper.id = 'wishlist-list';
        listWrapper.className = 'orders-list';

        items.forEach(function (item) {
            var row = document.createElement('div');
            row.className = 'order-item';

            var img = document.createElement('img');
            img.className = 'order-item-image';
            img.src = item.image || '';
            img.alt = item.title || '';

            var details = document.createElement('div');
            details.className = 'order-item-details';

            var href = safeDetailHref(item.detailHref);
            var titleEl;
            if (href !== '#') {
                titleEl = document.createElement('a');
                titleEl.href = href;
                titleEl.className = 'order-item-name';
            } else {
                titleEl = document.createElement('h3');
                titleEl.className = 'order-item-name';
            }
            titleEl.textContent = item.title || '';

            details.appendChild(titleEl);

            if (item.category) {
                var meta = document.createElement('p');
                meta.className = 'order-item-meta';
                meta.textContent = item.category;
                details.appendChild(meta);
            }

            var priceP = document.createElement('p');
            priceP.className = 'order-item-line-total';
            priceP.textContent = item.price || '';
            details.appendChild(priceP);

            var removeBtn = document.createElement('button');
            removeBtn.type = 'button';
            removeBtn.className = 'wishlist-remove-btn';
            removeBtn.setAttribute('data-wishlist-key', item.key);
            removeBtn.textContent = 'Remove';

            row.appendChild(img);
            row.appendChild(details);
            row.appendChild(removeBtn);
            listWrapper.appendChild(row);
        });

        pageContent.appendChild(listWrapper);
    }

    function initWishlistPage() {
        var pageContent = document.querySelector('.page-content');
        if (!pageContent) return;

        pageContent.addEventListener('click', function (event) {
            var removeBtn = event.target.closest('.wishlist-remove-btn[data-wishlist-key]');
            if (!removeBtn) return;
            var key = removeBtn.getAttribute('data-wishlist-key');
            if (key) removeFromWishlist(key);
        });

        window.addEventListener('storage', function (e) {
            if (e.key === STORAGE_KEY) renderWishlistPage();
        });

        window.addEventListener('wishlist-changed', function () {
            renderWishlistPage();
        });

        renderWishlistPage();
    }

    window.getWishlist = getWishlist;
    window.saveWishlist = saveWishlist;
    window.isWishlisted = isWishlisted;
    window.addToWishlist = addToWishlist;
    window.removeFromWishlist = removeFromWishlist;
    window.toggleWishlist = toggleWishlist;

    document.addEventListener('DOMContentLoaded', function () {
        initListingWishlist();
        if (document.body.getAttribute('data-wishlist-page') === 'true') {
            initWishlistPage();
        }
    });
})();
