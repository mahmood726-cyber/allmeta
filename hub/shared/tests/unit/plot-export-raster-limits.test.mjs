import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { decodePng } from '../zip-reader.mjs';
import { readTiff } from '../plot-export-reader.mjs';

const source = readFileSync(new URL('../../plot-export.js', import.meta.url), 'utf8');
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64');

function fixture(viewBox = '0 0 276 276') {
  const canvases = [], writes = [], pages = [];
  class Element {
    constructor(name, attrs = {}) { this.localName = name; this.attrs = { ...attrs }; }
    getAttribute(name) { return this.attrs[name] ?? null; }
    setAttribute(name, value) { this.attrs[name] = String(value); }
    removeAttribute(name) { delete this.attrs[name]; }
    querySelectorAll() { return []; }
    cloneNode() { return new Element(this.localName, this.attrs); }
    insertBefore() {}
  }
  const svg = new Element('svg', { viewBox });
  const document = {
    currentScript: null,
    createElementNS: (_, name) => new Element(name),
    createElement(name) {
      assert.equal(name, 'canvas');
      let width = 300, height = 150;
      // Canvas dimensions are unsigned long IDL attributes, so assignment can
      // wrap before a guard reads the attribute back. No real allocation here.
      const canvas = {
        set width(value) { writes.push(['width', value]); width = Number(value) >>> 0; },
        get width() { return width; },
        set height(value) { writes.push(['height', value]); height = Number(value) >>> 0; },
        get height() { return height; },
        getContext: () => ({ fillRect() {}, drawImage() {},
          getImageData: () => ({ data: new Uint8Array(width * height * 4) }) }),
        toBlob: callback => callback(new Blob([png])),
        toDataURL: () => 'data:image/png;base64,' + png.toString('base64')
      };
      canvases.push(canvas); return canvas;
    }
  };
  const window = { jsPDF: class {
    constructor(options) { pages.push(options); }
    addImage() {}
    output() { return new Blob(['PDF fixture']); }
  } };
  const context = { window, document, Blob, URL, TextEncoder, Uint8Array, DataView,
    XMLSerializer: class { serializeToString(el) { return JSON.stringify(el.attrs); } },
    Image: class { set src(_) { this.onload(); } }
  };
  vm.runInNewContext(source, context);
  return { artifact: (...args) => window.alm.plotExport.artifact({ name: 'test', getSvg: () => svg }, ...args),
    canvases, writes, pages, svg };
}

test('raster guard rejects overflowing width before canvas conversion can accept a tiny image', async () => {
  for (const format of ['png', 'tiff', 'pdf']) {
    const f = fixture();
    // At one inch, requested pixels equal dpi exactly; 2^32 + 1 wraps to 1.
    await assert.rejects(f.artifact(format, 2 ** 32 + 1, 25.4), /Figure exceeds raster export size/);
    assert.deepEqual(f.writes, [], 'reject before assigning dimensions');
  }
});

test('raster guard rejects overflowing height before canvas conversion can accept a tiny image', async () => {
  const f = fixture(`0 0 1 ${25 * (2 ** 32 + 1) - 24}`);
  // Padding gives a 25-unit width and a height/width ratio of 2^32 + 1.
  await assert.rejects(f.artifact('png', 1, 25.4), /Figure exceeds raster export size/);
  assert.deepEqual(f.writes, []);
});

test('ordinary side and pixel-area limits reject before canvas allocation', async () => {
  for (const dpi of [32768, 8001]) {
    const f = fixture();
    await assert.rejects(f.artifact('png', dpi, 25.4), /Figure exceeds raster export size/);
    assert.deepEqual(f.writes, []);
  }
});

test('valid PNG, TIFF and PDF preserve requested pixel dimensions and physical settings', async () => {
  for (const format of ['png', 'tiff', 'pdf']) {
    const f = fixture();
    const blob = await f.artifact(format, 300, 25.4);
    assert.deepEqual(f.writes, [['width', 300], ['height', 300]]);
    assert.equal(f.svg.getAttribute('viewBox'), '0 0 276 276', 'source remains untouched');
    if (format === 'png') {
      // The fixture supplies fixed encoded pixels; the real metadata writer
      // must still embed the requested dpi, independently of canvas sizing.
      assert.deepEqual(decodePng(new Uint8Array(await blob.arrayBuffer())).phys,
        { x: 11811, y: 11811, unit: 1 });
    } else if (format === 'tiff') {
      const tiff = readTiff(Buffer.from(await blob.arrayBuffer()));
      assert.deepEqual(tiff.tags[256], [300]); assert.deepEqual(tiff.tags[257], [300]);
      assert.deepEqual(tiff.tags[282], [300]);
    } else {
      assert.deepEqual(Array.from(f.pages[0].format), [25.4, 25.4]);
    }
  }
});

test('SVG remains independent of raster limits and makes no canvas', async () => {
  const f = fixture();
  const blob = await f.artifact('svg', 2 ** 32 + 1, 25.4);
  assert.match(await blob.text(), /25\.4mm/);
  assert.equal(f.canvases.length, 0);
});
