/**
 * Firestore cart + orders (Firebase v8 compat).
 * Paths: cart/{uid}/items/{itemId}, orders/{autoId}
 */
(function () {
    'use strict';

    function tmvEnsureFirestoreApp() {
        if (typeof firebase === 'undefined') return false;
        if (typeof firebaseConfig === 'undefined') return false;
        try {
            if (!firebase.apps.length) {
                firebase.initializeApp(firebaseConfig);
            }
        } catch (e) {
            console.error('[cart-firestore] init error:', e);
            return false;
        }
        return !!firebase.firestore;
    }

    /**
     * Wait until Firebase Auth has finished restoring session (currentUser is reliable).
     */
    function tmvWhenAuthUserReady() {
        return new Promise(function (resolve) {
            if (typeof firebase === 'undefined' || !firebase.auth) {
                resolve(null);
                return;
            }
            var unsub = firebase.auth().onAuthStateChanged(function (user) {
                unsub();
                resolve(user || null);
            });
        });
    }

    function tmvSanitizeDocId(s) {
        return String(s).replace(/[/\\]/g, '_');
    }

    function cartItemsCollection(uid) {
        return firebase.firestore().collection('cart').doc(uid).collection('items');
    }

    function mapSnapToOrderItems(snap) {
        var orderItems = [];
        snap.forEach(function (doc) {
            var d = doc.data() || {};
            orderItems.push({
                productId: String(d.productId != null ? d.productId : doc.id),
                name: d.name,
                price: d.price,
                image: d.image,
                quantity: Number(d.quantity) || 1
            });
        });
        return orderItems;
    }

    /**
     * Save / merge into cart/{uid}/items/{itemId}. Resolves to cart rows or null (guest / error).
     */
    window.addToCart = function (item) {
        if (!tmvEnsureFirestoreApp()) {
            console.warn('[addToCart] Firebase not available; skipping Firestore.');
            return Promise.resolve(null);
        }
        return tmvWhenAuthUserReady()
            .then(function (user) {
                if (!user || !user.uid) {
                    console.warn('[addToCart] No signed-in user after auth ready; skipping Firestore.');
                    return null;
                }
                var uid = user.uid;
                var pid = String(item && item.productId != null ? item.productId : '');
                if (!pid) {
                    console.warn('[addToCart] Missing productId; skipping Firestore.');
                    return null;
                }
                var docId = tmvSanitizeDocId(pid);
                var colPath = 'cart/' + uid + '/items';
                var fullPath = colPath + '/' + docId;
                var ref = cartItemsCollection(uid).doc(docId);
                var payloadPreview = {
                    productId: pid,
                    name: item.name,
                    price: item.price,
                    image: item.image,
                    quantity: item.quantity
                };
                console.log('[addToCart] uid=', uid, 'firestorePath=', fullPath, 'payload=', payloadPreview);

                return ref
                    .get()
                    .then(function (snap) {
                        var prevQty = snap.exists ? Number(snap.data().quantity) || 0 : 0;
                        var addQty = Number(item.quantity) || 1;
                        var upd = {
                            productId: pid,
                            name: item.name,
                            price: item.price,
                            image: item.image,
                            quantity: prevQty + addQty
                        };
                        if (!snap.exists) {
                            upd.addedAt = firebase.firestore.FieldValue.serverTimestamp();
                        }
                        return ref.set(upd, { merge: true });
                    })
                    .then(function () {
                        console.log('[addToCart] Success writing to', fullPath);
                        return window.loadCartFromFirestore();
                    });
            })
            .catch(function (err) {
                console.error('[addToCart] Failure:', err);
                return null;
            });
    };

    /**
     * Load cart/{uid}/items after auth is ready. Returns null if guest; [] if empty cart.
     */
    window.loadCartFromFirestore = function () {
        if (!tmvEnsureFirestoreApp()) {
            console.warn('[loadCartFromFirestore] Firebase not available.');
            return Promise.resolve(null);
        }
        return tmvWhenAuthUserReady()
            .then(function (user) {
                if (!user || !user.uid) {
                    console.warn('[loadCartFromFirestore] No signed-in user after auth ready.');
                    return null;
                }
                var uid = user.uid;
                var colPath = 'cart/' + uid + '/items';
                console.log('[loadCartFromFirestore] uid=', uid, 'collection=', colPath);
                return cartItemsCollection(uid)
                    .get()
                    .then(function (snap) {
                        var rows = [];
                        snap.forEach(function (doc) {
                            var d = doc.data() || {};
                            rows.push({
                                id: doc.id,
                                productId: d.productId || doc.id,
                                image: d.image || '',
                                name: d.name || '',
                                price: d.price || '',
                                status: 'Pending',
                                quantity: Number(d.quantity) || 1
                            });
                        });
                        console.log('[loadCartFromFirestore] Success,', rows.length, 'item(s)');
                        return rows;
                    });
            })
            .catch(function (err) {
                console.error('[loadCartFromFirestore] Failure:', err);
                return null;
            });
    };

    /**
     * Delete cart/{uid}/items/{itemId}. itemId must match save/load doc id (sanitized productId).
     * Returns refreshed cart rows from Firestore, or null if guest / skip.
     */
    window.removeCartItem = async function (itemId) {
        try {
            if (!tmvEnsureFirestoreApp()) {
                console.warn('[removeCartItem] Firebase not available.');
                return null;
            }
            var user = await tmvWhenAuthUserReady();
            if (!user || !user.uid) {
                console.warn('[removeCartItem] No signed-in user after auth ready.');
                return null;
            }
            var uid = user.uid;
            var docId = tmvSanitizeDocId(String(itemId));
            var fullPath = 'cart/' + uid + '/items/' + docId;
            console.log('[removeCartItem] uid=', uid, 'deleting path=', fullPath);
            await cartItemsCollection(uid).doc(docId).delete();
            console.log('[removeCartItem] Success deleted', fullPath);
            var rows = await window.loadCartFromFirestore();
            return rows;
        } catch (err) {
            console.error('[removeCartItem] Failure:', err);
            throw err;
        }
    };

    window.removeCartItemFromFirestore = function (uid, itemDocId) {
        return window.removeCartItem(itemDocId);
    };

    /**
     * payload: { userId, totalAmount, subtotal?, deliveryFee?, discount?, address, billingAddress?,
     *   billingSameAsDelivery?, lineItems?, paymentMethod, paymentDetails?, status?, orderStatus?,
     *   paymentStatus?, paymentProvider?, razorpayOrderId?, razorpayPaymentId?, currency?, paidAtField? }
     */
    window.placeOrder = function (payload) {
        if (!tmvEnsureFirestoreApp()) {
            console.error('[placeOrder] Firebase unavailable');
            return Promise.reject(new Error('Firebase unavailable'));
        }
        var uid = payload && payload.userId;
        if (!uid) {
            console.error('[placeOrder] Missing userId');
            return Promise.reject(new Error('Missing userId'));
        }
        console.log('[placeOrder] Fetching cart for uid:', uid);
        return cartItemsCollection(uid)
            .get()
            .then(function (snap) {
                var orderItems =
                    payload.lineItems && payload.lineItems.length
                        ? payload.lineItems
                        : mapSnapToOrderItems(snap);
                if (!orderItems.length) {
                    console.warn('[placeOrder] No line items (cart empty and no lineItems in payload).');
                }
                var orderRef = firebase.firestore().collection('orders').doc();
                console.log('[placeOrder] Writing order:', orderRef.id);
                var doc = {
                    userId: uid,
                    items: orderItems,
                    totalAmount: payload.totalAmount,
                    address: payload.address,
                    paymentMethod: payload.paymentMethod,
                    paymentDetails: payload.paymentDetails != null ? payload.paymentDetails : null,
                    status: payload.status || 'placed',
                    createdAt: firebase.firestore.FieldValue.serverTimestamp()
                };
                if (payload.subtotal != null) doc.subtotal = payload.subtotal;
                if (payload.deliveryFee != null) doc.deliveryFee = payload.deliveryFee;
                if (payload.discount != null) doc.discount = payload.discount;
                /* Only persist billingAddress when billing is explicitly different from delivery. */
                if (payload.billingSameAsDelivery === false) {
                    doc.billingSameAsDelivery = false;
                    if (payload.billingAddress != null) {
                        doc.billingAddress = payload.billingAddress;
                    }
                } else {
                    doc.billingSameAsDelivery = true;
                }
                if (payload.orderStatus != null) doc.orderStatus = payload.orderStatus;
                if (payload.paymentStatus != null) doc.paymentStatus = payload.paymentStatus;
                if (payload.paymentProvider != null) doc.paymentProvider = payload.paymentProvider;
                if (payload.razorpayOrderId != null) doc.razorpayOrderId = payload.razorpayOrderId;
                if (payload.razorpayPaymentId != null) doc.razorpayPaymentId = payload.razorpayPaymentId;
                if (payload.currency != null) doc.currency = payload.currency;
                if (payload.paidAtField === true) {
                    doc.paidAt = firebase.firestore.FieldValue.serverTimestamp();
                }
                if (payload.updatedAtField === true) {
                    doc.updatedAt = firebase.firestore.FieldValue.serverTimestamp();
                }
                /* Final guarantee: never persist duplicate billing when same as delivery. */
                if (doc.billingSameAsDelivery !== false) {
                    delete doc.billingAddress;
                }
                console.log('[FINAL DOC BEFORE SAVE]', doc);
                return orderRef.set(doc);
            })
            .then(function () {
                console.log('[placeOrder] Success');
            })
            .catch(function (err) {
                console.error('[placeOrder] Failure:', err);
                return Promise.reject(err);
            });
    };

    window.clearCart = function (uid) {
        if (!tmvEnsureFirestoreApp() || !uid) {
            console.warn('[clearCart] Skipped.');
            return Promise.resolve();
        }
        console.log('[clearCart] uid=', uid);
        return cartItemsCollection(uid)
            .get()
            .then(function (snap) {
                var batch = firebase.firestore().batch();
                snap.forEach(function (doc) {
                    batch.delete(doc.ref);
                });
                return batch.commit();
            })
            .then(function () {
                console.log('[clearCart] Success');
            })
            .catch(function (err) {
                console.error('[clearCart] Failure:', err);
                return Promise.reject(err);
            });
    };

    window.clearCartAfterOrder = window.clearCart;
})();
