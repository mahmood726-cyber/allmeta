// Written by the PR #637 second-round reviewer (lane rev637b, F:/claude-temp/lanes/rev637b-work/rev637b-overlay.test.cjs),
// copied unchanged except the module paths default to this repo / the usual playwright-core. Credit: rev637b.
"use strict";
const test = require("node:test"); const assert = require("node:assert");
const U = require(process.env.UP || require("path").join(__dirname, "..", "userpath.cjs"));
const { chromium } = require(process.env.PLAYWRIGHT_CORE || "playwright-core");
const CHROME = process.env.CHROME || "C:/Program Files/Google/Chrome/Application/chrome.exe";
const page = (body) => `<!doctype html><html><head><style>.fs{position:fixed;inset:0;z-index:5;background:#fff}</style></head><body>${body}
<script>window.__pressed=[];document.addEventListener('click',e=>{if(e.target.dataset.k)window.__pressed.push(e.target.dataset.k)});</script></body></html>`;
async function run(html) {
  const b = await chromium.launch({ executablePath: CHROME, headless: true });
  try { const p = await b.newPage(); await p.setContent(html); const rep = await U.dismissOverlays(p);
    return { rep, pressed: await p.evaluate(() => window.__pressed) }; } finally { await b.close(); }
}
test("m4a full-screen fixed layout (no dialog role/class) with a Close and an x button: nothing pressed", async () => {
  const r = await run(page(`<div id="layout" class="fs"><aside><button data-k="close">Close</button><button data-k="x">×</button></aside><button>Run</button></div>`));
  assert.deepStrictEqual(r.pressed, [], JSON.stringify(r));
});
test("m4b full-screen role=dialog onboarding with Close: pressed", async () => {
  const r = await run(page(`<div id="intro" class="fs" role="dialog"><button data-k="close" onclick="this.parentNode.remove()">Close</button></div><button>Run</button>`));
  assert.deepStrictEqual(r.pressed, ["close"], JSON.stringify(r));
});
