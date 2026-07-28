/**
 * TMV Store - Main JavaScript
 * Handles slide menu and basic interactions
 */

document.addEventListener('DOMContentLoaded', () => {
    // --- Menu Elements ---
    const menuTriggers = document.querySelectorAll('[data-menu-trigger]');
    const menuOverlay = document.querySelector('[data-menu-overlay]');
    const slideMenu = document.querySelector('[data-slide-menu]');
    const menuClose = document.querySelector('[data-menu-close]');

    // --- Account Panel Elements ---
    const profileTrigger = document.querySelector('a.nav-link[aria-label="Profile"]');
    const accountOverlay = document.querySelector('[data-account-overlay]');
    const accountPanel = document.querySelector('[data-account-panel]');
    const accountClose = document.querySelector('[data-account-close]');

    // --- Other elements ---
    const header = document.querySelector('.header');
    const passwordInput = document.getElementById('login-password');
    const togglePasswordBtn = document.querySelector('.toggle-password-visibility');

    // --- Menu Functions ---
    // Add null check here before defining open/close, as requested
    if (menuOverlay && slideMenu) {
        function openMenu(event) {
            if (event) event.preventDefault();
            slideMenu.classList.add('active');
            menuOverlay.classList.add('active');
            slideMenu.setAttribute('aria-hidden', 'false');
            menuOverlay.setAttribute('aria-hidden', 'false');
            document.body.classList.add('menu-open');
        }

        function closeMenu() {
            slideMenu.classList.remove('active');
            menuOverlay.classList.remove('active');
            slideMenu.setAttribute('aria-hidden', 'true');
            menuOverlay.setAttribute('aria-hidden', 'true');
            document.body.classList.remove('menu-open');
        }

        menuTriggers.forEach(trigger => {
            trigger.addEventListener('click', openMenu);
        });

        if (menuClose) {
            menuClose.addEventListener('click', closeMenu);
        }

        menuOverlay.addEventListener('click', closeMenu);

        document.addEventListener('keydown', (event) => {
            if (event.key === 'Escape') {
                closeMenu();
            }
        });

        // Ensure menu is closed on initial load
        closeMenu();
    }

    // --- Account Panel Functions (retained) ---
    if (accountOverlay && accountPanel) {
        function openAccountPanel() {
            accountOverlay.classList.add('is-open');
            accountPanel.classList.add('is-open');
            accountOverlay.setAttribute('aria-hidden', 'false');
            accountPanel.setAttribute('aria-hidden', 'false');
            document.body.style.overflow = 'hidden';
        }

        function closeAccountPanel() {
            accountOverlay.classList.remove('is-open');
            accountPanel.classList.remove('is-open');
            accountOverlay.setAttribute('aria-hidden', 'true');
            accountPanel.setAttribute('aria-hidden', 'true');
            document.body.style.overflow = '';
        }

        function closeSlideMenuIfOpen() {
            if (menuOverlay && slideMenu && slideMenu.classList.contains('active')) {
                slideMenu.classList.remove('active');
                menuOverlay.classList.remove('active');
                slideMenu.setAttribute('aria-hidden', 'true');
                menuOverlay.setAttribute('aria-hidden', 'true');
                document.body.classList.remove('menu-open');
            }
        }

        function onAccountEntryClick(e, triggerEl) {
            e.preventDefault();
            const profileHref = triggerEl.getAttribute('href') || 'pages/profile.html';
            const currentUser = typeof firebase !== 'undefined' && firebase.auth ? firebase.auth().currentUser : null;
            if (currentUser) {
                console.log('Authenticated user found:', currentUser.uid);
                console.log('Redirecting to user page:', profileHref);
                window.location.href = profileHref;
            } else {
                console.log('No authenticated user found. Opening login modal.');
                closeSlideMenuIfOpen();
                openAccountPanel();
            }
        }

        if (profileTrigger) {
            profileTrigger.addEventListener('click', (e) => onAccountEntryClick(e, profileTrigger));
        }

        document.querySelectorAll('[data-open-account-panel]').forEach((el) => {
            el.addEventListener('click', (e) => onAccountEntryClick(e, el));
        });

        if (accountClose) {
            accountClose.addEventListener('click', closeAccountPanel);
        }

        if (accountOverlay) {
            accountOverlay.addEventListener('click', closeAccountPanel);
        }

        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                if (accountPanel.classList.contains('is-open')) {
                    closeAccountPanel();
                }
            }
        });

        // Ensure account panel is closed on initial load
        closeAccountPanel();
    }

    // --- Header scroll effect - only on homepage (retained) ---
    const isHomePage = window.location.pathname === '/' || window.location.pathname.endsWith('/index.html');

    if (header && isHomePage) {
        const heroSection = document.querySelector('.hero');
        const heroHeight = heroSection ? heroSection.offsetHeight / 2 : 100;

        const handleScroll = () => {
            if (window.scrollY > heroHeight) {
                header.classList.add('scrolled');
            } else {
                header.classList.remove('scrolled');
            }
        };

        window.addEventListener('scroll', handleScroll);
        handleScroll();
    } else if (header && !isHomePage) {
        header.classList.add('scrolled');
    }

    // --- Password visibility toggle (retained) ---
    if (passwordInput && togglePasswordBtn) {
        togglePasswordBtn.addEventListener('click', () => {
            const type = passwordInput.getAttribute('type') === 'password' ? 'text' : 'password';
            passwordInput.setAttribute('type', type);
            togglePasswordBtn.classList.toggle('show-password');
        });
    }

    document.querySelectorAll('[data-page-back]').forEach((btn) => {
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            const fb = btn.getAttribute('data-fallback-href') || '../index.html';
            if (window.history.length > 1) {
                window.history.back();
            } else {
                window.location.href = fb;
            }
        });
    });
});
