/* a11y-landmarks.js — runtime landmark containment fixer.
 *
 * Closes the portfolio-wide axe `region` violation (66/69 apps): the shared
 * fixed `#hub-back` link and trailing `.footer-note` paragraph sit outside
 * any landmark. Each app's index.html is hand-written with no universal
 * shared script, so the fix is applied at runtime by this one file (added
 * to every app via an idempotent one-line <script> codemod).
 *
 * Zero-visual-risk technique: wrappers use `display:contents` so they
 * generate no layout box — children render byte-identically — while still
 * contributing a landmark to the accessibility tree. Idempotent: re-running
 * is a no-op (guarded by a data marker and an already-in-landmark check).
 */
(function () {
  'use strict';

  var LANDMARK_SEL =
    'main,nav,header,footer,aside,[role=main],[role=navigation],' +
    '[role=banner],[role=contentinfo],[role=complementary],' +
    '[role=region][aria-label],[role=search],form';

  function inLandmark(el) {
    return el.closest && el.closest(LANDMARK_SEL) != null;
  }

  function wrap(el, tagName, ariaLabel) {
    if (!el || el.dataset.almLandmarkWrapped === '1' || inLandmark(el)) return;
    var w = document.createElement(tagName);
    w.dataset.almLandmark = '1';
    w.style.display = 'contents'; // no box generated; visuals unchanged
    if (ariaLabel) w.setAttribute('aria-label', ariaLabel);
    el.parentNode.insertBefore(w, el);
    w.appendChild(el);
    el.dataset.almLandmarkWrapped = '1';
  }

  function fix() {
    var back = document.getElementById('hub-back');
    if (back) wrap(back, 'nav', 'Back to allmeta hub');

    var notes = document.querySelectorAll('.footer-note');
    for (var i = 0; i < notes.length; i++) wrap(notes[i], 'footer', null);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', fix);
  } else {
    fix();
  }
})();
