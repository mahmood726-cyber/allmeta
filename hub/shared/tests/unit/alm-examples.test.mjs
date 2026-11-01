import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { validateDataset } = require('../../../../shared/alm-examples.js');

// Synthetic schema controls only: these are not published example records.
const control = () => ({
  source_package: 'schema-test', version: '1.0', dataset: 'schema-control',
  citation: 'Synthetic schema control; not research data.',
  licence: 'Synthetic test fixture.', values: [{ study: 'control', yi: 0.2, vi: 0.04 }]
});

test('example schema accepts a complete provenance control', () => {
  assert.doesNotThrow(() => validateDataset(control()));
});

test('planted defect: an example without a citation is rejected', () => {
  const data = control();
  delete data.citation;
  assert.throws(() => validateDataset(data), /citation/i);
});

test('planted defect: a whitespace-only citation is rejected', () => {
  const data = control();
  data.citation = '  ';
  assert.throws(() => validateDataset(data), /citation/i);
});

test('planted defect: empty example values are rejected', () => {
  const data = control();
  data.values = [];
  assert.throws(() => validateDataset(data), /values/i);
});

test('planted defect: a missing package version is rejected', () => {
  const data = control();
  delete data.version;
  assert.throws(() => validateDataset(data), /version/i);
});
