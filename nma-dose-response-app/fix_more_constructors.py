import re

# Read app.js
with open('app.js', 'r', encoding='utf-8') as f:
    content = f.read()

fixes = 0

# Fix WAAPWLS constructor
old_waap = """  class WAAPWLS {
    constructor(effects, ses, options = {}) {
      this.effects = effects;
      this.ses = ses;
      this.n = effects.length;
      this.powerThreshold = options.powerThreshold || 0.80;
    }"""

new_waap = """  class WAAPWLS {
    constructor(studiesOrEffects, ses, options = {}) {
      if (Array.isArray(studiesOrEffects) && studiesOrEffects.length > 0 && typeof studiesOrEffects[0] === 'object' && 'effect' in studiesOrEffects[0]) {
        this.effects = studiesOrEffects.map(s => s.effect);
        this.ses = studiesOrEffects.map(s => s.se);
      } else {
        this.effects = studiesOrEffects || [];
        this.ses = ses || [];
      }
      this.n = this.effects.length;
      this.powerThreshold = options?.powerThreshold || 0.80;
    }"""

if old_waap in content:
    content = content.replace(old_waap, new_waap, 1)
    fixes += 1
    print('Fixed WAAPWLS constructor')

# Fix CumulativeMetaAnalysis constructor
old_cumulative = """  class CumulativeMetaAnalysis {
    constructor(effects, ses, studyNames) {
      this.effects = effects;
      this.ses = ses;
      this.studyNames = studyNames || effects.map((_, i) => `Study ${i + 1}`);
      this.n = effects.length;
    }"""

new_cumulative = """  class CumulativeMetaAnalysis {
    constructor(studiesOrEffects, ses, studyNames) {
      if (Array.isArray(studiesOrEffects) && studiesOrEffects.length > 0 && typeof studiesOrEffects[0] === 'object' && 'effect' in studiesOrEffects[0]) {
        this.effects = studiesOrEffects.map(s => s.effect);
        this.ses = studiesOrEffects.map(s => s.se);
        this.studyNames = studiesOrEffects.map((s, i) => s.study || s.id || s.name || `Study ${i + 1}`);
      } else {
        this.effects = studiesOrEffects || [];
        this.ses = ses || [];
        this.studyNames = studyNames || this.effects.map((_, i) => `Study ${i + 1}`);
      }
      this.n = this.effects.length;
    }"""

if old_cumulative in content:
    content = content.replace(old_cumulative, new_cumulative, 1)
    fixes += 1
    print('Fixed CumulativeMetaAnalysis constructor')

# Write back
with open('app.js', 'w', encoding='utf-8') as f:
    f.write(content)

print(f'\nTotal fixes applied: {fixes}')
print(f'app.js size: {len(content)} chars')
