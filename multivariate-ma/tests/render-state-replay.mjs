// Reuse every assertion in the shipped regression test, including its controls.
// Mutants reproduce the reported mechanisms; they are NOT historical snapshots.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

export const root = new URL('../../', import.meta.url);
const regression = new URL('hub/shared/tests/unit/p18-render-state.test.mjs', root);
const lf = value => value.replace(/\r\n/g, '\n');
const read = url => lf(readFileSync(url, 'utf8'));

function replaceOnce(source, before, after) {
  assert.equal(source.split(before).length, 2, 'mutation must match exactly once');
  return source.replace(before, after);
}

export function runAssertions({ sourceRoot = root, defects = [] } = {}) {
  const sources = new Map();
  for (const file of ['multivariate-ma/index.html', 'multivariate-ma/plus-ui.js']) {
    sources.set(file, read(new URL(file, sourceRoot)));
  }
  const mutate = (file, before, after) => sources.set(file, replaceOnce(sources.get(file), before, after));
  for (const defect of defects) {
    if (defect === 'joint precision') {
      mutate('multivariate-ma/index.html',
        'label: d > 100 ? (x === 0 ? "0" : x.toExponential(2)) : x.toFixed(d)',
        'label: x.toFixed(d)');
    } else if (defect === 'sweep precision') {
      mutate('multivariate-ma/plus-ui.js',
        "label: d > 100 ? (x === 0 ? '0' : x.toExponential(2)) : x.toFixed(d)",
        'label: x.toFixed(d)');
    } else if (defect === 'stale render state') {
      mutate('multivariate-ma/index.html',
        '        // A failed render must also replace the panel\'s separate report/export state.\n' +
        '        clearOutputs();\n' +
        '        var reason = "Unable to render analysis: " + error.message;\n' +
        '        head.textContent = reason;\n' +
        '        done({ status: "refused", reason: reason, k: parsed.rows.length }); return;',
        '        head.textContent = error.message; return;');
    } else {
      throw new Error(`Unknown defect: ${defect}`);
    }
  }

  // Only adapt the four ESM imports and import.meta.url for this VM loader.
  // The DOM double, input setup, test names and assertion bodies stay unchanged.
  let source = read(regression);
  for (const line of [
    "import test from 'node:test';",
    "import assert from 'node:assert/strict';",
    "import { readFileSync } from 'node:fs';",
    "import vm from 'node:vm';"
  ]) source = replaceOnce(source, line, '');
  source = replaceOnce(source, 'import.meta.url', JSON.stringify(regression.href));
  const results = [];
  vm.runInNewContext(source, {
    URL, vm, assert, setTimeout, clearTimeout,
    readFileSync(url, encoding) {
      assert.equal(encoding, 'utf8');
      const file = url.href.slice(root.href.length);
      assert.ok(url.href.startsWith(root.href), 'test reads stay inside the source tree');
      return sources.has(file) ? sources.get(file) : read(new URL(file, sourceRoot));
    },
    test(name, body) {
      let cause;
      try {
        // A regression can also throw before its next explicit assertion (for
        // example, reading result.k after the page correctly clears a refusal).
        // Assert completion at the runner boundary, retaining the native cause.
        // Source loading and mutation validation remain outside this boundary.
        assert.doesNotThrow(() => {
          try {
            assert.equal(body(), undefined, 'replayed assertions must remain synchronous');
          } catch (error) {
            cause = { name: error.name, code: error.code, message: error.message, stack: error.stack };
            throw error;
          }
        }, 'the unchanged regression body must complete without throwing');
        results.push({ name, passed: true });
      } catch (error) {
        results.push({ name, passed: false, code: error.code, message: error.message, cause });
      }
    }
  }, { filename: regression.pathname });
  assert.equal(results.length, 6, 'all three plants and all three controls must execute');
  assert.equal(new Set(results.map(result => result.name)).size, 6);
  return results;
}
