/**
 * TMV — minimal Razorpay TEST API (create order + verify signature).
 * Run: npm run start:payment
 * Env: project root .env — RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET (test keys), PORT (optional)
 */
'use strict';

require('dotenv').config({ path: require('path').join(__dirname, '.env') });

const express = require('express');
const cors = require('cors');
const crypto = require('crypto');
const Razorpay = require('razorpay');
const admin = require('firebase-admin');

const PORT = Number(process.env.PORT) || 3000;
const KEY_ID = process.env.RAZORPAY_KEY_ID || '';
const KEY_SECRET = process.env.RAZORPAY_KEY_SECRET || '';
const FIREBASE_PROJECT_ID = process.env.FIREBASE_PROJECT_ID || process.env.GCLOUD_PROJECT || '';
const FIREBASE_CLIENT_EMAIL = process.env.FIREBASE_CLIENT_EMAIL || '';
const FIREBASE_PRIVATE_KEY = process.env.FIREBASE_PRIVATE_KEY
    ? process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n')
    : '';

if (!KEY_ID || !KEY_SECRET) {
    console.warn(
        '[tmv-payment] Missing RAZORPAY_KEY_ID or RAZORPAY_KEY_SECRET in .env — /create-order will fail until set.'
    );
}

const razorpay = new Razorpay({
    key_id: KEY_ID,
    key_secret: KEY_SECRET
});

const app = express();

function createFirebaseAdminOptions() {
    var options = {};
    if (FIREBASE_PROJECT_ID) {
        options.projectId = FIREBASE_PROJECT_ID;
    }
    if (FIREBASE_CLIENT_EMAIL && FIREBASE_PRIVATE_KEY) {
        options.credential = admin.credential.cert({
            projectId: FIREBASE_PROJECT_ID,
            clientEmail: FIREBASE_CLIENT_EMAIL,
            privateKey: FIREBASE_PRIVATE_KEY
        });
        return options;
    }
    try {
        options.credential = admin.credential.applicationDefault();
    } catch (err) {
        return options;
    }
    return options;
}

function getAdminApp() {
    if (admin.apps.length) {
        return admin.app();
    }
    return admin.initializeApp(createFirebaseAdminOptions());
}

function getAdminDb() {
    return getAdminApp().firestore();
}

function isAllowedDevOrigin(origin) {
    if (!origin || origin === 'null') return true;
    try {
        var u = new URL(origin);
        var h = (u.hostname || '').toLowerCase();
        if (u.protocol !== 'http:' && u.protocol !== 'https:') return false;
        return h === 'localhost' || h === '127.0.0.1' || h === '[::1]' || h === '::1';
    } catch (e) {
        return false;
    }
}

app.use(
    cors({
        origin: function (origin, callback) {
            if (!origin || origin === 'null') {
                return callback(null, true);
            }
            if (isAllowedDevOrigin(origin)) {
                return callback(null, origin);
            }
            return callback(null, false);
        },
        methods: ['GET', 'POST', 'OPTIONS'],
        allowedHeaders: ['Content-Type', 'Authorization'],
        maxAge: 86400
    })
);
app.use(function (_req, res, next) {
    res.setHeader('Access-Control-Allow-Private-Network', 'true');
    next();
});
app.use(express.json({ limit: '32kb' }));

function verifySignature(orderId, paymentId, signature) {
    if (!KEY_SECRET || !orderId || !paymentId || !signature) return false;
    const body = String(orderId) + '|' + String(paymentId);
    const expectedHex = crypto.createHmac('sha256', KEY_SECRET).update(body).digest('hex');
    const sigHex = String(signature).trim().toLowerCase();
    try {
        const expBuf = Buffer.from(expectedHex, 'hex');
        const sigBuf = Buffer.from(sigHex, 'hex');
        if (expBuf.length !== sigBuf.length || expBuf.length === 0) return false;
        return crypto.timingSafeEqual(expBuf, sigBuf);
    } catch (e) {
        return false;
    }
}

async function readBearerToken(req) {
    const authHeader = String(req.headers.authorization || '');
    if (!authHeader.toLowerCase().startsWith('bearer ')) {
        return null;
    }
    return authHeader.slice(7).trim() || null;
}

