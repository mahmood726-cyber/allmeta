import { readFileSync } from 'node:fs';
import vm from 'node:vm';

export const root = new URL('../../../../', import.meta.url);
export const read = path => readFileSync(new URL(path, root), 'utf8');

// Execute the actual page engine, renderers and lifecycle without a browser.
// Only the optional widget initialisers are omitted. DOM observations below
// deliberately cover markup/text, not browser layout or accessibility.
export function harness() {
  const elements = new Map();
  function element(id, html = '') {
    const attrs = new Map();
    return { id, value: '', hidden: true, style: {}, innerHTML: html,
      get innerText() { return this.innerHTML.replace(/<[^>]*>/g, ' '); },
      get attributes() { return [...attrs].map(([name, value]) => ({ name, value })); },
      setAttribute(name, value) { attrs.set(name, String(value)); },
      removeAttribute(name) { attrs.delete(name); },
      addEventListener() {}, closest() { return null; }
    };
  }
  const get = id => {
    if (!elements.has(id)) elements.set(id, element(id));
    return elements.get(id);
  };
  const document = {
    getElementById: get, addEventListener() {}, querySelector() { return null; },
    querySelectorAll(selector) {
      if (selector === '#src, #trans, #tau-est') return ['src', 'trans', 'tau-est'].map(get);
      if (selector === '#het') return [get('het')];
      if (selector === '#res-body tr') return [...get('res-body').innerHTML.matchAll(/<tr\b[^>]*>[\s\S]*?<\/tr>/g)].map(m => element('', m[0]));
      if (selector === '#forest polygon') return [...get('forest').innerHTML.matchAll(/<polygon\b/g)].map(() => element(''));
      if (selector === '.pooled-row') {
        const match = get('res-body').innerHTML.match(/<tr class="pooled-row">[\s\S]*?<\/tr>/);
        return match ? [element('', match[0])] : [];
      }
      throw new Error('Unsupported test selector: ' + selector);
    }
  };
  const context = vm.createContext({ document, console, setTimeout });
  context.window = context;
  context.MaStudies = {};
  vm.runInContext(read('shared/ma-core.js'), context);
  vm.runInContext(read('hub/shared/analysis-lifecycle.js'), context);
  const html = read('proportion-ma/index.html');
  const script = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]).find(s => s.includes('function logitTransform'));
  const end = script.indexOf('    // ---- module init ----');
  if (end < 0) throw new Error('Page engine boundary missing');
  vm.runInContext(script.slice(0, end) + `
    window.testEngine = {
      logit: logitTransform,
      fault: function (stage, value) {
        if (stage === 'transform') logitTransform = function () { return value; };
        else if (stage === 'pool') {
          var original = pool;
          pool = function (rows, method) { return Object.assign(original(rows, method), value); };
        } else if (stage === 'back') logitBack = function () { return value; };
        else if (stage === 'ci') clopperPearson = function () { return value; };
      }
    };
  })();`, context);
  return { context, get, engine: context.testEngine,
    run(src = '0,10,A\n10,10,B\n4,20,C', trans = 'logit', method = 'PM') {
      get('src').value = src;
      get('trans').value = trans;
      get('tau-est').value = method;
      context.__almPropValidation.run();
      return context._almLastPropMA();
    },
    details() { return context.__almPropValidation.save().details; }
  };
}
