/**
 * Tests for src/utils/sanitize.js — all sanitization branches
 * Covers: escapeHTML, sanitizeHTML, _removeScripts, _removeEventHandlers,
 * _removeDangerousAttributes, setTextContent, setInnerHTML, formatValue,
 * formatNumber, formatCurrency, safeHTML template tag
 */

'use strict';

const { HTMLSanitizer, safeHTML } = require('../../src/utils/sanitize');

// ================================================================
// escapeHTML — all special characters
// ================================================================

describe('HTMLSanitizer.escapeHTML', () => {
    test('escapes ampersand', () => {
        expect(HTMLSanitizer.escapeHTML('a & b')).toBe('a &amp; b');
    });

    test('escapes less-than', () => {
        expect(HTMLSanitizer.escapeHTML('<script>')).toBe('&lt;script&gt;');
    });

    test('escapes double quotes', () => {
        expect(HTMLSanitizer.escapeHTML('"hello"')).toBe('&quot;hello&quot;');
    });

    test('escapes single quotes', () => {
        expect(HTMLSanitizer.escapeHTML("it's")).toBe("it&#x27;s");
    });

    test('escapes forward slashes', () => {
        expect(HTMLSanitizer.escapeHTML('a/b')).toBe('a&#x2F;b');
    });

    test('handles null → empty string', () => {
        expect(HTMLSanitizer.escapeHTML(null)).toBe('');
    });

    test('handles undefined → empty string', () => {
        expect(HTMLSanitizer.escapeHTML(undefined)).toBe('');
    });

    test('converts number to string then escapes', () => {
        expect(HTMLSanitizer.escapeHTML(42)).toBe('42');
    });

    test('handles empty string', () => {
        expect(HTMLSanitizer.escapeHTML('')).toBe('');
    });
});

// ================================================================
// sanitizeHTML — script removal
// ================================================================

describe('HTMLSanitizer.sanitizeHTML — script injection', () => {
    test('removes <script> tags', () => {
        const result = HTMLSanitizer.sanitizeHTML('<p>Hello</p><script>alert(1)</script>');
        expect(result).not.toContain('<script>');
        expect(result).toContain('Hello');
    });

    test('removes <iframe> tags', () => {
        const result = HTMLSanitizer.sanitizeHTML('<iframe src="evil.com"></iframe><p>ok</p>');
        expect(result).not.toContain('iframe');
        expect(result).toContain('ok');
    });

    test('removes <style> tags', () => {
        const result = HTMLSanitizer.sanitizeHTML('<style>body{display:none}</style><p>ok</p>');
        expect(result).not.toContain('<style>');
    });

    test('removes <object> tags', () => {
        const result = HTMLSanitizer.sanitizeHTML('<object data="flash.swf"></object>');
        expect(result).not.toContain('object');
    });

    test('removes <embed> tags', () => {
        const result = HTMLSanitizer.sanitizeHTML('<embed src="flash.swf">');
        expect(result).not.toContain('embed');
    });

    test('removes <form> tags', () => {
        const result = HTMLSanitizer.sanitizeHTML('<form action="/steal"><input></form>');
        expect(result).not.toContain('form');
    });

    test('handles null → empty string', () => {
        expect(HTMLSanitizer.sanitizeHTML(null)).toBe('');
    });

    test('handles undefined → empty string', () => {
        expect(HTMLSanitizer.sanitizeHTML(undefined)).toBe('');
    });
});

// ================================================================
// sanitizeHTML — event handler removal
// ================================================================

describe('HTMLSanitizer.sanitizeHTML — event handlers', () => {
    test('removes onclick', () => {
        const result = HTMLSanitizer.sanitizeHTML('<div onclick="alert(1)">click</div>');
        expect(result).not.toContain('onclick');
        expect(result).toContain('click');
    });

    test('removes onmouseover', () => {
        const result = HTMLSanitizer.sanitizeHTML('<span onmouseover="steal()">x</span>');
        expect(result).not.toContain('onmouseover');
    });

    test('removes onerror', () => {
        const result = HTMLSanitizer.sanitizeHTML('<img onerror="alert(1)" src="x">');
        expect(result).not.toContain('onerror');
    });

    test('removes onload', () => {
        const result = HTMLSanitizer.sanitizeHTML('<body onload="evil()"><p>ok</p></body>');
        expect(result).not.toContain('onload');
    });
});

