// Firebase services should be available globally via CDN scripts
// Initialize Firebase and get service instances
// The firebaseConfig object is assumed to be loaded from js/firebase.js
const firebaseApp = firebase.initializeApp(firebaseConfig);
const db = firebaseApp.firestore();
const auth = firebaseApp.auth();
const googleProvider = new firebase.auth.GoogleAuthProvider();

// Function to create or update user document in Firestore
async function upsertUserDocument(user, additionalData = {}) {
    if (!user) return;
    const userRef = db.collection("users").doc(user.uid);
    const docSnap = await userRef.get(); // Fetch document to check if it exists

    const isNewUser = !docSnap.exists;

    // Retrieve existing user data if it exists, to preserve fields not provided by auth or additionalData
    let existingData = {};
    if (docSnap.exists) {
        existingData = docSnap.data();
    }

    // Determine 'name' based on priority: additionalData.name -> user.displayName -> existingData.name -> email prefix
    let userName = additionalData.name || user.displayName || existingData.name || user.email?.split('@')[0] || '';

    // Determine 'provider'
    let providerId = 'password'; // Default for email/password auth
    if (user.providerData && user.providerData.length > 0) {
        const provider = user.providerData[0].providerId;
        if (provider === 'google.com') {
            providerId = 'google';
        } else {
            providerId = provider; // Use the actual provider ID if not Google
        }
    }

    const userDataToSet = {
        uid: user.uid,
        name: userName,
        email: user.email,
        photoURL: user.photoURL || '',
        provider: providerId,
        // For fields not directly from auth or additionalData, preserve existing or default to empty string
        phone: additionalData.phone || existingData.phone || '',
        dateOfBirth: additionalData.dateOfBirth || existingData.dateOfBirth || '',
        lastLoginAt: firebase.firestore.FieldValue.serverTimestamp(), // Always update lastLoginAt
    };

    if (isNewUser) {
        userDataToSet.createdAt = firebase.firestore.FieldValue.serverTimestamp(); // Set createdAt only on creation
    } else {
        // Preserve createdAt if it already exists in Firestore for an existing user
        if (existingData.createdAt) {
            userDataToSet.createdAt = existingData.createdAt;
        }
    }

    try {
        await userRef.set(userDataToSet, { merge: true }); // Use merge: true for safe updates
        console.log("Firestore user save success:", user.uid); // Added success log
    } catch (error) {
        console.error("Firestore user save failed:", error); // Use requested error message
    }
}

