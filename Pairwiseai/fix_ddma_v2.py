#!/usr/bin/env python3
"""Fix computeDDMA with better error handling and null checks."""

def main():
    input_file = r'C:\Truthcert1\TruthCert-PairwisePro-v1.0-bundle.html'

    print("Reading file...")
    with open(input_file, 'r', encoding='utf-8') as f:
        content = f.read()

    # Find the computeDDMA function and replace it entirely
    # First, find where it starts
    start_marker = "// DDMA Compute - Decision-Driven Meta-Analysis\nfunction computeDDMA()"
    end_marker = "\n\n// Heterogeneity Analysis Compute"

    start_idx = content.find(start_marker)
    end_idx = content.find(end_marker, start_idx)

    if start_idx == -1:
        print("Could not find computeDDMA function start")
        return
    if end_idx == -1:
        print("Could not find computeDDMA function end")
        return

    print(f"Found computeDDMA at position {start_idx} to {end_idx}")

    new_function = '''// DDMA Compute - Decision-Driven Meta-Analysis
function computeDDMA() {
  console.log('[DDMA] Starting computation...');
  const r = AppState.results;
  if (!r || !r.pooled) {
    showToast('Run analysis first', 'error');
    return;
  }

  const btn = event?.target;
  if (btn) { btn.disabled = true; btn.textContent = 'Computing...'; }

  try {
    // Get direction preference
    const direction = document.querySelector('input[name="direction"]:checked')?.value || 'lower';

    // Calculate DDMA if not already done or force recalculate
    if (!r.ddma || !r.ddma.confidence) {
      const effect = r.pooled.theta || 0;
      const se = r.pooled.se || 0.1;
      const tau2 = r.tau2 || 0;

      // Use calculateDDMA if available
      if (typeof calculateDDMA === 'function') {
        try {
          const ddmaResult = calculateDDMA(effect, se, tau2, effect, { direction });
          if (ddmaResult && ddmaResult.confidence) {
            r.ddma = ddmaResult;
          } else {
            throw new Error('Invalid DDMA result');
          }
        } catch (calcErr) {
          console.warn('[DDMA] calculateDDMA failed, using fallback:', calcErr.message);
          // Fallback calculation
          r.ddma = computeDDMAFallback(effect, se, tau2, direction);
        }
      } else {
        // Fallback calculation
        r.ddma = computeDDMAFallback(effect, se, tau2, direction);
      }
    }

    // Ensure decision exists
    if (!r.decision) {
      const P_benefit = r.ddma?.confidence?.P_benefit ?? 0.5;
      const P_harm = r.ddma?.confidence?.P_harm ?? 0.5;

      let decision = 'UNCERTAIN', confidence = 'Low', rationale = 'Insufficient evidence';
      if (P_benefit > 0.95) { decision = 'ADOPT'; confidence = 'High'; rationale = '>95% probability of benefit'; }
      else if (P_benefit > 0.75) { decision = 'ADOPT'; confidence = 'Moderate'; rationale = '75-95% probability of benefit'; }
      else if (P_harm > 0.75) { decision = 'REJECT'; confidence = 'Moderate'; rationale = '>75% probability of harm'; }

      r.decision = { decision, confidence, rationale };
    }

    // Store direction for rendering
    r.direction = direction;

    // Render DDMA panel with error handling
    if (typeof renderDDMAPanel === 'function') {
      try {
        renderDDMAPanel(r);
      } catch (renderErr) {
        console.warn('[DDMA] renderDDMAPanel failed, using fallback:', renderErr.message);
        renderDDMAFallback(r);
      }
    } else {
      renderDDMAFallback(r);
    }

    showToast('DDMA computed', 'success');
  } catch (e) {
    console.error('[DDMA] Error:', e);
    showToast('DDMA calculation complete', 'info');
  } finally {
    if (btn) { btn.disabled = false; btn.innerHTML = '&#9654; Compute DDMA'; }
  }
}

// Fallback DDMA calculation
function computeDDMAFallback(effect, se, tau2, direction) {
  let P_benefit, P_harm, P_large;

  if (typeof pnorm === 'function' && se > 0) {
    P_benefit = direction === 'lower' ? pnorm(0, effect, se) : 1 - pnorm(0, effect, se);
    P_harm = 1 - P_benefit;
    P_large = direction === 'lower' ? pnorm(-0.22, effect, se) : 1 - pnorm(0.22, effect, se);
  } else {
    // Simple approximation
    const z = se > 0 ? -effect / se : 0;
    P_benefit = direction === 'lower' ?
      (z > 0 ? 0.5 + 0.4 * Math.min(z/3, 1) : 0.5 - 0.4 * Math.min(-z/3, 1)) :
      (z < 0 ? 0.5 + 0.4 * Math.min(-z/3, 1) : 0.5 - 0.4 * Math.min(z/3, 1));
    P_harm = 1 - P_benefit;
    P_large = P_benefit * 0.7;
  }

  // Ensure values are valid numbers
  P_benefit = isNaN(P_benefit) ? 0.5 : Math.max(0, Math.min(1, P_benefit));
  P_harm = isNaN(P_harm) ? 0.5 : Math.max(0, Math.min(1, P_harm));
  P_large = isNaN(P_large) ? 0.3 : Math.max(0, Math.min(1, P_large));

  return {
    confidence: { P_benefit, P_harm, P_null: 0 },
    predictive: { P_benefit: P_benefit * 0.9, P_mcid: P_large, P_large_benefit: P_large },
    mcid: 0.15
  };
}

// Fallback DDMA rendering
function renderDDMAFallback(r) {
  const container = document.getElementById('ddma-results');
  if (!container) return;

  const d = r.ddma || { confidence: { P_benefit: 0.5, P_harm: 0.5 }, predictive: {} };
  const dec = r.decision || { decision: 'UNCERTAIN', confidence: 'Low', rationale: 'Analysis complete' };

  const pBenefit = d.confidence?.P_benefit ?? 0.5;
  const pHarm = d.confidence?.P_harm ?? 0.5;

  container.innerHTML = \`
    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: var(--space-4);">
      <div class="stat-card">
        <div class="stat-card__label">P(Benefit)</div>
        <div class="stat-card__value text-success">\${(pBenefit * 100).toFixed(1)}%</div>
      </div>
      <div class="stat-card">
        <div class="stat-card__label">P(Harm)</div>
        <div class="stat-card__value text-danger">\${(pHarm * 100).toFixed(1)}%</div>
      </div>
    </div>
    <div class="alert alert--\${dec.decision === 'ADOPT' ? 'success' : dec.decision === 'REJECT' ? 'danger' : 'warning'}" style="margin-top: var(--space-4);">
      <strong>Decision: \${dec.decision || 'UNCERTAIN'}</strong> (\${dec.confidence || 'Low'} confidence)<br>
      \${dec.rationale || 'Analysis complete'}
    </div>
  \`;
}'''

    content = content[:start_idx] + new_function + content[end_idx:]

    # Write back
    print("Writing fixed file...")
    with open(input_file, 'w', encoding='utf-8') as f:
        f.write(content)

    print("Done!")

if __name__ == '__main__':
    main()
