import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import vm from 'node:vm';

export const root = new URL('../../../../', import.meta.url);
export const lf = text => text.replace(/\r\n/g, '\n');
export const sha256 = text => createHash('sha256').update(lf(text)).digest('hex');
export const html = lf(readFileSync(new URL('meta-regression/index.html', root), 'utf8'));
export const archiveText = readFileSync(new URL('meta-regression/validate/plus/baseline-dom.json', root), 'utf8');
export const archive = JSON.parse(archiveText);

// Extract the real page functions, without browser setup or a copied renderer.
const start = html.indexOf('    function parseStudies(');
const end = html.indexOf('    function statCard(', start);
assert.ok(start > 0 && end > start, 'page function boundaries must exist');
const z = html.match(/var Z975 = [^;]+;/);
assert.ok(z, 'use the page\'s own normal quantile');
export const source = z[0] + '\n' + html.slice(start, end);

function replaceOnce(text, pattern, replacement) {
  assert.equal([...text.matchAll(new RegExp(pattern.source, 'g'))].length, 1,
    'a planted defect must replace exactly one loop');
  return text.replace(pattern, replacement);
}

// These are explicit reconstructions of the two old progress mechanisms described
// in CXTASK.md. No base tree or original patch was supplied in this job. They are
// mutation evidence, not a claim to reproduce the unavailable old file bytes.
export function plantDefects(text, { ticks = false, curve = false } = {}) {
  if (ticks) text = replaceOnce(text,
    /      \/\/ Count candidates:[\s\S]*?\n      }\n      return t;/,
    '      for (let v=start; v<=hi+1e-9; v+=step) t.push(v);\n      return t;');
  if (curve) text = replaceOnce(text,
    /        \/\/ Integer progress[\s\S]*?\n          const xv = [^;]+;/,
    '        const dx = (xHi-xLo)/200;\n        for (let xv=xLo; xv<=xHi+dx/2; xv+=dx) {');
  return text;
}

// Count loop entries, not elapsed wall time: a busy runner can spend the old
// 500 ms watchdog allowance merely scheduling a VM containing declarations.
// The same guards instrument the page and every mutant. They throw rather than
// break/return, so a stalled loop cannot become a successful partial render.
function iterationBudget(loop, limit) {
  let iterations = 0;
  return () => {
    if (++iterations > limit) {
      const error = new Error(`${loop} exceeded ${limit} loop entries`);
      Object.assign(error, { code: 'ERR_P08_ITERATION_BOUND', loop, limit, iterations });
      throw error;
    }
    return true;
  };
}

function instrumentLoops(text) {
  for (const [begin, end, loop, limit] of [
    ['    function niceTicks(', '    function buildSvg(', 'ticks', '2*Math.max(1,n)+1'],
    ['        const linePts = ', '          const yHat = ', 'curve', '201']
  ]) {
    const start = text.indexOf(begin), stop = text.indexOf(end, start + begin.length);
    assert.ok(start >= 0 && stop > start, `${loop}: instrumentation boundaries exist`);
    // There is exactly one for-loop in each selected region. Preserve its
    // initializer, condition and update, including the defective float update.
    const section = replaceOnce(text.slice(start, stop), /for \(([^;]*);([^;]*);([^)]*)\)/,
      (_, init, condition, update) =>
        `const __p08Step = __p08Budget('${loop}', ${limit});\n` +
        `for (${init}; (${condition}) && __p08Step();${update})`);
    text = text.slice(0, start) + section + text.slice(stop);
  }
  return text;
}

export function loadPage(defects = {}, { instrument = true } = {}) {
  const context = vm.createContext({ window: {}, __p08Budget: iterationBudget });
  const page = plantDefects(source, defects);
  vm.runInContext(instrument ? instrumentLoops(page) : page, context);
  return (expression, bindings = {}) => {
    Object.assign(context, bindings);
    return vm.runInContext(expression, context);
  };
}

