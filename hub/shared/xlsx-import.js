/* Minimal read-only OOXML importer: raw values, no formula evaluation. */
(function (root) {
  'use strict';
  const MAX = 50 * 1024 * 1024, MAX_CELLS = 1000000;
  const scriptURL = typeof document !== 'undefined' && document.currentScript ? document.currentScript.src : '';
  let zipPromise;
  function refuse(message) { throw new Error('XLSX: ' + message); }
  function crc32(bytes) {
    let crc = -1;
    for (const b of bytes) { crc ^= b; for (let j = 0; j < 8; j++) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1)); }
    return (crc ^ -1) >>> 0;
  }
  async function fallback() {
    if (root.JSZip) return root.JSZip;
    if (!zipPromise) zipPromise = new Promise((resolve, reject) => {
      if (!scriptURL) return reject(new Error('XLSX: local JSZip fallback unavailable'));
      const script = document.createElement('script');
      script.src = new URL('../../shared/vendor/jszip-3.10.1.min.js', scriptURL).href;
      script.onload = () => root.JSZip ? resolve(root.JSZip) : reject(new Error('XLSX: JSZip unavailable'));
      script.onerror = () => reject(new Error('XLSX: cannot load local JSZip'));
      document.head.appendChild(script);
    });
    return zipPromise;
  }
  async function inflate(data, expected) {
    let stream;
    try { stream = new DecompressionStream('deflate-raw'); } catch (_) { return null; }
    const reader = new Blob([data]).stream().pipeThrough(stream).getReader();
    const chunks = []; let size = 0;
    try {
      while (true) {
        const {value, done} = await reader.read(); if (done) break;
        size += value.length;
        if (size > expected || size > MAX) { await reader.cancel(); refuse('expanded size limit exceeded'); }
        chunks.push(value);
      }
    } finally { reader.releaseLock(); }
    const out = new Uint8Array(size); let pos = 0;
    for (const chunk of chunks) { out.set(chunk, pos); pos += chunk.length; }
    return out;
  }
  async function unzip(bytes) {
    if (bytes.length > MAX) refuse('file exceeds 50 MB');
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const u16 = p => view.getUint16(p, true), u32 = p => view.getUint32(p, true);
    let end = -1;
    for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65557); i--) {
      if (u32(i) === 0x06054b50 && i + 22 + u16(i + 20) === bytes.length) { end = i; break; }
    }
    if (end < 0) refuse('invalid ZIP archive');
    const count = u16(end + 10), cdSize = u32(end + 12), cdStart = u32(end + 16);
    if (u16(end + 4) || u16(end + 6) || u16(end + 8) !== count || count === 65535 || count > 4096 || cdStart + cdSize !== end) refuse('unsupported ZIP layout');
    const decoder = new TextDecoder('utf-8', {fatal:true}), entries = [], names = new Set();
    let p = cdStart, total = 0;
    for (let i = 0; i < count; i++) {
      if (p + 46 > end || u32(p) !== 0x02014b50) refuse('invalid ZIP directory');
      const flags = u16(p + 8), method = u16(p + 10), crc = u32(p + 16), compressed = u32(p + 20), size = u32(p + 24);
      const nl = u16(p + 28), el = u16(p + 30), cl = u16(p + 32), offset = u32(p + 42);
      if (p + 46 + nl + el + cl > end) refuse('truncated ZIP directory');
      const name = decoder.decode(bytes.subarray(p + 46, p + 46 + nl));
      if (!name || /(^\/|\\|\x00|(^|\/)\.\.?($|\/))/.test(name) || names.has(name)) refuse('unsafe or duplicate ZIP path');
      names.add(name); total += size;
      if ((flags & ~0x808) || ![0,8].includes(method) || u16(p + 34) || total > MAX || compressed > MAX) refuse('unsupported or oversized ZIP entry');
      if (offset + 30 > cdStart || u32(offset) !== 0x04034b50 || u16(offset + 6) !== flags || u16(offset + 8) !== method) refuse('invalid ZIP local header');
      const localNameLength = u16(offset + 26), start = offset + 30 + localNameLength + u16(offset + 28);
      if (start + compressed > cdStart || decoder.decode(bytes.subarray(offset + 30, offset + 30 + localNameLength)) !== name) refuse('invalid ZIP entry bounds');
      entries.push({name, method, crc, size, data:bytes.subarray(start, start + compressed)});
      p += 46 + nl + el + cl;
    }
    if (p !== end) refuse('invalid ZIP directory length');
    const files = new Map(); let archive;
    for (const e of entries) {
      let data = e.method === 0 ? e.data : await inflate(e.data, e.size);
      if (data === null) {
        // Metadata and total declared expanded size are checked before fallback allocation.
        if (!archive) archive = await (await fallback()).loadAsync(bytes, {checkCRC32:false});
        const entry = archive.file(e.name); if (!entry) refuse('missing ZIP entry');
        data = await new Promise((resolve, reject) => {
          const chunks = []; let size = 0;
          const stream = entry.internalStream('uint8array');
          stream.on('data', chunk => {
            size += chunk.length;
            if (size > e.size || size > MAX) { stream.pause(); reject(new Error('XLSX: expanded size limit exceeded')); return; }
            chunks.push(chunk);
          }).on('error', reject).on('end', () => {
            const out = new Uint8Array(size); let pos = 0;
            for (const chunk of chunks) { out.set(chunk, pos); pos += chunk.length; }
            resolve(out);
          }).resume();
        });
      }
      if (data.length !== e.size || crc32(data) !== e.crc) refuse('ZIP size or CRC mismatch');
      files.set(e.name, data);
    }
    return files;
  }
  function numeric(value) {
    if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(value) || !Number.isFinite(Number(value))) refuse('invalid numeric cell');
    return String(Number(value));
  }
  const elements = (node, name) => Array.from(node.getElementsByTagNameNS('*', name));
  const children = (node, name) => Array.from(node.children).filter(n => n.localName === name);
  function richText(node) { return elements(node, 't').filter(n => !n.parentElement || n.parentElement.localName !== 'rPh').map(n => n.textContent).join(''); }
  function resolvePart(base, target) {
    if (!target || /[\\?#:%]/.test(target)) refuse('unsupported relationship target');
    const parts = target.startsWith('/') ? [] : base.split('/').slice(0, -1);
    for (const part of target.split('/')) {
      if (part === '..') { if (!parts.length) refuse('relationship escapes archive'); parts.pop(); }
      else if (part && part !== '.') parts.push(part);
    }
    return parts.join('/');
  }
  function quote(value) { return /[",\r\n]/.test(value) ? '"' + value.replace(/"/g, '""') + '"' : value; }
  /**
   * toCSV(File|Blob, {sheet?: string|number}) -> Promise<{csv,sheet,sheets,warnings}>.
   * Numeric sheet indices are zero-based. Omitted sheet selects the first sheet.
   * Refusals reject; warnings never evaluate formulas or convert date serials.
   */
  async function toCSV(file, opts) {
    opts = opts || {};
    if (!file || typeof file.arrayBuffer !== 'function') refuse('a File or Blob is required');
    if (/\.xls$/i.test(file.name || '')) refuse('.xls is not supported; save as .xlsx');
    if (file.size > MAX) refuse('file exceeds 50 MB');
    const files = await unzip(new Uint8Array(await file.arrayBuffer()));
    const docs = new Map(), decoder = new TextDecoder('utf-8', {fatal:true});
    for (const [name, bytes] of files) {
      if (!/\.(xml|rels)$/i.test(name)) continue;
      const text = decoder.decode(bytes);
      if (/<!DOCTYPE|<!ENTITY/i.test(text)) refuse('DOCTYPE and entities are not supported');
      const doc = new DOMParser().parseFromString(text, 'application/xml');
      if (elements(doc, 'parsererror').length) refuse('malformed XML: ' + name);
      docs.set(name, doc);
    }
    function xml(name, expected) {
      const doc = docs.get(name); if (!doc) refuse('missing XML part: ' + name);
      if (expected && doc.documentElement.localName !== expected) refuse('invalid XML part: ' + name);
      return doc;
    }
    function rels(name, base) {
      const map = new Map();
      for (const r of elements(xml(name, 'Relationships'), 'Relationship')) {
        const id = r.getAttribute('Id');
        if (!id || map.has(id) || r.getAttribute('TargetMode') === 'External') refuse('external or duplicate relationship');
        map.set(id, {type:r.getAttribute('Type').split('/').pop(), path:resolvePart(base, r.getAttribute('Target'))});
      }
      return map;
    }
    const offices = [...rels('_rels/.rels', '').values()].filter(r => r.type === 'officeDocument');
    if (offices.length !== 1) refuse('missing or ambiguous workbook');
    const workbookPath = offices[0].path, workbook = xml(workbookPath, 'workbook'), slash = workbookPath.lastIndexOf('/');
    const links = rels(workbookPath.slice(0, slash + 1) + '_rels/' + workbookPath.slice(slash + 1) + '.rels', workbookPath);
    const sheets = elements(workbook, 'sheet');
    if (!sheets.length) refuse('workbook has no sheets');
    const names = sheets.map(s => s.getAttribute('name'));
    if (new Set(names).size !== names.length) refuse('duplicate sheet names');
    const index = opts.sheet === undefined ? 0 : typeof opts.sheet === 'string' ? names.indexOf(opts.sheet) : opts.sheet;
    if (!Number.isInteger(index) || index < 0 || index >= sheets.length) refuse('sheet not found');
    const sheet = sheets[index], id = Array.from(sheet.attributes).find(a => a.localName === 'id'), link = id && links.get(id.value);
    if (!link || link.type !== 'worksheet') refuse('selected sheet is not a worksheet');
    const worksheet = xml(link.path, 'worksheet'), warnings = [];
    if (sheets.length > 1 && opts.sheet === undefined) warnings.push('Multiple sheets: imported first sheet "' + names[index] + '"; select a sheet explicitly to change it.');
    if (sheet.getAttribute('state') && sheet.getAttribute('state') !== 'visible') warnings.push('Selected sheet is hidden.');
    const part = type => [...links.values()].find(r => r.type === type), strings = part('sharedStrings');
    const shared = strings ? elements(xml(strings.path), 'si').map(richText) : [];
    const stylesPart = part('styles'), styles = stylesPart ? xml(stylesPart.path) : null;
    const formats = new Map(styles ? elements(styles, 'numFmt').map(n => [Number(n.getAttribute('numFmtId')), n.getAttribute('formatCode')]) : []);
    const cellXfs = styles && elements(styles, 'cellXfs')[0], xfs = cellXfs ? children(cellXfs, 'xf') : [];
    const rows = new Map(); let maxRow = 0, maxCol = 0, count = 0;
    const warning = new Set();
    for (const row of elements(worksheet, 'row')) {
      for (const cell of children(row, 'c')) {
        const match = /^([A-Z]{1,3})([1-9]\d*)$/.exec(cell.getAttribute('r'));
        if (!match) refuse('invalid cell reference');
        let col = 0; for (const c of match[1]) col = col * 26 + c.charCodeAt(0) - 64;
        const rn = Number(match[2]);
        if (col > 16384 || rn > 1048576 || ++count > MAX_CELLS || rn * Math.max(maxCol, col) > MAX_CELLS || maxRow * col > MAX_CELLS) refuse('worksheet exceeds cell limits');
        maxRow = Math.max(maxRow, rn); maxCol = Math.max(maxCol, col);
        if (!rows.has(rn)) rows.set(rn, new Map());
        if (rows.get(rn).has(col)) refuse('duplicate cell reference');
        const type = cell.getAttribute('t') || 'n', v = children(cell, 'v')[0], f = children(cell, 'f')[0];
        let value = v ? v.textContent : '';
        if (f) warning.add(v && value !== '' ? 'Formula cells use cached values; formulas are not recalculated.' : 'Formula without a cached value imported as an empty cell.');
        if (f && (!v || value === '')) value = '';
        else if (type === 'inlineStr') value = richText(cell);
        else if (type === 's') {
          if (!/^\d+$/.test(value) || Number(value) >= shared.length) refuse('invalid shared string index');
          value = shared[Number(value)];
        } else if (type === 'n') { if (value !== '') value = numeric(value); }
        else if (type === 'b') { if (!/^[01]$/.test(value)) refuse('invalid boolean cell'); }
        else if (type === 'd') warning.add('Date cells retain raw values; dates are not converted.');
        else if (type !== 'str') refuse('unsupported or error cell type: ' + type);
        if (cell.hasAttribute('s')) {
          const style = cell.getAttribute('s');
          if (!/^\d+$/.test(style) || !xfs[Number(style)]) refuse('invalid style index');
          const numFmt = Number(xfs[Number(style)].getAttribute('numFmtId'));
          const format = (formats.get(numFmt) || '').replace(/"[^"]*"|\\.|\[[^\]]*\]/g, '');
          if ([9,10].includes(numFmt) || /%/.test(format)) warning.add('Percentage formatting ignored; raw numeric values retained.');
          if ((numFmt >= 14 && numFmt <= 22) || (numFmt >= 27 && numFmt <= 36) || (numFmt >= 45 && numFmt <= 58) || /[ymdhs]/i.test(format)) warning.add('Date/time formatting ignored; raw serial values retained.');
        }
        rows.get(rn).set(col, value);
      }
    }
    if (elements(worksheet, 'mergeCell').length) warning.add('Merged cells are not expanded; only stored cells are imported.');
    const lines = []; let outputSize = 0;
    for (let rn = 1; rn <= maxRow; rn++) {
      const row = rows.get(rn), values = [];
      for (let col = 1; col <= maxCol; col++) values.push(quote(row && row.get(col) || ''));
      const line = values.join(','); outputSize += line.length + 1;
      if (outputSize > MAX) refuse('CSV exceeds output size limit');
      lines.push(line);
    }
    return {csv:lines.join('\n'), sheet:names[index], sheets:names, warnings:warnings.concat([...warning])};
  }
  root.alm = root.alm || {}; root.alm.xlsxImport = {toCSV};
  if (typeof module !== 'undefined' && module.exports) module.exports = {toCSV, unzip, numeric, crc32, resolvePart, quote};
})(typeof window !== 'undefined' ? window : globalThis);