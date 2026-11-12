// Drive the E-value page's own scripts in a Node vm with a minimal document
// (the same approach as the paper-22 validation archive's analysis/replay.cjs).
// Usage: node page_driver.cjs <cases.json>   -> prints JSON rows to stdout.
// Each case: {measure, point, lo, hi, rare, se, sd, delta, truev, n11, n10, n01, n00}.
"use strict";
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const page = path.resolve(__dirname, "..", "index.html");
const html = fs.readFileSync(page, "utf8");
const els = new Map();
function element(id) {
  return { id, value: "", checked: false, hidden: false, validity: { badInput: false }, innerHTML: "",
    textContent: "", dataset: {}, style: {}, listeners: {}, children: [],
    addEventListener(ev, fn) { (this.listeners[ev] = this.listeners[ev] || []).push(fn); },
    replaceChildren() { this.innerHTML = ""; this.children = []; },
    setAttribute() {}, removeAttribute() {}, closest() { return null; },
    appendChild(e) { this.children.push(e); }, insertBefore() {}, parentNode: { insertBefore() {} } };
}
for (const m of html.matchAll(/<[^>]+\bid="([^"]+)"[^>]*>/g)) {
  const e = element(m[1]);
  const v = m[0].match(/\bvalue="([^"]*)"/);
  e.value = v ? v[1] : "";
  els.set(e.id, e);
}
els.get("measure").value = "RR";
const document = { readyState: "complete",
  getElementById(id) { if (!els.has(id)) throw Error("Unknown DOM id " + id); return els.get(id); },
  querySelectorAll(sel) { if (sel !== ".footer-note") throw Error("Unknown selector " + sel); return []; },
  createElement: element, addEventListener() {} };
const ctx = { document, console };
ctx.window = ctx; ctx.globalThis = ctx;
vm.createContext(ctx);
for (const m of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) {
  const src = (m[1].match(/\bsrc="([^"]+)"/i) || [])[1];
  const file = src ? path.resolve(path.dirname(page), src) : page + "#inline";
  vm.runInContext(src ? fs.readFileSync(file, "utf8") : m[2], ctx, { filename: file });
}
const FIELDS = ["measure", "point", "lo", "hi", "se", "sd", "delta", "truev", "n11", "n10", "n01", "n00"];
const cases = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
const rows = cases.map(c => {
  for (const id of FIELDS) {
    if (!els.has(id)) { if (c[id] != null) throw Error("Page has no field " + id); continue; }
    if (id in c) els.get(id).value = c[id] == null ? "" : String(c[id]);
    else if (id !== "measure") els.get(id).value = id === "delta" ? "1" : "";
  }
  els.get("rare").checked = !!c.rare;
  const clicks = els.get("btn-run").listeners.click;
  if (!clicks || clicks.length !== 1) throw Error("Expected one compute handler");
  clicks[0]();
  const r = ctx.__almLastEValue();
  return { accepted: r !== null, result: r, refusal: r === null ? els.get("tbody").textContent : null,
    hidden: Object.fromEntries([...els.values()].filter(e => /^grp-/.test(e.id)).map(e => [e.id, e.hidden])) };
});
process.stdout.write(JSON.stringify(rows));