async function requireAdminAuth(req, res, next) {
    try {
        const token = await readBearerToken(req);
        if (!token) {
            return res.status(401).json({ success: false, error: 'Missing authentication token.' });
        }

        const decoded = await getAdminApp().auth().verifyIdToken(token);
        const userSnap = await getAdminDb().collection('users').doc(decoded.uid).get();
        const userData = userSnap.exists ? userSnap.data() || {} : {};

        if (String(userData.role || '').toLowerCase() !== 'admin') {
            return res.status(403).json({ success: false, error: 'Admin access required.' });
        }

        req.adminUser = decoded;
        req.adminProfile = userData;
        return next();
    } catch (err) {
        console.error('[admin-auth]', err);
        return res.status(401).json({ success: false, error: 'Invalid or expired authentication token.' });
    }
}

app.post('/create-order', async function (req, res) {
    try {
        const amount = Number(req.body && req.body.amount);
        const currency = (req.body && req.body.currency) || 'INR';
        const receipt = (req.body && req.body.receipt) || 'tmv_' + Date.now();

        console.log('[create-order] incoming amount(paise)=', amount, 'currency=', currency);

        if (!Number.isFinite(amount) || amount < 100 || amount > 1e12) {
            return res.status(400).json({
                success: false,
                error: 'Invalid amount (must be INR paise, min 100).'
            });
        }
        if (currency !== 'INR') {
            return res.status(400).json({ success: false, error: 'Only INR is supported.' });
        }
        if (!KEY_ID || !KEY_SECRET) {
            return res.status(500).json({ success: false, error: 'Server payment keys are not configured.' });
        }

        const order = await razorpay.orders.create({
            amount: Math.round(amount),
            currency: currency,
            receipt: String(receipt).slice(0, 40)
        });

        console.log('[create-order] razorpay order id=', order.id, 'amount=', order.amount);

        return res.json({
            success: true,
            orderId: order.id,
            amount: order.amount,
            currency: order.currency,
            keyId: KEY_ID
        });
    } catch (err) {
        console.error('[create-order]', err);
        return res.status(502).json({
            success: false,
            error: (err && err.error && err.error.description) || err.message || 'Razorpay order failed'
        });
    }
});

app.post('/verify-payment', function (req, res) {
    const b = req.body || {};
    const orderId = b.razorpay_order_id;
    const paymentId = b.razorpay_payment_id;
    const signature = b.razorpay_signature;

    if (!orderId || !paymentId || !signature) {
        return res.status(400).json({ verified: false, error: 'Missing payment fields.' });
    }

    const ok = verifySignature(orderId, paymentId, signature);
    return res.json({ verified: ok });
});

app.get('/admin/orders', requireAdminAuth, async function (_req, res) {
    try {
        const snap = await getAdminDb().collection('orders').orderBy('createdAt', 'desc').get();
        const orders = [];
        snap.forEach(function (doc) {
            const data = doc.data() || {};
            orders.push({
                id: doc.id,
                userId: data.userId || '',
                totalAmount: data.totalAmount != null ? data.totalAmount : null,
                paymentMethod: data.paymentMethod || '',
                orderStatus: data.orderStatus || data.status || 'placed',
                status: data.status || 'placed',
                currency: data.currency || 'INR'
            });
        });
        return res.json({ success: true, orders: orders });
    } catch (err) {
        console.error('[admin/orders]', err);
        return res.status(500).json({ success: false, error: 'Failed to fetch orders.' });
    }
});

app.post('/admin/update-order', requireAdminAuth, async function (req, res) {
    try {
        const orderId = String((req.body && req.body.orderId) || '').trim();
        const status = String((req.body && req.body.status) || '').trim().toLowerCase();
        const allowedStatuses = ['placed', 'shipped', 'delivered', 'cancelled'];

        if (!orderId) {
            return res.status(400).json({ success: false, error: 'orderId is required.' });
        }
        if (allowedStatuses.indexOf(status) === -1) {
            return res.status(400).json({ success: false, error: 'Invalid order status.' });
        }

        const orderRef = getAdminDb().collection('orders').doc(orderId);
        const orderSnap = await orderRef.get();
        if (!orderSnap.exists) {
            return res.status(404).json({ success: false, error: 'Order not found.' });
        }

        await orderRef.set(
            {
                orderStatus: status,
                updatedAt: admin.firestore.FieldValue.serverTimestamp()
            },
            { merge: true }
        );

        return res.json({ success: true, orderId: orderId, orderStatus: status });
    } catch (err) {
        console.error('[admin/update-order]', err);
        return res.status(500).json({ success: false, error: 'Failed to update order status.' });
    }
});

app.get('/health', function (_req, res) {
    res.json({ ok: true, razorpayConfigured: !!(KEY_ID && KEY_SECRET) });
});

app.listen(PORT, '0.0.0.0', function () {
    console.log('[tmv-payment] listening on port', PORT, '(use http://127.0.0.1:' + PORT + ' or http://localhost:' + PORT + ')');
});
