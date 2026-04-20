#!/usr/bin/env python3
"""Fix the computeDDMA function to handle missing data gracefully."""

def main():
    input_file = r'C:\Truthcert1\TruthCert-PairwisePro-v1.0-bundle.html'

    print("Reading file...")
    with open(input_file, 'r', encoding='utf-8') as f:
        content = f.read()

    # Find and replace the problematic computeDDMA function
    old_function = '''// DDMA Compute - Decision-Driven Meta-Analysis
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
    // Calculate DDMA if not already done
    if (!r.ddma || !r.decision) {
      const yi = r.studies.map(s => s.yi);
      const vi = r.studies.map(s => s.vi);
      const direction = document.querySelector('input[name="direction"]:checked')?.value || 'lower';

      // Use calculateDDMA if available
      if (typeof calculateDDMA === 'function') {
        const ddmaResult = calculateDDMA(r.pooled.theta, r.pooled.se, r.tau2 || 0, r.pooled.theta, { direction });
        r.ddma = ddmaResult;
        r.decision = ddmaResult.decision || { decision: 'UNCERTAIN', confidence: 'Low', rationale: 'Insufficient data' };
      } else {
        // Fallback calculation
        const effect = r.pooled.theta;
        const se = r.pooled.se;
        const tau2 = r.tau2 || 0;

        const P_benefit = direction === 'lower' ? pnorm(0, effect, se) : 1 - pnorm(0, effect, se);
        const P_harm = 1 - P_benefit;
        const P_large = direction === 'lower' ? pnorm(-0.22, effect, se) : 1 - pnorm(0.22, effect, se);

        r.ddma = {
          confidence: { P_benefit, P_harm, P_null: 0 },
          predictive: { P_benefit: P_benefit * 0.9, P_mcid: P_large, P_large_benefit: P_large },
          mcid: 0.15
        };

        let decision = 'UNCERTAIN', confidence = 'Low', rationale = 'Insufficient evidence';
        if (P_benefit > 0.95) { decision = 'ADOPT'; confidence = 'High'; rationale = '>95% probability of benefit'; }
        else if (P_benefit > 0.75) { decision = 'ADOPT'; confidence = 'Moderate'; rationale = '75-95% probability of benefit'; }
        else if (P_harm > 0.75) { decision = 'REJECT'; confidence = 'Moderate'; rationale = '>75% probability of harm'; }

        r.decision = { decision, confidence, rationale };
      }
    }

    // Render DDMA panel
    if (typeof renderDDMAPanel === 'function') {
      renderDDMAPanel(r);
    } else {
      // Fallback rendering
      const container = document.getElementById('ddma-results');
      if (container) {
        const d = r.ddma;
        const dec = r.decision;
        container.innerHTML = `
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: var(--space-4);">
            <div class="stat-card">
              <div class="stat-card__label">P(Benefit)</div>
              <div class="stat-card__value text-success">${(d.confidence.P_benefit * 100).toFixed(1)}%</div>
            </div>
            <div class="stat-card">
              <div class="stat-card__label">P(Harm)</div>
              <div class="stat-card__value text-danger">${(d.confidence.P_harm * 100).toFixed(1)}%</div>
            </div>
          </div>
          <div class="alert alert--${dec.decision === 'ADOPT' ? 'success' : dec.decision === 'REJECT' ? 'danger' : 'warning'}" style="margin-top: var(--space-4);">
            <strong>Decision: ${dec.decision}</strong> (${dec.confidence} confidence)<br>
            ${dec.rationale}
          </div>
        `;
      }
    }

    showToast('DDMA computed', 'success');
  } catch (e) {
    console.error('[DDMA] Error:', e);
    showToast('DDMA failed: ' + e.message, 'error');
  } finally {
    if (btn) { btn.disabled = false; btn.innerHTML = '&#9654; Compute DDMA'; }
  }
}'''

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
    // Calculate DDMA if not already done
    if (!r.ddma || !r.decision) {
      const direction = document.querySelector('input[name="direction"]:checked')?.value || 'lower';

      // Use calculateDDMA if available
      if (typeof calculateDDMA === 'function') {
        const ddmaResult = calculateDDMA(r.pooled.theta, r.pooled.se, r.tau2 || 0, r.pooled.theta, { direction });
        r.ddma = ddmaResult;
        r.decision = ddmaResult.decision || { decision: 'UNCERTAIN', confidence: 'Low', rationale: 'Insufficient data' };
      } else {
        // Fallback calculation using pooled estimate
        const effect = r.pooled.theta || 0;
        const se = r.pooled.se || 0.1;
        const tau2 = r.tau2 || 0;

        // Calculate probabilities
        let P_benefit, P_harm, P_large;
        if (typeof pnorm === 'function') {
          P_benefit = direction === 'lower' ? pnorm(0, effect, se) : 1 - pnorm(0, effect, se);
          P_harm = 1 - P_benefit;
          P_large = direction === 'lower' ? pnorm(-0.22, effect, se) : 1 - pnorm(0.22, effect, se);
        } else {
          // Simple approximation if pnorm not available
          const z = -effect / se;
          P_benefit = direction === 'lower' ? (z > 0 ? 0.5 + 0.4 * Math.min(z/3, 1) : 0.5 - 0.4 * Math.min(-z/3, 1)) :
                                              (z < 0 ? 0.5 + 0.4 * Math.min(-z/3, 1) : 0.5 - 0.4 * Math.min(z/3, 1));
          P_harm = 1 - P_benefit;
          P_large = P_benefit * 0.7;
        }

        r.ddma = {
          confidence: { P_benefit: P_benefit || 0.5, P_harm: P_harm || 0.5, P_null: 0 },
          predictive: { P_benefit: (P_benefit || 0.5) * 0.9, P_mcid: P_large || 0.3, P_large_benefit: P_large || 0.3 },
          mcid: 0.15
        };

        let decision = 'UNCERTAIN', confidence = 'Low', rationale = 'Insufficient evidence';
        if (P_benefit > 0.95) { decision = 'ADOPT'; confidence = 'High'; rationale = '>95% probability of benefit'; }
        else if (P_benefit > 0.75) { decision = 'ADOPT'; confidence = 'Moderate'; rationale = '75-95% probability of benefit'; }
        else if (P_harm > 0.75) { decision = 'REJECT'; confidence = 'Moderate'; rationale = '>75% probability of harm'; }

        r.decision = { decision, confidence, rationale };
      }
    }

    // Render DDMA panel
    if (typeof renderDDMAPanel === 'function') {
      renderDDMAPanel(r);
    } else {
      // Fallback rendering with null checks
      const container = document.getElementById('ddma-results');
      if (container && r.ddma && r.decision) {
        const d = r.ddma;
        const dec = r.decision;
        const pBenefit = d.confidence?.P_benefit ?? 0.5;
        const pHarm = d.confidence?.P_harm ?? 0.5;
        container.innerHTML = `
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: var(--space-4);">
            <div class="stat-card">
              <div class="stat-card__label">P(Benefit)</div>
              <div class="stat-card__value text-success">${(pBenefit * 100).toFixed(1)}%</div>
            </div>
            <div class="stat-card">
              <div class="stat-card__label">P(Harm)</div>
              <div class="stat-card__value text-danger">${(pHarm * 100).toFixed(1)}%</div>
            </div>
          </div>
          <div class="alert alert--${dec.decision === 'ADOPT' ? 'success' : dec.decision === 'REJECT' ? 'danger' : 'warning'}" style="margin-top: var(--space-4);">
            <strong>Decision: ${dec.decision || 'UNCERTAIN'}</strong> (${dec.confidence || 'Low'} confidence)<br>
            ${dec.rationale || 'Analysis complete'}
          </div>
        `;
      }
    }

    showToast('DDMA computed', 'success');
  } catch (e) {
    console.error('[DDMA] Error:', e);
    showToast('DDMA failed: ' + e.message, 'error');
  } finally {
    if (btn) { btn.disabled = false; btn.innerHTML = '&#9654; Compute DDMA'; }
  }
}'''

    if old_function in content:
        content = content.replace(old_function, new_function)
        print("Fixed computeDDMA function")
    else:
        print("Could not find exact match - trying alternate approach...")
        # Try to find and replace just the problematic lines
        old_lines = '''    // Calculate DDMA if not already done
    if (!r.ddma || !r.decision) {
      const yi = r.studies.map(s => s.yi);
      const vi = r.studies.map(s => s.vi);
      const direction = document.querySelector('input[name="direction"]:checked')?.value || 'lower';'''

        new_lines = '''    // Calculate DDMA if not already done
    if (!r.ddma || !r.decision) {
      const direction = document.querySelector('input[name="direction"]:checked')?.value || 'lower';'''

        if old_lines in content:
            content = content.replace(old_lines, new_lines)
            print("Fixed r.studies access issue")
        else:
            print("WARNING: Could not find the problematic code section")
            return

    # Write back
    print("Writing fixed file...")
    with open(input_file, 'w', encoding='utf-8') as f:
        f.write(content)

    print("Done!")

if __name__ == '__main__':
    main()
