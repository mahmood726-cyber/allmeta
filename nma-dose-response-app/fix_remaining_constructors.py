import re

# Read app.js
with open('app.js', 'r', encoding='utf-8') as f:
    content = f.read()

fixes = 0

# Fix PUniformStar - different signature with options
old = '''  class PUniformStar {
    constructor(effects, ses, options = {}) {
      this.effects = effects;
      this.ses = ses;
      this.n = effects.length;'''

new = '''  class PUniformStar {
    constructor(studiesOrEffects, ses, options = {}) {
      if (Array.isArray(studiesOrEffects) && studiesOrEffects.length > 0 && typeof studiesOrEffects[0] === 'object' && 'effect' in studiesOrEffects[0]) {
        this.effects = studiesOrEffects.map(s => s.effect);
        this.ses = studiesOrEffects.map(s => s.se);
      } else {
        this.effects = studiesOrEffects || [];
        this.ses = ses || [];
      }
      this.n = this.effects.length;'''

if old in content:
    content = content.replace(old, new)
    fixes += 1
    print('Fixed PUniformStar constructor')

# Fix RobustBayesianMA
old2 = '''  class RobustBayesianMA {
    constructor(effects, ses, options = {}) {
      this.effects = effects;
      this.ses = ses;
      this.n = effects.length;'''

new2 = '''  class RobustBayesianMA {
    constructor(studiesOrEffects, ses, options = {}) {
      if (Array.isArray(studiesOrEffects) && studiesOrEffects.length > 0 && typeof studiesOrEffects[0] === 'object' && 'effect' in studiesOrEffects[0]) {
        this.effects = studiesOrEffects.map(s => s.effect);
        this.ses = studiesOrEffects.map(s => s.se);
      } else {
        this.effects = studiesOrEffects || [];
        this.ses = ses || [];
      }
      this.n = this.effects.length;'''

if old2 in content:
    content = content.replace(old2, new2)
    fixes += 1
    print('Fixed RobustBayesianMA constructor')

# Fix ContourFunnelPlot
old3 = '''  class ContourFunnelPlot {
    constructor(effects, ses, options = {}) {
      this.effects = effects;
      this.ses = ses;'''

new3 = '''  class ContourFunnelPlot {
    constructor(studiesOrEffects, ses, options = {}) {
      if (Array.isArray(studiesOrEffects) && studiesOrEffects.length > 0 && typeof studiesOrEffects[0] === 'object' && 'effect' in studiesOrEffects[0]) {
        this.effects = studiesOrEffects.map(s => s.effect);
        this.ses = studiesOrEffects.map(s => s.se);
      } else {
        this.effects = studiesOrEffects || [];
        this.ses = ses || [];
      }'''

if old3 in content:
    content = content.replace(old3, new3)
    fixes += 1
    print('Fixed ContourFunnelPlot constructor')

# Fix PetersTest
old4 = '''  class PetersTest {
    constructor(effects, ses, ns, options = {}) {
      this.effects = effects;
      this.ses = ses;
      this.ns = ns || effects.map((_, i) => Math.round(4 / (ses[i] * ses[i])));
      this.n = effects.length;'''

new4 = '''  class PetersTest {
    constructor(studiesOrEffects, ses, ns, options = {}) {
      if (Array.isArray(studiesOrEffects) && studiesOrEffects.length > 0 && typeof studiesOrEffects[0] === 'object' && 'effect' in studiesOrEffects[0]) {
        this.effects = studiesOrEffects.map(s => s.effect);
        this.ses = studiesOrEffects.map(s => s.se);
        this.ns = studiesOrEffects.map(s => s.n || Math.round(4 / (s.se * s.se)));
      } else {
        this.effects = studiesOrEffects || [];
        this.ses = ses || [];
        this.ns = ns || this.effects.map((_, i) => Math.round(4 / (this.ses[i] * this.ses[i])));
      }
      this.n = this.effects.length;'''

if old4 in content:
    content = content.replace(old4, new4)
    fixes += 1
    print('Fixed PetersTest constructor')

# Fix WAAPWLS
old5 = '''  class WAAPWLS {
    constructor(effects, ses, ns, options = {}) {
      this.effects = effects;
      this.ses = ses;
      this.ns = ns || effects.map((_, i) => Math.round(4 / (ses[i] * ses[i])));
      this.n = effects.length;'''

