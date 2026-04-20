/**
 * HTML Sanitization Utilities
 * Prevents XSS attacks from innerHTML assignments
 *
 * For production use, consider using DOMPurify library instead:
 * https://github.com/cure53/DOMPurify
 */

const HTMLSanitizer = {
    /**
     * Escape HTML special characters to prevent XSS
     * Use this for text content that should not contain any HTML
     */
    escapeHTML(str) {
        if (str === null || str === undefined) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#x27;')
            .replace(/\//g, '&#x2F;');
    },

    /**
     * Sanitize HTML by removing dangerous tags and attributes
     * Allows safe formatting tags (b, i, strong, em, br, p, span, div)
     */
    sanitizeHTML(html) {
        if (html === null || html === undefined) return '';

        // Create a temporary element
        const temp = document.createElement('div');
        temp.innerHTML = String(html);

        // Remove script tags and event handlers
        this._removeScripts(temp);
        this._removeEventHandlers(temp);
        this._removeDangerousAttributes(temp);

        return temp.innerHTML;
    },

    /**
     * Remove all script elements
     */
    _removeScripts(element) {
        const scripts = element.querySelectorAll('script, style, iframe, object, embed, form');
        scripts.forEach(script => script.remove());
    },

    /**
     * Remove event handler attributes
     */
    _removeEventHandlers(element) {
        const allElements = element.querySelectorAll('*');
        allElements.forEach(el => {
            // Get all attributes
            const attrs = [...el.attributes];
            attrs.forEach(attr => {
                // Remove event handlers (on*)
                if (attr.name.toLowerCase().startsWith('on')) {
                    el.removeAttribute(attr.name);
                }
                // Remove javascript: URLs
                if (attr.value && attr.value.toLowerCase().includes('javascript:')) {
                    el.removeAttribute(attr.name);
                }
            });
        });
    },

    /**
     * Remove dangerous attributes
     */
    _removeDangerousAttributes(element) {
        const dangerousAttrs = ['href', 'src', 'data', 'action', 'formaction', 'xlink:href'];
        const allElements = element.querySelectorAll('*');

        allElements.forEach(el => {
            dangerousAttrs.forEach(attrName => {
                const attrValue = el.getAttribute(attrName);
                if (attrValue) {
                    const lowerValue = attrValue.toLowerCase().trim();
                    const isSafeRasterDataImage = /^data:image\/(?:png|gif|jpe?g|webp|avif)(?:;|,)/.test(lowerValue);
                    // Remove javascript: and data: URLs (except safe data: images)
                    if (lowerValue.startsWith('javascript:') ||
                        (lowerValue.startsWith('data:') && !isSafeRasterDataImage)) {
                        el.removeAttribute(attrName);
                    }
                }
            });
        });
    },

    /**
     * Create safe text node (alternative to innerHTML for pure text)
     */
    createTextNode(text) {
        return document.createTextNode(String(text));
    },

    /**
     * Safely set text content of an element
     */
    setTextContent(element, text) {
        if (element) {
            element.textContent = String(text);
        }
    },

    /**
     * Safely set innerHTML with sanitization
     */
    setInnerHTML(element, html) {
        if (element) {
            element.innerHTML = this.sanitizeHTML(html);
        }
    },

    /**
     * Format a value for display (escapes HTML)
     */
    formatValue(value, defaultValue = '-') {
        if (value === null || value === undefined || value === '') {
            return defaultValue;
        }
        return this.escapeHTML(String(value));
    },

    /**
     * Format a number for display
     */
    formatNumber(value, decimals = 2, defaultValue = '-') {
        if (value === null || value === undefined || !Number.isFinite(value)) {
            return defaultValue;
        }
        return this.escapeHTML(value.toFixed(decimals));
    },

    /**
     * Format currency for display
     */
    formatCurrency(value, currency = 'OMR', decimals = 2, defaultValue = '-') {
        if (value === null || value === undefined || !Number.isFinite(value)) {
            return defaultValue;
        }
        const formatted = value.toLocaleString('en-US', {
            minimumFractionDigits: decimals,
            maximumFractionDigits: decimals
        });
        return this.escapeHTML(`${currency} ${formatted}`);
    }
};

// Create a safe template literal tag for HTML
function safeHTML(strings, ...values) {
    let result = strings[0];
    for (let i = 0; i < values.length; i++) {
        result += HTMLSanitizer.escapeHTML(values[i]) + strings[i + 1];
    }
    return result;
}

// Export for browser
if (typeof window !== 'undefined') {
    window.HTMLSanitizer = HTMLSanitizer;
    window.safeHTML = safeHTML;
}

// Export for Node.js
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { HTMLSanitizer, safeHTML };
}
