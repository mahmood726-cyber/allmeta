"""Remove orphaned/duplicate code from corrupted insertions"""

with open('app.js', 'r', encoding='utf-8') as f:
    content = f.read()

# Pattern: Everything from the orphaned catch block to the duplicate StatUtils closing
orphaned_code = ''' catch (e) {
      console.warn('Method execution failed:', e.message);
      return fallback;
    }
  }



      const df = k - 1;
      const I2 = Q > df ? ((Q - df) / Q) * 100 : 0;

      // Q-profile method for tau² CI, then transform to I²
      const chiLower = this.chiSquareQuantile(1 - alpha / 2, df);
      const chiUpper = this.chiSquareQuantile(alpha / 2, df);

      // I² = (Q - df) / Q, so bounds are:
      // When Q is at lower chi-square bound
      const I2Lower = chiLower > df ? ((chiLower - df) / chiLower) * 100 : 0;
      // When Q is at upper chi-square bound
      const I2Upper = chiUpper > df ? ((chiUpper - df) / chiUpper) * 100 : 0;

      // Actually need to solve for I² bounds differently
      // Using the relationship: Q ~ chi²(df) under null
      // I² = max(0, (Q - df) / Q)
      // For CI, we use: I² = 1 - df/Q, Q ~ chi²(df)
      // So I²_lower corresponds to Q_upper and vice versa

      // More accurate: use Q-profile
      // tau²_lower when Q = chi²_upper, tau²_upper when Q = chi²_lower
      // Then convert tau² to I²

      // Simpler approximation for I² CI (Higgins & Thompson 2002)
      const lnQ = Math.log(Math.max(Q, 1));
      const seLnQ = Math.sqrt(2 / df);
      const lnQLower = lnQ - this.normalQuantile(1 - alpha/2) * seLnQ;
      const lnQUpper = lnQ + this.normalQuantile(1 - alpha/2) * seLnQ;

      const QLower = Math.exp(lnQLower);
      const QUpper = Math.exp(lnQUpper);

      const I2LowerCalc = QLower > df ? ((QLower - df) / QLower) * 100 : 0;
      const I2UpperCalc = QUpper > df ? ((QUpper - df) / QUpper) * 100 : 0;

      return {
        I2,
        lower: Math.max(0, Math.min(I2LowerCalc, I2UpperCalc)),
        upper: Math.min(100, Math.max(I2LowerCalc, I2UpperCalc)),
        Q,
        df,
        method: 'Q-profile (log-transform)'
      };
    },

    // Weighted mean and variance
    weightedMean(values, weights) {
      if (!values.length || !weights.length) return { mean: 0, variance: Infinity };
      const sumW = weights.reduce((a, b) => a + b, 0);
      if (sumW < 1e-10) return { mean: 0, variance: Infinity };
      const mean = values.reduce((s, v, i) => s + weights[i] * v, 0) / sumW;
      const variance = 1 / sumW;
      return { mean, variance, se: Math.sqrt(variance), sumW };
    },

    // Cochran's Q statistic
    cochraneQ(effects, variances) {
      const weights = variances.map(v => v > 0 ? 1 / v : 0);
      const { mean, sumW } = this.weightedMean(effects, weights);
      return weights.reduce((Q, w, i) => Q + w * Math.pow(effects[i] - mean, 2), 0);
    }
  };



'''

if orphaned_code in content:
    content = content.replace(orphaned_code, '\n\n')
    print('Removed orphaned code block (lines 328-397)')
else:
    print('Orphaned code pattern not found exactly')
    # Try to find partial matches
    if 'catch (e) {\n      console.warn(\'Method execution failed' in content:
        print('  Found partial: orphaned catch block')
    if 'const I2LowerCalc = QLower > df' in content:
        print('  Found partial: duplicate I² calculation')

with open('app.js', 'w', encoding='utf-8') as f:
    f.write(content)

print(f'app.js size: {len(content)} chars')
