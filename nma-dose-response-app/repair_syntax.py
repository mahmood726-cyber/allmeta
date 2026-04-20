"""Repair syntax errors from incomplete function insertions"""

with open('app.js', 'r', encoding='utf-8') as f:
    content = f.read()

# Fix 1: Complete the I2ConfidenceInterval function (line 271-274 is incomplete)
old_incomplete_i2 = '''    // I² confidence interval using Q-profile method (Viechtbauer 2007)
    I2ConfidenceInterval(Q, k, alpha = 0.05) {
      if (k < 2) return { I2: 0, lower: 0, upper: 0 };

  // Safe method execution wrapper'''

complete_i2 = '''    // I² confidence interval using Q-profile method (Viechtbauer 2007)
    I2ConfidenceInterval(Q, k, alpha = 0.05) {
      if (k < 2) return { I2: 0, lower: 0, upper: 0 };
      const df = k - 1;

      // Point estimate
      const I2 = Q > df ? Math.max(0, (Q - df) / Q * 100) : 0;

      // Get chi-square quantiles for CI
      const chiLower = this.chiSquareQuantile(1 - alpha / 2, df);
      const chiUpper = this.chiSquareQuantile(alpha / 2, df);

      // Transform to I² scale
      let lower = 0, upper = 0;
      if (Q > chiLower) {
        lower = Math.max(0, (Q - chiLower) / Q * 100);
      }
      if (Q > chiUpper && chiUpper > 0) {
        upper = Math.min(100, (Q - chiUpper) / Q * 100);
      } else if (Q > df) {
        upper = 100;
      }

      return { I2, lower, upper, Q, df };
    }
  };

  // Safe method execution wrapper'''

if old_incomplete_i2 in content:
    content = content.replace(old_incomplete_i2, complete_i2)
    print('FIX 1: Completed I2ConfidenceInterval function')
else:
    print('I2ConfidenceInterval pattern not found')

# Fix 2: Complete the safeExecute function (missing catch block)
old_incomplete_safe = '''  // Safe method execution wrapper
  function safeExecute(fn, fallback = null, context = null) {
    try {
      const result = context ? fn.call(context) : fn();
      return result;
    }

  // Calculate prediction interval'''

complete_safe = '''  // Safe method execution wrapper
  function safeExecute(fn, fallback = null, context = null) {
    try {
      const result = context ? fn.call(context) : fn();
      return result;
    } catch (e) {
      console.warn('Safe execution caught error:', e.message);
      return fallback;
    }
  }

  // Calculate prediction interval'''

if old_incomplete_safe in content:
    content = content.replace(old_incomplete_safe, complete_safe)
    print('FIX 2: Completed safeExecute function with catch block')
else:
    print('safeExecute pattern not found')

# Write back
with open('app.js', 'w', encoding='utf-8') as f:
    f.write(content)

print(f'\napp.js size: {len(content)} chars')
