        firebase.initializeApp(firebaseConfig);
        const auth = firebase.auth();
        const db = firebase.firestore();

        document.addEventListener('DOMContentLoaded', () => {
            // DOM Elements for dynamic content
            const profileAvatarInitials = document.getElementById('profile-avatar-initials');
            const welcomeUser = document.getElementById('welcome-user');
            const profileUserName = document.getElementById('profile-user-name');
            const displayUserEmail = document.getElementById('display-user-email');
            const displayUserPhone = document.getElementById('display-user-phone');
            const displayMemberSince = document.getElementById('display-member-since');

            const overviewRecentOrders = document.getElementById('overview-recent-orders');
            const overviewWishlistSummary = document.getElementById('overview-wishlist-summary');
            const overviewAccountDetailsName = document.getElementById('overview-account-details-name');
            const overviewAccountDetailsEmail = document.getElementById('overview-account-details-email');

            const profileForm = document.getElementById('profile-edit-form');
            const profileTitleSelect = document.getElementById('profile-title-select');
            const profileFirstNameInput = document.getElementById('profile-first-name-input');
            const profileLastNameInput = document.getElementById('profile-last-name-input');
            const profilePhoneInput = document.getElementById('profile-phone-input');
            const profileCountrySelect = document.getElementById('profile-country-select');
            const profileDobInput = document.getElementById('profile-dob-input');
            const profileEmailDisplay = document.getElementById('profile-email-display');
            const profilePasswordBtn = document.getElementById('profile-password-btn');
            const prefEmail = document.getElementById('pref-email');
            const prefPhone = document.getElementById('pref-phone');
            const prefSms = document.getElementById('pref-sms');
            const prefPostal = document.getElementById('pref-postal');

            const profileAddressSummary = document.getElementById('profile-address-summary');
            const profileAddressForm = document.getElementById('profile-address-form');
            const profileAddrFirst = document.getElementById('profile-addr-first');
            const profileAddrLast = document.getElementById('profile-addr-last');
            const profileAddrA1 = document.getElementById('profile-addr-a1');
            const profileAddrA2 = document.getElementById('profile-addr-a2');
            const profileAddrCity = document.getElementById('profile-addr-city');
            const profileAddrPin = document.getElementById('profile-addr-pin');
            const profileAddrState = document.getElementById('profile-addr-state');
            const profileAddrCountry = document.getElementById('profile-addr-country');
            const profileAddrPhone = document.getElementById('profile-addr-phone');
            const profileAddrMethod = document.getElementById('profile-addr-method');

            const dashboardOrdersList = document.getElementById('dashboard-orders-list');
            const dashboardWishlistList = document.getElementById('dashboard-wishlist-list');
            const backButton = document.getElementById('profile-back-button');

            const logoutBtn = document.getElementById('logout-btn');
            const accountNavTabs = document.getElementById('account-nav-tabs');
            const contentSections = document.querySelectorAll('.dashboard-content-section');
            const editProfileButton = document.querySelector('#overview-section [data-tab-link="profile"]');
            const settingsButtons = document.querySelectorAll('.settings-actions .button');
            const STORAGE_KEYS = {
                orders: 'orders',
                wishlist: 'wishlist'
            };

            let currentAuthUser = null;
            let currentUserDoc = {};

            // Function to display current section
            function showSection(tabId) {
                contentSections.forEach(section => {
                    section.classList.remove('active');
                    if (section.id === `${tabId}-section`) {
                        section.classList.add('active');
                    }
                });
                accountNavTabs.querySelectorAll('.account-nav-item').forEach(item => {
                    item.classList.remove('active');
                    if (item.dataset.tab === tabId) {
                        item.classList.add('active');
                    }
                });
            }

            function getStorageArray(key) {
                try {
                    const parsed = JSON.parse(localStorage.getItem(key));
                    return Array.isArray(parsed) ? parsed : [];
                } catch (error) {
                    console.error(`Invalid localStorage payload for ${key}:`, error);
                    return [];
                }
            }

            function parsePriceToNumber(priceValue) {
                const parsed = Number(String(priceValue || '').replace(/[^\d.]/g, ''));
                return Number.isFinite(parsed) ? parsed : 0;
            }

            function isShippingAddressComplete(sh) {
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

            function formatAddressBookSummary(sh) {
                if (!isShippingAddressComplete(sh)) return 'No saved addresses.';
                const name = [sh.firstName, sh.lastName].filter(Boolean).join(' ').trim();
                const cityLine = [sh.city, sh.state, sh.pincode].filter(Boolean).join(', ');
                const parts = [name, sh.address1, sh.address2, cityLine, sh.country, sh.phone ? `Phone: ${sh.phone}` : ''];
                return parts.filter((x) => String(x || '').trim()).join(' · ');
            }

            function fillAddressFormFromShipping(sh) {
                const a = sh || {};
                if (profileAddrFirst) profileAddrFirst.value = a.firstName || '';
                if (profileAddrLast) profileAddrLast.value = a.lastName || '';
                if (profileAddrA1) profileAddrA1.value = a.address1 || '';
                if (profileAddrA2) profileAddrA2.value = a.address2 || '';
                if (profileAddrCity) profileAddrCity.value = a.city || '';
                if (profileAddrPin) profileAddrPin.value = a.pincode || '';
                if (profileAddrState) profileAddrState.value = a.state || '';
                if (profileAddrCountry) profileAddrCountry.value = a.country || '';
                if (profileAddrPhone) profileAddrPhone.value = a.phone || '';
                if (profileAddrMethod) {
                    var m = String(a.method || 'standard');
                    if (m === 'express' || m === 'pickup' || m === 'standard') {
                        profileAddrMethod.value = m;
                    } else {
                        profileAddrMethod.value = 'standard';
                    }
                }
            }

            function renderAddressBook(userData) {
                const sh = userData && userData.shippingAddress;
                if (profileAddressSummary) profileAddressSummary.textContent = formatAddressBookSummary(sh);
                fillAddressFormFromShipping(sh);
            }

            async function loadCurrentUserProfile(user) {
                const userRef = db.collection("users").doc(user.uid);
                const docSnap = await userRef.get();
                return docSnap.exists ? docSnap.data() : {};
            }

            function getResolvedFullName(user, userData) {
                return (
                    userData.name ||
                    [userData.firstName, userData.lastName].filter(Boolean).join(' ').trim() ||
                    user.displayName ||
                    (user.email ? user.email.split('@')[0] : 'Guest')
                );
            }

            function renderUserProfile(user, userData) {
                const fullName = getResolvedFullName(user, userData);
                const firstName = userData.firstName || fullName.split(' ')[0] || '';
                const lastName = userData.lastName || fullName.split(' ').slice(1).join(' ');
                const initials = fullName
                    .split(' ')
                    .filter(Boolean)
                    .map(namePart => namePart.charAt(0))
                    .join('')
                    .slice(0, 2)
                    .toUpperCase();

                welcomeUser.textContent = `Welcome ${fullName}`;
                profileAvatarInitials.textContent = initials || (user.email ? user.email.charAt(0).toUpperCase() : '');
                profileUserName.textContent = '';
                displayUserEmail.textContent = userData.email || user.email || 'N/A';
                displayUserPhone.textContent = userData.phone || 'N/A';

                if (userData.createdAt && userData.createdAt.toDate) {
                    const date = userData.createdAt.toDate();
                    displayMemberSince.textContent = `Member Since: ${date.toLocaleDateString()}`;
                } else {
                    displayMemberSince.textContent = 'Member Since: N/A';
                }

                overviewAccountDetailsName.textContent = `Name: ${fullName}`;
                overviewAccountDetailsEmail.textContent = `Email: ${userData.email || user.email || 'N/A'}`;

                profileTitleSelect.value = userData.title || '';
                profileFirstNameInput.value = firstName;
                profileLastNameInput.value = lastName;
                profilePhoneInput.value = userData.phone || '';
                profileCountrySelect.value = userData.country || '';
                profileDobInput.value = userData.dateOfBirth || '';
                profileEmailDisplay.textContent = userData.email || user.email || 'N/A';

                const preferences = userData.preferences || {};
                prefEmail.checked = preferences.email !== false;
                prefPhone.checked = preferences.phone === true;
                prefSms.checked = preferences.sms === true;
                prefPostal.checked = preferences.postal === true;

                renderAddressBook(userData);
            }

            function renderOrdersUI(orders) {
                dashboardOrdersList.innerHTML = '';
                overviewRecentOrders.innerHTML = '';

                if (!orders.length) {
                    dashboardOrdersList.className = 'empty-state';
                    dashboardOrdersList.innerHTML = `
                        <h3>No Orders Yet</h3>
                        <p>It looks like you haven't placed any orders with us. Start exploring our products!</p>
                        <a href="../index.html" class="button">Start Shopping</a>
                    `;
                    overviewRecentOrders.innerHTML = '<li>No recent orders.</li>';
                    return;
                }

                dashboardOrdersList.className = '';
                const totalPrice = orders.reduce((sum, order) => {
                    return sum + (parsePriceToNumber(order.price) * Number(order.quantity || 1));
                }, 0);
                const totalCount = orders.reduce((sum, order) => sum + Number(order.quantity || 1), 0);

                const summary = document.createElement('div');
                summary.className = 'content-block';
                summary.innerHTML = `
                    <h3>Order Summary</h3>
                    <p>Total Items: ${totalCount}</p>
                    <p>Total Price: ₹ ${totalPrice.toLocaleString('en-IN')}</p>
                `;
                dashboardOrdersList.appendChild(summary);

                orders.forEach(order => {
                    const orderDate = order.orderDate || 'N/A';
                    const orderStatus = order.status || 'Pending';
                    const orderCard = document.createElement('div');
                    orderCard.classList.add('content-block');
                    orderCard.innerHTML = `
                        <div class="profile-order-item">
                            <img src="${order.image || '../images/placeholder.png'}" alt="${order.name || 'Order Item'}" class="profile-order-image">
                            <div>
                                <h3>${order.name || 'Order Item'}</h3>
                                <p>Quantity: ${order.quantity || 1}</p>
                                <p>Price: ${order.price || 'N/A'}</p>
                                <p>Status: ${orderStatus}</p>
                                <p>Date: ${orderDate}</p>
                            </div>
                        </div>
                    `;
                    dashboardOrdersList.appendChild(orderCard);
                });

                orders.slice(0, 3).forEach(order => {
                    const listItem = document.createElement('li');
                    listItem.textContent = `${order.name || 'Order Item'} x ${order.quantity || 1} (${order.price || 'N/A'})`;
                    overviewRecentOrders.appendChild(listItem);
                });
            }

            function loadUserOrders() {
                const orders = getStorageArray(STORAGE_KEYS.orders);
                renderOrdersUI(orders);
            }

            function renderWishlistUI(wishlistItems) {
                dashboardWishlistList.innerHTML = '';
                overviewWishlistSummary.innerHTML = '';

                if (!wishlistItems.length) {
                    dashboardWishlistList.className = 'empty-state';
                    dashboardWishlistList.innerHTML = `
                        <h3>Your Wishlist is Empty</h3>
                        <p>You haven't added any items to your wishlist yet. Find something you love!</p>
                        <a href="../index.html" class="button">Explore Products</a>
                    `;
                    overviewWishlistSummary.innerHTML = '<li>Your wishlist is empty.</li>';
                    return;
                }

                dashboardWishlistList.className = '';
                wishlistItems.forEach((item, index) => {
                    const wishlistCard = document.createElement('div');
                    wishlistCard.classList.add('content-block');
                    wishlistCard.innerHTML = `
                        <h3>${item.name || 'Wishlist Item'}</h3>
                        <p>Price: ${item.price || 'N/A'}</p>
                        <button class="button" data-remove-wishlist-index="${index}">Remove</button>
                    `;
                    dashboardWishlistList.appendChild(wishlistCard);
                });

                wishlistItems.slice(0, 3).forEach(item => {
                    const listItem = document.createElement('li');
                    listItem.textContent = `${item.name || 'Wishlist Item'}${item.price ? ` (${item.price})` : ''}`;
                    overviewWishlistSummary.appendChild(listItem);
                });
            }

            function loadUserWishlist() {
                const wishlistItems = getStorageArray(STORAGE_KEYS.wishlist);
                renderWishlistUI(wishlistItems);
            }

            async function saveUserProfileUpdates(formData) {
                if (!currentAuthUser) return;
                const updatePayload = {
                    name: `${formData.firstName} ${formData.lastName}`.trim(),
                    firstName: formData.firstName || '',
                    lastName: formData.lastName || '',
                    title: formData.title || '',
                    phone: formData.phone || '',
                    country: formData.country || '',
                    dateOfBirth: formData.dateOfBirth || '',
                    preferences: {
                        email: !!formData.prefEmail,
                        phone: !!formData.prefPhone,
                        sms: !!formData.prefSms,
                        postal: !!formData.prefPostal
                    },
                    updatedAt: firebase.firestore.FieldValue.serverTimestamp()
                };
                await db.collection("users").doc(currentAuthUser.uid).set(updatePayload, { merge: true });
            }

            // Event listener for tab navigation
            accountNavTabs.addEventListener('click', (event) => {
                event.preventDefault();
                const targetTab = event.target.dataset.tab;
                if (targetTab) {
                    showSection(targetTab);
                }
            });

            // Event listener for "View all orders" / "View wishlist" links
            document.querySelectorAll('[data-tab-link]').forEach(link => {
                link.addEventListener('click', (event) => {
                    event.preventDefault();
                    const targetTab = event.target.dataset.tabLink;
                    showSection(targetTab);
                });
            });

            if (editProfileButton) {
                editProfileButton.addEventListener('click', (event) => {
                    event.preventDefault();
                    showSection('profile');
                });
            }

            if (settingsButtons.length >= 2) {
                settingsButtons[0].addEventListener('click', (event) => {
                    event.preventDefault();
                    showSection('profile');
                });

                settingsButtons[1].addEventListener('click', (event) => {
                    event.preventDefault();
                    showSection('settings');
                });
            }

            if (profilePasswordBtn) {
                profilePasswordBtn.addEventListener('click', () => {
                    alert('Use "Forgot your password?" from the login screen to reset password securely.');
                });
            }

            if (backButton) {
                backButton.addEventListener('click', () => {
                    if (window.history.length > 1) {
                        window.history.back();
                    } else {
                        window.location.href = '../index.html';
                    }
                });
            }

            if (profileForm) {
                profileForm.addEventListener('submit', async (event) => {
                    event.preventDefault();
                    if (!currentAuthUser) return;

                    const formData = {
                        title: profileTitleSelect.value,
                        firstName: profileFirstNameInput.value.trim(),
                        lastName: profileLastNameInput.value.trim(),
                        phone: profilePhoneInput.value.trim(),
                        country: profileCountrySelect.value,
                        dateOfBirth: profileDobInput.value,
                        prefEmail: prefEmail.checked,
                        prefPhone: prefPhone.checked,
                        prefSms: prefSms.checked,
                        prefPostal: prefPostal.checked
                    };

                    try {
                        await saveUserProfileUpdates(formData);
                        currentUserDoc = { ...currentUserDoc, ...formData, name: `${formData.firstName} ${formData.lastName}`.trim() };
                        renderUserProfile(currentAuthUser, currentUserDoc);
                    } catch (error) {
                        console.error('Profile update failed:', error);
                        alert('Failed to save profile updates.');
                    }
                });
            }

            if (profileAddressForm) {
                profileAddressForm.addEventListener('submit', async (event) => {
                    event.preventDefault();
                    if (!currentAuthUser) return;

                    const shippingAddress = {
                        firstName: profileAddrFirst ? profileAddrFirst.value.trim() : '',
                        lastName: profileAddrLast ? profileAddrLast.value.trim() : '',
                        address1: profileAddrA1 ? profileAddrA1.value.trim() : '',
                        address2: profileAddrA2 ? profileAddrA2.value.trim() : '',
                        city: profileAddrCity ? profileAddrCity.value.trim() : '',
                        pincode: profileAddrPin ? profileAddrPin.value.trim() : '',
                        state: profileAddrState ? profileAddrState.value.trim() : '',
                        country: profileAddrCountry ? profileAddrCountry.value.trim() : '',
                        phone: profileAddrPhone ? profileAddrPhone.value.trim() : '',
                        method: profileAddrMethod ? profileAddrMethod.value : 'standard'
                    };

                    if (!isShippingAddressComplete(shippingAddress)) {
                        alert('Please complete all required address fields (name, street, city, pincode, state, country, phone).');
                        return;
                    }

                    try {
                        await db.collection('users').doc(currentAuthUser.uid).set(
                            {
                                shippingAddress,
                                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
                            },
                            { merge: true }
                        );
                        currentUserDoc = { ...currentUserDoc, shippingAddress };
                        renderAddressBook(currentUserDoc);
                    } catch (error) {
                        console.error('Address save failed:', error);
                        alert('Failed to save address.');
                    }
                });
            }

            dashboardWishlistList.addEventListener('click', (event) => {
                const removeBtn = event.target.closest('[data-remove-wishlist-index]');
                if (!removeBtn) return;
                const index = Number(removeBtn.dataset.removeWishlistIndex);
                const wishlistItems = getStorageArray(STORAGE_KEYS.wishlist);
                const updated = wishlistItems.filter((_, itemIndex) => itemIndex !== index);
                localStorage.setItem(STORAGE_KEYS.wishlist, JSON.stringify(updated));
                loadUserWishlist();
            });

            window.addEventListener('storage', (event) => {
                if (event.key === STORAGE_KEYS.orders) {
                    loadUserOrders();
                }
                if (event.key === STORAGE_KEYS.wishlist) {
                    loadUserWishlist();
                }
            });


            auth.onAuthStateChanged(async (user) => {
                if (user) {
                    currentAuthUser = user;
                    currentUserDoc = await loadCurrentUserProfile(user);
                    renderUserProfile(user, currentUserDoc);
                    loadUserOrders();
                    loadUserWishlist();
                } else {
                    // No user is signed in, redirect to login
                    window.location.href = '../index.html';
                }
            });

            logoutBtn.addEventListener('click', async () => {
                try {
                    await auth.signOut();
                    console.log("Logout successful");
                    window.location.href = '../index.html'; // Redirect to homepage after logout
                } catch (error) {
                    console.error('Error logging out:', error);
                    alert('Logout failed: ' + error.message);
                }
            });
        });
