// Initialize Firebase with the same config as index.html
firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();

// Function to create or update user document in Firestore
async function upsertUserDocument(user, additionalData = {}) {
    if (!user) return;
    const userRef = db.collection("users").doc(user.uid);
    const userData = {
        uid: user.uid,
        email: user.email,
        firstName: additionalData.firstName || user.displayName?.split(' ')[0] || '',
        lastName: additionalData.lastName || user.displayName?.split(' ').slice(1).join(' ') || '',
        phone: additionalData.phone || user.phoneNumber || null,
        title: additionalData.title || null,
        dateOfBirth: additionalData.dateOfBirth || null,
        createdAt: additionalData.createdAt || firebase.firestore.FieldValue.serverTimestamp()
    };
    try {
        await userRef.set(userData, { merge: true });
        console.log("Firestore user save success:", user.uid);
    } catch (error) {
        console.error("Firestore user save failed:", error);
    }
}

// Helper function to redirect after successful authentication
function redirectOnSuccess(pageUrl) {
    window.location.href = pageUrl;
}

document.addEventListener('DOMContentLoaded', () => {
    const signupPasswordInput = document.getElementById('signup-password');
    const signupTogglePasswordBtn = document.querySelector('.toggle-password-visibility');

    // Re-attach password visibility toggle listener for the new password input
    if (signupPasswordInput && signupTogglePasswordBtn) {
        signupTogglePasswordBtn.addEventListener('click', () => {
            const type = signupPasswordInput.getAttribute('type') === 'password' ? 'text' : 'password';
            signupPasswordInput.setAttribute('type', type);
            signupTogglePasswordBtn.classList.toggle('show-password');
        });
    }

    // Back to Login button
    document.getElementById('back-to-login').addEventListener('click', () => {
        window.location.href = '../index.html';
    });

    // Handle signup form submission
    document.getElementById('signup-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        // Clear previous errors
        document.querySelectorAll('.error-message').forEach(el => el.textContent = '');
        document.getElementById('signup-errors').textContent = '';

        const email = String(document.getElementById('signup-email').value || '').trim().toLowerCase();
        const password = String(document.getElementById('signup-password').value || '').trim();
        const title = document.getElementById('signup-title').value;
        const firstName = document.getElementById('signup-first-name').value;
        const lastName = document.getElementById('signup-last-name').value;
        const phone = document.getElementById('signup-phone').value;
        const dateOfBirth = document.getElementById('signup-dob').value;
        const privacyPolicy = document.getElementById('privacy-policy').checked;

        let isValid = true;
        let errorMessage = "";

        if (!email || !password) {
            errorMessage += "Please enter your email and password.";
            isValid = false;
        }
        if (password.length < 6) {
            document.getElementById('error-signup-password').textContent = "Password must be at least 6 characters.";
            isValid = false;
        }
        if (!firstName || !lastName || !privacyPolicy) {
            errorMessage += "Please fill all required fields.";
            isValid = false;
        }
        if (!privacyPolicy) {
            document.getElementById('error-privacy-policy').textContent = "You must accept the Privacy Policy.";
            isValid = false;
        }

        if (!isValid) {
            document.getElementById('signup-errors').textContent = errorMessage;
            return;
        }

        try {
            console.log("Email signup started");
            const userCredential = await auth.createUserWithEmailAndPassword(email, password);
            console.log("Email signup success", userCredential.user.uid);
            await upsertUserDocument(userCredential.user, { firstName, lastName, phone, title, dateOfBirth });
            console.log("Redirecting to user page");
            redirectOnSuccess('profile.html');
        } catch (error) {
            console.error('Signup error:', error);
            var sc = (error && error.code) || '';
            var sm = (error && error.message) || 'Unknown error';
            var friendly = sm;
            if (sc === 'auth/email-already-in-use') {
                friendly =
                    'This email is already registered. Try signing in, or use “Sign in with Google” if you created the account with Google.';
            } else if (sc === 'auth/weak-password') {
                friendly = 'Password is too weak. Use at least 6 characters.';
            } else if (sc === 'auth/invalid-email') {
                friendly = 'Please enter a valid email address.';
            }
            document.getElementById('signup-errors').textContent = 'Signup failed: ' + friendly;
        }
    });
});