document.addEventListener('DOMContentLoaded', async () => {
    // DOM elements for product display
    const productGrid = document.querySelector('.product-grid');

    // DOM elements for authentication
    const profileTrigger = document.querySelector('a[href="pages/profile.html"]');
    const accountPanel = document.querySelector('[data-account-panel]');
    const accountOverlay = document.querySelector('[data-account-overlay]');
    const loginForm = accountPanel ? accountPanel.querySelector('.login-form') : null;
    const loginEmailInput = document.getElementById('login-email');
    const loginPasswordInput = document.getElementById('login-password');
    const googleSignInBtn = accountPanel ? accountPanel.querySelector('.google-signin-btn') : null;
    const createAccountBtn = accountPanel ? accountPanel.querySelector('.create-account-button') : null;
    const PROFILE_PAGE_PATH = 'pages/profile.html';
    const SIGNUP_PAGE_PATH = 'pages/signup.html';
    let isRedirectingAfterAuth = false;

    // Helper function to close account panel
    function closeAccountPanel() {
        if (accountOverlay && accountPanel) {
            accountOverlay.classList.remove('is-open');
            accountPanel.classList.remove('is-open');
            accountOverlay.setAttribute('aria-hidden', 'true');
            accountPanel.setAttribute('aria-hidden', 'true');
            document.body.style.overflow = '';
        }
    }

    function getProfilePageUrl() {
        if (window.location.pathname.includes('/pages/')) {
            return 'profile.html';
        }
        return PROFILE_PAGE_PATH;
    }

    function getSignupPageUrl() {
        if (window.location.pathname.includes('/pages/')) {
            return 'signup.html';
        }
        return SIGNUP_PAGE_PATH;
    }

    async function handleAuthSuccessAndRedirect(user) {
        await upsertUserDocument(user);
        closeAccountPanel();
        console.log("Redirecting to user page");
        isRedirectingAfterAuth = true;
        window.location.href = getProfilePageUrl();
    }

    // Firebase Authentication State Listener
    auth.onAuthStateChanged(async (user) => {
        if (!user) {
            console.log("No user signed in. Profile link will open login modal.");
            isRedirectingAfterAuth = false;
            if (profileTrigger) {
                profileTrigger.href = PROFILE_PAGE_PATH; // Ensure profile link points to profile page
            }
            // No custom onclick needed here, main.js handles it.
            return;
        }
        console.log("Auth user found:", user.uid, user.email);
        try {
            await upsertUserDocument(user);
            console.log("Firestore user document upserted successfully after auth state change.");
            closeAccountPanel();

            if (isRedirectingAfterAuth) {
                return;
            }

            if (window.location.pathname.includes('signup.html') && user) {
                console.log("Redirecting to user page");
                window.location.href = getProfilePageUrl();
                return;
            }
        } catch (error) {
            console.error("Auth state listener error during Firestore save:", error);
        }
    });

    // Keep homepage featured cards from index.html unchanged (static 4 cards).
    // Do not override product-grid content from Firestore here.

    // --- Firebase Authentication Logic --- 

    // Google Sign-In
    if (googleSignInBtn) {
        if (googleSignInBtn.dataset.authBound !== '1') {
            googleSignInBtn.dataset.authBound = '1';
        googleSignInBtn.addEventListener('click', async () => {
            try {
                console.log("Google login started");
                const result = await auth.signInWithPopup(googleProvider);
                console.log("Google login success", result.user.uid);
                await handleAuthSuccessAndRedirect(result.user);
            } catch (error) {
                console.error('Google Sign-In error:', error);
                if (error.code && error.code.includes('auth')) {
                    alert('Google Sign-In failed: ' + error.message);
                } else {
                    console.warn('Non-authentication error during Google Sign-In, likely Firestore permissions. Check console for details.');
                }
            }
        });
        }
    }

    // Email/Password Login
    if (loginForm) {
        if (loginForm.dataset.authBound !== '1') {
            loginForm.dataset.authBound = '1';
        loginForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            var emailEl = (loginForm && loginForm.querySelector('#login-email')) || loginEmailInput;
            var passEl = (loginForm && loginForm.querySelector('#login-password')) || loginPasswordInput;
            if (!emailEl || !passEl) {
                alert('Login form is not available. Please refresh the page.');
                return;
            }
            var email = String(emailEl.value || '').trim().toLowerCase();
            var password = String(passEl.value || '').trim();
            if (!email || !password) {
                alert('Please enter your email and password.');
                return;
            }

            try {
                console.log("Email login started");
                const userCredential = await auth.signInWithEmailAndPassword(email, password);
                console.log("Email login success", userCredential.user.uid);
                await handleAuthSuccessAndRedirect(userCredential.user);
            } catch (error) {
                console.error('Email/Password Login error:', error.code, error.message);
                var code = (error && error.code) || '';
                var rawMsg = String((error && error.message) || '');
                var msgLower = rawMsg.toLowerCase();
                var wrongCreds =
                    code === 'auth/wrong-password' ||
                    code === 'auth/user-not-found' ||
                    code === 'auth/invalid-credential' ||
                    code === 'auth/invalid-email' ||
                    msgLower.indexOf('invalid_login') !== -1 ||
                    msgLower.indexOf('invalid-login') !== -1;
                var userMsg = 'Sign-in failed. Please try again.';
                if (wrongCreds) {
                    userMsg = 'That email or password is incorrect.';
                    try {
                        var methods = await auth.fetchSignInMethodsForEmail(email);
                        if (methods.indexOf('password') === -1 && methods.indexOf('google.com') !== -1) {
                            userMsg =
                                'This email is linked to Google sign-in. Use “Sign in with Google” instead of email and password.';
                        }
                    } catch (fmErr) {
                        /* ignore */
                    }
                } else if (code === 'auth/user-disabled') {
                    userMsg = 'This account has been disabled. Contact support if you need help.';
                } else if (code === 'auth/too-many-requests') {
                    userMsg = 'Too many attempts. Please wait a moment and try again.';
                } else if (rawMsg) {
                    userMsg = 'Sign-in failed: ' + rawMsg;
                }
                alert(userMsg);
            }
        });
        }
    }

    // Account Creation / Sign Up - Redirect to existing signup page
    if (createAccountBtn) {
        if (createAccountBtn.dataset.authBound !== '1') {
            createAccountBtn.dataset.authBound = '1';

            const openSignupView = (event) => {
                if (event) {
                    event.preventDefault();
                    event.stopPropagation();
                }
                console.log("Create Account clicked");
                console.log("Opening signup view");
                closeAccountPanel();
                console.log("Create Account view opened");
                window.location.href = getSignupPageUrl();
            };

            createAccountBtn.addEventListener('click', openSignupView);
            createAccountBtn.addEventListener('touchend', openSignupView, { passive: false });
        }
    }
});
