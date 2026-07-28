document.addEventListener('DOMContentLoaded', () => {
    const searchInput = document.getElementById('search-input');
    const searchResultsContainer = document.getElementById('search-results');
    const noResultsMessage = document.getElementById('no-results-message');

    const categoryMap = {
        'bag': 'handbags',
        'men': 'men',
        'woman': 'women',
        'watch': 'watches',
        'shoe': 'shoes',
        'ring': 'jewellery'
    };

    function renderProductCard(product, productId) {
        return `
            <a href="product-detail.html?id=${productId}" class="product-card" data-product-id="${productId}">
                <div class="product-image-wrapper">
                    <img src="${product.images[0]}" alt="${product.name}" class="product-image" onerror="this.onerror=null; this.src='../images/placeholder.png'; console.error('Image failed to load:', this.src);">
                </div>
                <div class="product-info">
                    <h3 class="product-name">${product.name}</h3>
                    <p class="product-price">${product.price}</p>
                </div>
            </a>
        `;
    }

    function performSearch(query) {
        searchResultsContainer.innerHTML = '';
        noResultsMessage.style.display = 'none';

        if (!query) {
            return; // Don't show results for empty query
        }

        const lowerCaseQuery = query.toLowerCase();
        const allProducts = window.products; // Access the globally accessible products object
        let foundProducts = [];

        for (const productId in allProducts) {
            const product = allProducts[productId];
            const productCategoryPrefix = productId.split('-')[0];
            const categoryName = categoryMap[productCategoryPrefix] || productCategoryPrefix; // Fallback to prefix if not in map

            if (product.name.toLowerCase().includes(lowerCaseQuery) ||
                categoryName.toLowerCase().includes(lowerCaseQuery)) {
                foundProducts.push({ id: productId, data: product });
            }
        }

        if (foundProducts.length > 0) {
            foundProducts.forEach(item => {
                searchResultsContainer.innerHTML += renderProductCard(item.data, item.id);
            });
        } else {
            noResultsMessage.style.display = 'block';
        }
    }

    searchInput.addEventListener('input', (event) => {
        performSearch(event.target.value);
    });

    // Initial search if there's a query in the URL (e.g., from external link)
    const urlParams = new URLSearchParams(window.location.search);
    const initialQuery = urlParams.get('query');
    if (initialQuery) {
        searchInput.value = initialQuery;
        performSearch(initialQuery);
    }
});
