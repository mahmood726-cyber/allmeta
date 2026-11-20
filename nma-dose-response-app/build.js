import { readFile, writeFile } from 'node:fs/promises';
import { basename } from 'node:path';
import { createHash } from 'node:crypto';
import { minify } from 'terser';

const inputFile = 'app.js';
const outputFile = 'app.min.js';
const mapFile = 'app.min.js.map';

async function build() {
  // Normalise line endings so the build (and its stamp) do not depend on core.autocrlf.
  const source = (await readFile(inputFile, 'utf8')).replace(/\r\n/g, '\n');
  // The stamp names the app.js this file was built from; tests/test_nma_dose_prod_build.py
  // fails when app.js changes without a rebuild (app.min.js once shipped a pre-#538 engine).
  const sha256 = createHash('sha256').update(source, 'utf8').digest('hex');

  const result = await minify(source, {
    compress: true,
    mangle: true,
    format: { preamble: `/*! nma-dose-response-app build: app.js sha256=${sha256} */` },
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

  await buildPages(result.code);
}

// index.prod.html and nma-studio-standalone.html are GENERATED from index.html so they cannot
// drift from it (they once carried an April-2026 page and a pre-#538 engine without the
// ../shared/upper-tail.js and ../shared/ma-core.js tags that app.js needs).
//   index.prod.html            = index.html with app.js -> app.min.js, nothing else changed.
//   nma-studio-standalone.html = index.prod.html with the engine (upper-tail.js, ma-core.js,
//                                app.min.js) inlined; other assets keep their relative paths,
//                                and app.wasm must still sit beside it.
const APP_TAG = '<script src="app.js" defer></script>';
const MIN_TAG = '<script src="app.min.js" defer></script>';

function replaceOnce(html, from, to) {
  const n = html.split(from).length - 1;
  if (n !== 1) throw new Error(`expected exactly one ${from} in index.html, found ${n}`);
  return html.replace(from, () => to);
}

function inlineScript(js, name) {
  if (/<\/script/i.test(js) || js.includes('<!--')) {
    throw new Error(`${name} contains </script or <!-- and cannot be inlined verbatim`);
  }
  return `<script>\n${js}\n</script>`;
}

async function buildPages(minCode) {
  const index = (await readFile('index.html', 'utf8')).replace(/\r\n/g, '\n');
  const prod = replaceOnce(index, APP_TAG, MIN_TAG);
  await writeFile('index.prod.html', prod, 'utf8');

  let standalone = prod;
  for (const rel of ['../shared/upper-tail.js', '../shared/ma-core.js']) {
    const js = (await readFile(rel, 'utf8')).replace(/\r\n/g, '\n');
    standalone = replaceOnce(standalone, `<script src="${rel}"></script>`, inlineScript(js, rel));
  }
  // A deferred script runs after the whole document is parsed; an inline script does not
  // defer, so the inlined app goes last in <body> to keep the execution order of index.html.
  standalone = replaceOnce(standalone, `  ${MIN_TAG}\n`, '');
  standalone = replaceOnce(standalone, '</body>', `${inlineScript(minCode, 'app.min.js')}\n</body>`);
  await writeFile('nma-studio-standalone.html', standalone, 'utf8');
  console.log('Built index.prod.html and nma-studio-standalone.html from index.html');
}

build().catch((error) => {
  console.error('Build failed:', error.message);
  process.exit(1);
});
