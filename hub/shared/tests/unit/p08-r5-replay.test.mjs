import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdirSync, mkdtempSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

const root = new URL('../../../../', import.meta.url);
const suite = 'hub/shared/tests/unit/p08-r5-bubble-accessibility.test.mjs';
const htmlPath = 'meta-regression/index.html';
const lf = text => text.replace(/\r\n/g, '\n');
const html = lf(readFileSync(new URL(htmlPath, root), 'utf8'));

// Reconstruct only the missing-metadata defect described in CXTASK's review.
// This is a planted defect, not a claim to possess an unavailable historical tree.
// Fail closed if the reviewed hunk changes; never edit the application or assertions.
function removeMetadata(source) {
  const name = '      const plotName = escapeXml((state.title ? state.title + ". " : "") + "Bubble plot: " +\n' +
    '        (state.effectlabel || "Effect") + " versus " + (state.modlabel || "Moderator") +\n' +
    '        (fitted && fitted.fit ? ", with fitted regression line and 95% confidence band." : "."));\n';
  const attrs = String.raw` role=\"img\" aria-label=\""+plotName+"\"`;
  const title = '      p.push("<title>"+plotName+"</title>");\n';
  for (const addition of [name, attrs, title]) {
    assert.equal(source.split(addition).length, 2, 'reviewed addition must occur exactly once');
    source = source.replace(addition, '');
  }
  assert.ok(!source.includes('plotName'), 'all and only metadata additions must be removed');
  return source;
}

for (const ending of ['LF', 'CRLF']) {
  for (const planted of [false, true]) {
    test(`P08-R5 replay: ${ending} ${planted ? 'missing metadata fails all four plants and preserves both controls' : 'current app passes unchanged assertions'}`, t => {
      const scratch = mkdtempSync(join(tmpdir(), 'p08-r5-replay-'));
      for (const path of [suite, htmlPath, 'hub/shared/plot-export.js', 'shared/truthcert-export.js']) {
        let content = lf(readFileSync(new URL(path, root), 'utf8'));
        if (path === htmlPath && planted) content = removeMetadata(content);
        const target = join(scratch, path);
        mkdirSync(dirname(target), { recursive: true });
        writeFileSync(target, ending === 'CRLF' ? content.replace(/\n/g, '\r\n') : content);
      }
      // A node:test parent marks inherited children as test workers. A fresh
      // environment lets this independent runner execute instead of suppressing
      // it as recursive. These children need no inherited configuration.
      const run = spawnSync(process.execPath, ['--test', '--test-reporter=tap', join(scratch, suite)],
        { env: { TEMP: scratch, TMP: scratch, TMPDIR: scratch },
          encoding: 'utf8', timeout: 30_000, windowsHide: true });
      assert.ifError(run.error);
      const output = run.stdout + run.stderr;
      writeFileSync(join(scratch, 'result.tap'), output);
      const statuses = output.split(/\r?\n/).filter(line => /^(?:not )?ok \d+ - P08-R5 /.test(line));
      for (const line of statuses) t.diagnostic(line);
      t.diagnostic('LF application SHA256: ' + createHash('sha256')
        .update(planted ? removeMetadata(html) : html).digest('hex'));
      t.diagnostic('Full child TAP: ' + join(scratch, 'result.tap'));
      assert.equal(statuses.length, 6, output);
      assert.equal(run.status, planted ? 1 : 0, output);
      assert.equal(statuses.filter(line => /^not ok \d+ - P08-R5 plant:/.test(line)).length, planted ? 4 : 0, output);
      assert.equal(statuses.filter(line => /^ok \d+ - P08-R5 control:/.test(line)).length, 2, output);
      assert.match(output, /# skipped 0\b/);
      assert.match(output, /# cancelled 0\b/);
      if (planted) assert.equal((output.match(/main bubble SVG must expose an image role/g) || []).length, 4, output);
      assert.match(output, /Example geometry\/statistics SHA256: 433aec5186a3f31341562c0e43f50f184c6e2baeafd22fc0ad453dc8182389af/);
    });
  }
}
