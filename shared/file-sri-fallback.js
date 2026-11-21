/* file-sri-fallback.js -- include right after the <script integrity=... crossorigin> tags
 * of vendored libraries (shared/vendor/).
 * A page opened from a local copy (file://) cannot have Subresource Integrity checked:
 * the request carries no CORS, so Chrome refuses the script outright and the library is
 * missing (no charts, no ZIP import, no exports). Over http(s) this file does nothing and
 * the integrity check stands. On file:// it re-adds each earlier local integrity script
 * without integrity (there is nothing to check it against there), in the original order,
 * before the rest of the page is parsed. Added 2026-11-12 (tools/fileproto/fileproto.cjs).
 */
(function () {
  'use strict';
  if (location.protocol !== 'file:') return;
  var me = document.currentScript;
  var tags = document.querySelectorAll('script[integrity][src]');
  for (var i = 0; i < tags.length; i++) {
    var s = tags[i];
    // Only tags before this one; each tag is re-added once.
    if (!me || !(s.compareDocumentPosition(me) & Node.DOCUMENT_POSITION_FOLLOWING)) continue;
    if (s.getAttribute('data-file-fallback')) continue;
    s.setAttribute('data-file-fallback', '1');
    var u = new URL(s.getAttribute('src'), document.baseURI);
    if (u.protocol !== 'file:') continue; // remote scripts keep their integrity check
    document.write('<script src="' + u.href.replace(/&/g, '&amp;').replace(/"/g, '&quot;') + '"><\/script>');
  }
})();
