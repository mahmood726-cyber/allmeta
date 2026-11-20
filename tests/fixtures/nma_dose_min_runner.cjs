// Loads nma-dose-response-app/app.js AND app.min.js (each in its own vm context, with the same
// shared/upper-tail.js + shared/ma-core.js globals that index.html / index.prod.html provide) and
// prints, for each build, REMLEstimator / SidikJonkmanEstimator .estimate() on the datasets of
// tau2_audit_metafor521.json. Used by tests/test_nma_dose_prod_build.py to prove the shipped
// minified build computes what app.js computes (lane nmabuild, 2026-11-12).
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
const MC = require(P("shared/ma-core.js"));
const TAIL = require(P("shared/upper-tail.js"));

function safe(fn) {
  try { return JSON.parse(JSON.stringify(fn())); } catch (e) { return "ERR:" + String((e && e.message) || e); }
}
function run(file) {
  const ctx = context({ AlmMaCore: MC, AlmTail: TAIL });
  let loadErr = null;
  try { vm.runInContext(fs.readFileSync(P(file), "utf8"), ctx, { filename: path.basename(file) }); }
  catch (e) { loadErr = String((e && e.message) || e); /* DOM wiring only */ }
  const out = { loadErr, reml: {}, sj: {} };
  for (const [ds, d] of Object.entries(FIX.data)) {
    out.reml[ds] = safe(() => new ctx.REMLEstimator(d.yi, d.vi).estimate());
    out.sj[ds] = safe(() => new ctx.SidikJonkmanEstimator(d.yi, d.vi).estimate());
  }
  return out;
}
process.stdout.write(JSON.stringify({ app: run("nma-dose-response-app/app.js"), min: run("nma-dose-response-app/app.min.js") }));
