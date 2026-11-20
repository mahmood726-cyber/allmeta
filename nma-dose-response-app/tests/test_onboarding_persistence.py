"""The first-visit Quick Start wizard must not come back after the user closes it.

index.html says "Check if first visit - show wizard", but the only key it checked
(nma_wizard_completed) is written solely when all four wizard steps are finished.
Closing it with the x button or Escape stored nothing, so the overlay (z-index
above the Run button) reopened on every page load. Runs the page's own
openWizard/closeWizard and auto-open block in Node against a persistent
localStorage, one "visit" per fresh overlay.
"""
import json
import subprocess
from pathlib import Path

PAGE = Path(__file__).resolve().parents[1] / 'index.html'

PROBE = r"""
const fs = require('fs'), vm = require('vm');
const html = fs.readFileSync(process.argv[1], 'utf8');
const grab = (re, what) => { const m = html.match(re); if (!m) throw new Error('anchor changed: ' + what); return m[0]; };
const fnSrc = name => grab(new RegExp('^( *)function ' + name + '\\(\\) \\{[\\s\\S]*?^\\1\\}', 'm'), name);
const auto = grab(/\/\/ Check if first visit - show wizard\s*\n( *)if \([^\n]*\) \{[\s\S]*?\n\1\}/, 'auto-open block');
const src = [fnSrc('openWizard'), fnSrc('closeWizard'), auto].join('\n');
const store = new Map();
const localStorage = { getItem: k => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)) };
function visit(actions) {
  const cls = new Set();
  const overlay = { classList: { add: c => cls.add(c), remove: c => cls.delete(c), contains: c => cls.has(c) } };
  const ctx = vm.createContext({ localStorage, wizardStep: 0, updateWizardStep() {},
    setTimeout: fn => fn(), document: { getElementById: id => { if (id !== 'wizardOverlay') throw new Error(id); return overlay; } } });
  vm.runInContext('var wizardStep = 1;\n' + src, ctx);
  const shown = cls.has('active');
  for (const a of actions || []) vm.runInContext(a, ctx);
  return shown;
}
const out = {};
out.firstVisitShown = visit(['closeWizard()']);
out.afterCloseShown = visit();
store.clear();
// Escape closes "any modal"; pressing it while the wizard is not open must not opt out.
const cls0 = new Set();
out.escapeBeforeOpenShown = (() => {
  const overlay = { classList: { add: c => cls0.add(c), remove: c => cls0.delete(c), contains: c => cls0.has(c) } };
  const ctx = vm.createContext({ localStorage, updateWizardStep() {}, setTimeout: fn => fn(),
    document: { getElementById: () => overlay } });
  vm.runInContext('var wizardStep = 1;\n' + [fnSrc('openWizard'), fnSrc('closeWizard')].join('\n') + '\ncloseWizard();\n' + auto, ctx);
  return cls0.has('active');
})();
store.clear(); store.set('nma_wizard_completed', 'true');
out.completedShown = visit();
console.log(JSON.stringify(out));
"""


def run_probe():
    proc = subprocess.run(['node', '-e', PROBE, str(PAGE)], capture_output=True, text=True, encoding='utf-8', timeout=60)
    assert proc.returncode == 0, proc.stderr
    return json.loads(proc.stdout)


def test_wizard_shows_on_first_visit_and_not_after_it_is_closed():
    out = run_probe()
    assert out['firstVisitShown'] is True
    assert out['afterCloseShown'] is False, 'closing the wizard must persist; it reopened on the next visit'


def test_escape_while_wizard_closed_does_not_opt_out():
    assert run_probe()['escapeBeforeOpenShown'] is True


def test_completed_wizard_stays_hidden():
    assert run_probe()['completedShown'] is False


def test_close_still_closes_when_storage_throws():
    # Codex review: persistence ran before the overlay was hidden, so a throwing
    # localStorage (quota, blocked storage) left the wizard stuck over Run.
    probe = r"""
const fs = require('fs'), vm = require('vm');
const html = fs.readFileSync(process.argv[1], 'utf8');
const src = html.match(/^( *)function closeWizard\(\) \{[\s\S]*?^\1\}/m)[0];
const cls = new Set(['active']);
const overlay = { classList: { add: c => cls.add(c), remove: c => cls.delete(c), contains: c => cls.has(c) } };
const ctx = vm.createContext({ localStorage: { setItem() { throw new Error('QuotaExceededError'); } },
  document: { getElementById: () => overlay } });
let threw = false;
try { vm.runInContext(src + '\ncloseWizard();', ctx); } catch (e) { threw = true; }
console.log(JSON.stringify({ threw, stillActive: cls.has('active') }));
"""
    proc = subprocess.run(['node', '-e', probe, str(PAGE)], capture_output=True, text=True, encoding='utf-8', timeout=60)
    assert proc.returncode == 0, proc.stderr
    out = json.loads(proc.stdout)
    assert out == {'threw': False, 'stillActive': False}, out
