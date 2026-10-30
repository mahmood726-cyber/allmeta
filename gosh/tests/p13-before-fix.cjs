// Reconstruct only this job's two source edits in memory, never on disk.
// These LF SHA-256 values were measured on the supplied PR head before editing.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
function beforeFix() {
  let plusSource = fs.readFileSync(path.join(__dirname, '../plus.js'), 'utf8').replace(/\r\n/g, '\n');
  let adapterSource = fs.readFileSync(path.join(__dirname, '../validate/adapter-plus.js'), 'utf8').replace(/\r\n/g, '\n');
  plusSource = plusSource.replace('Need 3 through 100 valid effect rows', 'Need 3 through 100 valid studies')
    .replace(',studies:a.summary.studies.map(s=>({...s}))', '');
  adapterSource = adapterSource.replace('    // Preserve the canonical study order used by subset membership indices.\n', '')
    .replace('    const studies=a.studies;', "    const lines=document.getElementById('src').value.trim().split(/\\n/).map(l=>l.split(','));")
    .replace('te:studies.map(s=>s.te),se:studies.map(s=>s.se)', 'te:lines.map(l=>Number(l[0])),se:lines.map(l=>Number(l[1]))');
  for (const [name, source, sha256] of [
    ['plus.js', plusSource, '95a5176df75e0cc947bd307f0838a3efa3734511335bc1b841af7a36badd0156'],
    ['adapter-plus.js', adapterSource, '9040d2e11bb319b8cdb07b6cb5cdd9706f24885b5273a033d4a31d2b101b7fa7']
  ]) assert.equal(crypto.createHash('sha256').update(source).digest('hex'), sha256, name + ' exact pre-fix LF source');
  return {plusSource, adapterSource};
}
module.exports = beforeFix;
