import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('../../../../nma-inconsistency/index.html', import.meta.url), 'utf8');
const css = html.match(/<style>([\s\S]*?)<\/style>/)[1].replace(/\/\*[\s\S]*?\*\//g, '');

// Source-derived contrast for this app's opaque chip colors, not a browser or
// accessibility-tree audit. The local stylesheet has one base and one dark root;
// shared app-style.css does not override these chip colors or semantic tokens.
function declarations(body) {
  return Object.fromEntries(body.split(';').filter(s => s.trim()).map(s => {
    const colon = s.indexOf(':');
    assert.ok(colon > 0, `Invalid declaration: ${s}`);
    return [s.slice(0, colon).trim(), s.slice(colon + 1).trim()];
  }));
}

function rule(selector) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const matches = [...css.matchAll(new RegExp(`${escaped}\\s*\\{([^}]+)\\}`, 'g'))];
  assert.equal(matches.length, 1, `Expected one ${selector} rule; review source extraction if CSS structure changes`);
  return declarations(matches[0][1]);
}

function themeTokens(theme) {
  assert.equal([...css.matchAll(/:root\s*\{/g)].length, 2);
  const light = css.match(/^\s*:root\s*\{([^}]+)\}/);
  const dark = css.match(/@media\s*\(prefers-color-scheme:\s*dark\)\s*\{\s*:root\s*\{([^}]+)\}/);
  assert.ok(light && dark, 'Expected base and dark theme token declarations');
  return { ...declarations(light[1]), ...(theme === 'dark' ? declarations(dark[1]) : {}) };
}

function resolveColor(value, tokens, seen = new Set()) {
  assert.equal(typeof value, 'string', 'Color declaration must exist');
  const variable = value.match(/^var\((--[\w-]+)\)$/);
  if (variable) {
    const name = variable[1];
    assert.ok(!seen.has(name), `Cyclic color token: ${name}`);
    return resolveColor(tokens[name], tokens, new Set([...seen, name]));
  }
  if (value === 'white') return '#ffffff';
  if (value === 'black') return '#000000';
  assert.match(value, /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i, `Expected an opaque hex color: ${value}`);
  return value.length === 4 ? '#' + [...value.slice(1)].map(c => c + c).join('') : value;
}

function luminance(hex) {
  const rgb = hex.slice(1).match(/../g).map(c => {
    const s = parseInt(c, 16) / 255;
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2];
}

function contrast(foreground, background) {
  const a = luminance(foreground), b = luminance(background);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

for (const theme of ['dark', 'light']) {
  for (const verdict of ['cons', 'incon']) {
    test(`${theme === 'dark' ? 'plant P16-R4' : 'control'}: ${theme} .chip.${verdict} normal text has contrast >= 4.5:1`, t => {
      const tokens = themeTokens(theme);
      const chip = { ...rule('.chip'), ...rule(`.chip.${verdict}`) };
      const foreground = resolveColor(chip.color, tokens);
      const background = resolveColor(chip.background, tokens);
      const ratio = contrast(foreground, background);
      t.diagnostic(`${theme} .chip.${verdict}: ${foreground} on ${background} = ${ratio}:1`);
      assert.ok(ratio >= 4.5, `${theme} .chip.${verdict}: ${ratio}:1 is below 4.5:1 (${foreground} on ${background})`);
    });
  }
}

test('control: semantic graph colors and flagged stroke/fill remain unchanged in both themes', () => {
  for (const [theme, cons, incon] of [
    ['light', '#0d7a27', '#912121'],
    ['dark', '#5bc47b', '#ef7373'],
  ]) {
    const tokens = themeTokens(theme);
    assert.equal(resolveColor(tokens['--cons'], tokens), cons);
    assert.equal(resolveColor(tokens['--incon'], tokens), incon);
    assert.equal(resolveColor(rule('.plus-edge.flagged .ln').stroke, tokens), incon);
    assert.equal(resolveColor(rule('.plus-bar.flip').fill, tokens), incon);
  }
});

test('control: contrast calculation gives 21:1 for black/white and 1:1 for identical colors', () => {
  assert.equal(contrast('#000000', '#ffffff'), 21);
  assert.equal(contrast('#ffffff', '#000000'), 21);
  assert.equal(contrast('#5bc47b', '#5bc47b'), 1);
});
