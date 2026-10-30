// Replay the unchanged regression tests against the exact pre-fix page in TEMP.
// Only the four URL-wiring edits are reversed; SHA-256 verifies the original bytes.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { spawnSync } from 'node:child_process';

const root = new URL('../../../', import.meta.url);
const page = 'effect-size-converter/index.html';
const suite = 'hub/shared/tests/unit/p20-r8-share-url.test.mjs';
let html = readFileSync(new URL(page, root), 'utf8').replace(/\r\n/g, '\n');
function replaceOnce(from, to) {
  assert.equal(html.split(from).length, 2, 'expected one exact URL-wiring hunk');
  html = html.replace(from, () => to);
}
replaceOnce(`      // Commit the share URL for every successful conversion, including Derive and restore.
      // The first render precedes the snapshot adapter; startup commits after it is ready.
      if (window.alm && window.alm.urlState && window.__almSnapshot) {
        window.alm.urlState.write(window.__almSnapshot());
      }
`, '');
replaceOnce(`        runConvert();
        setWarn('Imported metafor-compatible`, `        runConvert();
        if (window.alm && window.alm.urlState)
          window.alm.urlState.write(window.__almSnapshot());
        setWarn('Imported metafor-compatible`);
replaceOnce(`      // Commit the initial conversion once the snapshot adapter is available.
      runConvert();`, `      // Write initial state so page link is shareable immediately.
      if (window.__almSnapshot) {
        window.alm.urlState.write(window.__almSnapshot());
      }`);
replaceOnce(`      glossaryUrl: '../hub/shared/glossary.json',
    });

  })();`, `      glossaryUrl: '../hub/shared/glossary.json',
    });

    // Update URL state after every conversion so the link stays shareable.
    var _origRunConvert = (typeof runConvert === 'function') ? runConvert : null;
    // Intercept the Convert button to snapshot + write URL after each run.
    var btnConvert = document.getElementById('btn-convert');
    if (btnConvert) {
      btnConvert.addEventListener('click', function () {
        if (window.alm && window.alm.urlState && window.__almSnapshot) {
          window.alm.urlState.write(window.__almSnapshot());
        }
      });
    }
  })();`);
const baseline = html.replace(/\n/g, '\r\n');
const digest = createHash('sha256').update(baseline).digest('hex');
assert.equal(digest, 'fbe63e6dc4aca8da11ec7fedfd76f30518096bbfff1dd34bc53494dce760194c',
  'reconstructed page must match the pre-fix file captured before editing');

const temp = mkdtempSync(join(tmpdir(), 'p20-r8-baseline-'));
for (const file of [page, suite, 'shared/effect-size-accuracy.js', 'hub/shared/url-state.js']) {
  const target = join(temp, file);
  mkdirSync(dirname(target), { recursive: true });
  if (file === page) writeFileSync(target, baseline);
  else copyFileSync(new URL(file, root), target);
}
const result = spawnSync(process.execPath, ['--test', '--test-reporter=tap', suite], {
  cwd: temp, encoding: 'utf8', timeout: 30000,
});
const output = (result.stdout || '') + (result.stderr || '');
writeFileSync(join(temp, 'baseline.tap'), output);
console.log('Baseline SHA-256:', digest, 'Node:', process.version);
console.log(output.split(/\r?\n/).filter(line => /^(?:not ok |ok |# (?:tests |pass |fail |cancelled |skipped |todo ))/.test(line)).join('\n'));
assert.ifError(result.error);
assert.equal(result.status, 1, 'baseline suite must fail');
const cases = [...output.matchAll(/^(not ok|ok) \d+ - (.+)$/gm)];
assert.equal(cases.length, 17, 'all original regression and control tests must run');
assert.equal(cases.filter(([, status]) => status === 'not ok').length, 11);
for (const [, status, name] of cases) {
  assert.equal(status, name.startsWith('plant P20-R8:') ? 'not ok' : 'ok', name);
}
console.log('Verified: all 11 planted-defect tests FAIL on the exact old page; all 6 controls PASS.');
