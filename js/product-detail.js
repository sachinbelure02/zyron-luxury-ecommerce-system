document.addEventListener('DOMContentLoaded', () => {
    const imageGallery = document.getElementById('image-gallery'); // Changed ID
    const productName = document.querySelector('.product-info-details .product-name');
    const productPrice = document.querySelector('.product-info-details .product-price');
    const productDescription = document.querySelector('.product-info-details .product-description');
    const addToCartBtn = document.querySelector('.product-info-details .add-to-cart-btn');
    const ordersIcon = document.querySelector('.nav-right a[href="orders.html"]');
    const flyToOrdersAnimation = document.getElementById('fly-to-orders-animation');
    const orderToast = document.getElementById('order-toast');

    const urlParams = new URLSearchParams(window.location.search);
    const rawProductId = urlParams.get('id'); // Get the raw ID

    // Define product data
    const products = {
        // Handbag Products
        'bag-1': {
            name: "Elegant Leather Handbag",
            price: "₹ 12,999",
            description: "A structured everyday silhouette with a refined finish—designed for effortless elegance. Crafted from premium Italian leather with polished hardware and a secure zip closure. Features a spacious main compartment and an interior zip pocket.",
            images: ['../images/Bag-11.png', '../images/Bag-12.png', '../images/Bag-13.png', '../images/Bag-14.png']
        },
        'bag-2': {
            name: "Stylish Shoulder Bag",
            price: "₹ 15,499",
            description: "A modern classic with soft structure and clean lines—made to elevate every look. Features an adjustable shoulder strap, magnetic snap closure, and multiple interior pockets. Perfect for day-to-night wear.",
            images: ['../images/Bag-21.png', '../images/Bag-22.png', '../images/Bag-23.png', '../images/Bag-24.png']
        },
        'bag-3': {
            name: "Classic Tote Bag",
            price: "₹ 18,999",
            description: "A statement piece with polished details—crafted for day-to-night versatility. Spacious interior with a secure top zip, and comfortable shoulder straps. Made from durable, textured leather.",
            images: ['../images/Bag-31.png', '../images/Bag-32.png', '../images/Bag-33.png', '../images/Bag-34.png']
        },
        'bag-4': {
            name: "Urban Chic Backpack",
            price: "₹ 14,799",
            description: "Understated luxury with a confident silhouette—crafted for refined everyday wear. This versatile backpack features a sleek design, multiple compartments, and padded straps for comfort. Ideal for both work and travel.",
            images: ['../images/Bag-41.png', '../images/Bag-42.png', '../images/Bag-43.png', '../images/Bag-44.png']
        },
        'bag-5': {
            name: "Minimalist Crossbody Bag",
            price: "₹ 11,999",
            description: "A compact icon with refined proportions—minimal, polished, and effortlessly chic. Perfect for carrying your essentials with ease. Features a discreet magnetic closure and an adjustable strap.",
            images: ['../images/Bag-51.png', '../images/Bag-52.png', '../images/Bag-53.png']
        },
        'bag-6': {
            name: "Designer Evening Clutch",
            price: "₹ 19,499",
            description: "A bold silhouette with a refined finish—crafted to stand out, designed to last. This elegant clutch features exquisite detailing and a secure closure. Perfect for special occasions and evening events.",
            images: ['../images/Bag-61.png', '../images/Bag-62.png', '../images/Bag-63.png', '../images/Bag-64.png']
        },

        // Men's Products (IDs men-1 to men-11)
        'men-1': {
            name: "Linear Tweed Jacket",
            price: "₹ 1,200",
            description: "A stylish men's shirt for all occasions.",
            images: ['../images/men-11.png', '../images/men-12.png', '../images/men-13.png', '../images/men-14.png']
        },
        'men-2': {
            name: "Essential Sand T-Shirt",
            price: "₹ 3,500",
            description: "A versatile jacket for any weather.",
            images: ['../images/men-21.png', '../images/men-22.png', '../images/men-23.png', '../images/men-24.png']
        },
        'men-3': {
            name: "Classic Logo Sweatshirt",
            price: "₹ 2,800",
            description: "Comfortable and trendy shoes for daily wear.",
            images: ['../images/men-31.png', '../images/men-32.png', '../images/men-33.png', '../images/men-34.png']
        },
        'men-4': {
            name: "Cream Harrington Jacket",
            price: "₹ 7,500",
            description: "A classic timepiece for the modern man.",
            images: ['../images/men-41.png', '../images/men-42.png', '../images/men-43.png', '../images/men-44.png']
        },
        'men-5': {
            name: "Modern Trench Coat",
            price: "₹ 4,000",
            description: "A durable and spacious backpack for all your essentials.",
            images: ['../images/men-51.png', '../images/men-52.png', '../images/men-53.png', '../images/men-54.png']
        },
        'men-6': {
            name: "Tropical Print Shirt",
            price: "₹ 2,100",
            description: "Comfortable and stylish jeans for everyday.",
            images: ['../images/men-61.png', '../images/men-62.png', '../images/men-63.png', '../images/men-64.png']
        },
        'men-7': {
            name: "Navy Quilted Jacket",
            price: "₹ 5,000",
            description: "A comfortable and casual t-shirt.",
            images: ['../images/men-71.png', '../images/men-72.png', '../images/men-73.png', '../images/men-74.png']
        },
        'men-8': {
            name: "Essential Nylon Shirt",
            price: "₹ 4,200",
            description: "A robust jacket for outdoor adventures.",
            images: ['../images/men-81.png', '../images/men-82.png', '../images/men-83.png', '../images/men-84.png']
        },
        'men-9': {
            name: "Heritage Check Shirt",
            price: "₹ 3,100",
            description: "High-performance shoes for athletes.",
            images: ['../images/men-91.png', '../images/men-92.png', '../images/men-93.png', '../images/men-94.png']
        },
        'men-10': {
            name: "Denim Zip Jacket",
            price: "₹ 1,800",
            description: "A sharp formal shirt for professional settings.",
            images: ['../images/men-101.png', '../images/men-102.png', '../images/men-103.png', '../images/men-104.png']
        },
        'men-11': {
            name: "Loose-Fit Denim Pants",
            price: "₹ 1,500",
            description: "A relaxed casual shirt for weekend outings.",
            images: ['../images/men-111.png', '../images/men-112.png', '../images/men-113.png', '../images/men-114.png']
        },

        // Women's Products (IDs woman-1 to woman-9)
        'woman-1': {
            name: "Sleeveless Denim Crop Top",
            price: "₹ 2,500",
            description: "An elegant dress for any occasion.",
            images: ['../images/woman-11.png', '../images/woman-12.png', '../images/woman-13.png', '../images/woman-14.png']
        },
        'woman-2': {
            name: "Sculpted White Blazer",
            price: "₹ 1,800",
            description: "A stylish top for modern women.",
            images: ['../images/woman-21.png', '../images/woman-22.png', '../images/woman-23.png']
        },
        'woman-3': {
            name: "Pleated Ivory Culottes",
            price: "₹ 2,100",
            description: "A chic skirt for a sophisticated look.",
            images: ['../images/woman-31.png', '../images/woman-32.png', '../images/woman-33.png', '../images/woman-34.png']
        },
        'woman-4': {
            name: "Wide-Leg Folded Jeans",
            price: "₹ 4,200",
            description: "A fashionable jacket for all seasons.",
            images: ['../images/woman-41.png', '../images/woman-42.png', '../images/woman-43.png']
        },
        'woman-5': {
            name: "Denim Shirt Jacket",
            price: "₹ 3,000",
            description: "Comfortable and trendy jeans.",
            images: ['../images/woman-51.png', '../images/woman-52.png', '../images/woman-53.png']
        },
        'woman-6': {
            name: "Red Trench Dress",
            price: "₹ 3,800",
            description: "Elegant shoes for everyday wear.",
            images: ['../images/woman-61.png', '../images/woman-62.png', '../images/woman-63.png']
        },
        'woman-7': {
            name: "Sleeveless Drawstring Dress",
            price: "₹ 5,000",
            description: "A stylish handbag for essential items.",
            images: ['../images/woman-71.png', '../images/woman-72.png']
        },
        'woman-8': {
            name: "Classic Cream Overcoat",
            price: "₹ 4000",
            description: "A soft and elegant scarf.",
            images: ['../images/woman-91.png', '../images/woman-92.png', '../images/woman-93.png', '../images/woman-94.png']
        },
        'woman-9': {
            name: "Classic Dress",
            price: "₹ 1,200",
            description: "A chic hat to complete your look.",
            images: ['../images/woman-101.png', '../images/woman-102.png']
        },

        // Watches Products (IDs watch-1 to watch-3)
        'watch-1': {
            name: "Luxury Watch",
            price: "₹ 7,500",
            description: "A sophisticated timepiece for every occasion.",
            images: ['../images/watch-11.png', '../images/watch-12.png', '../images/watch-13.png', '../images/watch-14.png']
        },
        'watch-2': {
            name: "Sporty Chronograph",
            price: "₹ 9,200",
            description: "Durable and stylish, perfect for an active lifestyle.",
            images: ['../images/watch-21.png', '../images/watch-22.png']
        },
        'watch-3': {
            name: "Classic Leather Watch",
            price: "₹ 12,000",
            description: "Timeless design with a genuine leather strap.",
            images: ['../images/watch-31.png', '../images/watch-32.png']
        },

        // Shoes Products (IDs shoe-1 to shoe-8)
        'shoe-1': {
            name: "Classic Sneakers",
            price: "₹ 2,500",
            description: "Comfortable and versatile sneakers for everyday wear.",
            images: ['../images/shoes-1.png']
        },
        'shoe-2': {
            name: "The Ivory Ace Sneakers",
            price: "₹ 3,200",
            description: "High-performance running shoes for athletes.",
            images: ['../images/shoes-2.png']
        },
        'shoe-3': {
            name: "Formal Leather Shoes",
            price: "₹ 2,800",
            description: "Elegant leather shoes for formal occasions.",
            images: ['../images/shoes-3.png']
        },
        'shoe-4': {
            name: "Casual Loafers",
            price: "₹ 3,500",
            description: "Stylish and comfortable loafers for a relaxed look.",
            images: ['../images/shoes-4.png']
        },
        'shoe-5': {
            name: "The Cloud Walker",
            price: "₹ 4,100",
            description: "Trendy ankle boots for a chic and edgy style.",
            images: ['../images/shoes-5.png']
        },
        'shoe-6': {
            name: "Abyssal Flow Sneakers",
            price: "₹ 2,900",
            description: "Lightweight and comfortable sandals for summer.",
            images: ['../images/shoes-6.png']
        },
        'shoe-7': {
            name: "The Prism Luxe Sneakers",
            price: "₹ 3,800",
            description: "Stunning high heels to elevate your evening attire.",
            images: ['../images/shoes-7.png']
        },
        'shoe-8': {
            name: "Metallic Rose Sneakers",
            price: "₹ 4,500",
            description: "Warm and durable winter boots for cold weather.",
            images: ['../images/shoes-8.png']
        },

        // Jewellery Products (IDs ring-1 to ring-3)
        'ring-1': {
            name: "Diamond Band",
            price: "₹ 7,50,000",
            description: "A sparkling diamond ring for timeless elegance.",
            images: ['../images/ring-11.png', '../images/ring-12.png', '../images/ring-13.png', '../images/ring-14.png']
        },
        'ring-2': {
            name: "Silver Band",
            price: "₹ 3,50,000",
            description: "A classic gold band for everyday sophistication.",
            images: ['../images/ring-21.png', '../images/ring-22.png', '../images/ring-23.png', '../images/ring-24.png']
        },
        'ring-3': {
            name: "Gold Necklace",
            price: "₹ 5,00,000",
            description: "A sleek silver ring with a minimalist design.",
            images: ['../images/ring-31.png', '../images/ring-32.png', '../images/ring-33.png']
        }
    };
    window.products = products; // Make products object globally accessible

    let product = products[rawProductId];
    let currentProductId = rawProductId; // Use rawProductId for the modal

    console.log('DEBUG: rawProductId', rawProductId);
    console.log('DEBUG: product object', product);

    if (product) {
        productName.textContent = product.name;
        productPrice.textContent = product.price;
        productDescription.textContent = product.description;

        imageGallery.innerHTML = "";
        console.log('DEBUG: product.images array', product.images);

        // Check if the product is a shoe and has multiple images
        if (rawProductId.startsWith('shoe-')) {
            // For shoes, only display the first image
            const img = document.createElement('img');
            img.src = product.images[0];
            img.alt = product.name + ' Image 1';
            img.classList.add('product-image');
            img.onerror = function() {
                this.onerror=null;
                this.src='../images/placeholder.png';
                console.error('ERROR: Image failed to load:', this.src);
            };
            imageGallery.appendChild(img);
            console.log('DEBUG: Appended single shoe image with src:', img.src);
        } else {
            // For other products, display all images in the array
            product.images.forEach((image, index) => {
                const img = document.createElement('img');
                img.src = image;
                img.alt = product.name + ' Image ' + (index + 1);
                img.classList.add('product-image');
                img.onerror = function() {
                    this.onerror=null;
                    this.src='../images/placeholder.png';
                    console.error('ERROR: Image failed to load:', this.src);
                };
                imageGallery.appendChild(img);
                console.log('DEBUG: Appended image with src:', img.src);
            });
        }

        if (imageGallery.children.length === 0) {
            console.warn('WARNING: imageGallery is empty after attempting to append images.');
        } else {
            console.log('DEBUG: imageGallery contains', imageGallery.children.length, 'images.');
        }


        addToCartBtn.dataset.productId = rawProductId;
        addToCartBtn.dataset.productImage = product.images[0];
        addToCartBtn.dataset.productName = product.name;
        addToCartBtn.dataset.productPrice = product.price;

    } else {
        productName.textContent = "Product Not Found";
        productPrice.textContent = "";
        productDescription.textContent = "The requested product could not be found.";
        addToCartBtn.style.display = 'none';
        console.error('ERROR: Product with ID', rawProductId, 'not found in products object.');
    }

    // Cart Modal Integration (unchanged)
    const cartModal = document.getElementById('cart-modal');
    const modalCloseBtn = cartModal.querySelector('.modal-close-btn');
    const continueShoppingBtn = cartModal.querySelector('.continue-shopping-btn');
    const modalProductName = cartModal.querySelector('.modal-product-name');
    const modalProductImage = cartModal.querySelector('.modal-product-image');
    const modalProductPrice = cartModal.querySelector('.modal-product-price');
    const productQuantity = cartModal.querySelector('.product-quantity');
    const decreaseQtyBtn = cartModal.querySelector('.decrease-qty');
    const increaseQtyBtn = cartModal.querySelector('.increase-qty');

    function openCartModal(productId, productName, productImage, productPrice) {
        currentProductId = productId;
        modalProductName.textContent = productName;
        modalProductImage.src = productImage;
        modalProductImage.alt = productName;
        modalProductPrice.textContent = productPrice;
        productQuantity.textContent = '1'; // Reset quantity to 1
        cartModal.classList.add('visible');
    }

    function closeCartModal() {
        cartModal.classList.remove('visible');
    }

    addToCartBtn.addEventListener('click', (e) => {
        e.preventDefault();
        const productId = e.target.dataset.productId;
        const productImage = e.target.dataset.productImage;
        const productName = e.target.dataset.productName;
        const productPrice = e.target.dataset.productPrice;

        openCartModal(productId, productName, productImage, productPrice);
    });

    modalCloseBtn.addEventListener('click', closeCartModal);
    continueShoppingBtn.addEventListener('click', closeCartModal);

    decreaseQtyBtn.addEventListener('click', () => {
        let qty = parseInt(productQuantity.textContent);
        if (qty > 1) {
            qty--;
            productQuantity.textContent = qty;
        }
    });

    increaseQtyBtn.addEventListener('click', () => {
        let qty = parseInt(productQuantity.textContent);
        qty++;
        productQuantity.textContent = qty;
    });

    cartModal.addEventListener('click', (e) => {
        if (e.target === cartModal) {
            closeCartModal();
        }
    });

    function mergeCartItemLocal(product, productKey, quantity) {
        let orders = JSON.parse(localStorage.getItem('orders')) || [];
        const pid = String(productKey);
        const idx = orders.findIndex((o) => String(o.productId || o.id) === pid);
        if (idx >= 0) {
            orders[idx].quantity = (Number(orders[idx].quantity) || 0) + quantity;
        } else {
            orders.push({
                id: pid,
                productId: pid,
                image: product.images[0],
                name: product.name,
                price: product.price,
                status: 'Pending',
                quantity: quantity
            });
        }
        localStorage.setItem('orders', JSON.stringify(orders));
    }

    // Orders Integration (localStorage + Firestore when logged in; see js/cart-firestore.js)
    const goToCartBtn = cartModal.querySelector('.go-to-cart-btn');
    goToCartBtn.addEventListener('click', async () => {
        const currentProduct = products[currentProductId];
        const quantity = parseInt(productQuantity.textContent);

        if (currentProduct && quantity > 0) {
            const pid = String(currentProductId);
            const line = {
                productId: pid,
                name: currentProduct.name,
                price: currentProduct.price,
                image: currentProduct.images[0],
                quantity: quantity
            };

            try {
                if (typeof window.addToCart === 'function') {
                    const rows = await window.addToCart(line);
                    if (rows && Array.isArray(rows)) {
                        localStorage.setItem('orders', JSON.stringify(rows));
                    } else {
                        mergeCartItemLocal(currentProduct, currentProductId, quantity);
                    }
                } else {
                    mergeCartItemLocal(currentProduct, currentProductId, quantity);
                }
            } catch (err) {
                console.error('Cart Firestore error:', err);
                mergeCartItemLocal(currentProduct, currentProductId, quantity);
            }

            // Animation
            const startRect = modalProductImage.getBoundingClientRect();
            const endRect = ordersIcon.getBoundingClientRect();

            flyToOrdersAnimation.src = currentProduct.images[0];
            flyToOrdersAnimation.style.left = `${startRect.left}px`;
            flyToOrdersAnimation.style.top = `${startRect.top}px`;
            flyToOrdersAnimation.style.width = `${startRect.width}px`;
            flyToOrdersAnimation.style.height = `${startRect.height}px`;
            flyToOrdersAnimation.style.opacity = '1';

            // Set CSS variables for animation end point
            document.documentElement.style.setProperty('--end-x', `${endRect.left + endRect.width / 2 - startRect.left - startRect.width / 2}px`);
            document.documentElement.style.setProperty('--end-y', `${endRect.top + endRect.height / 2 - startRect.top - startRect.height / 2}px`);

            flyToOrdersAnimation.classList.add('animate');

            flyToOrdersAnimation.addEventListener('transitionend', () => {
                flyToOrdersAnimation.classList.remove('animate');
                flyToOrdersAnimation.style.opacity = '0';
                flyToOrdersAnimation.src = ''; // Clear image
            }, { once: true });

            // Show toast
            orderToast.classList.add('visible');
            setTimeout(() => {
                orderToast.classList.remove('visible');
            }, 3000);

            closeCartModal();
        }
    });
});