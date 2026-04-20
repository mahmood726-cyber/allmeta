const Stats = {



 normalPDF: (x, mean = 0, sd = 1) => {

 const z = (x - mean) / sd;

 return Math.exp(-0.5 * z * z) / (sd * Math.sqrt(2 * Math.PI));

 },



 normalCDF: (x, mean = 0, sd = 1) => {

 const z = (x - mean) / sd;

 const t = 1 / (1 + 0.2316419 * Math.abs(z));

 const d = 0.3989422804 * Math.exp(-z * z / 2);

 const p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));

 return z > 0 ? 1 - p : p;

 },



 normalQuantile: (p, mean = 0, sd = 1) => {



 if (p <= 0) return -Infinity;

 if (p >= 1) return Infinity;

 if (p === 0.5) return mean;



 const a = [

 -3.969683028665376e+01, 2.209460984245205e+02,

 -2.759285104469687e+02, 1.383577518672690e+02,

 -3.066479806614716e+01, 2.506628277459239e+00

 ];

 const b = [

 -5.447609879822406e+01, 1.615858368580409e+02,

 -1.556989798598866e+02, 6.680131188771972e+01, -1.328068155288572e+01

 ];

 const c = [

 -7.784894002430293e-03, -3.223964580411365e-01,

 -2.400758277161838e+00, -2.549732539343734e+00,

 4.374664141464968e+00, 2.938163982698783e+00

 ];

 const d = [

 7.784695709041462e-03, 3.224671290700398e-01,

 2.445134137142996e+00, 3.754408661907416e+00

 ];



 const pLow = 0.02425;

 const pHigh = 1 - pLow;

 let q, r;



 if (p < pLow) {

 q = Math.sqrt(-2 * Math.log(p));

 return mean + sd * (((((c[0]*q+c[1])*q+c[2])*q+c[3])*q+c[4])*q+c[5]) /

 ((((d[0]*q+d[1])*q+d[2])*q+d[3])*q+1);

 } else if (p <= pHigh) {

 q = p - 0.5;

 r = q * q;

 return mean + sd * (((((a[0]*r+a[1])*r+a[2])*r+a[3])*r+a[4])*r+a[5])*q /

 (((((b[0]*r+b[1])*r+b[2])*r+b[3])*r+b[4])*r+1);

 } else {

 q = Math.sqrt(-2 * Math.log(1 - p));

 return mean + sd * -(((((c[0]*q+c[1])*q+c[2])*q+c[3])*q+c[4])*q+c[5]) /

 ((((d[0]*q+d[1])*q+d[2])*q+d[3])*q+1);

 }

 },



 chiSquareCDF: (x, df) => {

 if (x <= 0) return 0;

 return Stats.gammaCDF(x / 2, df / 2);

 },



 chiSquareQuantile: (p, df) => {



 if (p <= 0) return 0;

 if (p >= 1) return Infinity;



 let x = df;

 for (let i = 0; i < 100; i++) {

 const fx = Stats.chiSquareCDF(x, df) - p;

 const fpx = Stats.chiSquarePDF(x, df);

 if (Math.abs(fx) < 1e-10 || fpx === 0) break;

 x = Math.max(0.001, x - fx / fpx);

 }

 return x;

 },



 chiSquarePDF: (x, df) => {

 if (x <= 0) return 0;

 const k = df / 2;

 return Math.pow(x, k - 1) * Math.exp(-x / 2) / (Math.pow(2, k) * Stats.gamma(k));

 },



 gamma: (z) => {

 const g = 7;

 const c = [

 0.99999999999980993, 676.5203681218851, -1259.1392167224028,

 771.32342877765313, -176.61502916214059, 12.507343278686905,

 -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7

 ];



 if (z < 0.5) {

 return Math.PI / (Math.sin(Math.PI * z) * Stats.gamma(1 - z));

 }



 z -= 1;

 let x = c[0];

 for (let i = 1; i < g + 2; i++) {

 x += c[i] / (z + i);

 }

 const t = z + g + 0.5;

 return Math.sqrt(2 * Math.PI) * Math.pow(t, z + 0.5) * Math.exp(-t) * x;

 },



 gammaCDF: (x, a) => {



 if (x <= 0) return 0;

 if (x > 1000) return 1;



 const EPSILON = 1e-12;

 let sum = 0;

 let term = 1 / a;

 sum = term;



 for (let n = 1; n < 1000; n++) {

 term *= x / (a + n);

 sum += term;

 if (Math.abs(term) < EPSILON) break;

 }



 return Math.exp(-x + a * Math.log(x) - Math.log(Stats.gamma(a))) * sum;

 },



 tCDF: (t, df) => {

 const x = df / (df + t * t);

 return 1 - 0.5 * Stats.betaCDF(x, df / 2, 0.5);

 },



 tQuantile: (p, df) => {

 if (p === 0.5) return 0;

 const sign = p < 0.5 ? -1 : 1;

 const p2 = p < 0.5 ? p : 1 - p;



 const a = 1 / (df - 0.5);

 const b = 48 / (a * a);

 let c = ((20700 * a / b - 98) * a - 16) * a + 96.36;

 const d = ((94.5 / (b + c) - 3) / b + 1) * Math.sqrt(a * Math.PI / 2) * df;

 let x = d * p2;

 let y = Math.pow(x, 2 / df);



 if (y > 0.05 + a) {

 x = Stats.normalQuantile(p2);

 y = x * x;

 if (df < 5) c += 0.3 * (df - 4.5) * (x + 0.6);

 c += (((0.05 * d * x - 5) * x - 7) * x - 2) * x + b;

 y = (((((0.4 * y + 6.3) * y + 36) * y + 94.5) / c - y - 3) / b + 1) * x;

 y = a * y * y;

 y = y > 0.002 ? Math.exp(y) - 1 : 0.5 * y * y + y;

 } else {

 y = ((1 / (((df + 6) / (df * y) - 0.089 * d - 0.822) * (df + 2) * 3) + 0.5 / (df + 4)) * y - 1) * (df + 1) / (df + 2) + 1 / y;

 }



 return sign * Math.sqrt(df * y);

 },



 betaCDF: (x, a, b) => {

 if (x <= 0) return 0;

 if (x >= 1) return 1;



 const bt = Math.exp(

 Stats.logGamma(a + b) - Stats.logGamma(a) - Stats.logGamma(b) +

 a * Math.log(x) + b * Math.log(1 - x)

 );



 if (x < (a + 1) / (a + b + 2)) {

 return bt * Stats.betaCF(x, a, b) / a;

 } else {

 return 1 - bt * Stats.betaCF(1 - x, b, a) / b;

 }

 },



 betaCF: (x, a, b) => {

 const EPSILON = 1e-10;

 const MAX_ITER = 200;



 let qab = a + b;

 let qap = a + 1;

 let qam = a - 1;

 let c = 1;

 let d = 1 - qab * x / qap;

 if (Math.abs(d) < EPSILON) d = EPSILON;

 d = 1 / d;

 let h = d;



 for (let m = 1; m <= MAX_ITER; m++) {

 let m2 = 2 * m;

 let aa = m * (b - m) * x / ((qam + m2) * (a + m2));

 d = 1 + aa * d;

 if (Math.abs(d) < EPSILON) d = EPSILON;

 c = 1 + aa / c;

 if (Math.abs(c) < EPSILON) c = EPSILON;

 d = 1 / d;

 h *= d * c;



 aa = -(a + m) * (qab + m) * x / ((a + m2) * (qap + m2));

 d = 1 + aa * d;

 if (Math.abs(d) < EPSILON) d = EPSILON;

 c = 1 + aa / c;

 if (Math.abs(c) < EPSILON) c = EPSILON;

 d = 1 / d;

 const del = d * c;

 h *= del;



 if (Math.abs(del - 1) < EPSILON) break;

 }



 return h;

 },



 logGamma: (x) => {

 const c = [

 76.18009172947146, -86.50532032941677, 24.01409824083091,

 -1.231739572450155, 0.001208650973866179, -0.000005395239384953

 ];



 let y = x;

 let tmp = x + 5.5;

 tmp -= (x + 0.5) * Math.log(tmp);

 let ser = 1.000000000190015;



 for (let j = 0; j < 6; j++) {

 ser += c[j] / ++y;

 }



 return -tmp + Math.log(2.5066282746310005 * ser / x);

 },



 mean: (arr) => arr.reduce((a, b) => a + b, 0) / arr.length,



