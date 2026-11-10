import assert from 'node:assert/strict';

// Reconstruct the documented stopping rules, not an authenticated checkout.
export function engineVariant(source, variant) {
  const fixed = 'const meanY=sum(y)/k,threshold=1e-12*Math.max(k/sum(v.map(vi=>1/vi)),sum(y.map(v=>(v-meanY)**2))/(k-1));';
  assert.equal(source.split(fixed).length, 2, 'recognize repaired stopping rule');
  if (variant === 'fixed') return source;
  if (variant === 'pass-3') return source.replace(fixed, 'const threshold=1e-12*Math.min(...v);');
  const floor = variant === 'pr-head' ? 'sum(v)/k' : '1';
  let result = source.replace(fixed,
    `const meanY=sum(y)/k,threshold=1e-12*Math.max(${floor},sum(y.map(v=>(v-meanY)**2))/(k-1));`);
  if (variant === 'original') {
    const guard = "if(likelihoodGain < -likelihoodRoundoff)throw Error('Full-model likelihood is lower than reduced-model likelihood; ML optimization did not converge.');";
    assert.equal(result.split(guard).length, 2, 'recognize likelihood-order guard');
    result = result.replace(guard, '');
  } else assert.equal(variant, 'pr-head');
  return result;
}
