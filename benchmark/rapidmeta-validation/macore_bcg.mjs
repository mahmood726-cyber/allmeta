// RapidMeta ma-core pooling on the published BCG vaccine MA (Berkey 1995, log-RR).
import { createRequire } from 'node:module';
import { writeFileSync } from 'node:fs';
const require = createRequire(import.meta.url);
const DS = require('../../shared/canonical-datasets.js');
const CORE = require('../../shared/ma-core.js');
const bcg = DS.get('bcg');
const yi = bcg.effect_se.map(s => s.yi);
const vi = bcg.effect_se.map(s => s.vi);
writeFileSync(new URL('./bcg_data.json', import.meta.url), JSON.stringify({ yi, vi }));
const out = {};
for (const method of ['DL','REML','PM']) {
  const f = CORE.pool(yi, vi, { method, knha:false, pi:true });
  out[method] = { tau2:f.tau2, mu:f.mu, se:f.se, ciLo:f.ciLo, ciHi:f.ciHi, I2:f.I2, Q:f.Q, piLo:f.piLo, piHi:f.piHi };
}
const hk = CORE.pool(yi, vi, { method:'REML', knha:true });
out.REML_HK = { tau2:hk.tau2, mu:hk.mu, se:hk.se, ciLo:hk.ciLo, ciHi:hk.ciHi };
writeFileSync(new URL('./bcg_rapidmeta.json', import.meta.url), JSON.stringify(out,null,2));
for (const k of Object.keys(out)) {
  const o = out[k];
  console.log(`${k}: mu=${o.mu.toFixed(6)} se=${o.se.toFixed(6)} tau2=${o.tau2.toFixed(6)}` + (o.I2!=null?` I2=${o.I2.toFixed(3)}`:''));
}
