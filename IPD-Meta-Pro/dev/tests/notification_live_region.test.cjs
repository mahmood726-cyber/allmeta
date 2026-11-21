'use strict';
// Requirement: the page's notifications -- including every analysis refusal ("At least 2 studies",
// "Run Analysis does not fit RR", ...) -- are announced to assistive technology: errors and warnings
// as alerts (role="alert", aria-live="assertive"), other messages as status (role="status",
// aria-live="polite"). Limitation sweep LIM-P60 L33, on main cfce892d: showNotification() created a
// plain <div> with no role or live region, removed after 3 s, so a screen-reader user was told nothing.
//   node dev/tests/notification_live_region.test.cjs [path/to/ipd-meta-pro.html]
const path = require('node:path');
const { loadPage } = require('./p60_page_loader.cjs');
const pageFile = process.argv[2] || path.join(__dirname, '..', '..', 'ipd-meta-pro.html');
const { run } = loadPage(pageFile);
let failed = 0;
function check(name, ok, detail) { console.log((ok ? 'PASS ' : 'FAIL ') + name + (detail ? '  [' + detail + ']' : '')); if (!ok) failed++; }
// a minimal element that records attributes, appended to a recording body
run('var __made = []; var __ce = document.createElement; document.createElement = function (tag) {' +
    '  var el = { tagName: String(tag).toUpperCase(), attrs: {}, style: {}, className: "", textContent: "",' +
    '    setAttribute: function (k, v) { this.attrs[k] = String(v); }, getAttribute: function (k) { return k in this.attrs ? this.attrs[k] : null; }, remove: function () {} };' +
    '  __made.push(el); return el; };' +
    'document.querySelector = function () { return null; }; document.body.appendChild = function (el) { el.appended = true; return el; };');
const shown = (msg, type) => JSON.parse(run('__made = []; showNotification(' + JSON.stringify(msg) + ', ' + JSON.stringify(type) + ');' +
  'JSON.stringify(__made.filter(function (e) { return e.appended; }).map(function (e) { return { text: e.textContent, attrs: e.attrs }; }))'));
for (const [type, role, live] of [['error', 'alert', 'assertive'], ['warning', 'alert', 'assertive'], ['info', 'status', 'polite'], ['success', 'status', 'polite']]) {
  const els = shown('message ' + type, type);
  const el = els.find(e => e.text === 'message ' + type) || { attrs: {} };
  check(type + ' notification has role="' + role + '" and aria-live="' + live + '"', el.attrs.role === role && el.attrs['aria-live'] === live, JSON.stringify(el.attrs));
}
if (failed) { console.log(failed + ' FAILED'); process.exit(1); }
console.log('all passed');
