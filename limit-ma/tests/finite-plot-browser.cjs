const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const http = require('node:http');
const {chromium} = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
// Serve the selected snapshot with the checkout's actual shared assets.
const root = path.resolve(__dirname, '../..');
const target = path.resolve(process.argv[2] || path.join(__dirname, '../index.html'));
const server = http.createServer((req, res) => {
  const file = req.url === '/limit-ma/index.html' ? target : path.join(root, decodeURIComponent(req.url.split('?')[0]));
  if (!file.startsWith(root + path.sep) && file !== target) { res.writeHead(403).end(); return; }
  fs.readFile(file, (err, data) => { if (err) res.writeHead(404).end(); else res.end(data); });
});
(async () => {
  await new Promise(resolve => server.listen(8000, '127.0.0.1', resolve));
  const browser = await chromium.launch({channel: 'chrome'});
  try {
    const page = await browser.newPage();
    await page.goto('http://127.0.0.1:8000/limit-ma/index.html');
    const example = await page.locator('#src').inputValue();
    const snapshot = () => page.evaluate(() => ({result: window._almLastLimit(),
      table: document.querySelector('#body').innerHTML, diagnostics: document.querySelector('#limit-diagnostics').textContent,
      controlError: document.querySelector('#alm-axis-mount [data-error]').textContent,
      note: document.querySelector('#limit-range-note')?.textContent || '',
      plot: document.querySelector('#plot').innerHTML, error: document.querySelector('#limit-error').textContent}));
    const failures = [];
    let count = 0;
    for (const [name, input] of [['zero', '0,0.1\n0,0.2\n0,0.3'], ['example', example]]) {
      await page.locator('#src').fill(input);
      await page.locator('#btn-run').click();
      const before = await snapshot();
      assert.ok(before.result && before.plot.includes('<circle'));
      const cases = [
        {ymax:'1e-40', omitted:name === 'zero' ? 3 : null},
        {ymax:'0.15', omitted:name === 'zero' ? 2 : null},
        {xmin:'0.09999999999999999', omitted:name === 'zero' ? 3 : null},
        {ymax:'1e200'}, {xmax:'1e300'}, {ymin:'1e-300'}
      ];
      let seed = 0x600d;
      const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 2**32; };
      for (let i=0;i<250;i++) {
        const c = {};
        for (const key of ['xmin','xmax','ymin','ymax']) {
          if (random()<0.3) continue;
          c[key] = String((random()<0.5?-1:1)*10**(-300+600*random()));
        }
        cases.push(c);
      }
      for (const bounds of cases) {
        await page.evaluate(bounds => {
          for (const axis of ['x','y']) for (const edge of ['min','max']) {
            const control = document.querySelector(`[data-axis="${axis}"][data-edge="${edge}"]`);
            control.value = bounds[axis+edge] || '';
            control.dispatchEvent(new Event('change', {bubbles:true}));
          }
        }, bounds);
        const state = await snapshot();
        try {
          assert.ok(!/NaN|Infinity/.test(state.plot), 'nonfinite SVG');
          const rows=input.split('\n').map(line=>line.trim().split(/[,\s]+/).slice(0,2).map(Number)).filter(r=>r.length===2 && r.every(Number.isFinite) && r[1]>0);
          const xmin=bounds.xmin == null ? Math.min(before.result.limit_est,...rows.map(r=>r[0]))-.1 : Number(bounds.xmin);
          const xmax=bounds.xmax == null ? Math.max(before.result.limit_est,...rows.map(r=>r[0]))+.1 : Number(bounds.xmax);
          const ymin=bounds.ymin == null ? 0 : Number(bounds.ymin);
          const ymax=bounds.ymax == null ? Math.max(...rows.map(r=>r[1]))*1.1 : Number(bounds.ymax);
          const valid=xmin<xmax && ymin<ymax;
          if(valid) assert.equal(state.error, '', 'valid bounds must never trigger installation guard');
          else if(state.controlError) {
            assert.match(state.controlError, /min must be < max/);
            assert.ok(await page.locator('#alm-axis-mount [data-error]').isVisible());
          } else assert.equal(state.plot, '', 'invalid effective bounds must fail closed');
          const expected=rows.filter(r=>r[0]>=xmin&&r[0]<=xmax&&r[1]>=ymin&&r[1]<=ymax).length;
          assert.deepEqual(state.result, before.result, 'export preserved');
          assert.equal(state.table, before.table); assert.equal(state.diagnostics, before.diagnostics);
          if (!state.plot) {
            assert.match(state.error, /plot.*error/i);
            assert.ok(await page.locator('#limit-error[role="alert"]').isVisible());
            assert.equal(state.plot, '');
          }
          const geometry = await page.evaluate(() => {
            const xy = [];
            for (const n of document.querySelectorAll('#plot circle')) xy.push([n.cx.baseVal.value,n.cy.baseVal.value]);
            for (const n of document.querySelectorAll('#plot polyline')) for (let i=0;i<n.points.numberOfItems;i++) {
              const p=n.points.getItem(i); xy.push([p.x,p.y]);
            }
            for (const n of document.querySelectorAll('#plot line')) xy.push([n.x1.baseVal.value,n.y1.baseVal.value],[n.x2.baseVal.value,n.y2.baseVal.value]);
            for (const n of document.querySelectorAll('#plot text')) xy.push([n.x.baseVal.getItem(0).value,n.y.baseVal.getItem(0).value]);
            return {xy, count:document.querySelectorAll('#plot circle').length,
              note:document.querySelector('#limit-range-note')?.textContent || '',
              clip:!!document.querySelector('#plot clipPath rect')};
          });
          assert.ok(geometry.xy.every(([x,y]) => Number.isFinite(x)&&Number.isFinite(y)&&x>=60-1e-4&&x<=580+1e-4&&y>=20-1e-4&&y<=300+1e-4), 'native SVG coordinate outside plot');
          if(valid) {
            assert.equal(geometry.count, expected, 'omit exactly the out-of-range studies');
            if(expected<rows.length) {
              assert.match(geometry.note, new RegExp(`^${rows.length-expected} stud`));
              assert.ok(await page.locator('#limit-range-note').isVisible());
            } else assert.equal(geometry.note, '');
          }
          if (bounds.omitted != null) {
            assert.equal(state.error, '', 'valid zoom must draw without an error');
            assert.equal(geometry.count, 3-bounds.omitted);
            assert.match(geometry.note, new RegExp(`^${bounds.omitted} stud`));
            assert.ok(await page.locator('#limit-range-note').isVisible());
          }
          if(state.plot) assert.ok(geometry.clip, 'clipPath backstop');
        } catch (error) { failures.push(`${name} ${JSON.stringify(bounds)}: ${error.message}`); }
        await page.evaluate(() => {
          for (const control of document.querySelectorAll('[data-edge="min"], [data-edge="max"]')) {
            control.value=''; control.dispatchEvent(new Event('change',{bubbles:true}));
          }
        });
        assert.deepEqual(await snapshot(), before, 'clearing restores finite plot');
        count++;
      }
    }
    assert.deepEqual(failures, []);
    console.log(`PASS: ${count} finite-bound cases; export/table/diagnostics preserved and recovery verified`);
  } finally { await browser.close(); }
})().catch(error => {console.error(error); process.exitCode=1;}).finally(() => server.close());
