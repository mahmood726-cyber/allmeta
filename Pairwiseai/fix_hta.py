#!/usr/bin/env python3
"""Fix HTA module by adding missing calculateICER function for HTA."""

def main():
    input_file = r'C:\Truthcert1\TruthCert-PairwisePro-v1.0-bundle.html'

    print("Reading file...")
    with open(input_file, 'r', encoding='utf-8') as f:
        content = f.read()

    # The HTA module needs a specific ICER calculation that was removed
    # We'll add it as calculateHTAICER and update the call site

    # First, add the HTA-specific ICER function before runHTAAnalysis
    hta_icer_func = '''
// HTA-specific ICER calculation (different from generic calculateICER)
function calculateHTAICER(config, rrr) {
  const incrementalQALY = config.baselineRisk * rrr * config.qalyLoss;
  const incrementalCost = config.intervention.cost - config.comparator.cost;

  if (incrementalQALY <= 0 && incrementalCost <= 0) {
    return {
      value: null,
      incrementalCost: incrementalCost,
      incrementalQALY: incrementalQALY,
      dominated: false,
      inferior: true,
      interpretation: "Less effective and more costly (inferior)"
    };
  }
  if (incrementalQALY <= 0 && incrementalCost > 0) {
    return {
      value: null,
      incrementalCost: incrementalCost,
      incrementalQALY: incrementalQALY,
      dominated: true,
      inferior: false,
      interpretation: "More costly with no additional benefit (dominated)"
    };
  }
  if (incrementalQALY > 0 && incrementalCost <= 0) {
    return {
      value: 0,
      incrementalCost: incrementalCost,
      incrementalQALY: incrementalQALY,
      dominated: false,
      inferior: false,
      dominant: true,
      interpretation: "More effective and cost-saving (dominant)"
    };
  }

  const icer = incrementalCost / incrementalQALY;
  return {
    value: icer,
    incrementalCost: incrementalCost,
    incrementalQALY: incrementalQALY,
    dominated: false,
    inferior: false,
    dominant: false,
    interpretation: typeof formatCurrency === 'function' ? formatCurrency(icer) + " per QALY gained" : "$" + icer.toFixed(0) + " per QALY gained"
  };
}

'''

    # Find the insertion point - before runHTAAnalysis
    marker = "function runHTAAnalysis()"
    pos = content.find(marker)

    if pos == -1:
        print("ERROR: Could not find runHTAAnalysis function")
        return

    # Insert the HTA ICER function
    content = content[:pos] + hta_icer_func + content[pos:]
    print("Added calculateHTAICER function")

    # Now update the call to use the new function name
    old_call = "u = calculateICER(n, o)"
    new_call = "u = calculateHTAICER(n, o)"

    if old_call in content:
        content = content.replace(old_call, new_call)
        print("Updated call site to use calculateHTAICER")
    else:
        print("WARNING: Could not find the call site to update")
        # Try alternate pattern
        old_call2 = "calculateICER(n, o)"
        if old_call2 in content:
            content = content.replace(old_call2, "calculateHTAICER(n, o)", 1)
            print("Updated call site (alternate pattern)")

    # Write back
    print("Writing fixed file...")
    with open(input_file, 'w', encoding='utf-8') as f:
        f.write(content)

    print("Done!")

if __name__ == '__main__':
    main()
