// correlation-ma plus panel: DOM-level checks of the real page + plus-core.js + plus-ui.js under a Node VM (linkedom).
// Numbers are compared to the independent metafor oracle (correlation-ma/validate/plus-corpus/reference-plus.json);
// display strings are compared to the panel's own full-precision numbers at the shown precision.
// No browser rendering claims. Run with linkedom resolvable (node_modules or NODE_PATH).
"use strict";
const fs = require("node:fs"), path = require("node:path"), vm = require("node:vm");
const { webcrypto } = require("node:crypto");
const nodeSetTimeout = require("node:timers").setTimeout;
const { parseHTML } = require("linkedom");
const root = path.resolve(__dirname, "../../..");
const read = (p) => fs.readFileSync(path.join(root, p), "utf8");
const REF = JSON.parse(read("correlation-ma/validate/plus-corpus/reference-plus.json"));
const V1 = JSON.parse(read("correlation-ma/validate/corpus/corpus.json"));
const LEDGER = path.join(root, "correlation-ma/validate/plus-corpus/probe-row-refusals.csv");
const ROWLEDGER = path.join(root, "correlation-ma/validate/plus-corpus/row-ledger-summary.json");
const TAMPER = process.argv.includes("--tamper");

let checks = 0; const fails = [];
const fail = (id, m) => fails.push(id + " :: " + m);
function near(id, f, a, r, kind) {
  checks++;
  if (r === null || r === undefined) { if (a !== null && a !== undefined) fail(id, f + " app=" + a + " ref=null"); return; }
  const ok = kind === "I2" ? Math.abs(a - r) / 100 <= 1e-9 : Math.abs(a - r) / Math.max(1, Math.abs(r)) <= (kind === "tau2" ? 1e-6 : 1e-9);
  if (!(typeof a === "number" && ok)) fail(id, f + " app=" + a + " ref=" + r);
}
function exact(id, f, a, r) { checks++; if (a !== r) fail(id, f + " app=" + JSON.stringify(a) + " ref=" + JSON.stringify(r)); }

function setup() {
  const { window, document } = parseHTML(read("correlation-ma/index.html"));
  window.__almChartExportAuto = false; window.alm = {};
  document.readyState = "complete";
  Object.defineProperty(document.querySelector("#f-method"), "value", { value: "REML", writable: true });
  for (const id of ["f-data", "f-method"]) { document.getElementById(id).disabled = false; document.getElementById(id).readOnly = false; }
  window.Element.prototype.getBoundingClientRect = () => ({ width: 560, height: 200 });
  window.matchMedia = () => ({ matches: false });
  const timers = [];
  const ctx = vm.createContext({ window, document, matchMedia: window.matchMedia, console, URL, Blob, TextEncoder, TextDecoder, ArrayBuffer, Uint8Array, crypto: webcrypto,
    location: { protocol: "http:", origin: "http://localhost", pathname: "/correlation-ma/index.html" },
    setTimeout: (f, n) => { timers.push(f); return timers.length; }, clearTimeout: () => {}, setInterval: () => 0, clearInterval: () => {}, performance, structuredClone,
    MutationObserver: window.MutationObserver, Event: window.Event });
  window.setTimeout = ctx.setTimeout; window.clearTimeout = ctx.clearTimeout;
  const run = (p) => vm.runInContext(read(p), ctx, { filename: p });
  run("shared/ma-core.js"); run("hub/shared/results-export.js");
  vm.runInContext([...document.querySelectorAll("script")].find((s) => s.textContent.includes("var EXAMPLE")).textContent, ctx);
  run("correlation-ma/plus-core.js"); run("correlation-ma/plus-ui.js");
  const flush = () => { let g = 0; while (timers.length && g++ < 1000) timers.shift()(); };
  flush();
  const setText = (t, method) => {
    if (method) { document.getElementById("f-method").value = method; document.getElementById("f-method").dispatchEvent(new window.Event("change")); }
    const ta = document.getElementById("f-data"); ta.value = t; ta.dispatchEvent(new window.Event("input")); flush();
  };
  return { window, document, ctx, flush, setText };
}
const fmt = (x, d = 3) => (typeof x === "number" && isFinite(x) ? x.toFixed(d) : "—");
const textOf = (studies) => studies.map((s) => s.label + ", " + s.r + ", " + s.n).join("\n");

