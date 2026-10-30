import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync(new URL('../../../../shared/alm-sof.js', import.meta.url), 'utf8');
function placement(code, featureLocation) {
  let actual;
  const stop = new Error('placement captured');
  const main = { appendChild: () => { actual = 'inside-main'; } };
  const features = featureLocation && {
    closest: selector => selector === 'main' && featureLocation === 'main' ? main : null,
    insertAdjacentElement: (where, host) => {
      assert.equal(where, 'afterend'); assert.equal(host.id, 'alm-sof');
      actual = featureLocation === 'main' ? 'inside-main' : 'beside-features';
    },
  };
  const document = {
    head: { appendChild() {} },
    body: { appendChild: () => { actual = 'body-end'; } },
    getElementById: id => id === 'alm-features' ? features : null,
    querySelector: selector => selector === 'main' ? main : null,
    createElement: () => ({ setAttribute() {}, querySelector() { throw stop; } }),
  };
  const ctx = { document, module: { exports: {} } };
  vm.runInNewContext(code, ctx);
  // Stop after insertion: this unit test covers the actual mount destination;
  // the browser spec covers rendering, geometry and the full-precision witness.
  assert.throws(() => ctx.module.exports.mount('mh-peto'), error => error === stop);
  return actual;
}

test('SoF uses the external feature panel, with a body-end fallback on older hosts', () => {
  const gate = code => {
    assert.equal(placement(code, 'body'), 'beside-features');
    assert.equal(placement(code, null), 'body-end');
    assert.equal(placement(code, 'main'), 'body-end');
  };
  gate(source);
  const planted = source.replace(
    /var features = d\.getElementById\('alm-features'\);\s*if \(features && !features\.closest\('main'\)\) features\.insertAdjacentElement\('afterend', host\);\s*else d\.body\.appendChild\(host\);/,
    "(d.querySelector('main') || d.body).appendChild(host);",
  );
  assert.notEqual(planted, source, 'placement mutation must be applied');
  assert.throws(() => gate(planted), 'old placement inside main must fail the same gate');
});

test('geometry baseline waits for fonts and nested host animations, not just visibility', async () => {
  const spec = readFileSync(new URL('../features-sof.spec.mjs', import.meta.url), 'utf8');
  const helper = spec.match(/async function waitForHostLayout\(page\) \{[\s\S]*?\n\}/);
  assert.ok(helper, 'geometry capture needs an explicit host-layout readiness helper');
  const gate = async code => {
    let finishFonts, finishMain, finishPanel, measured = false, queried = false;
    const fonts = new Promise(resolve => { finishFonts = resolve; });
    const main = new Promise(resolve => { finishMain = resolve; });
    const panel = new Promise(resolve => { finishPanel = resolve; });
    const animation = finished => ({ finished, effect: { getComputedTiming: () => ({ endTime: 360 }) } });
    const document = {
      fonts: { ready: fonts },
      getAnimations() {
        queried = true;
        return [animation(main), animation(panel)];
      },
    };
    const ctx = { document };
    vm.runInNewContext(code + '\nthis.waitForHostLayout = waitForHostLayout;', ctx);
    const ready = ctx.waitForHostLayout({ evaluate: fn => fn() }).then(() => { measured = true; });
    const flush = async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); };
    try {
      await flush();
      assert.equal(measured, false, 'fonts are still loading');
      finishFonts(); await flush();
      assert.equal(queried, true, 'collect animations after fonts settle');
      assert.equal(measured, false, 'main and nested panel are still moving');
      finishMain(); await flush();
      assert.equal(measured, false, 'the delayed nested panel still changes the plot position');
      finishPanel(); await ready;
      assert.equal(measured, true);
    } finally {
      finishFonts(); finishMain(); finishPanel(); await ready;
    }
  };
  await gate(helper[0]);
  // Reproduce the previous readiness path: fonts ready does not mean the
  // appFadeIn transforms on main and its panels have finished.
  await assert.rejects(() => gate('async function waitForHostLayout(page) { await page.evaluate(() => document.fonts.ready); }'));
  const mainOnly = helper[0].replace('.map(animation => animation.finished)', '.slice(0, 1).map(animation => animation.finished)');
  assert.notEqual(mainOnly, helper[0], 'nested-animation mutation must be applied');
  await assert.rejects(() => gate(mainOnly), 'waiting for main alone misses the delayed panel');
});
