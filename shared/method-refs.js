/* Offline reference metadata. DOI intentionally pending host --resolve.
 * Metadata transcribed from metafor 5.2-1 CITATION, not generated from memory.
 * JSON block is also read by scripts/ground_citations.py. */
(function (root) {
  'use strict';
  const refs = /* METHOD_REFS_START */ [
    {
      "id": "metafor",
      "authors": ["Viechtbauer W"],
      "title": "Conducting meta-analyses in R with the metafor package",
      "journal": "Journal of Statistical Software",
      "year": "2010",
      "volume": "36",
      "issue": "3",
      "pages": "1-48",
      "doi": "",
      "vancouver": "Viechtbauer W. Conducting meta-analyses in R with the metafor package. Journal of Statistical Software. 2010;36(3):1-48."
    }
  ] /* METHOD_REFS_END */;
  refs.forEach(ref => { Object.freeze(ref.authors); Object.freeze(ref); });
  const api = Object.freeze({entries: Object.freeze(refs)});
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.alm = root.alm || {};
  root.alm.methodRefs = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