const E = setup(), W = E.window, D = E.document;
// 1. default page: built-in example
{
  const ref = REF.inputs.find((i) => i.id === "plus-probe::built-in");
  const plus = W._almCorrPlus();
  exact("built-in", "plus schema", plus && plus._schema, "corr-ma-plus-v1");
  exact("built-in", "k", plus.k, 8);
  exact("built-in", "rows rendered", D.querySelectorAll("#alm-plus-sens tbody tr").length, 12);
  exact("built-in", "current row", D.querySelector("#alm-plus-sens tr[aria-current='true'] th").textContent, "REML");
}
// 2. sensitivity cells (numbers vs R; table strings vs numbers), LOO, prose — every input with k <= 200 through the real page
let nInputs = 0, nLoo = 0;
for (const inp of REF.inputs) {
  if (inp.k > 200) continue;
  nInputs++;
  for (const method of ["REML", "PM", "DL", "FE"]) for (const test of ["z", "knha", "adhoc"]) {
    const id = inp.id + "::" + method + "::" + test;
    E.setText(textOf(inp.studies), method);
    const radio = D.querySelector("input[name='alm-plus-test'][value='" + test + "']"); radio.checked = true;
    radio.dispatchEvent(new W.Event("change", { bubbles: true })); E.flush();
    const last = W._almLastCorrMA();
    exact(id, "page accepted k", last && last.k, inp.k);
    const plus = W._almCorrPlus();
    exact(id, "current", plus.current.method + "/" + plus.current.test, method + "/" + test);
    const trs = [...D.querySelectorAll("#alm-plus-sens tbody tr")];
    plus.cells.forEach((c, i) => {
      const R = inp.sensitivity.find((x) => x.method === c.method && x.test === c.test);
      const tds = [...trs[i].querySelectorAll("td")].map((t) => t.textContent);
      if (!c.applicable) { exact(id, "NA text " + c.method + c.test, tds[1], "not applicable"); return; }
      if (method === "REML" && test === "z") { // numbers once per input (the cells do not depend on the current selection)
        let mu = c.mu_z; if (TAMPER && c.method === "DL" && c.test === "adhoc") mu += 1e-7;
        near(id, c.method + c.test + " mu", mu, R.mu_z); near(id, c.method + c.test + " ciLo", c.ciLo, R.ciLo); near(id, c.method + c.test + " ciHi", c.ciHi, R.ciHi);
        near(id, c.method + c.test + " tau2", c.tau2_z, R.tau2_z, (c.method === "REML" || c.method === "PM") ? "tau2" : "num");
        near(id, c.method + c.test + " piLo", c.piLo, R.piLo); near(id, c.method + c.test + " piHi", c.piHi, R.piHi);
      }
      exact(id, "est str " + c.method + c.test, tds[1], fmt(c.r) + " [" + fmt(c.r_lo) + ", " + fmt(c.r_hi) + "]");
      exact(id, "pi str " + c.method + c.test, tds[2], c.r_pi_lo != null ? "[" + fmt(c.r_pi_lo) + ", " + fmt(c.r_pi_hi) + "]" : "—");
      exact(id, "I2 str " + c.method + c.test, tds[5], c.I2 != null ? fmt(c.I2, 1) + "%" : "—");
      exact(id, "Q str " + c.method + c.test, tds[6], fmt(c.Q, 2) + " (" + c.df + ")");
      exact(id, "narrower note " + c.method + c.test, /narrower than Wald/.test(tds[7]), !!c.narrower_than_wald);
    });
    // prose bound to the current cell's display strings
    const cur = plus.cells.find((c) => c.method === method && c.test === test);
    const sum = D.getElementById("alm-plus-summary"), res = D.getElementById("alm-plus-results");
    if (cur.applicable) {
      exact(id, "summary has r", sum.textContent.includes("r = " + fmt(cur.r) + " (95% CI " + fmt(cur.r_lo) + " to " + fmt(cur.r_hi) + ")"), true);
      exact(id, "results has r", res.textContent.includes("pooled r = " + fmt(cur.r)), true);
    } else exact(id, "no prose for NA", sum, null);
    // leave-one-out through the button
    if (test !== "adhoc" && (method === "REML" || method === "DL")) {
      D.getElementById("alm-plus-loo-btn").dispatchEvent(new W.Event("click")); E.flush();
      const L = plus.loo;
      if (inp.loo_refusal || (method === "FE" && test !== "z")) { exact(id, "loo refusal shown", !!D.querySelector("#alm-plus-loo .plus-refusal"), true); continue; }
      const R = inp.loo.find((x) => x.method === method && x.test === test);
      nLoo++;
      exact(id, "loo rows", D.querySelectorAll("#alm-plus-loo tbody tr").length, inp.k);
      L.rows.forEach((row, i) => { near(id, "loo mu " + i, row.mu_z, R.mu_z[i]); exact(id, "loo flag " + i, row.changes_ci_excludes_0, R.changes_ci_excludes_0[i]); });
      exact(id, "loo svg role", D.querySelector("#alm-plus-loo svg").getAttribute("role"), "img");
      exact(id, "loo flagged rows", D.querySelectorAll("#alm-plus-loo tbody tr.plus-flag").length, R.changes_ci_excludes_0.filter(Boolean).length);
    }
  }
}
// 3. U1: rejected-row notice reproduces the P17 probe refusal ledger exactly
{
  const lines = fs.readFileSync(LEDGER, "utf8").trim().split(/\r?\n/).slice(1);
  const parseCsv = (l) => { const o = []; let cur = "", q = false; for (const ch of l) { if (ch === '"') q = !q; else if (ch === "," && !q) { o.push(cur); cur = ""; } else cur += ch; } o.push(cur); return o; };
  const byKey = {};
  for (const l of lines) { const [key, line, text, reason] = parseCsv(l); (byKey[key] = byKey[key] || []).push({ line: Number(line), text, reason }); }
  const ledgered = new Set(Object.keys(byKey).map((k) => k.split("::")[0]));
  ["empty", "singleton", "escaped-label", "two-studies", "near-boundary", "built-in"].forEach((k) => ledgered.add(k)); // P17 probes with no refused rows
  let nProbe = 0;
  for (const c of V1) {
    E.setText(c.text, c.method);
    const got = W._almCorrRejected(), notice = D.getElementById("f-notice");
    const probe = c.id.split("::")[0];
    if (ledgered.has(probe)) { // P17 focused probes: exact line/text/reason ledger
      const want = byKey[c.id] || [];
      nProbe += want.length;
      exact(c.id, "rejected rows", JSON.stringify(got), JSON.stringify(want));
    } else { // other inputs (corpus NA rows, v1 empty-field probes): consistent with the page parser's accepted k
      const rows = c.text.split(/\r?\n/).map((l) => l.trim()).filter((l) => l && l[0] !== "#").length;
      const last = W._almLastCorrMA();
      exact(c.id, "rejected = supplied - accepted", got.length, rows - (last ? last.k : 0));
    }
    exact(c.id, "notice visible", !notice.hidden, got.length > 0);
    exact(c.id, "notice role", notice.getAttribute("role"), "status");
  }
  exact("U1", "ledger rows covered", nProbe, lines.length);
}
// 4. U1: full row ledger (5,089 supplied / 5,014 accepted) — accepted set equals the page parser's
{
  const S = JSON.parse(fs.readFileSync(ROWLEDGER, "utf8"));
  let sup = 0, acc = 0;
  for (const inp of S.inputs) {
    E.setText(inp.studies.map(([l, r, n]) => `${l}, ${r === null ? "NA" : r}, ${n === null ? "NA" : n}`).join("\n"), "DL");
    const last = W._almLastCorrMA(), rej = W._almCorrRejected();
    sup += inp.supplied; acc += last ? last.k : 0;
    exact(inp.id, "accepted", last ? last.k : 0, inp.accepted);
    exact(inp.id, "rejected count", rej.length, inp.supplied - inp.accepted);
  }
  exact("U1", "supplied total", sup, 5089); exact("U1", "accepted total", acc, 5014);
}
// 5. U2 tools
{
  E.setText("", "REML");
  exact("U2", "clear -> refusal headline", D.getElementById("headline").textContent, "Enter at least 2 studies (label, r, n).");
  D.querySelector("#f-tools button[data-tool='example']").dispatchEvent(new W.Event("click", { bubbles: true })); E.flush();
  const ex = REF.inputs.find((i) => i.id === "plus-probe::built-in").sensitivity.find((x) => x.method === "REML" && x.test === "z");
  near("U2", "example = REML R reference", W._almLastCorrMA().r, ex.r);
  D.querySelector("#f-tools button[data-tool='clear']").dispatchEvent(new W.Event("click", { bubbles: true })); E.flush();
  exact("U2", "clear empties", D.getElementById("f-data").value, "");
  exact("U2", "clear -> no result", W._almLastCorrMA(), null);
  const cohen = REF.inputs.find((i) => i.id === "dat.cohen1981::ri::ni");
  E.setText(cohen.studies.map((s) => s.label + "\t" + s.r + "\t" + s.n).join("\n"), "REML");
  D.querySelector("#f-tools button[data-tool='convert']").dispatchEvent(new W.Event("click", { bubbles: true })); E.flush();
  near("U2", "tab copy of dat.cohen1981 -> comma reference", W._almLastCorrMA().r, cohen.sensitivity.find((x) => x.method === "REML" && x.test === "z").r);
  E.setText(cohen.studies.map((s) => s.label + ";" + String(s.r).replace(".", ",") + ";" + s.n).join("\n"), "REML");
  D.querySelector("#f-tools button[data-tool='convert']").dispatchEvent(new W.Event("click", { bubbles: true })); E.flush();
  near("U2", "semicolon + decimal-comma copy -> comma reference", W._almLastCorrMA().r, cohen.sensitivity.find((x) => x.method === "REML" && x.test === "z").r);
  D.getElementById("f-data").disabled = true; E.flush();
  const before = D.getElementById("f-data").value;
  D.querySelector("#f-tools button[data-tool='clear']").dispatchEvent(new W.Event("click", { bubbles: true })); E.flush();
  exact("U2", "inert while replay disables #f-data", D.getElementById("f-data").value, before);
  D.getElementById("f-data").disabled = false;
}
// 6. U4 forest accessibility + contrast
{
  E.setText(V1[0].text, "REML");
  const svg = D.querySelector("#forest-host svg");
  exact("U4", "forest role", svg.getAttribute("role"), "img");
  exact("U4", "forest label has k", /of 20 studies/.test(svg.getAttribute("aria-label")), true);
  const lum = (h) => { const c = [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4))); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; };
  const ratio = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
  const css = read("correlation-ma/index.html");
  const m = css.match(/--forest-ci:\s*(#[0-9a-fA-F]{6})/g) || [];
  exact("U4", "forest CI colour tokens (light, dark)", m.length >= 2, true);
  const light = m[0] && m[0].split(":")[1].trim(), dark = m[1] && m[1].split(":")[1].trim();
  checks++; if (!(ratio(light, "#ffffff") >= 3)) fail("U4", "light stroke contrast " + ratio(light, "#ffffff"));
  checks++; if (!(ratio(dark, "#1c1f23") >= 3)) fail("U4", "dark stroke contrast " + ratio(dark, "#1c1f23"));
}
console.log(`PLUS-DOM: ${checks - fails.length}/${checks} checks pass; inputs=${nInputs}; loo_configs=${nLoo}` + (TAMPER ? " (TAMPER: failures expected)" : ""));
fails.slice(0, 30).forEach((f) => console.log("FAIL " + f));
process.exit(fails.length ? 1 : 0);
