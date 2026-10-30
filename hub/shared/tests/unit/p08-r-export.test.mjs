import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { cases, exportCase } from './p08-r-export-fixture.mjs';

const reference = JSON.parse(readFileSync(new URL('./p08-r-export-reference.json', import.meta.url), 'utf8'));

test('P08-R3 control: reference records native R versions and exact input labels', () => {
  assert.match(reference.provenance.R, /^R version /);
  assert.ok(reference.provenance.metafor);
  assert.equal(reference.provenance.encoder, 'base::encodeString(quote = double quote)');
  assert.deepEqual(reference.cases.map(item => ({ id: item.id, label: item.label })),
    cases.map(item => ({ id: item.id, label: item.label })));
});

for (const item of cases) {
  test(`P08-R3 ${item.kind}: ${item.id} uses the native R string literal`, () => {
    const expected = reference.cases.find(record => record.id === item.id);
    const script = exportCase(item);
    const actual = script.slice(script.indexOf('labels <- c('), script.indexOf('\n\n# PM'));
    assert.equal(actual, `labels <- c(${expected.literal}, "Trial B", "Trial C", "Trial D")`);
    // Label serialization must not alter the numeric data or model settings.
    const withoutLabels = text => text.slice(0, text.indexOf('labels <- c('))
      + text.slice(text.indexOf('\n\n# PM'));
    assert.equal(withoutLabels(script), withoutLabels(exportCase(cases[0])));
  });
}
