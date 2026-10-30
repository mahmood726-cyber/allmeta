import './p11-r4-prepare.mjs';
import { readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';

const source = readFileSync(new URL('../../../../influence/r-script.js', import.meta.url));
const path = join(tmpdir(), 'p11-r4-review-original-r-script.js');
writeFileSync(path, source);
console.log(`Preserved supplied PR-head exporter for RED/GREEN replay: ${path}`);
console.log(`Exporter SHA256: ${createHash('sha256').update(source).digest('hex')}`);