// ================================================================
// sanitizeHTML — dangerous attributes (javascript: URLs)
// ================================================================

describe('HTMLSanitizer.sanitizeHTML — javascript: URLs', () => {
    test('removes javascript: href', () => {
        const result = HTMLSanitizer.sanitizeHTML('<a href="javascript:alert(1)">link</a>');
        const temp = document.createElement('div');
        temp.innerHTML = result;
        const a = temp.querySelector('a');
        expect(a.getAttribute('href')).toBeNull();
    });

    test('removes javascript: src', () => {
        const result = HTMLSanitizer.sanitizeHTML('<img src="javascript:alert(1)">');
        const temp = document.createElement('div');
        temp.innerHTML = result;
        const img = temp.querySelector('img');
        expect(img.getAttribute('src')).toBeNull();
    });
});

// ================================================================
// sanitizeHTML — data: URLs (safe vs unsafe)
// ================================================================

describe('HTMLSanitizer.sanitizeHTML — data: URLs', () => {
    test('removes data:text/html URLs', () => {
        const result = HTMLSanitizer.sanitizeHTML('<a href="data:text/html,<script>alert(1)</script>">x</a>');
        const temp = document.createElement('div');
        temp.innerHTML = result;
        const a = temp.querySelector('a');
        expect(a.getAttribute('href')).toBeNull();
    });

    test('keeps data:image/png URLs', () => {
        const result = HTMLSanitizer.sanitizeHTML('<img src="data:image/png;base64,iVBOR">');
        const temp = document.createElement('div');
        temp.innerHTML = result;
        const img = temp.querySelector('img');
        expect(img.getAttribute('src')).toMatch(/^data:image\/png/);
    });

    test('keeps data:image/jpeg URLs', () => {
        const result = HTMLSanitizer.sanitizeHTML('<img src="data:image/jpeg;base64,/9j/4A">');
        const temp = document.createElement('div');
        temp.innerHTML = result;
        const img = temp.querySelector('img');
        expect(img.getAttribute('src')).toMatch(/^data:image\/jpeg/);
    });

    test('keeps data:image/gif URLs', () => {
        const result = HTMLSanitizer.sanitizeHTML('<img src="data:image/gif;base64,R0lGO">');
        const temp = document.createElement('div');
        temp.innerHTML = result;
        const img = temp.querySelector('img');
        expect(img.getAttribute('src')).toMatch(/^data:image\/gif/);
    });

    test('keeps data:image/webp URLs', () => {
        const result = HTMLSanitizer.sanitizeHTML('<img src="data:image/webp;base64,UklGR">');
        const temp = document.createElement('div');
        temp.innerHTML = result;
        const img = temp.querySelector('img');
        expect(img.getAttribute('src')).toMatch(/^data:image\/webp/);
    });

    test('removes data:image/svg+xml (scriptable)', () => {
        const result = HTMLSanitizer.sanitizeHTML('<img src="data:image/svg+xml,<svg><script>alert(1)</script></svg>">');
        const temp = document.createElement('div');
        temp.innerHTML = result;
        const img = temp.querySelector('img');
        expect(img.getAttribute('src')).toBeNull();
    });
});

// ================================================================
// createTextNode, setTextContent, setInnerHTML
// ================================================================

