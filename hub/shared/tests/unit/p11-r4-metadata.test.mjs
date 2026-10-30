import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { build, cases, stateFor } from './p11-r4-cases.mjs';
import { definitions, runR } from './p11-r4-review-support.mjs';

const fixture = new URL('./p11-r4-metadata-reference.json', import.meta.url);
const reference = () => JSON.parse(readFileSync(fixture, 'utf8'));
const near = (a, b, label) => assert.ok(Number.isFinite(a) && Number.isFinite(b) && Math.abs(a-b)/Math.max(1, Math.abs(b)) <= 1e-6, `${label}: ${a} versus ${b}`);

test('P11-R4 metadata control: native estimated-model reference records inputs and versions', () => {
  const ref = reference();
  for (const key of ['R', 'metafor', 'script', 'serialization']) assert.ok(ref.provenance[key]);
  assert.deepEqual(ref.cases.map(c => c.id), ['ordinary', 'three-study', 'ties', 'zero']);
  for (const c of ref.cases) {
    const input = cases.find(v => v.id === c.id);
    assert.deepEqual(c.yi, input.yi);
    assert.deepEqual(c.vi, input.vi.map(v => Math.sqrt(v)**2));
  }
});

for (const c of cases) {
  test(`P11-R4 metadata plant: ${c.id} counts estimated tau2 in full and subset models`, () => {
    const script = definitions(build(stateFor(c))) + `
check <- function(y, v, slab) {
  selected <- fit(y, v, slab)
  fixed <- rma.uni(y, v, slab=slab, method="REML", test="z", tau2=selected$tau2)
  # Control: metadata repair must leave the selected mode and likelihood alone.
  stopifnot(identical(selected$tau2, fixed$tau2),
            identical(as.numeric(logLik(selected)), as.numeric(logLik(fixed))),
            identical(selected$fit.stats[c("ll", "dev"), ], fixed$fit.stats[c("ll", "dev"), ]),
            identical(selected$se.tau2, fixed$se.tau2),
            isTRUE(fixed$tau2.fix), fixed$parms == 1L)
  cat("CONTROL mode, likelihood and tau2 SE unchanged; caller-fixed model counts one parameter\\n")
  stopifnot(isFALSE(selected$tau2.fix), selected$parms == 2L,
            attr(logLik(selected), "df") == 2L)
}
check(dat$yi, dat$vi, dat$study)
for (i in seq_along(dat$yi)) check(dat$yi[-i], dat$vi[-i], dat$study[-i])
`;
    const run = runR(script);
    assert.match(run.output, /CONTROL mode, likelihood and tau2 SE unchanged/);
    assert.equal(run.status, 0, run.output);
  });
}

for (const id of ['ordinary', 'three-study', 'ties', 'zero']) {
  test(`P11-R4 criteria plant: ${id} full and excluded model criteria match native estimated fits`, () => {
    const c = cases.find(c => c.id === id);
    const ex = c.excluded.length ? `c(${c.excluded.map(i => i+1).join(',')})` : 'integer(0)';
    const run = runR(definitions(build(stateFor(c))) + `
emit <- function(label, y, v, slab) {
  res <- fit(y, v, slab)
  cat("SNAPSHOT", label, paste(sprintf("%.17g", c(res$tau2, as.numeric(logLik(res)),
      AIC(res), BIC(res), as.matrix(res$fit.stats))), collapse=" "), "\\n")
}
emit("full", dat$yi, dat$vi, dat$study)
excluded <- ${ex}
if (length(excluded)) emit("excluded", dat$yi[-excluded], dat$vi[-excluded], dat$study[-excluded])
`);
    assert.equal(run.status, 0, run.output);
    const ref = reference().cases.find(c => c.id === id);
    const snapshots = run.output.split(/\r?\n/).filter(line => line.startsWith('SNAPSHOT '));
    assert.equal(snapshots.length, c.excluded.length ? 2 : 1, run.output);
    for (const line of snapshots) {
      const [, label, ...values] = line.trim().split(/\s+/);
      const r = ref[label], actual = values.map(Number);
      const expected = [r.tau2, r.logLik, r.AIC, r.BIC, ...r.fit_stats];
      assert.equal(actual.length, expected.length);
      actual.forEach((v, i) => near(v, expected[i], `${id} ${label} field ${i}`));
    }
  });
}
