import re

# Read app.js
with open('app.js', 'r', encoding='utf-8') as f:
    content = f.read()

fixes = 0

# Fix 1: CopasSelectionModel expects (effects, ses) but handlers pass (studies)
# Option: Modify the class constructor to accept studies array

old_copas_constructor = '''  class CopasSelectionModel {
    constructor(effects, ses) {
      this.effects = effects;
      this.ses = ses;
      this.n = effects.length;'''

new_copas_constructor = '''  class CopasSelectionModel {
    constructor(studiesOrEffects, ses) {
      // Handle both formats: array of {effect, se} objects OR separate arrays
      if (Array.isArray(studiesOrEffects) && studiesOrEffects.length > 0 && typeof studiesOrEffects[0] === 'object' && 'effect' in studiesOrEffects[0]) {
        this.effects = studiesOrEffects.map(s => s.effect);
        this.ses = studiesOrEffects.map(s => s.se);
      } else {
        this.effects = studiesOrEffects;
        this.ses = ses || [];
      }
      this.n = this.effects.length;'''

if old_copas_constructor in content:
    content = content.replace(old_copas_constructor, new_copas_constructor)
    fixes += 1
    print('Fixed CopasSelectionModel constructor')

# Fix 2: PUniformStar - similar issue
old_puniform_constructor = '''  class PUniformStar {
    constructor(effects, ses) {
      this.effects = effects;
      this.ses = ses;
      this.n = effects.length;'''

new_puniform_constructor = '''  class PUniformStar {
    constructor(studiesOrEffects, ses) {
      if (Array.isArray(studiesOrEffects) && studiesOrEffects.length > 0 && typeof studiesOrEffects[0] === 'object' && 'effect' in studiesOrEffects[0]) {
        this.effects = studiesOrEffects.map(s => s.effect);
        this.ses = studiesOrEffects.map(s => s.se);
      } else {
        this.effects = studiesOrEffects;
        this.ses = ses || [];
      }
      this.n = this.effects.length;'''

if old_puniform_constructor in content:
    content = content.replace(old_puniform_constructor, new_puniform_constructor)
    fixes += 1
    print('Fixed PUniformStar constructor')

# Fix 3: LimitMetaAnalysis
old_limit_constructor = '''  class LimitMetaAnalysis {
    constructor(effects, ses) {
      this.effects = effects;
      this.ses = ses;
      this.n = effects.length;'''

new_limit_constructor = '''  class LimitMetaAnalysis {
    constructor(studiesOrEffects, ses) {
      if (Array.isArray(studiesOrEffects) && studiesOrEffects.length > 0 && typeof studiesOrEffects[0] === 'object' && 'effect' in studiesOrEffects[0]) {
        this.effects = studiesOrEffects.map(s => s.effect);
        this.ses = studiesOrEffects.map(s => s.se);
      } else {
        this.effects = studiesOrEffects;
        this.ses = ses || [];
      }
      this.n = this.effects.length;'''

if old_limit_constructor in content:
    content = content.replace(old_limit_constructor, new_limit_constructor)
    fixes += 1
    print('Fixed LimitMetaAnalysis constructor')

# Fix 4: RobustBayesianMA
old_robma_constructor = '''  class RobustBayesianMA {
    constructor(effects, ses) {
      this.effects = effects;
      this.ses = ses;
      this.n = effects.length;'''

new_robma_constructor = '''  class RobustBayesianMA {
    constructor(studiesOrEffects, ses) {
      if (Array.isArray(studiesOrEffects) && studiesOrEffects.length > 0 && typeof studiesOrEffects[0] === 'object' && 'effect' in studiesOrEffects[0]) {
        this.effects = studiesOrEffects.map(s => s.effect);
        this.ses = studiesOrEffects.map(s => s.se);
      } else {
        this.effects = studiesOrEffects;
        this.ses = ses || [];
      }
      this.n = this.effects.length;'''

