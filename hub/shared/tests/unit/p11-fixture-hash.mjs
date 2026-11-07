import { createHash } from 'node:crypto';

export function fixtureMD5(bytes) {
  // Native-R provenance records LF bytes; normalize only CRLF checkout conversion.
  return createHash('md5').update(bytes.toString('utf8').replace(/\r\n/g, '\n')).digest('hex');
}
