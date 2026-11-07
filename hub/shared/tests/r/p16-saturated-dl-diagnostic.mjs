// Read-only output for P16-R1. The failing parity assertions remain in the suite.
import { readFileSync } from 'node:fs';
import { load } from '../unit/p16-nma-inconsistency-harness.mjs';

const input = JSON.parse(readFileSync(new URL('../fixtures/p16-nma-inconsistency-input.json', import.meta.url), 'utf8'));
const oracle = JSON.parse(readFileSync(new URL('../fixtures/p16-nma-inconsistency-reference.json', import.meta.url), 'utf8'));
const h = load();
for (const id of ['tree_k3', 'tree_replicated', 'tau_zero', 'triangle_k3']) {
  const rows = input.networks.find(c => c.id === id).rows;
  const actual = h.run(rows, 'DL'), expected = oracle.cases[id].fits.DL;
  const summarize = fit => ({ tau2: fit.tau2, Q: fit.Q, Qrandom: fit.Qrandom,
    df: fit.df, estimates: fit.estimates, estimatesRandom: fit.estimatesRandom,
    nodeSplitCount: fit.nodeSplit.length, dbt: fit.dbt });
  console.log(JSON.stringify({ id, app: summarize(actual), R: summarize(expected) }, null, 2));
}