if old_robma_constructor in content:
    content = content.replace(old_robma_constructor, new_robma_constructor)
    fixes += 1
    print('Fixed RobustBayesianMA constructor')

# Fix 5: PublicationBiasSensitivity
old_bias_constructor = '''  class PublicationBiasSensitivity {
    constructor(effects, ses) {
      this.effects = effects;
      this.ses = ses;
      this.n = effects.length;'''

new_bias_constructor = '''  class PublicationBiasSensitivity {
    constructor(studiesOrEffects, ses) {
      if (Array.isArray(studiesOrEffects) && studiesOrEffects.length > 0 && typeof studiesOrEffects[0] === 'object' && 'effect' in studiesOrEffects[0]) {
        this.effects = studiesOrEffects.map(s => s.effect);
        this.ses = studiesOrEffects.map(s => s.se);
      } else {
        this.effects = studiesOrEffects;
        this.ses = ses || [];
      }
      this.n = this.effects.length;'''

if old_bias_constructor in content:
    content = content.replace(old_bias_constructor, new_bias_constructor)
    fixes += 1
    print('Fixed PublicationBiasSensitivity constructor')

# Fix 6: ContourFunnelPlot
old_contour_constructor = '''  class ContourFunnelPlot {
    constructor(effects, ses) {
      this.effects = effects;
      this.ses = ses;'''

new_contour_constructor = '''  class ContourFunnelPlot {
    constructor(studiesOrEffects, ses) {
      if (Array.isArray(studiesOrEffects) && studiesOrEffects.length > 0 && typeof studiesOrEffects[0] === 'object' && 'effect' in studiesOrEffects[0]) {
        this.effects = studiesOrEffects.map(s => s.effect);
        this.ses = studiesOrEffects.map(s => s.se);
      } else {
        this.effects = studiesOrEffects;
        this.ses = ses || [];
      }'''

if old_contour_constructor in content:
    content = content.replace(old_contour_constructor, new_contour_constructor)
    fixes += 1
    print('Fixed ContourFunnelPlot constructor')

# Fix 7: BeggMazumdarTest
old_begg_constructor = '''  class BeggMazumdarTest {
    constructor(effects, ses) {
      this.effects = effects;
      this.ses = ses;
      this.n = effects.length;'''

new_begg_constructor = '''  class BeggMazumdarTest {
    constructor(studiesOrEffects, ses) {
      if (Array.isArray(studiesOrEffects) && studiesOrEffects.length > 0 && typeof studiesOrEffects[0] === 'object' && 'effect' in studiesOrEffects[0]) {
        this.effects = studiesOrEffects.map(s => s.effect);
        this.ses = studiesOrEffects.map(s => s.se);
      } else {
        this.effects = studiesOrEffects;
        this.ses = ses || [];
      }
      this.n = this.effects.length;'''

if old_begg_constructor in content:
    content = content.replace(old_begg_constructor, new_begg_constructor)
    fixes += 1
    print('Fixed BeggMazumdarTest constructor')

# Fix 8: PetersTest
old_peters_constructor = '''  class PetersTest {
    constructor(effects, ses, ns) {
      this.effects = effects;
      this.ses = ses;
      this.ns = ns;
      this.n = effects.length;'''

new_peters_constructor = '''  class PetersTest {
    constructor(studiesOrEffects, ses, ns) {
      if (Array.isArray(studiesOrEffects) && studiesOrEffects.length > 0 && typeof studiesOrEffects[0] === 'object' && 'effect' in studiesOrEffects[0]) {
        this.effects = studiesOrEffects.map(s => s.effect);
        this.ses = studiesOrEffects.map(s => s.se);
        this.ns = studiesOrEffects.map(s => s.n || Math.round(4 / (s.se * s.se)));
      } else {
        this.effects = studiesOrEffects;
        this.ses = ses || [];
        this.ns = ns || [];
      }
      this.n = this.effects.length;'''

