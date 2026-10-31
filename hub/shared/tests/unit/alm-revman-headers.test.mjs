import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const R = createRequire(import.meta.url)('../../../../shared/alm-revman.js').reader;

for (const [schema, columns, values, alias] of [
  ['binary2x2', ['Events','Total','Events','Total'], [0,40,4,42], 'Experimental Events'],
  ['continuous', ['Mean','SD','Total','Mean','SD','Total'], [5.25,1.2,40,4.5,1.4,42], 'Control SD']
]) test(schema + ': repeated copy headers reject PLANTED conflicting explicit arm column; valid controls retain values', () => {
  for (const delimiter of [',', '\t']) {
    const table = (head, row) => [head.join(delimiter),row.join(delimiter)].join('\n');
    const header = ['Study or Subgroup', ...columns];
    const row = ['Synthetic', ...values];
    const read = text => R.select(R.parseText(text), {comparison:0,outcome:0,subgroup:0}, schema);
    const valid = read(table([...header, 'Weight'], [...row, '25%']));
    assert.deepEqual(R.fields[schema].map(f => valid[0][f]), values);
    const explicit = R.exportCSV(valid, schema).csv;
    assert.deepEqual(R.fields[schema].map(f => read(explicit)[0][f]), values);
    assert.throws(() => read(table([...header, alias], [...row, 9])), /ambiguous|duplicate/i);
  }
});
