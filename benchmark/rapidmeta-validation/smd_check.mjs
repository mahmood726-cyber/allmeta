// SMD contrast parity: ma-comparisons toContrasts (exact Hedges g) vs metafor escalc.
import { createRequire } from 'node:module';
import { writeFileSync } from 'node:fs';
const require = createRequire(import.meta.url);
const MC = require('../../shared/ma-comparisons-v1.js');
// 4 continuous 2-arm studies (mean/sd/n)
const studies = [
  { id:'C1', arms:[{treatment:'T',mean:12.4,sd:3.1,n:50},{treatment:'P',mean:14.9,sd:3.4,n:48}] },
  { id:'C2', arms:[{treatment:'T',mean:9.8,sd:2.2,n:30},{treatment:'P',mean:11.0,sd:2.5,n:33}] },
  { id:'C3', arms:[{treatment:'T',mean:21.1,sd:5.0,n:70},{treatment:'P',mean:23.7,sd:5.4,n:65}] },
  { id:'C4', arms:[{treatment:'T',mean:6.2,sd:1.4,n:25},{treatment:'P',mean:6.9,sd:1.6,n:27}] },
];
writeFileSync(new URL('./smd_data.json', import.meta.url), JSON.stringify(studies));
const env = MC.buildEnvelope(studies, 'SMD');
const rows = MC.toContrasts(env);
for (const r of rows) console.log(`${r.study}: g(T vs P)=${r.te.toFixed(6)} se=${r.se.toFixed(6)}`);
