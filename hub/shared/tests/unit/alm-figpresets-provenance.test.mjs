import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
const F = createRequire(import.meta.url)('../../../../shared/alm-figpresets.js');

test('Custom has no journal source; a planted journal association is rejected', () => {
  const custom = F.presets.find(p => p.id === 'custom');
  assert.equal(custom.source_url, null);
  assert.deepEqual(F.lint([custom]), []);
  assert.ok(F.lint([{ ...custom, source_url: F.presets[0].source_url }]).length);
  assert.ok(F.lint([{ ...F.presets[0], source_url: null }]).length);
});

test('every memory-based preset remains unverified; planted confirmation fails lint', () => {
  for (const preset of F.presets) {
    assert.equal(preset.verified, false);
    assert.deepEqual(F.lint([preset]), []);
    assert.ok(F.lint([{ ...preset, verified: true }]).length);
  }
});

test('visible provenance follows every selection; Custom clears a previous journal link', () => {
  class Element {
    constructor(tag) { this.tag = tag; this.children = []; this.events = {}; this.text = ''; }
    set textContent(value) { this.text = value; this.children = []; }
    get textContent() { return this.text + this.children.map(el => el.textContent).join(''); }
    appendChild(el) { this.children.push(el); return el; }
    append(...els) { els.forEach(el => this.appendChild(el)); }
    attachShadow() { this.shadowRoot = new Element('shadow-root'); return this.shadowRoot; }
    setAttribute(key, value) { this[key] = value; }
    removeAttribute(key) { delete this[key]; }
    addEventListener(event, callback) { this.events[event] = callback; }
    get options() { return this.children; }
  }
  const document = { createElement: tag => new Element(tag), head: new Element('head'), currentScript: null };
  const window = { document };
  vm.runInNewContext(readFileSync(new URL('../../../../shared/alm-figpresets.js', import.meta.url), 'utf8'), { window });
  const panel = window.AlmFigPresets.mount({ target: new Element('div'), plots: [] });
  const all = el => el.children.flatMap(child => [child, ...all(child), ...(child.shadowRoot ? all(child.shadowRoot) : [])]);
  const elements = all(panel), select = elements.find(el => el.tag === 'select');
  const disclosure = elements.find(el => el.className === 'alm-figpresets-verification');
  const link = elements.find(el => el.tag === 'a');
  const warning = "Unverified — check the journal's current author guide";
  for (const preset of F.presets) {
    select.value = preset.id; select.events.change();
    assert.equal(disclosure.textContent, `${preset.name}: ${warning}`);
    assert.equal(select.options.find(option => option.value === preset.id).textContent, `${preset.name} — ${warning}`);
    if (preset.id === 'custom') {
      assert.equal(link.hidden, true);
      assert.equal(link.href, undefined);
    } else {
      assert.equal(link.hidden, false);
      assert.equal(link.href, preset.source_url);
    }
  }
  disclosure.textContent = 'Verified'; // planted misleading confirmation
  assert.notEqual(disclosure.textContent, `Custom: ${warning}`);
});