export function points(svg, tag) {
  const match = svg.match(new RegExp('<' + tag + '\\b[^>]*\\bpoints="([^"]+)"'));
  assert.ok(match, `${tag} must be present`);
  const result = match[1].trim().split(/\s+/).map(p => p.split(',').map(Number));
  assert.ok(result.every(p => p.length === 2 && p.every(Number.isFinite)), `${tag}: finite coordinates`);
  return result;
}

export function narrowRows(offset) {
  return [0.1, 0.5, -0.3, 0.4, -0.2, 0.6].map((est, i) =>
    ({ label: `Study ${i + 1}`, est, se: 0.2, v: 0.04, x: offset + i / 1024 }));
}

export function render(run, rows, fitted = true, state = {}) {
  return run('buildSvg(state, rows, fitted ? fitPM(rows) : null)', { rows, fitted, state });
}

// The preserved DOM scenarios retain the example title/axis labels even when
// their study rows change. Title presence sets the renderer's top margin.
export function archivePlotState(record) {
  const text = pattern => {
    const match = record.svg.match(pattern);
    assert.ok(match, 'the archived plot label must exist');
    const entities = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
    return match[1].replace(/&(amp|lt|gt|quot|apos);/g, (_, key) => entities[key]);
  };
  return {
    title: text(/<text\b[^>]*\by="28"[^>]*>([^<]*)<\/text>/),
    modlabel: text(/<text\b[^>]*\by="476"[^>]*>([^<]*)<\/text>/),
    effectlabel: text(/<text\b[^>]*\btransform="[^"]*rotate\(-90\)"[^>]*>([^<]*)<\/text>/)
  };
}

export function checkCurve(svg, rowCount) {
  assert.doesNotMatch(svg, /NaN|Infinity/);
  const line = points(svg, 'polyline'), band = points(svg, 'polygon');
  assert.equal(line.length, 201, '200 intervals include both endpoints');
  assert.equal(band.length, 402, 'both confidence limits include all samples');
  // Both old and new ordinary renders reach the frame within floating-point
  // rounding; exact equality here would confuse rounding with nontermination.
  const coordinateTolerance = 1e-9;
  assert.ok(Math.abs(line[0][0] - 70) <= coordinateTolerance, 'left plot boundary');
  assert.ok(Math.abs(line.at(-1)[0] - 690) <= coordinateTolerance, 'right plot boundary');
  assert.equal((svg.match(/<circle\b/g) || []).length, rowCount);
  for (let i = 0; i < line.length; i++) {
    const [x, y] = line[i];
    assert.ok(x >= 70 - coordinateTolerance && x <= 690 + coordinateTolerance);
    if (i) assert.ok(x >= line[i - 1][0], 'samples never move backwards');
    assert.equal(band[i][0], x);
    assert.equal(band.at(-1 - i)[0], x);
    assert.ok(band[i][1] <= y && band.at(-1 - i)[1] >= y, 'CI surrounds the fitted mean');
  }
}

