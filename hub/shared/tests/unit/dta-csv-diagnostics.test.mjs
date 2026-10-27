import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

const html = readFileSync(new URL('../../../../dta-sroc/index.html', import.meta.url), 'utf8');
const csvSource = readFileSync(new URL('../../csv-upload.js', import.meta.url), 'utf8');
const header = 'study,TP,FP,FN,TN\n';
const good = 'Control,85,10,15,140';

// Exercise the shipped adapter and validators, with only DOM/render plumbing stubbed.
function setup() {
  const data = { value: good };
  const warning = { textContent: '', classList: { add() {} } };
  let options, rendered, snapshots = 0;
  const context = {
    window: {}, warnEl: warning,
    document: { getElementById(id) { assert.equal(id, 'f-data'); return data; } },
    readState: () => ({ cov: '' }),
    render() { rendered = data.value; },
  };
  runInNewContext(csvSource, context);
  const parse = context.window.alm.csvUpload.parse;
  context.window.alm.csvUpload = value => { options = value; };
  context.window.alm.csvUpload.parse = parse;
  context.window.alm.resetUndo = { snapshot() { snapshots++; } };
  runInNewContext(html.slice(html.indexOf('    const COUNT_FIELDS'), html.indexOf('    // Per-study points')), context);
  runInNewContext(html.slice(html.indexOf('    window.alm.csvUpload({'), html.indexOf('    // Keep the axis ranges')), context);
  return {
    import(text) { options.onParse(options.parse(text, options.columns)); },
    warning, data,
    get rendered() { return rendered; },
    get snapshots() { return snapshots; },
  };
}

function assertRejected(app, row, label, field) {
  assert.match(app.warning.textContent, /CSV rejected/);
  assert.ok(app.warning.textContent.includes(`Row ${row} (${label}): ${field}`), app.warning.textContent);
  assert.equal(app.data.value, '');
  assert.equal(app.rendered, '');
  assert.equal(app.snapshots, 1);
}

for (const [index, field] of ['TP', 'FP', 'FN', 'TN'].entries()) {
  for (const [kind, token] of [['empty', ''], ['whitespace', '   ']]) {
    test(`DTA CSV ${kind} ${field} retains the middle study's identity on refusal`, () => {
      const app = setup();
      const counts = ['85', '10', '15', '140'];
      counts[index] = token;
      app.import(header + good + '\n"Bad, quoted study",' + counts.join(',') + '\n' + good);
      assertRejected(app, 2, 'Bad, quoted study', field);
    });
  }
}

test('DTA CSV truncated row retains the study and missing count field', () => {
  const app = setup();
  app.import(header + 'Truncated,85,10,15\n' + good);
  assertRejected(app, 1, 'Truncated', 'TN');
});

test('DTA CSV missing count without study header names the generated study', () => {
  const app = setup();
  app.import('TP,FP,FN,TN\n85,10,15,140\n85,,15,140');
  assertRejected(app, 2, 'Study 2', 'FP');
});

test('DTA CSV valid quoted label, numeric notation and zero counts remain accepted', () => {
  const app = setup();
  app.import(header + '"Study, Alpha",+85,1e1,15.0,1.4e2\nZero,0,10,15,140');
  assert.equal(app.warning.textContent, '');
  assert.equal(app.data.value, 'Study, Alpha, 85, 10, 15, 140\nZero, 0, 10, 15, 140');
  assert.equal(app.rendered, app.data.value);
});

test('DTA CSV complete counts without study header retain generated labels', () => {
  const app = setup();
  app.import('TP,FP,FN,TN\n85,10,15,140');
  assert.equal(app.warning.textContent, '');
  assert.equal(app.data.value, 'Study 1, 85, 10, 15, 140');
});

for (const [kind, text] of [
  ['missing header', 'study,TP,FP,FN\nBad,85,10,15'],
  ['fuzzy header', 'study,TP,FP,FN,TT\nBad,85,10,15,140'],
  ['duplicate header', 'study,TP,FP,FN,TN,TN\nBad,85,10,15,140,140'],
  ['extra field', header + 'Bad,85,10,15,140,200'],
]) {
  test(`DTA CSV still rejects ${kind} before count validation`, () => {
    const app = setup();
    app.import(text);
    assert.match(app.warning.textContent, /CSV rejected: Use unique, exact/);
    assert.equal(app.data.value, '');
    assert.equal(app.rendered, '');
  });
}
