function getConfZ() {

 const level = (typeof APP !== 'undefined' && APP.config && APP.config.confLevel) ? APP.config.confLevel : 0.95;

 const alpha = 1 - level;

 // Use Stats.normalQuantile if available, otherwise approximate

 if (typeof Stats !== 'undefined' && Stats.normalQuantile) {

 return Stats.normalQuantile(1 - alpha / 2);

 }

 // Rational approximation fallback (Abramowitz & Stegun 26.2.23)

 const p = 1 - alpha / 2;

 const t = Math.sqrt(-2 * Math.log(1 - p));

 return t - (2.515517 + 0.802853 * t + 0.010328 * t * t) / (1 + 1.432788 * t + 0.189269 * t * t + 0.001308 * t * t * t);

 }



 