export const cases = [];
for (const sign of [1, -1]) {
  cases.push({
    name: `P08 ticks plant: ${sign > 0 ? 'positive' : 'negative'} large offset terminates`, defect: 'ticks',
    check(run) {
      const lo = sign * 1e16, hi = lo + 2;
      // With n=6 the old step is 0.5, smaller than one ULP here.
      assert.equal(lo + 0.5, lo, 'input actually exercises lost floating-point progress');
      const ticks = Array.from(run('niceTicks(lo, hi, 6)', { lo, hi }));
      assert.ok(ticks.length > 0 && ticks.length <= 13, 'bounded, nonempty ticks');
      assert.ok(ticks.every((v, i) => Number.isFinite(v) && v >= lo && v <= hi && (!i || v > ticks[i - 1])));
    }
  });
  cases.push({
    name: `P08 curve plant: ${sign > 0 ? 'positive' : 'negative'} narrow offset renders`, defect: 'curve',
    check(run) {
      const rows = narrowRows(sign * 2 ** 40);
      const min = rows[0].x, max = rows.at(-1).x, pad = (max - min) * 0.08;
      const lo = min - pad, hi = max + pad;
      assert.equal(lo + (hi - lo) / 200, lo, 'old interpolation increment cannot advance');
      // Isolate the curve defect: ticks on this same domain must terminate first.
      assert.ok(run('niceTicks(lo, hi, 6).length', { lo, hi }) > 0);
      const before = structuredClone(rows);
      checkCurve(render(run, rows), rows.length);
      assert.deepEqual(rows, before, 'rendering preserves the caller\'s rows');
    }
  });
}
cases.push({
  name: 'P08 ticks control: ordinary and degenerate domains',
  check(run) {
    for (const [lo, hi, expected] of [[0, 10, [0, 2, 4, 6, 8, 10]], [-1, 1, [-1, -0.5, 0, 0.5, 1]], [3, 3, [3]], [3, 2, [3]]]) {
      const actual = Array.from(run('niceTicks(lo, hi, 6)', { lo, hi }));
      assert.equal(actual.length, expected.length);
      // +0 and -0 denote the same tick; signed zero is not liveness evidence.
      actual.forEach((value, i) => assert.ok(value === expected[i]));
    }
  }
}, {
  name: 'P08 curve control: ordinary data renders finite line and confidence band',
  check(run) { for (const record of archive.result) checkCurve(render(run, record.studies), record.studies.length); }
}, {
  name: 'P08 plot control: absent fit still renders study bubbles',
  check(run) {
    const rows = archive.result[0].studies, svg = render(run, rows, false);
    assert.doesNotMatch(svg, /NaN|Infinity|<polyline\b|<polygon\b/);
    assert.equal((svg.match(/<circle\b/g) || []).length, rows.length);
  }
}, {
  name: 'P08 archive control: fitted results and HKSJ match preserved records exactly',
  check(run) {
    for (const record of archive.result) {
      const actual = run(`(() => {
        const fitted = fitPM(rows), f = fitted.fit;
        return { fit: fitted, hk: hksj(rows.length, 2, f.rss, f.swxx, f.sw, f.det) };
      })()`, { rows: record.studies });
      assert.deepEqual(JSON.parse(JSON.stringify(actual)), { fit: record.fit, hk: record.hk });
    }
  }
}, {
  name: 'P08 provenance control: LF and CRLF preserve the pinned archive hash; tampering fails',
  check() {
    // Captured from the supplied, unedited archive before adding this suite.
    // This is not the unavailable hash claimed in the previous review report.
    const expected = '7a75ed572b533103f8142309ba1ff0ce98967fdd4a8d6787eb3cfcfd6db83c1a';
    assert.equal(sha256(archiveText), expected);
    assert.equal(sha256(lf(archiveText).replace(/\n/g, '\r\n')), expected);
    assert.notEqual(sha256(archiveText.replace('"tau2": 0', '"tau2": 1')), expected);
  }
});

export function mutationEvidence() {
  const outcomes = [];
  for (const [variant, defects] of [['current', {}], ['old-ticks', { ticks: true }],
    ['old-curve', { curve: true }], ['old-both', { ticks: true, curve: true }]]) {
    const results = [];
    for (const item of cases) {
      let failure;
      try { item.check(loadPage(defects)); } catch (error) { failure = error; }
      const shouldExceedBound = !!defects[item.defect];
      if (shouldExceedBound) {
        const label = `${variant}: ${item.name}`;
        assert.equal(failure?.code, 'ERR_P08_ITERATION_BOUND', label);
        assert.equal(failure.loop, item.defect, label + ': only the affected loop fails');
        assert.equal(failure.limit, item.defect === 'ticks' ? 13 : 201, label);
        assert.equal(failure.iterations, failure.limit + 1, label);
      }
      else if (failure) throw failure;
      results.push({ name: item.name, result: failure ? 'FAIL' : 'PASS',
        ...(failure ? { code: failure.code, loop: failure.loop,
          limit: failure.limit, iterations: failure.iterations } : {}) });
    }
    outcomes.push({ variant, results });
  }
  return outcomes;
}
