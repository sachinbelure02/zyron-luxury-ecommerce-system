/**
 * TMV Store — shopping bag + multi-step checkout (single module)
 * Cart: localStorage "orders" (+ Firestore cart/{uid}/items via ../js/cart-firestore.js when logged in).
 * Draft: localStorage "tmv_checkout_draft" (persists).
 * Guest identity/address: tmv_guest_customer, tmv_guest_shipping.
 * Logged-in shipping: Firestore users/{uid}.shippingAddress
 */
(function () {
    var DRAFT_KEY = 'tmv_checkout_draft';
    var CART_KEY = 'orders';
    var PLACED_KEY = 'tmv_placed_orders';
    var GUEST_CUSTOMER_KEY = 'tmv_guest_customer';
    var GUEST_SHIPPING_KEY = 'tmv_guest_shipping';

    var checkoutRoutingState = {
        authUser: null,
        firestoreProfile: null,
        profileLoaded: false
    };

    var STEPS = ['bag', 'customer', 'delivery', 'billing', 'payment', 'review'];

    var HEADER_COPY = {
        bag: {
            eyebrow: 'Checkout · Step 1 of 6',
            title: 'Shopping bag',
            lede: 'Review your pieces, then continue through each checkout step.'
        },
        customer: {
            eyebrow: 'Checkout · Step 2 of 6',
            title: 'Customer information',
            lede: 'We will use these details for your order confirmation and updates.'
        },
        delivery: {
            eyebrow: 'Checkout · Step 3 of 6',
            title: 'Delivery address',
            lede: 'Where should we send your ZYRON selection?'
        },
        billing: {
            eyebrow: 'Checkout · Step 4 of 6',
            title: 'Billing address',
            lede: 'Use your delivery address or enter a different billing address.'
        },
        payment: {
            eyebrow: 'Checkout · Step 5 of 6',
            title: 'Payment method',
            lede: 'Choose how you would like to pay.'
        },
        review: {
            eyebrow: 'Checkout · Step 6 of 6',
            title: 'Review & complete',
            lede: 'Confirm your details before placing your order.'
        }
    };

    function defaultDraft() {
        return {
            customer: { name: '', email: '', phone: '' },
            delivery: {
                firstName: '',
                lastName: '',
                address1: '',
                address2: '',
                city: '',
                pincode: '',
                state: '',
                country: 'India',
                phone: '',
                method: 'standard'
            },
            billingSameAsDelivery: true,
            billing: {
                firstName: '',
                lastName: '',
                address1: '',
                address2: '',
                city: '',
                pincode: '',
                state: '',
                country: 'India',
                phone: ''
            },
            payment: {
                method: '',
                razorpayOrderId: '',
                upiApp: '',
                upiId: '',
                cardType: '',
                cardName: '',
                cardNumber: '',
                cardExpiry: '',
                cardCvv: ''
            },
            meta: { discountAmount: 0, deliveryFee: 0, discountLabel: '' }
        };
    }

    function loadDraft() {
        var base = defaultDraft();
        try {
            var raw = JSON.parse(localStorage.getItem(DRAFT_KEY) || '{}');
            base.customer = Object.assign({}, base.customer, raw.customer || {});
            base.delivery = Object.assign({}, base.delivery, raw.delivery || {});
            base.billing = Object.assign({}, base.billing, raw.billing || {});
            base.payment = Object.assign({}, base.payment, raw.payment || {});
            base.meta = Object.assign({}, base.meta, raw.meta || {});
            if (typeof raw.billingSameAsDelivery === 'boolean') {
                base.billingSameAsDelivery = raw.billingSameAsDelivery;
            }
        } catch (e) { /* ignore */ }
        return base;
    }

    function saveDraft(draft) {
        localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
    }

    function clearDraft() {
        localStorage.removeItem(DRAFT_KEY);
    }

    function parsePriceString(priceStr) {
        if (typeof priceStr === 'number' && !isNaN(priceStr)) return priceStr;
        if (!priceStr) return 0;
        var n = parseFloat(String(priceStr).replace(/[₹,Rs.\s]/gi, ''));
        return isNaN(n) ? 0 : n;
    }

    function getCartItems() {
        try {
            return JSON.parse(localStorage.getItem(CART_KEY) || '[]');
        } catch (e) {
            return [];
        }
    }

    function deliveryFeeForMethod(method) {
        if (method === 'express') return 199;
        if (method === 'pickup') return 0;
        return 99;
    }

    function customerComplete(d) {
        return !!(d.customer && String(d.customer.email || '').trim() && String(d.customer.name || '').trim());
    }

    function deliveryComplete(d) {
        var x = d.delivery || {};
        return !!(
            String(x.firstName || '').trim() &&
            String(x.lastName || '').trim() &&
            String(x.address1 || '').trim() &&
            String(x.city || '').trim() &&
            String(x.pincode || '').trim() &&
            String(x.state || '').trim() &&
            String(x.country || '').trim() &&
            String(x.phone || '').trim()
        );
    }

    function shippingAddressDocComplete(sh) {
        if (!sh || typeof sh !== 'object') return false;
        return !!(
            String(sh.firstName || '').trim() &&
            String(sh.lastName || '').trim() &&
            String(sh.address1 || '').trim() &&
            String(sh.city || '').trim() &&
            String(sh.pincode || '').trim() &&
            String(sh.state || '').trim() &&
            String(sh.country || '').trim() &&
            String(sh.phone || '').trim()
        );
    }

    function deliveryFromShippingDoc(sh, prevMethod) {
        var method = String(sh.method || prevMethod || 'standard');
        return {
            firstName: String(sh.firstName || '').trim(),
            lastName: String(sh.lastName || '').trim(),
            address1: String(sh.address1 || '').trim(),
            address2: String(sh.address2 || '').trim(),
            city: String(sh.city || '').trim(),
            pincode: String(sh.pincode || '').trim(),
            state: String(sh.state || '').trim(),
            country: String(sh.country || 'India').trim(),
            phone: String(sh.phone || '').trim(),
            method: method
        };
    }

    function shippingDocFromDelivery(d) {
        return {
            firstName: d.firstName,
            lastName: d.lastName,
            address1: d.address1,
            address2: d.address2,
            city: d.city,
            pincode: d.pincode,
            state: d.state,
            country: d.country,
            phone: d.phone,
            method: d.method || 'standard'
        };
    }

    function customerCompleteForRouting(draft) {
        if (customerComplete(draft)) return true;
        var u = checkoutRoutingState.authUser;
        var data = checkoutRoutingState.firestoreProfile;
        if (!u || !checkoutRoutingState.profileLoaded) return false;
        var eff = mergeCustomerFromAuthAndFirestore(u, data || {});
        return !!eff.name && emailLooksValid(eff.email);
    }

    function deliveryCompleteForRouting(draft) {
        if (deliveryComplete(draft)) return true;
        var data = checkoutRoutingState.firestoreProfile;
        if (!checkoutRoutingState.profileLoaded || !data) return false;
        return shippingAddressDocComplete(data.shippingAddress);
    }

    function billingComplete(d) {
        if (d.billingSameAsDelivery) return true;
        var x = d.billing || {};
        return !!(
            String(x.firstName || '').trim() &&
            String(x.lastName || '').trim() &&
            String(x.address1 || '').trim() &&
            String(x.city || '').trim() &&
            String(x.pincode || '').trim() &&
            String(x.state || '').trim() &&
            String(x.country || '').trim() &&
            String(x.phone || '').trim()
        );
    }

    function paymentComplete(d) {
        var p = d.payment || {};
        var m = p.method;
        if (m === 'cod') return true;
        if (m === 'upi') {
            var app = String(p.upiApp || '').trim();
            if (!app) return false;
            if (app === 'other') return !!String(p.upiId || '').trim();
            return true;
        }
        if (m === 'card') return p.cardType === 'debit' || p.cardType === 'credit';
        return false;
    }

    function paymentValidationMessage(d) {
        var p = d.payment || {};
        if (p.method === 'upi') {
            if (!String(p.upiApp || '').trim()) return 'Please select a UPI app.';
            if (p.upiApp === 'other' && !String(p.upiId || '').trim()) {
                return 'Please enter your UPI ID for Other UPI.';
            }
        }
        if (p.method === 'card' && !(p.cardType === 'debit' || p.cardType === 'credit')) {
            return 'Please choose debit or credit card (card details are entered in the secure Razorpay window).';
        }
        return '';
    }

    function maxReachableStepIndex() {
        if (!getCartItems().length) return 0;
        var d = loadDraft();
        if (!customerCompleteForRouting(d)) return 1;
        if (!deliveryCompleteForRouting(d)) return 2;
        if (!billingComplete(d)) return 3;
        if (!paymentComplete(d)) return 4;
        return 5;
    }

    function computeTotals(draft) {
        var items = getCartItems();
        var subtotal = 0;
        items.forEach(function (o) {
            subtotal += parsePriceString(o.price) * (Number(o.quantity) || 1);
        });
        var method = (draft && draft.delivery && draft.delivery.method) || 'standard';
        var deliveryFee = draft && draft.meta && typeof draft.meta.deliveryFee === 'number'
            ? draft.meta.deliveryFee
            : deliveryFeeForMethod(method);
        var discount = (draft && draft.meta && Number(draft.meta.discountAmount)) || 0;
        var total = Math.max(0, subtotal + deliveryFee - discount);
        var itemCount = items.reduce(function (s, o) {
            return s + (Number(o.quantity) || 1);
        }, 0);
        return { subtotal: subtotal, deliveryFee: deliveryFee, discount: discount, total: total, itemCount: itemCount, items: items };
    }

    function mapCartToFirestoreLineItems(items) {
        items = items || [];
        return items.map(function (it) {
            return {
                productId: String(it.productId != null ? it.productId : it.id),
                name: it.name,
                price: it.price,
                image: it.image,
                quantity: Number(it.quantity) || 1
            };
        });
    }

    function stepIndex(step) {
        return STEPS.indexOf(step);
    }

    function addressOnlyFromDelivery(delivery) {
        return {
            firstName: delivery.firstName,
            lastName: delivery.lastName,
            address1: delivery.address1,
            address2: delivery.address2,
            city: delivery.city,
            pincode: delivery.pincode,
            state: delivery.state,
            country: delivery.country,
            phone: delivery.phone
        };
    }

    function emailLooksValid(email) {
        return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email || '').trim());
    }

    /** Aligns with profile page resolution of display name from Firestore + Auth */
    function mergeCustomerFromAuthAndFirestore(user, userData) {
        userData = userData || {};
        var name = String(userData.name || '').trim();
        if (!name) {
            var joined = [userData.firstName, userData.lastName].filter(Boolean).join(' ').trim();
            if (joined) name = joined;
        }
        if (!name && user && user.displayName) name = String(user.displayName).trim();
        var email = String(userData.email || (user && user.email) || '').trim();
        var phone = String(userData.phone || '').trim();
        return { name: name, email: email, phone: phone };
    }

    /** Prefer saved account data (merged) over draft when both exist */
    function effectiveCustomer(draft, merged) {
        var c = (draft && draft.customer) || {};
        var m = merged || {};
        return {
            name: String(m.name || c.name || '').trim(),
            email: String(m.email || c.email || '').trim(),
            phone: String(m.phone || c.phone || '').trim()
        };
    }

    function blurFocusInside(el) {
        if (!el || typeof document === 'undefined') return;
        var ae = document.activeElement;
        if (ae && el.contains(ae) && typeof ae.blur === 'function') {
            ae.blur();
        }
    }

    function supportsInert() {
        return typeof HTMLElement !== 'undefined' && 'inert' in HTMLElement.prototype;
    }

    function focusCheckoutStepPanel(panel) {
        if (!panel || typeof window === 'undefined') return;
        window.requestAnimationFrame(function () {
            if (!panel || panel.hidden || panel.getAttribute('aria-hidden') === 'true') return;
            var primary = panel.querySelector('.checkout-btn--primary:not([disabled])');
            if (primary) {
                try {
                    primary.focus();
                } catch (e1) {
                    /* ignore */
                }
                return;
            }
            var inp = panel.querySelector(
                'input:not([type="hidden"]):not([disabled]), select:not([disabled]), textarea:not([disabled])'
            );
            if (inp) {
                try {
                    inp.focus();
                } catch (e2) {
                    /* ignore */
                }
                return;
            }
            var btn = panel.querySelector('button:not([disabled])');
            if (btn) {
                try {
                    btn.focus();
                } catch (e3) {
                    /* ignore */
                }
                return;
            }
            var link = panel.querySelector('a[href]');
            if (link) {
                try {
                    link.focus();
                } catch (e4) {
                    /* ignore */
                }
                return;
            }
            var h = panel.querySelector('h1, h2.checkout-review-heading, .page-title');
            if (h) {
                if (!h.getAttribute('tabindex')) h.setAttribute('tabindex', '-1');
                try {
                    h.focus();
                } catch (e5) {
                    /* ignore */
                }
            }
        });
    }

    document.addEventListener('DOMContentLoaded', function () {
        var ordersList = document.getElementById('orders-list');
        var cartSummary = document.getElementById('cart-summary');
        var continueBtn = document.getElementById('orders-continue-checkout');
        var placedBanner = document.getElementById('orders-placed-banner');
        var stepsNav = document.getElementById('orders-steps-nav');
        var eyebrowEl = document.getElementById('orders-checkout-eyebrow');
        var titleEl = document.getElementById('orders-checkout-title');
        var ledeEl = document.getElementById('orders-checkout-lede');

        var stepPanels = {};
        STEPS.forEach(function (s) {
            var el = document.querySelector('[data-checkout-step="' + s + '"]');
            if (el) stepPanels[s] = el;
        });

        function applyFirestoreCartToLocalStorageThen(done) {
            if (typeof window.loadCartFromFirestore !== 'function') {
                done();
                return;
            }
            window.loadCartFromFirestore().then(function (rows) {
                if (rows !== null && rows !== undefined && Array.isArray(rows)) {
                    localStorage.setItem(CART_KEY, JSON.stringify(rows));
                }
                done();
            }).catch(function (err) {
                console.error('[orders] applyFirestoreCartToLocalStorageThen:', err);
                done();
            });
        }

        if (window.location.search.indexOf('placed=1') !== -1 && placedBanner) {
            placedBanner.hidden = false;
            try {
                window.history.replaceState({}, document.title, window.location.pathname + window.location.hash);
            } catch (e) { /* ignore */ }
        }

        function calculateCartTotals(orders) {
            var totalItems = 0;
            var totalPrice = 0;
            orders.forEach(function (order) {
                var q = Number(order.quantity) || 1;
                totalItems += q;
                totalPrice += parsePriceString(order.price) * q;
            });
            return { totalItems: totalItems, totalPrice: totalPrice };
        }

        function setContinueEnabled(enabled) {
            if (!continueBtn) return;
            if (enabled) {
                continueBtn.classList.remove('is-disabled');
                continueBtn.setAttribute('aria-disabled', 'false');
            } else {
                continueBtn.classList.add('is-disabled');
                continueBtn.setAttribute('aria-disabled', 'true');
            }
        }

        var customerStepEditing = false;
        var deliveryStepEditing = false;
        var profileCustomerSnapshot = { name: '', email: '', phone: '' };
        var lastSummaryEffectiveCustomer = { name: '', email: '', phone: '' };
        var lastSummaryDelivery = null;
        var canReturnToSummary = false;
        var canReturnToDeliverySummary = false;

        function getHashStep() {
            var raw = (window.location.hash || '').replace(/^#/, '').toLowerCase();
            return STEPS.indexOf(raw) >= 0 ? raw : 'bag';
        }

        function fetchUserProfileFirestore(uid) {
            if (typeof firebase === 'undefined' || !firebase.firestore) {
                return Promise.resolve({});
            }
            return firebase.firestore().collection('users').doc(uid).get().then(function (snap) {
                return snap.exists ? snap.data() : {};
            }).catch(function () {
                return {};
            });
        }

        function bootstrapCheckoutState() {
            checkoutRoutingState.authUser = (typeof firebase !== 'undefined' && firebase.auth)
                ? firebase.auth().currentUser
                : null;
            var draft = loadDraft();

            if (!checkoutRoutingState.authUser) {
                checkoutRoutingState.firestoreProfile = null;
                checkoutRoutingState.profileLoaded = true;
                try {
                    var gc = JSON.parse(localStorage.getItem(GUEST_CUSTOMER_KEY) || 'null');
                    var gs = JSON.parse(localStorage.getItem(GUEST_SHIPPING_KEY) || 'null');
                    if (gc && typeof gc === 'object') {
                        draft.customer = Object.assign({}, draft.customer, {
                            name: String(gc.name || draft.customer.name || '').trim(),
                            email: String(gc.email || draft.customer.email || '').trim(),
                            phone: String(gc.phone || draft.customer.phone || '').trim()
                        });
                    }
                    if (shippingAddressDocComplete(gs)) {
                        draft.delivery = deliveryFromShippingDoc(gs, draft.delivery && draft.delivery.method);
                        draft.meta = draft.meta || {};
                        draft.meta.deliveryFee = deliveryFeeForMethod(draft.delivery.method);
                    }
                } catch (e) { /* ignore */ }
                saveDraft(draft);
                return Promise.resolve();
            }

            checkoutRoutingState.profileLoaded = false;
            return fetchUserProfileFirestore(checkoutRoutingState.authUser.uid).then(function (data) {
                checkoutRoutingState.firestoreProfile = data || {};
                checkoutRoutingState.profileLoaded = true;
                draft = loadDraft();
                var u = checkoutRoutingState.authUser;
                var merged = mergeCustomerFromAuthAndFirestore(u, checkoutRoutingState.firestoreProfile);
                if (merged.name && emailLooksValid(merged.email)) {
                    draft.customer = {
                        name: merged.name,
                        email: merged.email,
                        phone: merged.phone || (draft.customer && draft.customer.phone) || ''
                    };
                }
                var sh = checkoutRoutingState.firestoreProfile.shippingAddress;
                if (shippingAddressDocComplete(sh)) {
                    if (!deliveryComplete(draft)) {
                        draft.delivery = deliveryFromShippingDoc(
                            sh,
                            (draft.delivery && draft.delivery.method) || sh.method
                        );
                    }
                    draft.meta = draft.meta || {};
                    draft.meta.deliveryFee = deliveryFeeForMethod(draft.delivery.method || 'standard');
                }
                saveDraft(draft);
            }).catch(function () {
                checkoutRoutingState.firestoreProfile = {};
                checkoutRoutingState.profileLoaded = true;
            });
        }

        function routeContinueAfterBootstrap() {
            var d = loadDraft();
            if (customerCompleteForRouting(d) && deliveryCompleteForRouting(d)) {
                window.location.hash = 'billing';
            } else if (customerCompleteForRouting(d)) {
                window.location.hash = 'delivery';
            } else {
                window.location.hash = 'customer';
            }
        }

        if (continueBtn) {
            continueBtn.addEventListener('click', function () {
                if (continueBtn.classList.contains('is-disabled')) return;
                bootstrapCheckoutState()
                    .then(routeContinueAfterBootstrap)
                    .catch(function (err) {
                        console.error('[orders] Continue checkout bootstrap error:', err);
                        routeContinueAfterBootstrap();
                    });
            });
        }

        function renderOrders() {
            if (!ordersList) return;
            ordersList.innerHTML = '';

            var orders = getCartItems();

            if (orders.length === 0) {
                ordersList.innerHTML = '<p class="no-orders-message">Your bag is empty.</p>';
                if (cartSummary) cartSummary.innerHTML = '';
                setContinueEnabled(false);
                return;
            }

            setContinueEnabled(true);

            var totals = calculateCartTotals(orders);

            orders.forEach(function (order) {
                var orderItem = document.createElement('div');
                orderItem.classList.add('order-item');
                orderItem.dataset.id = order.id;

                var statusClass = '';
                if (order.status === 'Delivered') statusClass = 'status-delivered';
                else if (order.status === 'Pending') statusClass = 'status-pending';
                else if (order.status === 'Shipped') statusClass = 'status-shipped';

                var q = Number(order.quantity) || 1;
                var unit = parsePriceString(order.price);
                var lineTotal = unit * q;

                var img = document.createElement('img');
                img.className = 'order-item-image';
                img.src = order.image || '';
                img.alt = order.name || 'Product';

                var details = document.createElement('div');
                details.className = 'order-item-details';

                var h3 = document.createElement('h3');
                h3.className = 'order-item-name';
                h3.textContent = order.name || 'Item';

                var meta = document.createElement('p');
                meta.className = 'order-item-meta';
                meta.textContent = (order.price || '') + ' · Qty ' + q;

                var line = document.createElement('p');
                line.className = 'order-item-line-total';
                line.textContent = 'Line total · ₹ ' + lineTotal.toLocaleString('en-IN');

                var statusEl = document.createElement('span');
                statusEl.className = 'order-item-status ' + statusClass;
                statusEl.textContent = order.status || '';

                details.appendChild(h3);
                details.appendChild(meta);
                details.appendChild(line);
                details.appendChild(statusEl);

                var rm = document.createElement('button');
                rm.type = 'button';
                rm.className = 'remove-item-btn';
                rm.setAttribute('aria-label', 'Remove item');
                rm.dataset.id = order.id;
                rm.textContent = 'Remove';

                orderItem.appendChild(img);
                orderItem.appendChild(details);
                orderItem.appendChild(rm);

                ordersList.appendChild(orderItem);
            });

            if (cartSummary) {
                cartSummary.innerHTML =
                    '<h2 class="orders-bag__summary-title">Summary</h2>' +
                    '<div class="orders-bag__summary-row"><span>Items</span><span>' + totals.totalItems + '</span></div>' +
                    '<div class="orders-bag__summary-row orders-bag__summary-row--strong">' +
                    '<span>Subtotal</span><span>₹ ' + totals.totalPrice.toLocaleString('en-IN') + '</span></div>' +
                    '<p class="orders-bag__summary-note">Delivery and taxes are confirmed on the next steps.</p>';
            }

            document.querySelectorAll('.remove-item-btn').forEach(function (button) {
                button.addEventListener('click', function (event) {
                    removeOrderItem(event.currentTarget.dataset.id);
                });
            });
        }

        function removeOrderItem(idToRemove) {
            function applyLocalOnly() {
                var list = getCartItems().filter(function (order) {
                    return order.id.toString() !== idToRemove.toString();
                });
                localStorage.setItem(CART_KEY, JSON.stringify(list));
                renderOrders();
                syncRoute();
            }
            if (typeof window.removeCartItem === 'function') {
                window
                    .removeCartItem(idToRemove)
                    .then(function (rows) {
                        if (rows !== null && rows !== undefined && Array.isArray(rows)) {
                            localStorage.setItem(CART_KEY, JSON.stringify(rows));
                        } else {
                            applyLocalOnly();
                        }
                        renderOrders();
                        syncRoute();
                    })
                    .catch(function (err) {
                        console.error('[orders] removeCartItem:', err);
                        applyLocalOnly();
                    });
            } else {
                applyLocalOnly();
            }
        }

        function updateHeader(step) {
            var copy = HEADER_COPY[step] || HEADER_COPY.bag;
            if (eyebrowEl) eyebrowEl.textContent = copy.eyebrow;
            if (titleEl) titleEl.textContent = copy.title;
            if (ledeEl) ledeEl.textContent = copy.lede;
        }

        function updateStepNav(activeStep) {
            if (!stepsNav) return;
            var activeIdx = stepIndex(activeStep);
            var maxIdx = maxReachableStepIndex();
            stepsNav.querySelectorAll('.checkout-step').forEach(function (li) {
                var key = li.getAttribute('data-step');
                var idx = stepIndex(key);
                li.classList.remove('is-current', 'is-done');
                if (idx === activeIdx) li.classList.add('is-current');
                else if (idx < activeIdx) li.classList.add('is-done');
                li.classList.toggle('is-locked', idx > maxIdx);
            });
        }

        if (stepsNav) {
            stepsNav.addEventListener('click', function (e) {
                var a = e.target.closest('a[href^="#"]');
                if (!a) return;
                var target = a.getAttribute('href').replace(/^#/, '');
                var idx = stepIndex(target);
                if (idx > maxReachableStepIndex()) {
                    e.preventDefault();
                }
            });
        }

        function showStep(step) {
            if (step !== 'customer') {
                customerStepEditing = false;
            }
            if (step !== 'delivery') {
                deliveryStepEditing = false;
            }
            STEPS.forEach(function (s) {
                var panel = stepPanels[s];
                if (!panel) return;
                if (s !== step) {
                    blurFocusInside(panel);
                }
            });
            var useInert = supportsInert();
            STEPS.forEach(function (s) {
                var panel = stepPanels[s];
                if (!panel) return;
                var on = s === step;
                panel.hidden = !on;
                panel.setAttribute('aria-hidden', on ? 'false' : 'true');
                if (useInert) {
                    try {
                        panel.inert = !on;
                    } catch (inertErr) {
                        /* ignore */
                    }
                }
            });
            updateHeader(step);
            updateStepNav(step);
            if (step === 'review') {
                renderReview();
            } else if (step === 'customer') {
                refreshCustomerStepUI();
            } else if (step === 'delivery') {
                refreshDeliveryStepUI();
            } else if (step !== 'bag') {
                hydrateFormsFromDraft();
            }
            var visible = stepPanels[step];
            if (visible) {
                focusCheckoutStepPanel(visible);
            }
        }

        function syncRoute() {
            var maxIdx = maxReachableStepIndex();
            var raw = (window.location.hash || '').replace(/^#/, '').toLowerCase();
            var requested = STEPS.indexOf(raw) >= 0 ? raw : 'bag';
            var idx = stepIndex(requested);
            if (idx > maxIdx) {
                window.location.replace(window.location.pathname + window.location.search + '#' + STEPS[maxIdx]);
                return;
            }
            showStep(requested);
        }

        window.addEventListener('hashchange', syncRoute);

        function hydrateCustomerFieldsFromDraft(draft) {
            draft = draft || loadDraft();
            var c = draft.customer || {};
            var nameEl = document.getElementById('cust-name');
            var emailEl = document.getElementById('cust-email');
            var phoneEl = document.getElementById('cust-phone');
            if (nameEl) nameEl.value = c.name || '';
            if (emailEl) emailEl.value = c.email || '';
            if (phoneEl) phoneEl.value = c.phone || '';
        }

        function setCustomerFormFieldVisibility(showName, showEmail, showPhone) {
            var wn = document.getElementById('cust-wrap-name');
            var we = document.getElementById('cust-wrap-email');
            var wp = document.getElementById('cust-wrap-phone');
            if (wn) wn.hidden = !showName;
            if (we) we.hidden = !showEmail;
            if (wp) wp.hidden = !showPhone;
        }

        function refreshCustomerStepUI() {
            var loadingEl = document.getElementById('checkout-customer-loading');
            var summaryBlock = document.getElementById('checkout-customer-summary-block');
            var summaryBody = document.getElementById('checkout-customer-summary-body');
            var summaryNote = document.getElementById('checkout-customer-summary-note');
            var custFormEl = document.getElementById('checkout-customer-form');
            var cancelEditBtn = document.getElementById('checkout-customer-cancel-edit');
            if (!custFormEl) return;

            var user = typeof firebase !== 'undefined' && firebase.auth ? firebase.auth().currentUser : null;
            var draft = loadDraft();

            function updateCancelEditVisibility() {
                if (cancelEditBtn) {
                    cancelEditBtn.hidden = !(customerStepEditing && canReturnToSummary);
                }
            }

            if (!user) {
                profileCustomerSnapshot = { name: '', email: '', phone: '' };
                var effGuest = {
                    name: String((draft.customer && draft.customer.name) || '').trim(),
                    email: String((draft.customer && draft.customer.email) || '').trim(),
                    phone: String((draft.customer && draft.customer.phone) || '').trim()
                };
                var guestOk = !!effGuest.name && emailLooksValid(effGuest.email);
                if (!customerStepEditing && guestOk) {
                    canReturnToSummary = true;
                    lastSummaryEffectiveCustomer = {
                        name: effGuest.name,
                        email: effGuest.email,
                        phone: effGuest.phone || ''
                    };
                    if (loadingEl) loadingEl.hidden = true;
                    if (summaryBlock) summaryBlock.hidden = false;
                    custFormEl.hidden = true;
                    if (summaryBody) {
                        var glines = [effGuest.name, effGuest.email];
                        glines.push(effGuest.phone ? 'Phone: ' + effGuest.phone : 'Phone: optional');
                        summaryBody.textContent = glines.join('\n');
                    }
                    if (summaryNote) {
                        summaryNote.hidden = false;
                        summaryNote.textContent =
                            'Saved on this device. Use Edit if you need to change anything for this order.';
                    }
                    updateCancelEditVisibility();
                    return;
                }
                canReturnToSummary = guestOk;
                if (loadingEl) loadingEl.hidden = true;
                if (summaryBlock) summaryBlock.hidden = true;
                if (summaryNote) summaryNote.hidden = true;
                custFormEl.hidden = false;
                setCustomerFormFieldVisibility(true, true, true);
                hydrateCustomerFieldsFromDraft(draft);
                updateCancelEditVisibility();
                return;
            }

            if (loadingEl) loadingEl.hidden = false;
            if (summaryBlock) summaryBlock.hidden = true;
            custFormEl.hidden = true;

            fetchUserProfileFirestore(user.uid).then(function (userData) {
                var merged = mergeCustomerFromAuthAndFirestore(user, userData);
                profileCustomerSnapshot = {
                    name: String(merged.name || '').trim(),
                    email: String(merged.email || '').trim(),
                    phone: String(merged.phone || '').trim()
                };
                var eff = effectiveCustomer(draft, merged);

                if (loadingEl) loadingEl.hidden = true;

                var needName = !eff.name;
                var needEmail = !eff.email || !emailLooksValid(eff.email);

                if (!customerStepEditing && !needName && !needEmail) {
                    canReturnToSummary = true;
                    lastSummaryEffectiveCustomer = {
                        name: eff.name,
                        email: eff.email,
                        phone: eff.phone || ''
                    };
                    if (summaryBlock) summaryBlock.hidden = false;
                    custFormEl.hidden = true;
                    if (summaryBody) {
                        var lines = [eff.name, eff.email];
                        if (eff.phone) {
                            lines.push('Phone: ' + eff.phone);
                        } else {
                            lines.push('Phone: not on file (optional)');
                        }
                        summaryBody.textContent = lines.join('\n');
                    }
                    if (summaryNote) {
                        summaryNote.hidden = false;
                        summaryNote.textContent =
                            'Pulled from your TMV account. Use Edit if you need to change anything for this order.';
                    }
                    updateCancelEditVisibility();
                    return;
                }

                if (summaryNote) summaryNote.hidden = true;
                if (summaryBlock) summaryBlock.hidden = true;
                custFormEl.hidden = false;

                if (customerStepEditing) {
                    canReturnToSummary = true;
                    setCustomerFormFieldVisibility(true, true, true);
                    document.getElementById('cust-name').value = eff.name || '';
                    document.getElementById('cust-email').value = eff.email || '';
                    document.getElementById('cust-phone').value = eff.phone || '';
                } else {
                    canReturnToSummary = false;
                    setCustomerFormFieldVisibility(needName, needEmail, false);
                    if (needName) document.getElementById('cust-name').value = eff.name || '';
                    if (needEmail) document.getElementById('cust-email').value = eff.email || '';
                    document.getElementById('cust-phone').value = eff.phone || '';
                }
                updateCancelEditVisibility();
            }).catch(function () {
                if (loadingEl) loadingEl.hidden = true;
                canReturnToSummary = false;
                profileCustomerSnapshot = mergeCustomerFromAuthAndFirestore(user, {});
                custFormEl.hidden = false;
                setCustomerFormFieldVisibility(true, true, true);
                hydrateCustomerFieldsFromDraft(draft);
                updateCancelEditVisibility();
            });
        }

        function refreshDeliveryStepUI() {
            var loadingEl = document.getElementById('checkout-delivery-loading');
            var summaryBlock = document.getElementById('checkout-delivery-summary-block');
            var summaryBody = document.getElementById('checkout-delivery-summary-body');
            var summaryNote = document.getElementById('checkout-delivery-summary-note');
            var delFormEl = document.getElementById('checkout-delivery-form');
            var cancelDelBtn = document.getElementById('checkout-delivery-cancel-edit');
            var backSum = document.getElementById('checkout-delivery-back');
            var backForm = document.getElementById('checkout-delivery-form-back');
            if (!delFormEl) return;

            var user = typeof firebase !== 'undefined' && firebase.auth ? firebase.auth().currentUser : null;
            var draft = loadDraft();
            var skipCust = !!(user && customerCompleteForRouting(draft));

            if (backSum) backSum.href = skipCust ? '#bag' : '#customer';
            if (backForm) backForm.href = skipCust ? '#bag' : '#customer';

            function updateCancelDel() {
                if (cancelDelBtn) {
                    cancelDelBtn.hidden = !(deliveryStepEditing && canReturnToDeliverySummary);
                }
            }

            if (user && !checkoutRoutingState.profileLoaded) {
                if (loadingEl) loadingEl.hidden = false;
                if (summaryBlock) summaryBlock.hidden = true;
                delFormEl.hidden = true;
                return;
            }
            if (loadingEl) loadingEl.hidden = true;

            var del = draft.delivery || {};
            var sh = checkoutRoutingState.firestoreProfile && checkoutRoutingState.firestoreProfile.shippingAddress;
            var hasComplete = deliveryComplete(draft) || (user && shippingAddressDocComplete(sh));

            if (!hasComplete || deliveryStepEditing) {
                if (summaryBlock) summaryBlock.hidden = true;
                delFormEl.hidden = false;
                if (summaryNote) summaryNote.hidden = true;
                hydrateFormsFromDraft();
                if (deliveryStepEditing) {
                    canReturnToDeliverySummary = true;
                } else {
                    canReturnToDeliverySummary = false;
                }
                updateCancelDel();
                return;
            }

            canReturnToDeliverySummary = true;
            var eff = deliveryComplete(draft) ? del : deliveryFromShippingDoc(sh, del.method);
            lastSummaryDelivery = eff;

            if (!deliveryComplete(draft)) {
                draft.delivery = eff;
                draft.meta = draft.meta || {};
                draft.meta.deliveryFee = deliveryFeeForMethod(eff.method || 'standard');
                saveDraft(draft);
            }

            if (summaryBlock) summaryBlock.hidden = false;
            delFormEl.hidden = true;
            if (summaryBody) {
                summaryBody.textContent = formatAddress(eff) + '\n' + deliveryLabel(eff.method || 'standard');
            }
            if (summaryNote) {
                summaryNote.hidden = false;
                summaryNote.textContent = user
                    ? 'Saved to your account. Use Edit to change this order.'
                    : 'Saved on this device for faster checkout.';
            }
            updateCancelDel();
        }

        /* --- Firebase: init + bootstrap on auth changes --- */
        function tryInitFirebase() {
            if (typeof firebase === 'undefined' || typeof firebaseConfig === 'undefined') return;
            try {
                if (!firebase.apps.length) {
                    firebase.initializeApp(firebaseConfig);
                }
            } catch (e) {
                return;
            }
            firebase.auth().onAuthStateChanged(function () {
                bootstrapCheckoutState()
                    .then(function () {
                        return new Promise(function (resolve) {
                            applyFirestoreCartToLocalStorageThen(resolve);
                        });
                    })
                    .then(function () {
                        var step = getHashStep();
                        if (step === 'customer') refreshCustomerStepUI();
                        if (step === 'delivery') refreshDeliveryStepUI();
                        syncRoute();
                    });
            });
        }
        tryInitFirebase();

        var useSavedBtn = document.getElementById('checkout-customer-use-saved');
        if (useSavedBtn) {
            useSavedBtn.addEventListener('click', function () {
                var draft = loadDraft();
                draft.customer = {
                    name: lastSummaryEffectiveCustomer.name,
                    email: lastSummaryEffectiveCustomer.email,
                    phone: lastSummaryEffectiveCustomer.phone || ''
                };
                saveDraft(draft);
                window.location.hash = 'delivery';
            });
        }

        var editCustomerBtn = document.getElementById('checkout-customer-edit');
        if (editCustomerBtn) {
            editCustomerBtn.addEventListener('click', function () {
                customerStepEditing = true;
                canReturnToSummary = true;
                refreshCustomerStepUI();
            });
        }

        var cancelEditBtn = document.getElementById('checkout-customer-cancel-edit');
        if (cancelEditBtn) {
            cancelEditBtn.addEventListener('click', function () {
                customerStepEditing = false;
                refreshCustomerStepUI();
            });
        }

        var useDelBtn = document.getElementById('checkout-delivery-use-saved');
        if (useDelBtn) {
            useDelBtn.addEventListener('click', function () {
                var draft = loadDraft();
                if (lastSummaryDelivery) {
                    draft.delivery = Object.assign({}, defaultDraft().delivery, lastSummaryDelivery);
                    draft.meta = draft.meta || {};
                    draft.meta.deliveryFee = deliveryFeeForMethod(draft.delivery.method);
                    saveDraft(draft);
                }
                window.location.hash = 'billing';
            });
        }

        var editDelBtn = document.getElementById('checkout-delivery-edit');
        if (editDelBtn) {
            editDelBtn.addEventListener('click', function () {
                deliveryStepEditing = true;
                canReturnToDeliverySummary = true;
                refreshDeliveryStepUI();
            });
        }

        var cancelDelEditBtn = document.getElementById('checkout-delivery-cancel-edit');
        if (cancelDelEditBtn) {
            cancelDelEditBtn.addEventListener('click', function () {
                deliveryStepEditing = false;
                refreshDeliveryStepUI();
            });
        }

        /* --- Form: customer (guest, partial, or edit mode) --- */
        var custForm = document.getElementById('checkout-customer-form');
        if (custForm) {
            custForm.addEventListener('submit', function (e) {
                e.preventDefault();
                var err = document.getElementById('checkout-customer-error');
                var nameWrap = document.getElementById('cust-wrap-name');
                var emailWrap = document.getElementById('cust-wrap-email');
                var phoneWrap = document.getElementById('cust-wrap-phone');

                var snap = profileCustomerSnapshot || { name: '', email: '', phone: '' };
                var name = nameWrap && !nameWrap.hidden
                    ? String(document.getElementById('cust-name').value || '').trim()
                    : String(snap.name || '').trim();
                var email = emailWrap && !emailWrap.hidden
                    ? String(document.getElementById('cust-email').value || '').trim()
                    : String(snap.email || '').trim();
                var phone = phoneWrap && !phoneWrap.hidden
                    ? String(document.getElementById('cust-phone').value || '').trim()
                    : String(snap.phone || '').trim();

                var emailOk = emailLooksValid(email);
                if (!name || !emailOk) {
                    if (err) err.hidden = false;
                    return;
                }
                if (err) err.hidden = true;
                var draft = loadDraft();
                draft.customer = { name: name, email: email, phone: phone };
                saveDraft(draft);
                var authU = typeof firebase !== 'undefined' && firebase.auth ? firebase.auth().currentUser : null;
                if (!authU) {
                    try {
                        localStorage.setItem(
                            GUEST_CUSTOMER_KEY,
                            JSON.stringify({ name: name, email: email, phone: phone })
                        );
                    } catch (e) { /* ignore */ }
                }
                customerStepEditing = false;
                window.location.hash = 'delivery';
            });
        }

        /* --- Form: delivery --- */
        var delForm = document.getElementById('checkout-delivery-form');
        if (delForm) {
            delForm.addEventListener('submit', function (e) {
                e.preventDefault();
                var err = document.getElementById('checkout-delivery-error');
                if (err) err.hidden = true;
                var draft = loadDraft();
                var method = document.getElementById('del-method').value;
                draft.delivery = {
                    firstName: String(document.getElementById('del-first').value || '').trim(),
                    lastName: String(document.getElementById('del-last').value || '').trim(),
                    address1: String(document.getElementById('del-a1').value || '').trim(),
                    address2: String(document.getElementById('del-a2').value || '').trim(),
                    city: String(document.getElementById('del-city').value || '').trim(),
                    pincode: String(document.getElementById('del-pin').value || '').trim(),
                    state: String(document.getElementById('del-state').value || '').trim(),
                    country: String(document.getElementById('del-country').value || '').trim(),
                    phone: String(document.getElementById('del-phone').value || '').trim(),
                    method: method
                };
                draft.meta = draft.meta || {};
                draft.meta.deliveryFee = deliveryFeeForMethod(method);
                saveDraft(draft);
                if (!deliveryComplete(draft)) {
                    if (err) err.hidden = false;
                    return;
                }
                var shDoc = shippingDocFromDelivery(draft.delivery);
                var authU = typeof firebase !== 'undefined' && firebase.auth ? firebase.auth().currentUser : null;

                function finishDeliveryStep() {
                    deliveryStepEditing = false;
                    if (authU && checkoutRoutingState.firestoreProfile) {
                        checkoutRoutingState.firestoreProfile = Object.assign(
                            {},
                            checkoutRoutingState.firestoreProfile,
                            { shippingAddress: shDoc }
                        );
                    }
                    window.location.hash = 'billing';
                }

                if (authU && typeof firebase !== 'undefined' && firebase.firestore) {
                    firebase.firestore().collection('users').doc(authU.uid).set(
                        { shippingAddress: shDoc },
                        { merge: true }
                    ).then(finishDeliveryStep).catch(finishDeliveryStep);
                } else {
                    try {
                        localStorage.setItem(GUEST_SHIPPING_KEY, JSON.stringify(shDoc));
                    } catch (e2) { /* ignore */ }
                    finishDeliveryStep();
                }
            });
        }

        /* --- Form: billing --- */
        var billForm = document.getElementById('checkout-billing-form');
        var billSame = document.getElementById('bill-same');
        var billWrap = document.getElementById('billing-fields');
        if (billSame && billWrap) {
            billSame.addEventListener('change', function () {
                billWrap.hidden = billSame.checked;
            });
        }
        if (billForm) {
            billForm.addEventListener('submit', function (e) {
                e.preventDefault();
                var err = document.getElementById('checkout-billing-error');
                if (err) err.hidden = true;
                var draft = loadDraft();
                draft.billingSameAsDelivery = billSame.checked;
                if (billSame.checked) {
                    draft.billing = Object.assign({}, defaultDraft().billing);
                } else {
                    draft.billing = {
                        firstName: String(document.getElementById('bill-first').value || '').trim(),
                        lastName: String(document.getElementById('bill-last').value || '').trim(),
                        address1: String(document.getElementById('bill-a1').value || '').trim(),
                        address2: String(document.getElementById('bill-a2').value || '').trim(),
                        city: String(document.getElementById('bill-city').value || '').trim(),
                        pincode: String(document.getElementById('bill-pin').value || '').trim(),
                        state: String(document.getElementById('bill-state').value || '').trim(),
                        country: String(document.getElementById('bill-country').value || '').trim(),
                        phone: String(document.getElementById('bill-phone').value || '').trim()
                    };
                }
                saveDraft(draft);
                if (!billingComplete(draft)) {
                    if (err) err.hidden = false;
                    return;
                }
                window.location.hash = 'payment';
            });
        }

        /* --- Form: payment --- */
        var payForm = document.getElementById('checkout-payment-form');

        function readPaymentSubfieldsFromForm() {
            function val(id) {
                var el = document.getElementById(id);
                return el ? String(el.value || '').trim() : '';
            }
            var upiAppEl = payForm.querySelector('input[name="pay-upi-app"]:checked');
            var cardTypeEl = payForm.querySelector('input[name="pay-card-type"]:checked');
            return {
                upiApp: upiAppEl ? upiAppEl.value : '',
                upiId: val('pay-upi-id'),
                cardType: cardTypeEl ? cardTypeEl.value : '',
                cardName: val('pay-card-name'),
                cardNumber: val('pay-card-number'),
                cardExpiry: val('pay-card-expiry'),
                cardCvv: val('pay-card-cvv')
            };
        }

        function applyPaymentMethodToDraft(draft, mainMethod, sub) {
            draft.payment = draft.payment || {};
            draft.payment.method = mainMethod;
            draft.payment.razorpayOrderId = draft.payment.razorpayOrderId || '';
            if (mainMethod === 'upi') {
                draft.payment.upiApp = sub.upiApp || '';
                draft.payment.upiId = sub.upiId || '';
                draft.payment.cardType = '';
                draft.payment.cardName = '';
                draft.payment.cardNumber = '';
                draft.payment.cardExpiry = '';
                draft.payment.cardCvv = '';
            } else if (mainMethod === 'card') {
                draft.payment.cardType = sub.cardType || '';
                draft.payment.cardName = sub.cardName || '';
                draft.payment.cardNumber = sub.cardNumber || '';
                draft.payment.cardExpiry = sub.cardExpiry || '';
                draft.payment.cardCvv = sub.cardCvv || '';
                draft.payment.upiApp = '';
                draft.payment.upiId = '';
            } else {
                draft.payment.upiApp = '';
                draft.payment.upiId = '';
                draft.payment.cardType = '';
                draft.payment.cardName = '';
                draft.payment.cardNumber = '';
                draft.payment.cardExpiry = '';
                draft.payment.cardCvv = '';
            }
        }

        function syncPaymentPanels() {
            if (!payForm) return;
            var sel = payForm.querySelector('input[name="pay-method"]:checked');
            var v = sel ? sel.value : '';
            var upiP = document.getElementById('checkout-pay-panel-upi');
            var cardP = document.getElementById('checkout-pay-panel-card');
            var otherWrap = document.getElementById('checkout-pay-upi-other-wrap');
            payForm.querySelectorAll('.checkout-pay-block').forEach(function (blk) {
                blk.classList.toggle('checkout-pay-block--active', !!(sel && blk.contains(sel)));
            });
            if (upiP) upiP.hidden = v !== 'upi';
            if (cardP) cardP.hidden = v !== 'card';
            if (otherWrap) {
                var otherOn = !!payForm.querySelector('input[name="pay-upi-app"][value="other"]:checked');
                otherWrap.hidden = v !== 'upi' || !otherOn;
            }
        }

        if (payForm) {
            payForm.addEventListener('change', function () {
                syncPaymentPanels();
            });
            payForm.addEventListener('submit', function (e) {
                e.preventDefault();
                var err = document.getElementById('checkout-payment-error');
                var detailErr = document.getElementById('checkout-payment-detail-error');
                if (err) err.hidden = true;
                if (detailErr) {
                    detailErr.hidden = true;
                    detailErr.textContent = '';
                }
                var sel = payForm.querySelector('input[name="pay-method"]:checked');
                if (!sel) {
                    if (err) err.hidden = false;
                    return;
                }
                var sub = readPaymentSubfieldsFromForm();
                var draft = loadDraft();
                applyPaymentMethodToDraft(draft, sel.value, sub);
                saveDraft(draft);
                if (!paymentComplete(draft)) {
                    var msg = paymentValidationMessage(draft);
                    if (detailErr) {
                        detailErr.textContent = msg || 'Please complete the payment details.';
                        detailErr.hidden = false;
                    }
                    return;
                }
                window.location.hash = 'review';
            });
        }

        function fmtRupee(n) {
            return '₹ ' + Math.round(n).toLocaleString('en-IN');
        }

        function formatAddress(addr) {
            if (!addr) return '';
            var lines = [
                [addr.firstName, addr.lastName].filter(Boolean).join(' '),
                addr.address1,
                addr.address2,
                [addr.city, addr.state, addr.pincode].filter(Boolean).join(', '),
                addr.country,
                addr.phone ? 'Phone: ' + addr.phone : ''
            ];
            return lines.filter(function (x) { return String(x || '').trim(); }).join('\n');
        }

        function paymentLabel(m) {
            if (m === 'upi') return 'UPI';
            if (m === 'card') return 'Credit or debit card';
            if (m === 'cod') return 'Cash on delivery';
            return m || '';
        }

        function paymentReviewSummary(draft) {
            var p = (draft && draft.payment) || {};
            var apps = {
                gpay: 'Google Pay',
                phonepe: 'PhonePe',
                bhim: 'BHIM',
                paytm: 'Paytm',
                other: 'Other UPI'
            };
            if (p.method === 'cod') return 'Cash on delivery';
            if (p.method === 'upi') {
                var n = apps[p.upiApp] || p.upiApp || 'UPI';
                var s = 'UPI · ' + n;
                if (p.upiApp === 'other' && p.upiId) s += '\n' + p.upiId;
                return s;
            }
            if (p.method === 'card') {
                var num = String(p.cardNumber || '').replace(/\s/g, '');
                var ct = p.cardType === 'credit' ? 'Credit' : 'Debit';
                if (num.length >= 4) {
                    var last4 = num.slice(-4);
                    return ct + ' card · ···· ' + last4 + '\n' + (p.cardName || '') + '\n(Razorpay checkout)';
                }
                return ct + ' card · Razorpay checkout';
            }
            return paymentLabel(p.method);
        }

        function deliveryLabel(method) {
            if (method === 'express') return 'Express delivery';
            if (method === 'pickup') return 'Boutique pickup';
            return 'Standard delivery';
        }

        function renderReview() {
            var draft = loadDraft();
            var totals = computeTotals(draft);

            var cust = draft.customer || {};
            var rc = document.getElementById('review-customer');
            if (rc) {
                rc.textContent = [cust.name, cust.email, cust.phone ? 'Phone: ' + cust.phone : ''].filter(Boolean).join('\n');
            }

            var del = draft.delivery || {};
            var rd = document.getElementById('review-delivery');
            if (rd) {
                rd.textContent = formatAddress(del) + (del.method ? '\n' + deliveryLabel(del.method) : '');
            }

            var rb = document.getElementById('review-billing');
            if (rb) {
                rb.textContent = draft.billingSameAsDelivery
                    ? 'Same as delivery address'
                    : formatAddress(draft.billing || {});
            }

            var rp = document.getElementById('review-payment');
            if (rp) rp.textContent = paymentReviewSummary(draft);

            var itemsRoot = document.getElementById('review-items');
            if (itemsRoot) {
                itemsRoot.innerHTML = '';
                totals.items.forEach(function (item) {
                    var line = document.createElement('div');
                    line.className = 'checkout-review-line';
                    var img = document.createElement('img');
                    img.src = item.image || '../images/placeholder.png';
                    img.alt = item.name || '';
                    var meta = document.createElement('div');
                    meta.className = 'checkout-review-line-meta';
                    var q = Number(item.quantity) || 1;
                    var unit = parsePriceString(item.price);
                    var title = document.createElement('p');
                    title.className = 'checkout-review-line-title';
                    title.textContent = item.name || 'Item';
                    var sub = document.createElement('p');
                    sub.className = 'checkout-review-line-sub';
                    sub.textContent = item.price + ' × ' + q + ' · ' + fmtRupee(unit * q);
                    meta.appendChild(title);
                    meta.appendChild(sub);
                    line.appendChild(img);
                    line.appendChild(meta);
                    itemsRoot.appendChild(line);
                });
            }

            var discount = totals.discount || 0;
            var discLabel = (draft.meta && draft.meta.discountLabel) || 'Discount';
            var totalsEl = document.getElementById('review-totals');
            if (totalsEl) {
                totalsEl.innerHTML =
                    '<div class="checkout-totals-row"><span>Subtotal</span><span>' + fmtRupee(totals.subtotal) + '</span></div>' +
                    '<div class="checkout-totals-row"><span>Delivery</span><span>' + fmtRupee(totals.deliveryFee) + '</span></div>' +
                    (discount > 0
                        ? '<div class="checkout-totals-row"><span>' + discLabel + '</span><span>− ' + fmtRupee(discount) + '</span></div>'
                        : '') +
                    '<div class="checkout-totals-row checkout-totals-row--strong"><span>Total</span><span>' + fmtRupee(totals.total) + '</span></div>';
            }
        }

        function buildPaymentDetailsForFirestore(pay) {
            pay = pay || {};
            if (pay.method === 'upi') {
                return { upiApp: pay.upiApp || '', upiId: pay.upiId || '' };
            }
            if (pay.method === 'card') {
                var n = String(pay.cardNumber || '').replace(/\s/g, '');
                var o = { cardType: pay.cardType || '', via: 'razorpay_checkout' };
                if (n.length >= 4) o.last4 = n.slice(-4);
                return o;
            }
            return null;
        }

        function paymentMethodLabelForOrder(pay) {
            pay = pay || {};
            if (pay.method === 'upi') return 'UPI';
            if (pay.method === 'card') return 'Card';
            return 'COD';
        }

        var placeBtn = document.getElementById('checkout-place-order');
        if (placeBtn) {
            function clearPlaceOrderMsg() {
                var msgEl = document.getElementById('checkout-place-order-msg');
                if (msgEl) {
                    msgEl.textContent = '';
                    msgEl.hidden = true;
                }
            }
            function showPlaceOrderMsg(text) {
                var msgEl = document.getElementById('checkout-place-order-msg');
                if (msgEl) {
                    msgEl.textContent = text;
                    msgEl.hidden = false;
                } else {
                    window.alert(text);
                }
            }
            function checkoutReadyForPlacement(draft) {
                if (!getCartItems().length) {
                    return { ok: false, hash: 'bag', msg: 'Your bag is empty.' };
                }
                if (!customerCompleteForRouting(draft)) {
                    return { ok: false, hash: 'customer', msg: 'Please complete customer information.' };
                }
                if (!deliveryCompleteForRouting(draft)) {
                    return { ok: false, hash: 'delivery', msg: 'Please complete delivery address.' };
                }
                if (!billingComplete(draft)) {
                    return { ok: false, hash: 'billing', msg: 'Please complete billing address.' };
                }
                if (!paymentComplete(draft)) {
                    return { ok: false, hash: 'payment', msg: '' };
                }
                return { ok: true };
            }

            placeBtn.addEventListener('click', function () {
                clearPlaceOrderMsg();
                var authUser = typeof firebase !== 'undefined' && firebase.auth ? firebase.auth().currentUser : null;

                if (!authUser) {
                    showPlaceOrderMsg('Please login to continue checkout.');
                    window.location.hash = 'customer';
                 return;
               }

                var draft = loadDraft();
                var gate = checkoutReadyForPlacement(draft);
                if (!gate.ok) {
                    if (gate.msg) showPlaceOrderMsg(gate.msg);
                    if (gate.hash) window.location.hash = gate.hash;
                    return;
                }

                var totals = computeTotals(draft);
                var amountPaise = Math.round(totals.total * 100);
                if (totals.total <= 0 || amountPaise < 100) {
                    showPlaceOrderMsg('Order total is too low or invalid for payment.');
                    return;
                }

                var items = getCartItems();
                var lineItemsForFirestore = mapCartToFirestoreLineItems(items);
                /* Default (undefined / missing) means same as delivery — only explicit false means separate billing. */
                var sameBillingAsDelivery = draft.billingSameAsDelivery !== false;
                var billingSnap = sameBillingAsDelivery ? draft.delivery : draft.billing || {};
                var orderPayload = {
                    orderId: 'tmv_' + Date.now(),
                    createdAt: new Date().toISOString(),
                    customer: draft.customer,
                    deliveryAddress: draft.delivery,
                    billingSameAsDelivery: sameBillingAsDelivery,
                    payment: draft.payment,
                    items: items,
                    totals: {
                        subtotal: totals.subtotal,
                        deliveryFee: totals.deliveryFee,
                        discount: totals.discount,
                        total: totals.total
                    },
                    status: 'placed'
                };
                if (!sameBillingAsDelivery) {
                    orderPayload.billingAddress = billingSnap;
                }

                function buildFirestoreOrderPayload(extra) {
                    extra = extra || {};
                    if (sameBillingAsDelivery && Object.prototype.hasOwnProperty.call(extra, 'billingAddress')) {
                        extra = Object.assign({}, extra);
                        delete extra.billingAddress;
                    }
                    var basePayload = {
                        userId: authUser.uid,
                        totalAmount: totals.total,
                        subtotal: totals.subtotal,
                        deliveryFee: totals.deliveryFee,
                        discount: totals.discount,
                        currency: extra.currency != null ? extra.currency : 'INR',
                        address: draft.delivery,
                        billingSameAsDelivery: sameBillingAsDelivery,
                        paymentMethod: paymentMethodLabelForOrder(pay),
                        paymentDetails: buildPaymentDetailsForFirestore(pay),
                        status: 'placed',
                        orderStatus: extra.orderStatus != null ? extra.orderStatus : 'placed',
                        lineItems: lineItemsForFirestore
                    };
                    if (!sameBillingAsDelivery) {
                        basePayload.billingAddress = billingSnap;
                    }
                    return Object.assign(basePayload, extra);
                }

                function finishOrderLocal(mergedPayload) {
                    var payload = mergedPayload || orderPayload;
                    try {
                        var hist = JSON.parse(localStorage.getItem(PLACED_KEY) || '[]');
                        if (!Array.isArray(hist)) hist = [];
                        hist.unshift(payload);
                        localStorage.setItem(PLACED_KEY, JSON.stringify(hist));
                    } catch (e) { /* ignore */ }
                    localStorage.setItem(CART_KEY, JSON.stringify([]));
                    clearDraft();
                    window.location.href = 'orders.html?placed=1#bag';
                }

                
                var pay = draft.payment || {};
                var method = pay.method;

                function afterVerifiedPersist(rpOrderId, rpPaymentId) {
                    var paidAtIso = new Date().toISOString();
                    var mergedPayment = Object.assign({}, orderPayload.payment, { razorpayOrderId: rpOrderId });
                    var localPayload = Object.assign({}, orderPayload, {
                        payment: mergedPayment,
                        paymentStatus: 'paid',
                        paymentProvider: 'Razorpay',
                        razorpayOrderId: rpOrderId,
                        razorpayPaymentId: rpPaymentId,
                        currency: 'INR',
                        paidAt: paidAtIso
                    });

                    if (authUser && typeof window.placeOrder === 'function' && typeof window.clearCart === 'function') {
                        window
                            .placeOrder(
                                buildFirestoreOrderPayload({
                                    paymentStatus: 'paid',
                                    paymentProvider: 'Razorpay',
                                    razorpayOrderId: rpOrderId,
                                    razorpayPaymentId: rpPaymentId,
                                    currency: 'INR',
                                    orderStatus: 'paid',
                                    paidAtField: true,
                                    updatedAtField: true
                                })
                            )
                            .then(function () {
                                return window.clearCart(authUser.uid);
                            })
                            .then(function () {
                                finishOrderLocal(localPayload);
                            })
                            .catch(function (err) {
                                console.error('Firestore order/cart error:', err);
                                finishOrderLocal(localPayload);
                            });
                    } else {
                        finishOrderLocal(localPayload);
                    }
                }

                if (method === 'cod') {
                    if (placeBtn.getAttribute('data-tmv-order-busy') === '1') return;
                    placeBtn.setAttribute('data-tmv-order-busy', '1');
                    placeBtn.disabled = true;
                    if (authUser && typeof window.placeOrder === 'function' && typeof window.clearCart === 'function') {
                        window
                            .placeOrder(
                                buildFirestoreOrderPayload({
                                    paymentStatus: 'cod',
                                    orderStatus: 'placed'
                                })
                            )
                            .then(function () {
                                return window.clearCart(authUser.uid);
                            })
                            .then(function () {
                                finishOrderLocal();
                            })
                            .catch(function (err) {
                                console.error('Firestore order/cart error:', err);
                                finishOrderLocal();
                            })
                            .then(function () {
                                placeBtn.removeAttribute('data-tmv-order-busy');
                                placeBtn.disabled = false;
                            });
                    } else {
                        placeBtn.removeAttribute('data-tmv-order-busy');
                        placeBtn.disabled = false;
                        finishOrderLocal();
                    }
                    return;
                }

                if (method !== 'upi' && method !== 'card') {
                    showPlaceOrderMsg('Unsupported payment method.');
                    return;
                }

                if (placeBtn.getAttribute('data-tmv-rzp-busy') === '1') return;
                placeBtn.setAttribute('data-tmv-rzp-busy', '1');

                var RzpCtor = typeof Razorpay !== 'undefined' ? Razorpay : window.Razorpay;
                if (!RzpCtor) {
                    placeBtn.removeAttribute('data-tmv-rzp-busy');
                    showPlaceOrderMsg('Payment script did not load. Refresh the page and try again.');
                    return;
                }

                var apiBase = String(window.TMV_PAYMENT_API_BASE || '').replace(/\/$/, '');
                if (!apiBase) {
                    var host = window.location.hostname;
                    apiBase = host
                        ? window.location.protocol + '//' + host + ':3000'
                        : 'http://127.0.0.1:3000';
                }
                console.log('[tmv-pay] create-order →', apiBase, '(page:', window.location.href + ')');
                placeBtn.disabled = true;

                function clearRzpBusy() {
                    placeBtn.removeAttribute('data-tmv-rzp-busy');
                    placeBtn.disabled = false;
                }

                fetch(apiBase + '/create-order', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        amount: amountPaise,
                        currency: 'INR',
                        receipt: orderPayload.orderId
                    })
                })
                    .then(function (r) {
                        return r.text().then(function (text) {
                            var data = null;
                            try {
                                data = text ? JSON.parse(text) : {};
                            } catch (e) {
                                data = null;
                            }
                            if (!r.ok) {
                                throw new Error(
                                    (data && data.error) || 'Could not start payment (' + r.status + ').'
                                );
                            }
                            if (!data) throw new Error('Invalid response from payment server.');
                            return data;
                        });
                    })
                    .then(function (data) {
                        if (!data.success || !data.orderId || !data.keyId) {
                            throw new Error((data && data.error) || 'Invalid response from payment server.');
                        }
                        console.log('[tmv-pay] create-order ok', {
                            orderId: data.orderId,
                            hasKeyId: !!data.keyId,
                            amount: data.amount,
                            currency: data.currency
                        });
                        var cust = draft.customer || {};
                        var contactDigits = String(cust.phone || '').replace(/\D/g, '');
                        var prefill = {};
                        var nm = String(cust.name || '').trim();
                        if (nm) prefill.name = nm;
                        var em = String(cust.email || '').trim();
                        if (em) prefill.email = em;
                        if (contactDigits) prefill.contact = contactDigits;
                        var opts = {
                            key: data.keyId,
                            amount: String(data.amount),
                            currency: data.currency || 'INR',
                            order_id: data.orderId,
                            name: 'Zyron',
                            description: 'Order ' + orderPayload.orderId,
                            prefill: prefill,
                            handler: function (resp) {
                                fetch(apiBase + '/verify-payment', {
                                    method: 'POST',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify({
                                        razorpay_order_id: resp.razorpay_order_id,
                                        razorpay_payment_id: resp.razorpay_payment_id,
                                        razorpay_signature: resp.razorpay_signature
                                    })
                                })
                                    .then(function (vr) {
                                        return vr.text().then(function (t) {
                                            try {
                                                return t ? JSON.parse(t) : {};
                                            } catch (e) {
                                                return {};
                                            }
                                        });
                                    })
                                    .then(function (ver) {
                                        if (!ver || !ver.verified) {
                                            showPlaceOrderMsg(
                                                (ver && ver.error) ||
                                                    'Payment verification failed. If your account was charged, contact support with your payment id.'
                                            );
                                            clearRzpBusy();
                                            return;
                                        }
                                        afterVerifiedPersist(resp.razorpay_order_id, resp.razorpay_payment_id);
                                    })
                                    .catch(function (e) {
                                        console.error('[verify-payment]', e);
                                        showPlaceOrderMsg(
                                            'Could not verify payment. Check your connection and try again.'
                                        );
                                        clearRzpBusy();
                                    });
                            },
                            modal: {
                                ondismiss: function () {
                                    clearRzpBusy();
                                }
                            },
                            theme: { color: '#333333' }
                        };
                        try {
                            console.log('[tmv-pay] opening Razorpay modal');
                            var rzp = new RzpCtor(opts);
                            rzp.on('payment.failed', function (response) {
                                console.log('[tmv-pay] payment.failed', response && response.error);
                                clearRzpBusy();
                                var errObj = response && response.error;
                                var desc =
                                    (errObj && errObj.description) ||
                                    (errObj && errObj.reason) ||
                                    'Payment failed.';
                                showPlaceOrderMsg(desc);
                            });
                            rzp.open();
                        } catch (rzpErr) {
                            console.error('[tmv-pay] Razorpay constructor/open failed', rzpErr);
                            showPlaceOrderMsg(
                                'Could not open payment window. Check the browser console or try another browser.'
                            );
                            clearRzpBusy();
                        }
                    })
                    .catch(function (err) {
                        console.error('[create-order]', err);
                        var msg = err && err.message ? String(err.message) : '';
                        if (
                            msg.indexOf('Failed to fetch') !== -1 ||
                            msg.indexOf('NetworkError') !== -1 ||
                            msg.indexOf('Load failed') !== -1
                        ) {
                            showPlaceOrderMsg(
                                'Payment server unreachable (connection refused or offline). Open a terminal in the project folder and run: npm run start:payment — then keep it running on port 3000 with valid Razorpay test keys in .env.'
                            );
                        } else {
                            showPlaceOrderMsg(
                                msg || 'Could not start payment. Is the payment server running?'
                            );
                        }
                        clearRzpBusy();
                    });
            });
        }

        function hydrateFormsFromDraft() {
            var draft = loadDraft();
            var nameEl = document.getElementById('cust-name');
            var emailEl = document.getElementById('cust-email');
            var phoneEl = document.getElementById('cust-phone');
            if (nameEl) nameEl.value = draft.customer.name || '';
            if (emailEl) emailEl.value = draft.customer.email || '';
            if (phoneEl) phoneEl.value = draft.customer.phone || '';

            var d = draft.delivery || {};
            function set(id, v) {
                var el = document.getElementById(id);
                if (el) el.value = v || '';
            }
            set('del-first', d.firstName);
            set('del-last', d.lastName);
            set('del-a1', d.address1);
            set('del-a2', d.address2);
            set('del-city', d.city);
            set('del-pin', d.pincode);
            set('del-state', d.state);
            set('del-country', d.country || 'India');
            set('del-phone', d.phone || draft.customer.phone);
            var dm = document.getElementById('del-method');
            if (dm && d.method && dm.querySelector('option[value="' + d.method + '"]')) {
                dm.value = d.method;
            }

            if (billSame) {
                billSame.checked = draft.billingSameAsDelivery !== false;
                if (billWrap) billWrap.hidden = billSame.checked;
            }
            var b = draft.billing || {};
            set('bill-first', b.firstName);
            set('bill-last', b.lastName);
            set('bill-a1', b.address1);
            set('bill-a2', b.address2);
            set('bill-city', b.city);
            set('bill-pin', b.pincode);
            set('bill-state', b.state);
            set('bill-country', b.country);
            set('bill-phone', b.phone);

            if (payForm) {
                var pm = draft.payment && draft.payment.method;
                if (pm) {
                    var r = payForm.querySelector('input[name="pay-method"][value="' + pm + '"]');
                    if (r) r.checked = true;
                }
                var p = draft.payment || {};
                if (p.upiApp) {
                    var ur = payForm.querySelector('input[name="pay-upi-app"][value="' + p.upiApp + '"]');
                    if (ur) ur.checked = true;
                }
                if (p.cardType) {
                    var cr = payForm.querySelector('input[name="pay-card-type"][value="' + p.cardType + '"]');
                    if (cr) cr.checked = true;
                }
                set('pay-upi-id', p.upiId);
                set('pay-card-name', p.cardName);
                set('pay-card-number', p.cardNumber);
                set('pay-card-expiry', p.cardExpiry);
                set('pay-card-cvv', p.cardCvv);
                syncPaymentPanels();
            }
        }

        renderOrders();
        bootstrapCheckoutState()
            .then(function () {
                return new Promise(function (resolve) {
                    applyFirestoreCartToLocalStorageThen(resolve);
                });
            })
            .then(function () {
                renderOrders();
                syncRoute();
            });
    });
})();
