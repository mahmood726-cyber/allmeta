// Builds the SEPARATE within-subgroup cumulative corpus from the existing pinned corpus (read-only).
// Usage (from cumulative-subgroup/): node subcum/validate/build/build_corpus.mjs
// Input : validate/corpus/corpus.json (sha256 dac5806f..., never modified)
// Output: subcum/validate/corpus/corpus.json
//
// One configuration per existing subgroup configuration ("::rows": no year, so each subgroup is
// accrued in row order), plus one "::year=<col>" variant for every subgroup configuration whose
// effect (same dataset::effect prefix, identical te and se arrays) also has a cumulative year
// configuration: the year column is then parsed exactly as the page parses it (parseFloat), so each
// subgroup is accrued by year when every study in that subgroup has one (stable: ties keep row order),
// otherwise in row order. Group strings are produced with JavaScript String() so R receives exactly
// the strings the page will see. Labels are row numbers, as in the existing replay.
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

const SRC = 'validate/corpus/corpus.json';
const SRC_SHA = 'dac5806f456eb35518124d44b74e721f21c353abdb21287db533bc8f36616ea2';
const buf = readFileSync(SRC);
const sha = createHash('sha256').update(buf).digest('hex');
if (sha !== SRC_SHA) throw Error('Source corpus SHA-256 mismatch: ' + sha);
const corpus = JSON.parse(buf.toString('utf8'));

const prefix = (key, view) => key.split('::' + view + '::')[0];
const cum = corpus.filter(c => c.view === 'cumulative' && c.values);
const same = (a, b) => a.length === b.length && a.every((x, i) => Object.is(x, b[i]));
const out = [];
for (const s of corpus) {
  if (s.view !== 'subgroup') continue;
  const group = s.values.map(v => v == null || v === '' ? null : String(v));
  const base = { k: s.k, label: s.te.map((_, j) => String(j + 1)), te: s.te, se: s.se, group };
  out.push({ key: s.key + '::rows', source: [s.key, null], ...base, year: s.te.map(() => null) });
  for (const c of cum) {
    if (prefix(c.key, 'cumulative') !== prefix(s.key, 'subgroup') || !same(c.te, s.te) || !same(c.se, s.se)) continue;
    const year = c.values.map(v => { const y = parseFloat(String(v ?? '')); return Number.isFinite(y) ? y : null; });
    out.push({ key: s.key + '::year=' + c.column, source: [s.key, c.key], ...base, year });
  }
}
const keys = new Set(out.map(c => c.key));
if (keys.size !== out.length) throw Error('Duplicate keys');
const text = '[' + out.map(c => JSON.stringify(c)).join(',\n') + ']\n';
writeFileSync('subcum/validate/corpus/corpus.json', text, 'utf8');
const steps = out.reduce((a, c) => a + c.k, 0);
console.log(JSON.stringify({ configurations: out.length, rows_variants: out.filter(c => c.source[1] === null).length,
  year_variants: out.filter(c => c.source[1] !== null).length, studies: steps,
  sha256: createHash('sha256').update(text).digest('hex'), bytes: Buffer.byteLength(text) }));
