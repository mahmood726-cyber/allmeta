// Execute the walkthrough's actual export/axe blocks with controlled browser responses.
// This tests its failure gates, not browser downloads or accessibility themselves.
const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const { test } = require('node:test');
const source = fs.readFileSync(require('node:path').join(__dirname, 'correlation-ma-walkthrough.spec.mjs'), 'utf8');
const exportBlock = source.slice(source.indexOf('  // 7. Export:'), source.indexOf('  // Figure 2:'));
const axeBlock = source.slice(source.indexOf('  const axe = {};'), source.indexOf('  const result ='));
const fit = 'fit <- rma(yi, vi, data = dat, method = "PM", test = "knha"';
function expect(value) {
  return {
    toBe: x => assert.equal(value, x),
    toEqual: x => assert.deepEqual(JSON.parse(JSON.stringify(value)), JSON.parse(JSON.stringify(x))),
    toContain: x => assert.ok(value.includes(x)),
    toHaveCount: async x => assert.equal(await value.count(), x),
  };
}
async function run(mutation = '') {
  const result = { k: 16, method: 'PM', r: 0.2, studies: [{ label: 'row-1' }] };
  const window = { __dl: [], __blobs: [], _almLastCorrMA: () => result };
  const ctx = vm.createContext({
    window, expect, log: [], clicks: mutation === 'click count' ? 4 : 5,
    step: async () => {}, TAGS: [], console: { log() {} },
    page: {
      locator: selector => ({
        count: async () => mutation === 'missing JSON button' && selector.includes('data-action=json') ? 0 : 1,
        click: async () => {
          const json = selector.includes('data-action=json');
          if (json && mutation === 'missing JSON button') throw Error('JSON button missing');
          if (json && mutation === 'missing JSON download') return;
          window.__dl.push(json ? 'correlation-ma-results.json' : 'correlation-ma-PM-knha.R');
          window.__blobs.push(new Blob([json ? JSON.stringify(mutation === 'wrong JSON' ? {} : result) : mutation === 'wrong R' ? 'method = "REML"' : fit],
            { type: json ? 'application/json' : 'text/plain' }));
        },
      }),
      evaluate: async fn => vm.runInContext(`(${fn.toString()})()`, ctx),
      emulateMedia: async ({ colorScheme }) => { ctx.scheme = colorScheme; },
    },
    AxeBuilder: class {
      withTags() { return this; }
      async analyze() {
        return { violations: mutation === `axe ${ctx.scheme}` ? [{ id: 'image-alt', impact: 'critical', nodes: [{ target: ['#outside-plus img'] }] }] : [], passes: [] };
      }
    },
  });
  vm.runInContext('const click = async (loc, why) => { await loc.click(); clicks++; log.push({ click: clicks, why }); };', ctx);
  await vm.runInContext(`(async () => { ${exportBlock}\n${axeBlock} })()`, ctx);
}
test('valid exports and clean full-page axe pass', () => run());
for (const mutation of ['missing JSON button', 'missing JSON download', 'wrong JSON', 'wrong R', 'click count', 'axe light', 'axe dark']) {
  test(`walkthrough rejects ${mutation}`, async () => {
    await assert.rejects(() => run(mutation));
  });
}