variance: (arr, ddof = 0) => {

if (!Array.isArray(arr) || arr.length === 0) return NaN;

const divisor = arr.length - ddof;

if (divisor <= 0) return NaN;

const m = Stats.mean(arr);

return arr.reduce((acc, val) => acc + Math.pow(val - m, 2), 0) / divisor;

},



sd: (arr, ddof = 0) => Math.sqrt(Stats.variance(arr, ddof)),



 median: (arr) => {

 const sorted = [...arr].sort((a, b) => a - b);

 const mid = Math.floor(sorted.length / 2);

 return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;

 },



 quantile: (arr, p) => {

 const sorted = [...arr].sort((a, b) => a - b);

 const pos = (sorted.length - 1) * p;

 const base = Math.floor(pos);

 const rest = pos - base;

 if (sorted[base + 1] !== undefined) {

 return sorted[base] + rest * (sorted[base + 1] - sorted[base]);

 }

 return sorted[base];

 },



 weightedMean: (values, weights) => {

 let sum = 0, weightSum = 0;

 for (let i = 0; i < values.length; i++) {

 sum += values[i] * weights[i];

 weightSum += weights[i];

 }

 return sum / weightSum;

 },



 linearRegression: (x, y, weights = null) => {

 const n = x.length;

 const w = weights || new Array(n).fill(1);



 let sumW = 0, sumWX = 0, sumWY = 0, sumWXX = 0, sumWXY = 0;



 for (let i = 0; i < n; i++) {

 sumW += w[i];

 sumWX += w[i] * x[i];

 sumWY += w[i] * y[i];

 sumWXX += w[i] * x[i] * x[i];

 sumWXY += w[i] * x[i] * y[i];

 }



 const slope = (sumW * sumWXY - sumWX * sumWY) / (sumW * sumWXX - sumWX * sumWX);

 const intercept = (sumWY - slope * sumWX) / sumW;



 let ssRes = 0, ssTot = 0;

 const yMean = sumWY / sumW;



 for (let i = 0; i < n; i++) {

 const yPred = intercept + slope * x[i];

 ssRes += w[i] * Math.pow(y[i] - yPred, 2);

 ssTot += w[i] * Math.pow(y[i] - yMean, 2);

 }



 const rSquared = 1 - ssRes / ssTot;

 const mse = ssRes / (sumW - 2);

 const seSlope = Math.sqrt(mse * sumW / (sumW * sumWXX - sumWX * sumWX));

 const seIntercept = Math.sqrt(mse * sumWXX / (sumW * sumWXX - sumWX * sumWX));



 return { slope, intercept, rSquared, seSlope, seIntercept, mse };

 }

 };



 // Confidence level z-value: uses APP.config.confLevel (default 0.95 → z=1.96)

 // Call getConfZ() instead of hardcoding 1.96 so CIs respect user's chosen level

 