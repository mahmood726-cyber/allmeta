import { readFileSync } from 'node:fs';

export function referenceBytes(file) {
  const lf = readFileSync(new URL(file, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
  // The JSON input and R generator were hashed as LF. The immutable fixture
  // records the R input mirror as CRLF instead. Reconstruct its historical
  // serialization after LF normalization; never replace a recorded digest.
  // p16-dl-verify-reference.R independently reproduces this complete fixture.
  return file === 'p16-dl-input.R' ? lf.replace(/\n/g, '\r\n') : lf;
}
