// webr-studio (lane audit8). The page runs real R (webR 0.5.5, metafor/netmeta/bayesmeta
// from the webR repo); its default examples were run in headless Chrome and the same calls in
// desktop R 4.6.0 agree (rma REML+knha: 0.2494 [0.1760, 0.3229], PI [0.1569, 0.3420] on t(9);
// netmeta P-scores A 0.9979 C 0.6403 B 0.3580 D 0.0037). Defects were in the page's own text:
//  1. bayesmeta template printed "Posterior mean (mu): 0.226" from summary["median","mu"]
//     (posterior mean is 0.2292, median 0.2263).
//  2. netmeta template headed netrank()'s P-scores "SUCRA:" (and the menu said "+ SUCRA").
//  3. Bucher template hint said "A-vs-B direct-effect combination"; it is the indirect A-vs-B.
//  4. trimfill template printed "2studies imputed (left)." (missing space).
//  5. R messages and warnings were shown as "{}": captureR returns them as condition objects
//     and the page JSON-stringified the proxy. Chrome before: "{}\n{}\nx" for
//     message("hello-msg"); warning("hello-warn"); cat("x\n").
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { loadPage } from './helpers/page-vm.mjs';

const page = () => loadPage('webr-studio/index.html', { shared: ['hub/shared/tests/unit/helpers/webr-studio-preload.js'], pick: s => /const TEMPLATES/.test(s) });
const code = (p, k) => vm.runInContext(`TEMPLATES[${JSON.stringify(k)}].code()`, p.ctx);

test('webr-studio: template labels say what the printed R value is', () => {
  const p = page();
  assert.doesNotMatch(code(p, 'bayesmeta'), /Posterior mean \(mu\):", round\(res\$summary\["median"/);
  assert.match(code(p, 'bayesmeta'), /Posterior median \(mu\):", round\(res\$summary\["median", "mu"\]/);
  assert.doesNotMatch(code(p, 'netmeta'), /SUCRA:\\n"\); print\(netrank/);
  assert.match(code(p, 'netmeta'), /P-scores/);
  assert.doesNotMatch(p.html, /NMA consistency \+ SUCRA/);
  assert.doesNotMatch(vm.runInContext('TEMPLATES.bucher.hint', p.ctx), /direct-effect combination/);
  assert.match(vm.runInContext('TEMPLATES.bucher.hint', p.ctx), /indirect A-vs-B/);
  assert.match(code(p, 'trimfill'), /" studies imputed \("/);
});

// A stand-in for webR's RList condition proxy: get(name) -> RCharacter, toArray() -> strings.
// (The real behaviour was checked in headless Chrome against webR 0.5.5: out/webr_msg_after.txt.)
const cond = (type, message) => ({ type, data: { get: async k => ({ toArray: async () => (k === 'message' ? [message] : []) }) } });

test('webr-studio: R messages and warnings are shown as their text, not "{}"', async () => {
  const p = page();
  const f = vm.runInContext('typeof captureItemText === "function" ? captureItemText : null', p.ctx);
  assert.ok(f, 'captureItemText missing');
  assert.equal(await f(cond('message', 'hello-msg\n')), 'hello-msg');
  assert.equal(await f(cond('warning', 'hello-warn')), 'Warning: hello-warn');
  assert.equal(await f({ type: 'stdout', data: 'x' }), 'x');   // control
});
