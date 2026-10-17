import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { decodeLzw, readTiff } from './plot-export-reader.mjs';

const fixture = '/hub/shared/tests/plot-export-fixture.html';
const python = process.env.PYTHON || 'python';
const hasPillow = spawnSync(python, ['-c', 'import PIL']).status === 0;
const helper = fileURLToPath(new URL('./plot-export-pillow.py', import.meta.url));
async function download(page, button = 'Download forest') {
  const [file] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: button, exact: true }).click()]);
  return { file, bytes: readFileSync(await file.path()) };
}

test.beforeEach(async ({ page }) => { await page.goto(fixture); });

for (const mm of [85, 170]) for (const dpi of [300, 600]) {
  test(`TIFF ${mm} mm ${dpi} dpi independently decodes`, async ({ page }) => {
    await page.getByLabel('Format', { exact: true }).selectOption('tiff');
    await page.getByLabel('Resolution', { exact: true }).selectOption(String(dpi));
    await page.getByLabel('Physical width', { exact: true }).selectOption(String(mm));
    const { file, bytes } = await download(page);
    const { tags, bytes: rgb } = readTiff(bytes);
    const width = Math.round(mm / 25.4 * dpi), height = Math.round(width * 74 / 124);
    expect(tags[256]).toEqual([width]); expect(tags[257]).toEqual([height]);
    expect(tags[258]).toEqual([8, 8, 8]); expect(tags[259]).toEqual([5]);
    expect(tags[262]).toEqual([2]); expect(tags[277]).toEqual([3]);
    expect(tags[278]).toEqual([height]); expect(tags[282]).toEqual([dpi]); expect(tags[283]).toEqual([dpi]);
    expect(tags[284]).toEqual([1]); expect(tags[296]).toEqual([2]); expect(tags[317]).toEqual([1]);
    expect(Buffer.from(tags[305]).toString()).toBe('allmeta\0');
    expect([...rgb.subarray(0, 3)]).toEqual([255, 255, 255]);
    // A point well inside the rectangle proves the plot is present, not just a white canvas.
    const offset = (Math.floor(height * 0.5) * width + Math.floor(width * 0.75)) * 3;
    expect([...rgb.subarray(offset, offset + 3)]).toEqual([20, 83, 45]);
    if (hasPillow) {
      const result = spawnSync(python, [helper, await file.path(), String(width), String(height), String(dpi)], { encoding: 'utf8' });
      expect(result.status, result.stdout + result.stderr).toBe(0);
    }
  });
}

test('LZW random, adversarial, width boundaries and repeated Clear resets', async ({ page }) => {
  const inputs = [[], [1], Array(30000).fill(0), Array.from({ length: 60000 }, (_, i) => i % 256), Array.from({ length: 20000 }, (_, i) => i % 2)];
  let seed = 0x12345678;
  const random = Array.from({ length: 80000 }, () => { seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5; return seed & 255; });
  // Every prefix around the first width transition exercises final-code/EOI alignment.
  for (let n = 245; n <= 265; n++) inputs.push(random.slice(0, n));
  inputs.push(random);
  for (const input of inputs) {
    const packed = await page.evaluate(data => Array.from(window.alm.plotExport._lzw(new Uint8Array(data))), input);
    const result = decodeLzw(Buffer.from(packed));
    expect(result.bytes.equals(Buffer.from(input))).toBe(true);
    if (input === random) expect(result.clears).toBeGreaterThan(2);
  }
});

