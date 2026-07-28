/**
 * Luxury seamless handbag collection viewer
 * - Scroll-snap vertical sections (100vh)
 * - Tap to expand in-place, close to collapse
 */

document.addEventListener('DOMContentLoaded', () => {
    const sections = Array.from(document.querySelectorAll('.hv-section'));

    function expandSection(section) {
        if (section.classList.contains('is-expanded')) return;
        section.classList.add('is-expanded');

        const gallery = section.querySelector('.hv-gallery');
        if (gallery) {
            const saved = section.getAttribute('data-gallery-scroll');
            if (saved) gallery.scrollTop = Number(saved) || 0;
        }
    }

    function collapseSection(section) {
        if (!section.classList.contains('is-expanded')) return;

        const gallery = section.querySelector('.hv-gallery');
        if (gallery) {
            section.setAttribute('data-gallery-scroll', String(gallery.scrollTop || 0));
        }

        section.classList.remove('is-expanded');
    }

    sections.forEach((section) => {
        section.addEventListener('click', (e) => {
            const closeBtn = e.target.closest('[data-hv-close]');
            if (closeBtn) {
                e.preventDefault();
                e.stopPropagation();
                collapseSection(section);
                return;
            }

            if (!section.classList.contains('is-expanded')) {
                expandSection(section);
            }
        });
    });

    document.addEventListener('keydown', (e) => {
        if (e.key !== 'Escape') return;
        const expanded = document.querySelector('.hv-section.is-expanded');
        if (expanded) collapseSection(expanded);
    });
});