if old_peters_constructor in content:
    content = content.replace(old_peters_constructor, new_peters_constructor)
    fixes += 1
    print('Fixed PetersTest constructor')

# Fix 9: ZCurveAnalysis
old_zcurve_constructor = '''  class ZCurveAnalysis {
    constructor(effects, ses) {
      this.effects = effects;
      this.ses = ses;
      this.n = effects.length;'''

new_zcurve_constructor = '''  class ZCurveAnalysis {
    constructor(studiesOrEffects, ses) {
      if (Array.isArray(studiesOrEffects) && studiesOrEffects.length > 0 && typeof studiesOrEffects[0] === 'object' && 'effect' in studiesOrEffects[0]) {
        this.effects = studiesOrEffects.map(s => s.effect);
        this.ses = studiesOrEffects.map(s => s.se);
      } else {
        this.effects = studiesOrEffects;
        this.ses = ses || [];
      }
      this.n = this.effects.length;'''

if old_zcurve_constructor in content:
    content = content.replace(old_zcurve_constructor, new_zcurve_constructor)
    fixes += 1
    print('Fixed ZCurveAnalysis constructor')

# Fix 10: SelectionModelComparison
old_comparison_constructor = '''  class SelectionModelComparison {
    constructor(effects, ses) {
      this.effects = effects;
      this.ses = ses;
      this.n = effects.length;'''

new_comparison_constructor = '''  class SelectionModelComparison {
    constructor(studiesOrEffects, ses) {
      if (Array.isArray(studiesOrEffects) && studiesOrEffects.length > 0 && typeof studiesOrEffects[0] === 'object' && 'effect' in studiesOrEffects[0]) {
        this.effects = studiesOrEffects.map(s => s.effect);
        this.ses = studiesOrEffects.map(s => s.se);
      } else {
        this.effects = studiesOrEffects;
        this.ses = ses || [];
      }
      this.n = this.effects.length;'''

if old_comparison_constructor in content:
    content = content.replace(old_comparison_constructor, new_comparison_constructor)
    fixes += 1
    print('Fixed SelectionModelComparison constructor')

# Fix 11: WAAPWLS
old_waap_constructor = '''  class WAAPWLS {
    constructor(effects, ses, ns) {
      this.effects = effects;
      this.ses = ses;
      this.ns = ns;
      this.n = effects.length;'''

new_waap_constructor = '''  class WAAPWLS {
    constructor(studiesOrEffects, ses, ns) {
      if (Array.isArray(studiesOrEffects) && studiesOrEffects.length > 0 && typeof studiesOrEffects[0] === 'object' && 'effect' in studiesOrEffects[0]) {
        this.effects = studiesOrEffects.map(s => s.effect);
        this.ses = studiesOrEffects.map(s => s.se);
        this.ns = studiesOrEffects.map(s => s.n || Math.round(4 / (s.se * s.se)));
      } else {
        this.effects = studiesOrEffects;
        this.ses = ses || [];
        this.ns = ns || [];
      }
      this.n = this.effects.length;'''

if old_waap_constructor in content:
    content = content.replace(old_waap_constructor, new_waap_constructor)
    fixes += 1
    print('Fixed WAAPWLS constructor')

# Fix 12: CumulativeMetaAnalysis
old_cumulative_constructor = '''  class CumulativeMetaAnalysis {
    constructor(effects, ses, labels) {
      this.effects = effects;
      this.ses = ses;
      this.labels = labels;
      this.n = effects.length;'''

new_cumulative_constructor = '''  class CumulativeMetaAnalysis {
    constructor(studiesOrEffects, ses, labels) {
      if (Array.isArray(studiesOrEffects) && studiesOrEffects.length > 0 && typeof studiesOrEffects[0] === 'object' && 'effect' in studiesOrEffects[0]) {
        this.effects = studiesOrEffects.map(s => s.effect);
        this.ses = studiesOrEffects.map(s => s.se);
        this.labels = studiesOrEffects.map(s => s.study || s.id || s.label || '');
      } else {
        this.effects = studiesOrEffects;
        this.ses = ses || [];
        this.labels = labels || [];
      }
      this.n = this.effects.length;'''

