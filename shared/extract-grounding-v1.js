/* shared/extract-grounding-v1.js — span-grounding for extracted values.
 *
 * Every value the extract app surfaces should be traceable to the exact source
 * sentence it came from, and every value an LLM proposes should be REJECTED
 * unless its claimed supporting quote actually appears in the source text. This
 * is what makes allmeta's extraction reproducible and auditable where cloud
 * tools (e.g. Elicit) are not — and it directly counters the LLM
 * citation-misattribution / fabricated-default failure modes.
 *
 * Pure + dual-mode (window.SrGrounding + module.exports) so it is node-testable.
 */
(function (global) {
  "use strict";

  function norm(s) { return String(s == null ? "" : s).replace(/\s+/g, " ").trim(); }

  // Split into sentences without breaking common abbreviations / decimals
  // (e.g. "0.86", "vs.", "95% CI ... to ...."). Conservative: a boundary is
  // ". "/"? "/"! " followed by an uppercase letter or a digit-led clause.
  function sentences(text) {
    var t = norm(text);
    if (!t) return [];
    var parts = t.split(/(?<=[.?!])\s+(?=[A-Z(0-9])/);
    return parts.map(norm).filter(Boolean);
  }

  // Locate the sentence containing `needle` (e.g. an extracted effect's matched
  // text). Matching is whitespace-insensitive. Returns {found, sentence, index}.
  function locate(text, needle) {
    var nN = norm(needle);
    if (!nN) return { found: false, sentence: "", index: -1 };
    var sents = sentences(text);
    for (var i = 0; i < sents.length; i++) {
      if (norm(sents[i]).indexOf(nN) >= 0) return { found: true, sentence: sents[i], index: i };
    }
    // fall back to a token-overlap match (the needle may straddle a split)
    var key = nN.slice(0, Math.min(nN.length, 24));
    for (var j = 0; j < sents.length; j++) {
      if (norm(sents[j]).indexOf(key) >= 0) return { found: true, sentence: sents[j], index: j };
    }
    return { found: false, sentence: "", index: -1 };
  }

  // Validate that an LLM-supplied `quote` is genuinely present in `text`
  // (whitespace-insensitive substring). Ungrounded quotes must be treated as
  // unverified, never silently accepted. Returns {grounded, quote, sentence}.
  function validateQuote(text, quote) {
    var q = norm(quote);
    if (!q) return { grounded: false, quote: "", sentence: "" };
    var grounded = norm(text).indexOf(q) >= 0;
    var loc = grounded ? locate(text, q) : { sentence: "" };
    return { grounded: grounded, quote: q, sentence: loc.sentence || (grounded ? q : "") };
  }

  var api = { norm: norm, sentences: sentences, locate: locate, validateQuote: validateQuote };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  global.SrGrounding = api;
})(typeof window !== "undefined" ? window : globalThis);
