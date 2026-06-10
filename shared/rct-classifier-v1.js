/* shared/rct-classifier-v1.js — offline cold-start RCT/study-design classifier.
 *
 * Runs a transparent binary bag-of-words logistic regression entirely in the
 * browser: no server, no cloud model, weights are human-readable. Trained on
 * real PubMed abstracts labelled by Publication Type (see
 * screen/tools/train_rct_classifier.py); the weights live in
 * screen/assets/rct-classifier-weights-v1.js as window.AlmRctWeights.
 *
 * This gives a "likely RCT %" signal BEFORE any screening decisions, so it
 * complements (does not replace) screen's buscar active-learning, which only
 * kicks in once reviewers have started labelling.
 *
 * scoreWith(weights, text) is pure and dual-mode (node-testable); score(text)
 * uses the loaded global. Tokenisation replicates sklearn's CountVectorizer
 * default (lowercase, token pattern \b\w\w+\b, 1-2 grams, presence) so JS and
 * Python agree to floating point on ASCII text (pinned by the parity test).
 */
(function (global) {
  "use strict";

  function tokenize(text) {
    return (String(text == null ? "" : text).toLowerCase().match(/\b\w\w+\b/g)) || [];
  }

  // Set of unigram + (optionally) bigram features present in the text.
  function features(text, ngramMax) {
    var toks = tokenize(text), set = Object.create(null), i;
    for (i = 0; i < toks.length; i++) set[toks[i]] = 1;
    if ((ngramMax || 2) >= 2) for (i = 0; i < toks.length - 1; i++) set[toks[i] + " " + toks[i + 1]] = 1;
    return set;
  }

  function sigmoid(x) { return 1 / (1 + Math.exp(-x)); }

  // weights: { intercept, ngram_max, vocab:{term:coef} } -> P(RCT) in [0,1].
  function scoreWith(weights, text) {
    if (!weights || !weights.vocab) return null;
    var feats = features(text, weights.ngram_max), s = weights.intercept || 0, v = weights.vocab, f;
    for (f in feats) if (v[f] !== undefined) s += v[f];
    return sigmoid(s);
  }

  function weights() { return global.AlmRctWeights || null; }
  function available() { var w = weights(); return !!(w && w.vocab); }
  function meta() { var w = weights(); return w ? (w.meta || null) : null; }
  function score(text) { return scoreWith(weights(), text); }

  var api = { tokenize: tokenize, features: features, scoreWith: scoreWith, score: score, available: available, meta: meta };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  global.SrRctClassifier = api;
})(typeof window !== "undefined" ? window : globalThis);
