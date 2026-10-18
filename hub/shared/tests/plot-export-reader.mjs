// Independent decoder: reconstructs byte sequences (the encoder maps prefix/byte pairs).
export function decodeLzw(bytes) {
  let bit = 0, width = 9, table, next, previous, clears = 0;
  const chunks = [];
  function read() {
    if (bit + width > bytes.length * 8) throw Error('Truncated LZW');
    let code = 0;
    for (let i = 0; i < width; i++, bit++) code = code * 2 + ((bytes[bit >> 3] >> (7 - bit % 8)) & 1);
    return code;
  }
  while (true) {
    const code = read();
    if (code === 256) {
      table = Array.from({ length: 256 }, (_, i) => Buffer.from([i]));
      next = 258; width = 9; previous = null; clears++; continue;
    }
    if (code === 257) break;
    if (!table) throw Error('Missing clear');
    const entry = table[code] || (code === next && previous ? Buffer.concat([previous, previous.subarray(0, 1)]) : null);
    if (!entry) throw Error('Invalid LZW code ' + code);
    chunks.push(entry);
    if (previous) {
      table[next++] = Buffer.concat([previous, entry.subarray(0, 1)]);
      if (next === 2 ** width - 1 && width < 12) width++;
    }
    previous = entry;
  }
  return { bytes: Buffer.concat(chunks), clears };
}

export function readTiff(bytes) {
  if (bytes.toString('ascii', 0, 2) !== 'II' || bytes.readUInt16LE(2) !== 42) throw Error('Not baseline little-endian TIFF');
  const ifd = bytes.readUInt32LE(4), tags = {};
  for (let i = 0; i < bytes.readUInt16LE(ifd); i++) {
    const p = ifd + 2 + 12 * i, id = bytes.readUInt16LE(p), type = bytes.readUInt16LE(p + 2), count = bytes.readUInt32LE(p + 4);
    const size = { 2: 1, 3: 2, 4: 4, 5: 8 }[type];
    if (!size) throw Error('Unsupported TIFF type');
    const offset = count * size <= 4 ? p + 8 : bytes.readUInt32LE(p + 8);
    tags[id] = Array.from({ length: count }, (_, j) => {
      const at = offset + size * j;
      if (type === 2) return bytes[at];
      if (type === 3) return bytes.readUInt16LE(at);
      if (type === 5) return bytes.readUInt32LE(at) / bytes.readUInt32LE(at + 4);
      return bytes.readUInt32LE(at);
    });
  }
  const decoded = decodeLzw(bytes.subarray(tags[273][0], tags[273][0] + tags[279][0]));
  if (decoded.bytes.length !== tags[256][0] * tags[257][0] * 3) throw Error('Wrong RGB byte count');
  return { tags, ...decoded };
}
