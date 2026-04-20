import { readFile, writeFile } from 'node:fs/promises';
import { basename } from 'node:path';
import { minify } from 'terser';

const inputFile = 'app.js';
const outputFile = 'app.min.js';
const mapFile = 'app.min.js.map';

async function build() {
  const source = await readFile(inputFile, 'utf8');

  const result = await minify(source, {
    compress: true,
    mangle: true,
    sourceMap: {
      filename: basename(outputFile),
      url: basename(mapFile)
    }
  });

  if (!result.code) {
    throw new Error('Terser returned empty output');
  }

  await writeFile(outputFile, result.code, 'utf8');
  if (result.map) {
    await writeFile(mapFile, result.map, 'utf8');
  }

  console.log(`Built ${outputFile}${result.map ? ` and ${mapFile}` : ''}`);
}

build().catch((error) => {
  console.error('Build failed:', error.message);
  process.exit(1);
});