describe('HTMLSanitizer — DOM helpers', () => {
    test('createTextNode returns a text node', () => {
        const node = HTMLSanitizer.createTextNode('<b>bold</b>');
        expect(node.nodeType).toBe(3); // TEXT_NODE
        expect(node.textContent).toBe('<b>bold</b>');
    });

    test('setTextContent sets text safely (no HTML parsing)', () => {
        const el = document.createElement('div');
        HTMLSanitizer.setTextContent(el, '<script>alert(1)</script>');
        expect(el.textContent).toBe('<script>alert(1)</script>');
        expect(el.children.length).toBe(0);
    });

    test('setTextContent handles null element gracefully', () => {
        expect(() => HTMLSanitizer.setTextContent(null, 'text')).not.toThrow();
    });

    test('setInnerHTML sanitizes before setting', () => {
        const el = document.createElement('div');
        HTMLSanitizer.setInnerHTML(el, '<p>ok</p><script>alert(1)</script>');
        expect(el.innerHTML).toContain('ok');
        expect(el.innerHTML).not.toContain('script');
    });

    test('setInnerHTML handles null element gracefully', () => {
        expect(() => HTMLSanitizer.setInnerHTML(null, '<p>x</p>')).not.toThrow();
    });
});

// ================================================================
// formatValue, formatNumber, formatCurrency
// ================================================================

describe('HTMLSanitizer — formatValue', () => {
    test('returns default for null', () => {
        expect(HTMLSanitizer.formatValue(null)).toBe('-');
    });

    test('returns default for empty string', () => {
        expect(HTMLSanitizer.formatValue('')).toBe('-');
    });

    test('returns custom default', () => {
        expect(HTMLSanitizer.formatValue(undefined, 'N/A')).toBe('N/A');
    });

    test('escapes HTML in value', () => {
        expect(HTMLSanitizer.formatValue('<img onerror=alert(1)>')).toContain('&lt;');
    });
});

describe('HTMLSanitizer — formatNumber', () => {
    test('formats finite numbers with decimals', () => {
        expect(HTMLSanitizer.formatNumber(3.14159, 2)).toBe('3.14');
    });

    test('returns default for NaN', () => {
        expect(HTMLSanitizer.formatNumber(NaN)).toBe('-');
    });

    test('returns default for Infinity', () => {
        expect(HTMLSanitizer.formatNumber(Infinity)).toBe('-');
    });

    test('returns default for null', () => {
        expect(HTMLSanitizer.formatNumber(null)).toBe('-');
    });

    test('returns custom default', () => {
        expect(HTMLSanitizer.formatNumber(undefined, 2, 'N/A')).toBe('N/A');
    });

    test('formats zero correctly', () => {
        expect(HTMLSanitizer.formatNumber(0, 3)).toBe('0.000');
    });
});

describe('HTMLSanitizer — formatCurrency', () => {
    test('formats with default currency (OMR)', () => {
        const result = HTMLSanitizer.formatCurrency(1234.56);
        expect(result).toContain('OMR');
        expect(result).toContain('1,234.56');
    });

    test('uses custom currency', () => {
        const result = HTMLSanitizer.formatCurrency(100, 'GBP', 0);
        expect(result).toContain('GBP');
    });

    test('returns default for null', () => {
        expect(HTMLSanitizer.formatCurrency(null)).toBe('-');
    });

    test('returns default for NaN', () => {
        expect(HTMLSanitizer.formatCurrency(NaN, 'USD', 2, 'N/A')).toBe('N/A');
    });
});

// ================================================================
// safeHTML template tag
// ================================================================

describe('safeHTML template tag', () => {
    test('escapes interpolated values', () => {
        const userInput = '<script>alert(1)</script>';
        const result = safeHTML`<p>Hello ${userInput}</p>`;
        expect(result).toContain('&lt;script&gt;');
        expect(result).not.toContain('<script>');
    });

    test('preserves literal HTML structure', () => {
        const name = 'World';
        const result = safeHTML`<h1>Hello ${name}</h1>`;
        expect(result).toBe('<h1>Hello World</h1>');
    });

    test('escapes multiple interpolations', () => {
        const a = '<b>';
        const b = '&test';
        const result = safeHTML`${a} and ${b}`;
        expect(result).toContain('&lt;b&gt;');
        expect(result).toContain('&amp;test');
    });
});
