import re

# Read app.js
with open('app.js', 'r', encoding='utf-8') as f:
    content = f.read()

fixes = 0

# Fix the floating compareAll() method issue
old_pattern = """      if (cv < 0.1) return 'High agreement across models';
      if (cv < 0.3) return 'Moderate agreement';
      return 'Low agreement - interpret with caution';
    }
  }


  // ============================================================================
  // BEYOND R PART 2: ADDITIONAL ADVANCED METHODS
  // ============================================================================
    // compareAll() method - wrapper for handler compatibility
    compareAll() {
      const result = this.run();
      return {
        models: result.models ?? [],
        averagedEffect: result.averaged?.effect ?? result.bmaEffect ?? 0,
        averagedCI: result.averaged?.ci ?? [0, 0],
        bestModel: result.bestModel ?? null,
        converged: true
      };
    }
  }


  // ============================================================================
  // 11. WAAP-WLS (Weighted Average of Adequately Powered studies)"""

new_pattern = """      if (cv < 0.1) return 'High agreement across models';
      if (cv < 0.3) return 'Moderate agreement';
      return 'Low agreement - interpret with caution';
    }

    // compareAll() method - wrapper for handler compatibility
    compareAll() {
      const result = this.run();
      return {
        models: result.models ?? [],
        averagedEffect: result.averaged?.effect ?? result.modelAveraged ?? 0,
        averagedCI: result.averaged?.ci ?? [0, 0],
        bestModel: result.bestModel ?? null,
        converged: true
      };
    }
  }


  // ============================================================================
  // BEYOND R PART 2: ADDITIONAL ADVANCED METHODS
  // ============================================================================


  // ============================================================================
  // 11. WAAP-WLS (Weighted Average of Adequately Powered studies)"""

if old_pattern in content:
    content = content.replace(old_pattern, new_pattern, 1)
    fixes += 1
    print('Fixed SelectionModelComparison compareAll() placement')
else:
    print('Pattern not found - checking alternative patterns...')
    # Try to find and remove the floating method
    floating_method = """  // ============================================================================
  // BEYOND R PART 2: ADDITIONAL ADVANCED METHODS
  // ============================================================================
    // compareAll() method - wrapper for handler compatibility
    compareAll() {
      const result = this.run();
      return {
        models: result.models ?? [],
        averagedEffect: result.averaged?.effect ?? result.bmaEffect ?? 0,
        averagedCI: result.averaged?.ci ?? [0, 0],
        bestModel: result.bestModel ?? null,
        converged: true
      };
    }
  }"""

    if floating_method in content:
        content = content.replace(floating_method, """  // ============================================================================
  // BEYOND R PART 2: ADDITIONAL ADVANCED METHODS
  // ============================================================================""", 1)
        fixes += 1
        print('Removed floating compareAll() method')

        # Now add compareAll() to SelectionModelComparison properly
        old_class_end = """      return 'Low agreement - interpret with caution';
    }
  }


  // ============================================================================
  // BEYOND R PART 2"""
        new_class_end = """      return 'Low agreement - interpret with caution';
    }

    // compareAll() method - wrapper for handler compatibility
    compareAll() {
      const result = this.run();
      return {
        models: result.models ?? [],
        averagedEffect: result.averaged?.effect ?? result.modelAveraged ?? 0,
        averagedCI: result.averaged?.ci ?? [0, 0],
        bestModel: result.bestModel ?? null,
        converged: true
      };
    }
  }


  // ============================================================================
  // BEYOND R PART 2"""
        if old_class_end in content:
            content = content.replace(old_class_end, new_class_end, 1)
            fixes += 1
            print('Added compareAll() to SelectionModelComparison class')

# Write back
with open('app.js', 'w', encoding='utf-8') as f:
    f.write(content)

print(f'\nTotal fixes applied: {fixes}')
print(f'app.js size: {len(content)} chars')