if old_cumulative_constructor in content:
    content = content.replace(old_cumulative_constructor, new_cumulative_constructor)
    fixes += 1
    print('Fixed CumulativeMetaAnalysis constructor')

# Fix 13: SunsetPowerAnalysis
old_sunset_constructor = '''  class SunsetPowerAnalysis {
    constructor(effects, ses) {
      this.effects = effects;
      this.ses = ses;
      this.n = effects.length;'''

new_sunset_constructor = '''  class SunsetPowerAnalysis {
    constructor(studiesOrEffects, ses) {
      if (Array.isArray(studiesOrEffects) && studiesOrEffects.length > 0 && typeof studiesOrEffects[0] === 'object' && 'effect' in studiesOrEffects[0]) {
        this.effects = studiesOrEffects.map(s => s.effect);
        this.ses = studiesOrEffects.map(s => s.se);
      } else {
        this.effects = studiesOrEffects;
        this.ses = ses || [];
      }
      this.n = this.effects.length;'''

if old_sunset_constructor in content:
    content = content.replace(old_sunset_constructor, new_sunset_constructor)
    fixes += 1
    print('Fixed SunsetPowerAnalysis constructor')

# Fix 14: LeaveOneOutBias
old_loo_constructor = '''  class LeaveOneOutBias {
    constructor(effects, ses, labels) {
      this.effects = effects;
      this.ses = ses;
      this.labels = labels;
      this.n = effects.length;'''

new_loo_constructor = '''  class LeaveOneOutBias {
    constructor(studiesOrEffects, ses, labels) {
      if (Array.isArray(studiesOrEffects) && studiesOrEffects.length > 0 && typeof studiesOrEffects[0] === 'object' && 'effect' in studiesOrEffects[0]) {
        this.effects = studiesOrEffects.map(s => s.effect);
        this.ses = studiesOrEffects.map(s => s.se);
        this.labels = studiesOrEffects.map(s => s.study || s.id || s.label || '');
      } else {
        this.effects = studiesOrEffects;
        this.ses = ses || [];
        this.labels = labels || [];
      }
      this.n = this.effects.length;'''

if old_loo_constructor in content:
    content = content.replace(old_loo_constructor, new_loo_constructor)
    fixes += 1
    print('Fixed LeaveOneOutBias constructor')

# Fix 15: RegressionBasedTests
old_regression_constructor = '''  class RegressionBasedTests {
    constructor(effects, ses, ns) {
      this.effects = effects;
      this.ses = ses;
      this.ns = ns;
      this.n = effects.length;'''

new_regression_constructor = '''  class RegressionBasedTests {
    constructor(studiesOrEffects, ses, ns) {
      if (Array.isArray(studiesOrEffects) && studiesOrEffects.length > 0 && typeof studiesOrEffects[0] === 'object' && 'effect' in studiesOrEffects[0]) {
        this.effects = studiesOrEffects.map(s => s.effect);
        this.ses = studiesOrEffects.map(s => s.se);
        this.ns = studiesOrEffects.map(s => s.n || Math.round(4 / (s.se * s.se)));
      } else {
        this.effects = studiesOrEffects;
        this.ses = ses || [];
        this.ns = ns || [];
      }
      this.n = this.effects.length;'''

if old_regression_constructor in content:
    content = content.replace(old_regression_constructor, new_regression_constructor)
    fixes += 1
    print('Fixed RegressionBasedTests constructor')

# Write back
with open('app.js', 'w', encoding='utf-8') as f:
    f.write(content)

print(f'\nTotal constructor fixes applied: {fixes}')
print(f'app.js size: {len(content)} chars')
