// Executes every user-reachable univariate tau^2 implementation of the lane-remlA audit on the
// datasets in tau2_audit_metafor521.json and prints {impl: {dataset: tau2 | "ERR:..."}} as JSON.
// Pages that are not modules (nma-dose-response-app/app.js, dosehtml/dose-response-pro.html)
// run in a vm context with a permissive DOM stand-in; only their estimator classes are called.
"use strict";
const fs = require("fs"), path = require("path"), vm = require("vm");
const ROOT = path.resolve(__dirname, "..", "..");
const P = (p) => path.join(ROOT, p);
const FIX = JSON.parse(fs.readFileSync(path.join(__dirname, "tau2_audit_metafor521.json"), "utf8"));

function any() {
  const f = function () { return any(); };
  return new Proxy(f, {
    get(t, p) {
      if (p === Symbol.toPrimitive) return () => "";
      if (p === Symbol.iterator) return function* () {};
      if (p === "length") return 0;
      if (p === "then") return undefined;
      if (p === "value" || p === "textContent" || p === "innerHTML") return "";
      if (p === "checked") return false;
      return any();
    },
    set() { return true; }, apply() { return any(); }, construct() { return any(); }, has() { return true; },
  });
}
function context(extra) {
  const ctx = Object.assign({
    console: { log() {}, warn() {}, info() {}, debug() {}, error() {} }, Math, JSON, Date, Array, Object, Number, String, Map, Set, WeakMap,
    Promise, Symbol, Error, RangeError, TypeError, Proxy, Reflect, isFinite, isNaN, parseFloat, parseInt, Float64Array,
    Float32Array, Int32Array, Uint8Array, Uint32Array, URL, TextEncoder, TextDecoder, structuredClone,
    setTimeout: () => 0, clearTimeout() {}, setInterval: () => 0, clearInterval() {}, requestAnimationFrame: () => 0,
    cancelAnimationFrame() {}, document: any(), navigator: { userAgent: "node", hardwareConcurrency: 1 },
    location: { href: "http://x/", search: "", hash: "", protocol: "http:" },
    localStorage: { getItem() { return null; }, setItem() {}, removeItem() {} },
    sessionStorage: { getItem() { return null; }, setItem() {}, removeItem() {} },
    fetch: () => Promise.reject(new Error("offline")), addEventListener() {}, removeEventListener() {},
    matchMedia: () => ({ matches: false, addEventListener() {}, addListener() {} }), getComputedStyle: () => any(),
    MutationObserver: function () { return { observe() {}, disconnect() {} }; },
    ResizeObserver: function () { return { observe() {}, disconnect() {} }; },
    IntersectionObserver: function () { return { observe() {}, disconnect() {} }; },
    Worker: function () { return any(); }, performance: { now: () => 0 }, alert() {}, confirm: () => false, prompt: () => null,
    atob: (s) => Buffer.from(s, "base64").toString("binary"), btoa: (s) => Buffer.from(s, "binary").toString("base64"),
    Chart: function () { return any(); }, Plotly: any(), Blob: function () {}, FileReader: function () {},
    HTMLElement: function () {}, Element: function () {}, Node: function () {}, Event: function () {}, CustomEvent: function () {},
  }, extra || {});
  ctx.window = ctx; ctx.self = ctx; ctx.globalThis = ctx;
  vm.createContext(ctx);
  return ctx;
}
const read = (p) => fs.readFileSync(P(p), "utf8");
const MC = require(P("shared/ma-core.js"));
const TAIL = require(P("shared/upper-tail.js"));
globalThis.AlmMaCore = MC; globalThis.AlmTail = TAIL;

const impls = {};
for (const m of ["REML", "ML", "PM", "EB", "SJ", "HE", "DL"]) impls["ma-core " + m] = (y, v) => MC.pool(y, v, { method: m }).tau2;

const { MetaAnalysisMethods } = require(P("HTA/src/engine/metaMethods.js"));
for (const m of ["REML", "PM", "DL"]) impls["HTA metaMethods " + m] = (y, v) => new MetaAnalysisMethods({ method: m, autoHKSJ: false })
  .calculatePooledEffect(y.map((e, i) => ({ study: "s" + i, effect: e, se: Math.sqrt(v[i]) }))).heterogeneity.tauSquared;
const FM = require(P("HTA/src/engine/frontierMeta.js"));
impls["HTA IPD two-stage pooling"] = (y, v) => new FM.IPDMetaAnalysis()._remlPooling(y, v).tau2;

const MV = require(P("shared/multivariate-ma.js"));
impls["multivariate-ma univariate REML"] = (y, v) => MV.fitUnivariate(y, v).tau2;

{
  const ctx = context({ AlmMaCore: MC, AlmTail: TAIL });
  try { vm.runInContext(read("nma-dose-response-app/app.js"), ctx, { filename: "app.js" }); } catch (e) { /* DOM wiring only */ }
  impls["nma-dose-response-app REMLEstimator"] = (y, v) => new ctx.REMLEstimator(y, v).estimate().tau2;
  impls["nma-dose-response-app SidikJonkmanEstimator"] = (y, v) => new ctx.SidikJonkmanEstimator(y, v).estimate().tau2;
}
const reg = {};
{
  const html = read("dosehtml/dose-response-pro.html");
  const src = [...html.matchAll(/<script(?![^>]*src=)[^>]*>([\s\S]*?)<\/script>/g)].map((m) => m[1]).join("\n;\n") +
    "\n;this.__tau={reml:estimateTau2REML,dl:estimateTau2DL};";
  const ctx = context({ AlmTail: TAIL });
  vm.runInContext(src, ctx, { filename: "dose-response-pro.html" });
  const blocks = (y, v) => [y.map((_, i) => [1, i + 1]), y, v.map((vv, i) => ({ studyId: "s" + i, V: [vv], n: 1 }))];
  reg["dosehtml REML (mods = x)"] = (y, v) => { const [X, yy, V] = blocks(y, v); return ctx.__tau.reml(X, yy, V).tau2; };
  reg["dosehtml DL (mods = x)"] = (y, v) => { const [X, yy, V] = blocks(y, v); return ctx.__tau.dl(X, yy, V); };
}
function runAll(set, sets) {
  const out = {};
  for (const [name, f] of Object.entries(set)) {
    out[name] = {};
    for (const s of sets) {
      const { yi, vi } = FIX.data[s];
      try { out[name][s] = f(yi.slice(), vi.slice()); } catch (e) { out[name][s] = "ERR:" + e.message; }
    }
  }
  return out;
}
process.stdout.write(JSON.stringify({ uni: runAll(impls, Object.keys(FIX.ref)), reg: runAll(reg, Object.keys(FIX.ref_reg)) }));