new5 = '''  class WAAPWLS {
    constructor(studiesOrEffects, ses, ns, options = {}) {
      if (Array.isArray(studiesOrEffects) && studiesOrEffects.length > 0 && typeof studiesOrEffects[0] === 'object' && 'effect' in studiesOrEffects[0]) {
        this.effects = studiesOrEffects.map(s => s.effect);
        this.ses = studiesOrEffects.map(s => s.se);
        this.ns = studiesOrEffects.map(s => s.n || Math.round(4 / (s.se * s.se)));
      } else {
        this.effects = studiesOrEffects || [];
        this.ses = ses || [];
        this.ns = ns || this.effects.map((_, i) => Math.round(4 / (this.ses[i] * this.ses[i])));
      }
      this.n = this.effects.length;'''

if old5 in content:
    content = content.replace(old5, new5)
    fixes += 1
    print('Fixed WAAPWLS constructor')

# Fix CumulativeMetaAnalysis
old6 = '''  class CumulativeMetaAnalysis {
    constructor(effects, ses, labels, options = {}) {
      this.effects = effects;
      this.ses = ses;
      this.labels = labels || effects.map((_, i) => `Study ${i + 1}`);
      this.n = effects.length;'''

new6 = '''  class CumulativeMetaAnalysis {
    constructor(studiesOrEffects, ses, labels, options = {}) {
      if (Array.isArray(studiesOrEffects) && studiesOrEffects.length > 0 && typeof studiesOrEffects[0] === 'object' && 'effect' in studiesOrEffects[0]) {
        this.effects = studiesOrEffects.map(s => s.effect);
        this.ses = studiesOrEffects.map(s => s.se);
        this.labels = studiesOrEffects.map((s, i) => s.study || s.id || s.label || `Study ${i + 1}`);
      } else {
        this.effects = studiesOrEffects || [];
        this.ses = ses || [];
        this.labels = labels || this.effects.map((_, i) => `Study ${i + 1}`);
      }
      this.n = this.effects.length;'''

if old6 in content:
    content = content.replace(old6, new6)
    fixes += 1
    print('Fixed CumulativeMetaAnalysis constructor')

# Fix LeaveOneOutBias
old7 = '''  class LeaveOneOutBias {
    constructor(effects, ses, labels, options = {}) {
      this.effects = effects;
      this.ses = ses;
      this.labels = labels || effects.map((_, i) => `Study ${i + 1}`);
      this.n = effects.length;'''

new7 = '''  class LeaveOneOutBias {
    constructor(studiesOrEffects, ses, labels, options = {}) {
      if (Array.isArray(studiesOrEffects) && studiesOrEffects.length > 0 && typeof studiesOrEffects[0] === 'object' && 'effect' in studiesOrEffects[0]) {
        this.effects = studiesOrEffects.map(s => s.effect);
        this.ses = studiesOrEffects.map(s => s.se);
        this.labels = studiesOrEffects.map((s, i) => s.study || s.id || s.label || `Study ${i + 1}`);
      } else {
        this.effects = studiesOrEffects || [];
        this.ses = ses || [];
        this.labels = labels || this.effects.map((_, i) => `Study ${i + 1}`);
      }
      this.n = this.effects.length;'''

if old7 in content:
    content = content.replace(old7, new7)
    fixes += 1
    print('Fixed LeaveOneOutBias constructor')

# Fix RegressionBasedTests
old8 = '''  class RegressionBasedTests {
    constructor(effects, ses, ns, options = {}) {
      this.effects = effects;
      this.ses = ses;
      this.ns = ns || effects.map((_, i) => Math.round(4 / (ses[i] * ses[i])));
      this.n = effects.length;'''

new8 = '''  class RegressionBasedTests {
    constructor(studiesOrEffects, ses, ns, options = {}) {
      if (Array.isArray(studiesOrEffects) && studiesOrEffects.length > 0 && typeof studiesOrEffects[0] === 'object' && 'effect' in studiesOrEffects[0]) {
        this.effects = studiesOrEffects.map(s => s.effect);
        this.ses = studiesOrEffects.map(s => s.se);
        this.ns = studiesOrEffects.map(s => s.n || Math.round(4 / (s.se * s.se)));
      } else {
        this.effects = studiesOrEffects || [];
        this.ses = ses || [];
        this.ns = ns || this.effects.map((_, i) => Math.round(4 / (this.ses[i] * this.ses[i])));
      }
      this.n = this.effects.length;'''

if old8 in content:
    content = content.replace(old8, new8)
    fixes += 1
    print('Fixed RegressionBasedTests constructor')

# Write back
with open('app.js', 'w', encoding='utf-8') as f:
    f.write(content)

print(f'\nTotal fixes applied: {fixes}')
print(f'app.js size: {len(content)} chars')
