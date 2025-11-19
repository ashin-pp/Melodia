// Dark Theme JavaScript Enhancements
document.addEventListener('DOMContentLoaded', function () {
    // Apply dark theme to SweetAlert modals
    const originalSwalFire = Swal.fire;
    Swal.fire = function (options) {
        if (typeof options === 'object') {
            options.background = options.background || '#1e1e1e';
            options.color = options.color || '#ffffff';
            options.customClass = options.customClass || {};
            options.customClass.popup = 'dark-swal-popup';
        }
        return originalSwalFire.call(this, options);
    };

    // Apply dark theme to dynamically created elements
    const observer = new MutationObserver(function (mutations) {
        mutations.forEach(function (mutation) {
            mutation.addedNodes.forEach(function (node) {
                if (node.nodeType === 1) { // Element node
                    applyDarkThemeToElement(node);
                }
            });
        });
    });

    observer.observe(document.body, {
        childList: true,
        subtree: true
    });

    function applyDarkThemeToElement(element) {
        // Apply dark theme to common elements
        if (element.classList) {
            if (element.classList.contains('modal-content') ||
                element.classList.contains('swal2-popup')) {
                element.style.backgroundColor = '#1e1e1e';
                element.style.color = '#ffffff';
                element.style.border = '1px solid rgba(255, 255, 255, 0.1)';
            }
        }

        // Apply to child elements
        const whiteBackgrounds = element.querySelectorAll('[style*="background: white"], [style*="background-color: white"], [style*="background: #fff"], [style*="background-color: #ffffff"]');
        whiteBackgrounds.forEach(el => {
            el.style.backgroundColor = '#1e1e1e';
            el.style.color = '#ffffff';
            el.style.border = '1px solid rgba(255, 255, 255, 0.1)';
        });
    }

    // Initial application to existing elements
    applyDarkThemeToElement(document.body);
});

// CSS Custom Properties for Dynamic Theme Switching
document.documentElement.style.setProperty('--swal-bg', '#1e1e1e');
document.documentElement.style.setProperty('--swal-color', '#ffffff');
document.documentElement.style.setProperty('--swal-border', 'rgba(255, 255, 255, 0.1)');