import fs from 'node:fs';import crypto from 'node:crypto';
const path=new URL('corpus/plus-reference.json',import.meta.url),bytes=Buffer.from(fs.readFileSync(path,'utf8').replace(/\r\n/g,'\n'));
fs.writeFileSync(path,bytes);const c=JSON.parse(bytes);
const m={files:[{path:'validate/corpus/plus-reference.json',sha256:crypto.createHash('sha256').update(bytes).digest('hex'),bytes:bytes.length}],configurations:c.cases.length,candidates:c.inventory.length,versions:{R:c.R,mada:c.mada,metadat:c.metadat},tolerance:{closed_relative:1e-9,iterative_relative:1e-6,closed_p_absolute:1e-9,iterative_p_absolute:1e-6},convergence:{R_mvmeta_maxiter:1000,JS_BFGS_maxit:1000,reltol:1e-12}};
fs.writeFileSync(new URL('MANIFEST-plus.json',import.meta.url),JSON.stringify(m,null,2)+'\n');
fs.writeFileSync(new URL('plus-pins.js',import.meta.url),'globalThis.AlmDTAPlusPins=Object.freeze('+JSON.stringify(m)+');\n');
