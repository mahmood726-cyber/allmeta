"""Fix edge case handling for Zero/Negative SE values"""

with open('app.js', 'r', encoding='utf-8') as f:
    content = f.read()

fixes = 0

# Fix 1: Add strict validation that rejects zero/negative SEs with clear error
old_validate = '''    validatePaired(effects, ses, context = 'analysis') {
      if (!Array.isArray(effects) || !Array.isArray(ses)) {
        return { valid: false, error: context + ': effects and SEs must be arrays' };
      }
      if (effects.length !== ses.length) {
        return { valid: false, error: context + ': effects and SEs must have same length' };
      }

      const validIndices = [];
      for (let i = 0; i < effects.length; i++) {
        if (Number.isFinite(effects[i]) && Number.isFinite(ses[i]) && ses[i] > 0) {
          validIndices.push(i);
        }
      }

      if (validIndices.length < 2) {
        return { valid: false, error: context + ': need at least 2 valid studies' };
      }

      return {
        valid: true,
        effects: validIndices.map(i => effects[i]),
        ses: validIndices.map(i => ses[i]),
        n: validIndices.length,
        removed: effects.length - validIndices.length
      };
    },'''

new_validate = '''    validatePaired(effects, ses, context = 'analysis') {
      if (!Array.isArray(effects) || !Array.isArray(ses)) {
        return { valid: false, error: context + ': effects and SEs must be arrays' };
      }
      if (effects.length !== ses.length) {
        return { valid: false, error: context + ': effects and SEs must have same length' };
      }
      if (effects.length === 0) {
        return { valid: false, error: context + ': arrays cannot be empty' };
      }

      // Check for invalid SE values (must be positive)
      const invalidSEs = [];
      for (let i = 0; i < ses.length; i++) {
        if (!Number.isFinite(ses[i]) || ses[i] <= 0) {
          invalidSEs.push({ index: i, value: ses[i] });
        }
      }
      if (invalidSEs.length > 0) {
        const first = invalidSEs[0];
        const reason = first.value === 0 ? 'zero' : (first.value < 0 ? 'negative' : 'invalid');
        return {
          valid: false,
          error: context + ': SE values must be positive (found ' + reason + ' SE at index ' + first.index + ')',
          invalidIndices: invalidSEs.map(x => x.index)
        };
      }

      // Check for invalid effect values
      const invalidEffects = [];
      for (let i = 0; i < effects.length; i++) {
        if (!Number.isFinite(effects[i])) {
          invalidEffects.push({ index: i, value: effects[i] });
        }
      }
      if (invalidEffects.length > 0) {
        return {
          valid: false,
          error: context + ': effect values must be finite numbers (invalid at index ' + invalidEffects[0].index + ')',
          invalidIndices: invalidEffects.map(x => x.index)
        };
      }

      if (effects.length < 2) {
        return { valid: false, error: context + ': need at least 2 studies for meta-analysis' };
      }

      return {
        valid: true,
        effects: effects.slice(),
        ses: ses.slice(),
        n: effects.length,
        removed: 0
      };
    },'''

if old_validate in content:
    content = content.replace(old_validate, new_validate)
    fixes += 1
    print('FIX 1: Updated validatePaired to strictly reject zero/negative SEs')

with open('app.js', 'w', encoding='utf-8') as f:
    f.write(content)

print(f'\nApplied {fixes} fixes')
print(f'app.js size: {len(content):,} chars')
