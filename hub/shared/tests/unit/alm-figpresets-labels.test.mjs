import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

// Minimal DOM for mounting only; browser spec also exercises real label lookup.
class Element {
  constructor(tag) { this.tagName = tag; this.children = []; this.text = ''; this.style = {}; }
  set textContent(value) { this.text = value; this.children = []; }
  get textContent() { return this.text + this.children.map(el => el.textContent).join(''); }
  appendChild(el) { this.children.push(el); return el; }
  append(...els) { els.forEach(el => this.appendChild(el)); }
  attachShadow() { this.shadowRoot = new Element('shadow-root'); return this.shadowRoot; }
  setAttribute() {}
  addEventListener() {}
  get options() { return this.children; }
}
function descendants(el, tag) {
  return el.children.flatMap(child => [...(child.tagName === tag ? [child] : []), ...descendants(child, tag), ...(child.shadowRoot ? descendants(child.shadowRoot, tag) : [])]);
}

test('mounted fields have exact visible labels, independent of select options', () => {
  const document = { createElement: tag => new Element(tag), head: new Element('head'), currentScript: null };
  const window = { document };
  vm.runInNewContext(readFileSync(new URL('../../../../shared/alm-figpresets.js', import.meta.url), 'utf8'), { window });
  const target = new Element('div');
  window.AlmFigPresets.mount({ target, plots: [] });
  const labels = descendants(target, 'label');
  const names = ['Journal preset', 'Column width', 'Preset width (mm)', 'Preset resolution (dpi)',
    'Preset font family', 'Preset minimum font (pt)', 'Preset export format'];
  assert.deepEqual(labels.map(el => el.textContent.trim()), names);
  const controls = [...descendants(target, 'select'), ...descendants(target, 'input')];
  for (const label of labels) assert.equal(controls.filter(el => el.id === label.htmlFor).length, 1);
  // Planted original nesting defect must violate the same label-text contract.
  labels[0].appendChild(controls.find(el => el.id === labels[0].htmlFor));
  assert.notEqual(labels[0].textContent.trim(), names[0]);
});
