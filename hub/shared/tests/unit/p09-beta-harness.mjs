import { readFileSync } from 'node:fs';
import vm from 'node:vm';

export const root = new URL('../../../../', import.meta.url);
export const read = path => readFileSync(new URL(path, root), 'utf8');
export const html = read('proportion-ma/index.html');
export const kernelSource = html.slice(html.indexOf('    function logBeta('), html.indexOf('    // --- transforms ---'));
if (!kernelSource.includes('function clopperPearson')) throw new Error('Beta kernel extraction failed');
export function kernel(source = kernelSource) {
  const context = vm.createContext({});
  vm.runInContext(source, context);
  return context;
}
