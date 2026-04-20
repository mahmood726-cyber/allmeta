function createSeededRNG(seed) {

 let s = [seed >>> 0, (seed * 2654435761) >>> 0, (seed * 2246822519) >>> 0, (seed * 3266489917) >>> 0];

 function next() {

 const r = (((s[1] * 5) << 7 | (s[1] * 5) >>> 25) * 9) >>> 0;

 const t = s[1] << 9;

 s[2] ^= s[0]; s[3] ^= s[1]; s[1] ^= s[2]; s[0] ^= s[3];

 s[2] ^= t; s[3] = (s[3] << 11 | s[3] >>> 21);

 return (r >>> 0) / 4294967296;

 }

 return next;

 }



 // Global seeded RNG for deterministic statistical methods (bootstrap, MICE, CART, etc.)

 // All Math.random() calls in analysis code become deterministic via patchMathRandom/restoreMathRandom.

 const SeededRNG = {

 _rng: createSeededRNG(12345),

 _currentSeed: 12345,

 _originalMathRandom: Math.random,

 _patched: false,

 seed: function(s) { this._currentSeed = s; this._rng = createSeededRNG(s); },

 random: function() { return this._rng(); },

 getSeed: function() { return this._currentSeed; },

 // Monkey-patch Math.random for determinism during analysis

 patchMathRandom: function(seed) {

  if (seed !== undefined) this.seed(seed);

  else this.seed(this._currentSeed); // Reset to same seed for reproducibility

  this._originalMathRandom = Math.random;

  var self = this;

  Math.random = function() { return self._rng(); };

  this._patched = true;

 },

 restoreMathRandom: function() {

  if (this._patched) {

  Math.random = this._originalMathRandom;

  this._patched = false;

  }

 },

 // Run a function with deterministic Math.random, then restore

 withDeterminism: function(seed, fn) {

  this.patchMathRandom(seed);

  try { var result = fn(); return result; }

  finally { this.restoreMathRandom(); }

 }

 };

 // Expose globally

 window.SeededRNG = SeededRNG;

 window.createSeededRNG = createSeededRNG;



 