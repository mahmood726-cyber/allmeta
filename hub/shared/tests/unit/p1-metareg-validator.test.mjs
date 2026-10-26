import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const root = new URL('../../../../', import.meta.url);
const html = readFileSync(new URL('meta-regression/index.html', root), 'utf8');

function element(tag, id) {
  const match = html.match(new RegExp(`<${tag}\\b([^>]*\\bid="${id}"[^>]*)>([\\s\\S]*?)<\\/${tag}>`));
  assert.ok(match, `${id} is present`);
  return { attributes: match[1], text: match[2].replace(/<[^>]*>/g, '') };
}

for (const id of ['btn-verify-in-r', 'btn-validate-webr']) {
  test(`plant P0-19: ${id} discloses pooled-only scope in its visible name and tooltip`, () => {
    const button = element('button', id);
    assert.match(button.text, /pooled-only/i);
    assert.match(button.attributes, /title="[^"]*intercept-only[^"]*"/i);
    assert.match(button.attributes, /aria-describedby="[^"]*\br-validation-scope\b[^"]*"/);
  });
}

test('plant P0-19: a visible disclosure identifies the unvalidated regression outputs and correct export', () => {
  const note = element('p', 'r-validation-scope');
  assert.doesNotMatch(note.attributes, /\bhidden\b|display\s*:\s*none/i);
  assert.match(note.text, /intercept-only/i);
  assert.match(note.text, /without the moderator/i);
  assert.match(note.text, /do not validate/i);
  for (const output of ['coefficients', 'CIs', 'residual τ²', 'Q_E', 'R²']) {
    assert.ok(note.text.includes(output), `disclose that ${output} is not validated`);
  }
  assert.match(note.text, /Export R script/);
});

test('control: both pooled-check routes and the regression export remain connected', () => {
  assert.match(html, /MaStudies\.attachVerifyInRButton\(\{ btn: "#btn-verify-in-r" \}\)/);
  assert.match(html, /getElementById\("btn-validate-webr"\)\.addEventListener\("click", function \(\) \{\s*onBusSave\(\);\s*window\.open\("\.\.\/webr-validator\/index\.html\?fromBus=1", "_blank"\)/);
  assert.match(html, /getElementById\("btn-rscript"\)\.addEventListener\("click", onExportR\)/);
  assert.equal(element('button', 'btn-rscript').text, 'Export R script');
});

test('control: the generated regression script retains the actual moderator and floored Knapp-Hartung model', () => {
  // Existing software fixture, not clinical study data or a new numerical reference.
  const csv = readFileSync(new URL('meta-regression/tests/fixtures/mr-tiny.csv', root), 'utf8');
  const studies = csv.trim().split(/\r?\n/).slice(1).map(line => {
    const [label, yi, vi, x] = line.split(',');
    return { label, est: Number(yi), se: Math.sqrt(Number(vi)), x: Number(x) };
  });
  const start = html.indexOf('    function rScript(studies, state)');
  const end = html.indexOf('    function loadSaved()', start);
  assert.ok(start >= 0 && end > start, 'production R export is present');
  const context = vm.createContext({});
  vm.runInContext(html.slice(start, end), context);
  const script = context.rScript(studies, {});
  assert.ok(script.includes('yi <- c(' + studies.map(s => s.est).join(', ') + ')'));
  assert.ok(script.includes('se <- c(' + studies.map(s => s.se).join(', ') + ')'));
  assert.ok(script.includes('x  <- c(' + studies.map(s => s.x).join(', ') + ')'));
  assert.match(script, /rma\(yi = yi, sei = se, mods = ~ x, method = "PM", test = "adhoc"/);
  assert.match(script, /control = list\(tol = 1e-12\)/);
});
