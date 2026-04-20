/**
 * Regression tests for src/utils/sanitize.js
 */

'use strict';

const { HTMLSanitizer } = require('../../src/utils/sanitize');

describe('HTMLSanitizer data URL filtering', () => {
    test('removes scriptable SVG data URLs', () => {
        const dirty = '<img src="data:image/svg+xml,<svg xmlns=\'http://www.w3.org/2000/svg\'><script>alert(1)</script></svg>">';
        const sanitized = HTMLSanitizer.sanitizeHTML(dirty);

        const temp = document.createElement('div');
        temp.innerHTML = sanitized;
        const img = temp.querySelector('img');

        expect(img).not.toBeNull();
        expect(img.getAttribute('src')).toBeNull();
    });

    test('keeps safe raster image data URLs', () => {
        const dirty = '<img src="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAUA">';
        const sanitized = HTMLSanitizer.sanitizeHTML(dirty);

        const temp = document.createElement('div');
        temp.innerHTML = sanitized;
        const img = temp.querySelector('img');

        expect(img).not.toBeNull();
        expect(img.getAttribute('src')).toMatch(/^data:image\/png;/);
    });
});
