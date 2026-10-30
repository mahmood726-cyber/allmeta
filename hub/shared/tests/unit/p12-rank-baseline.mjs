import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { capture, destination, app } from './p12-rank-corpus.mjs';
mkdirSync(destination,{recursive:true});
const output = capture();
writeFileSync(path.join(destination,'before.json'),JSON.stringify(output),{flag:'wx'});
writeFileSync(path.join(destination,'index-before.html'),readFileSync(path.join(app,'index.html')),{flag:'wx'});
console.log(`Before fix: ${output.hashes.length}/7 pinned file hashes; ${output.primary.length}/169 primary; ${output.plus.length}/169 sensitivity; ${output.loo.length}/5304 LOO rows (${output.loo.filter(r=>r.status==='refused').length} refused). Baseline saved in temporary storage.`);