for (const dpi of [300, 600]) test(`PNG ${dpi} dpi pHYs precedes IDAT with valid CRC`, async ({ page }) => {
  await page.getByLabel('Resolution', { exact: true }).selectOption(String(dpi));
  await page.getByLabel('Physical width', { exact: true }).selectOption('85');
  const { bytes } = await download(page);
  expect([...bytes.subarray(0, 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
  const width = Math.round(85 / 25.4 * dpi);
  expect(bytes.readUInt32BE(16)).toBe(width); expect(bytes.readUInt32BE(20)).toBe(Math.round(width * 74 / 124));
  let density = 0, seenData = false;
  const table = Array.from({ length: 256 }, (_, i) => {
    let c = i; for (let j = 0; j < 8; j++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0;
  });
  for (let p = 8; p < bytes.length;) {
    const size = bytes.readUInt32BE(p), type = bytes.toString('ascii', p + 4, p + 8);
    if (type === 'IDAT') seenData = true;
    if (type === 'pHYs') {
      density++; expect(seenData).toBe(false); expect(size).toBe(9);
      expect(bytes.readUInt32BE(p + 8)).toBe(Math.round(dpi / 0.0254));
      expect(bytes.readUInt32BE(p + 12)).toBe(Math.round(dpi / 0.0254)); expect(bytes[p + 16]).toBe(1);
      let crc = 0xffffffff;
      for (const byte of bytes.subarray(p + 4, p + 8 + size)) crc = table[(crc ^ byte) & 255] ^ (crc >>> 8);
      expect(bytes.readUInt32BE(p + 8 + size)).toBe((crc ^ 0xffffffff) >>> 0);
    }
    p += size + 12;
  }
  expect(density).toBe(1);
});

test('selection, exact filenames/counts, keyboard, defaults and live status', async ({ page }) => {
  const group = page.getByRole('group', { name: 'Download plots' });
  await expect(group).toHaveAttribute('aria-describedby', /alm-plot-help-/);
  await expect(page.getByLabel('Format', { exact: true })).toHaveValue('png');
  await expect(page.getByLabel('Resolution', { exact: true })).toHaveValue('300');
  await expect(page.getByLabel('Physical width', { exact: true })).toHaveValue('170');
  await page.getByLabel('Format', { exact: true }).selectOption('svg');
  await expect(page.getByLabel('Resolution', { exact: true })).toBeDisabled();
  const names = []; page.on('download', file => names.push(file.suggestedFilename()));
  await page.getByRole('button', { name: 'Select none', exact: true }).click();
  await page.getByRole('button', { name: 'Download selected', exact: true }).click();
  await expect(page.getByRole('status')).toHaveText('Select at least one plot.');
  expect(names).toEqual([]);
  await page.getByRole('checkbox', { name: 'forest', exact: true }).focus();
  await page.keyboard.press('Space');
  const selected = page.getByRole('button', { name: 'Download selected', exact: true });
  await selected.focus(); await page.keyboard.press('Enter');
  await expect(page.getByRole('status')).toHaveText('Downloaded 1 file(s)');
  expect(names.splice(0)).toEqual(['example-forest.svg']);
  await page.getByRole('checkbox', { name: 'funnel', exact: true }).check();
  await selected.click(); await expect(page.getByRole('status')).toHaveText('Downloaded 2 file(s)');
  expect(names.splice(0)).toEqual(['example-forest.svg', 'example-funnel.svg']);
  await page.getByRole('button', { name: 'Select all', exact: true }).click();
  await selected.click(); await expect(page.getByRole('status')).toHaveText('Downloaded 3 file(s)');
  expect(names.splice(0)).toEqual(['example-forest.svg', 'example-funnel.svg', 'example-sensitivity.svg']);
  await page.getByRole('button', { name: 'Select none', exact: true }).click();
  await download(page, 'Download sensitivity');
  await expect(page.getByRole('status')).toHaveText('Downloaded 1 file(s)');
  expect(names).toEqual(['example-sensitivity.svg']);
});

test('SVG padding, styles, white background, physical width and TruthCert fail-open', async ({ page }) => {
  await page.getByLabel('Format', { exact: true }).selectOption('svg');
  const { bytes } = await download(page);
  const svg = bytes.toString();
  expect(svg).toContain('viewBox="-12 -12 124 74"'); expect(svg).toContain('xmlns="http://www.w3.org/2000/svg"');
  expect(svg).toContain('fill="#fff"'); expect(svg).toContain('font-family:Helvetica'); expect(svg).toContain('width="170mm"');
  await page.evaluate(() => {
    window.AlmTruthCertExport = { buildReceipt: async () => ({ proof: 'fixture' }), stampSVG: text => text.replace('</svg>', '<metadata>fixture receipt</metadata></svg>') };
    window.mountPlots(() => ({ label: 'test' }));
  });
  await page.getByLabel('Format', { exact: true }).selectOption('svg');
  expect((await download(page)).bytes.toString()).toContain('fixture receipt');
  for (const failure of ['missing', 'callback', 'signer']) {
    await page.evaluate(kind => {
      if (kind === 'missing') delete window.AlmTruthCertExport;
      else window.AlmTruthCertExport = { buildReceipt: () => { throw Error('fixture failure'); } };
      window.mountPlots(() => { if (kind === 'callback') throw Error('callback failure'); return {}; });
    }, failure);
    await page.getByLabel('Format', { exact: true }).selectOption('svg');
    expect((await download(page)).bytes.toString()).toContain('</svg>');
  }
});

test('PDF lazily loads vendored jsPDF under CSP and legacy PDF also works', async ({ page }) => {
  expect(await page.evaluate(() => !!window.jspdf)).toBe(false);
  await page.getByLabel('Format', { exact: true }).selectOption('pdf');
  const { bytes } = await download(page); expect(bytes.toString('ascii', 0, 5)).toBe('%PDF-');
  await page.reload(); expect(await page.evaluate(() => !!window.jspdf)).toBe(false);
  const [file] = await Promise.all([page.waitForEvent('download'), page.locator('#legacy [data-fmt="pdf"]').click()]);
  expect(readFileSync(await file.path()).toString('ascii', 0, 5)).toBe('%PDF-');
});

test('failed export reports zero downloads and re-enables controls', async ({ page }) => {
  await page.evaluate(() => document.querySelector('#chart').remove());
  await page.getByRole('button', { name: 'Download forest', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Downloaded 0 file(s). Export failed:');
  await expect(page.getByRole('button', { name: 'Download selected', exact: true })).toBeEnabled();
});