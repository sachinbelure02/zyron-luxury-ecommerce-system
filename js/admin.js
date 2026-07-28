(function () {
    'use strict';

    var HOME_PATH = '../index.html';
    var ALLOWED_STATUSES = ['placed', 'shipped', 'delivered', 'cancelled'];
    var messageEl = document.getElementById('adminMessage');
    var ordersContainer = document.getElementById('ordersContainer');

    function ensureFirebaseApp() {
        if (typeof firebase === 'undefined' || typeof firebaseConfig === 'undefined') {
            return false;
        }
        try {
            if (!firebase.apps.length) {
                firebase.initializeApp(firebaseConfig);
            }
            return !!(firebase.auth && firebase.firestore);
        } catch (err) {
            console.error('[admin] Firebase init failed:', err);
            return false;
        }
    }

    function redirectHome() {
        window.location.replace(HOME_PATH);
    }

    function setStatus(message, isError) {
        if (!messageEl) return;
        messageEl.textContent = message;
        messageEl.style.display = 'block';
        messageEl.style.color = isError ? '#111' : '';
    }

    function escapeHtml(value) {
        return String(value == null ? '' : value)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function formatAmount(amountValue) {
        var amount = Number(amountValue);
        if (!Number.isFinite(amount)) {
            return 'N/A';
        }
        try {
            return new Intl.NumberFormat('en-IN', {
                style: 'currency',
                currency: 'INR',
                maximumFractionDigits: 2
            }).format(amount);
        } catch (e) {
            return '\u20B9' + amount.toFixed(2);
        }
    }

    function formatCreatedAt(createdAt) {
        try {
            if (createdAt && typeof createdAt.toDate === 'function') {
                return createdAt.toDate().toLocaleString('en-IN');
            }
            if (createdAt && createdAt.seconds) {
                return new Date(createdAt.seconds * 1000).toLocaleString('en-IN');
            }
        } catch (err) {
            console.error('[admin] Created date format failed:', err);
        }
        return 'N/A';
    }

    function getValidStatus(statusValue) {
        var status = String(statusValue || 'placed').toLowerCase();
        return ALLOWED_STATUSES.indexOf(status) >= 0 ? status : 'placed';
    }

    function buildOrderCard(order) {
        var safeId = escapeHtml(order.id);
        var safeUser = escapeHtml(order.userId || 'N/A');
        var safePayment = escapeHtml(order.paymentMethod || 'N/A');
        var safeStatus = escapeHtml(getValidStatus(order.orderStatus || order.status));
        var safeDate = escapeHtml(formatCreatedAt(order.createdAt));
        var safeAmount = escapeHtml(formatAmount(order.totalAmount));

        return (
            '<article class="admin-order-card" data-order-id="' + safeId + '">' +
                '<h3 class="admin-section-title">Order</h3>' +
                '<p class="admin-order-row"><strong>Order ID:</strong> ' + safeId + '</p>' +
                '<p class="admin-order-row"><strong>User ID:</strong> ' + safeUser + '</p>' +
                '<p class="admin-order-row"><strong>Total Amount:</strong> ' + safeAmount + '</p>' +
                '<p class="admin-order-row"><strong>Payment Method:</strong> ' + safePayment + '</p>' +
                '<p class="admin-order-row"><strong>Order Status:</strong> <span data-status-text="' + safeId + '">' + safeStatus + '</span></p>' +
                '<p class="admin-order-row"><strong>Created Date:</strong> ' + safeDate + '</p>' +
                '<div class="admin-order-actions">' +
                    '<select class="admin-order-status-select" data-status-select="' + safeId + '">' +
                        '<option value="placed"' + (safeStatus === 'placed' ? ' selected' : '') + '>placed</option>' +
                        '<option value="shipped"' + (safeStatus === 'shipped' ? ' selected' : '') + '>shipped</option>' +
                        '<option value="delivered"' + (safeStatus === 'delivered' ? ' selected' : '') + '>delivered</option>' +
                        '<option value="cancelled"' + (safeStatus === 'cancelled' ? ' selected' : '') + '>cancelled</option>' +
                    '</select>' +
                    '<button type="button" class="admin-update-btn" data-update-button="' + safeId + '">Update Status</button>' +
                '</div>' +
            '</article>'
        );
    }

    function renderOrders(orders) {
        if (!ordersContainer) return;
        if (!orders || !orders.length) {
            ordersContainer.innerHTML = '<article class="admin-order-card">No orders available</article>';
            return;
        }

        ordersContainer.innerHTML = orders.map(buildOrderCard).join('');
    }

    function fetchOrders() {
        return firebase.firestore().collection('orders').get().then(function (snapshot) {
            var orders = [];
            snapshot.forEach(function (doc) {
                var data = doc.data() || {};
                orders.push({
                    id: doc.id,
                    userId: data.userId || '',
                    totalAmount: data.totalAmount,
                    paymentMethod: data.paymentMethod || '',
                    orderStatus: data.orderStatus || data.status || 'placed',
                    createdAt: data.createdAt || null
                });
            });
            orders.sort(function (a, b) {
                var aSec = a.createdAt && a.createdAt.seconds ? a.createdAt.seconds : 0;
                var bSec = b.createdAt && b.createdAt.seconds ? b.createdAt.seconds : 0;
                return bSec - aSec;
            });
            return orders;
        });
    }

    function loadOrders() {
        setStatus('Loading orders...');
        fetchOrders()
            .then(function (orders) {
                renderOrders(orders);
                if (!orders.length) {
                    setStatus('No orders available');
                    return;
                }
                setStatus('Orders loaded successfully.');
            })
            .catch(function (err) {
                console.error('[admin] Orders fetch failed:', err);
                renderOrders([]);
                setStatus('Failed to load orders.', true);
            });
    }

    function verifyAdminUser(user) {
        return firebase.firestore().collection('users').doc(user.uid).get().then(function (snap) {
            var data = snap.exists ? snap.data() || {} : {};
            return String(data.role || '').toLowerCase() === 'admin';
        });
    }

    document.addEventListener('click', function (event) {
        var button = event.target.closest('[data-update-button]');
        if (!button) return;

        var currentUser = firebase.auth().currentUser;
        if (!currentUser) {
            redirectHome();
            return;
        }

        var orderId = button.getAttribute('data-update-button');
        var select = document.querySelector('[data-status-select="' + orderId + '"]');
        var status = select ? getValidStatus(select.value) : '';
        if (ALLOWED_STATUSES.indexOf(status) === -1) {
            setStatus('Please select a valid order status.', true);
            return;
        }

        button.disabled = true;
        button.textContent = 'Updating...';
        setStatus('Updating order status...');
        firebase.firestore().collection('orders').doc(orderId).set({ orderStatus: status }, { merge: true })
            .then(function () {
                setStatus('Order status updated successfully.');
                return loadOrders();
            })
            .catch(function (err) {
                console.error('[admin] Order update failed:', err);
                setStatus('Unable to update order status.', true);
            })
            .finally(function () {
                button.disabled = false;
                button.textContent = 'Update Status';
            });
    });

    if (!ensureFirebaseApp()) {
        setStatus('Firebase is unavailable on this page.', true);
    } else {
        firebase.auth().onAuthStateChanged(function (user) {
            if (!user) {
                redirectHome();
                return;
            }

            verifyAdminUser(user)
                .then(function (isAdmin) {
                    if (!isAdmin) {
                        redirectHome();
                        return;
                    }
                    loadOrders();
                })
                .catch(function (err) {
                    console.error('[admin] Admin verification failed:', err);
                    redirectHome();
                });
        });
    }
})();
