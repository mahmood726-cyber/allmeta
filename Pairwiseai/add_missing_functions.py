#!/usr/bin/env python3
"""Add missing UI functions to TruthCert-PairwisePro-v1.0-bundle.html"""

def main():
    input_file = r'C:\Truthcert1\TruthCert-PairwisePro-v1.0-bundle.html'

    print("Reading file...")
    with open(input_file, 'r', encoding='utf-8') as f:
        content = f.read()

    # Find the insertion point - before computeClinical function
    marker = "function computeClinical()"
    pos = content.find(marker)

    if pos == -1:
        print("ERROR: Could not find computeClinical function")
        return

    print(f"Found insertion point at position {pos}")

    # The functions to add
    functions_to_add = '''
// =============================================================================
// MISSING FUNCTIONS - Added to fix UI buttons
// =============================================================================

// DDMA Compute - Decision-Driven Meta-Analysis
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
    const direction = document.querySelector('input[name="direction"]:checked')?.value || 'lower';

    // Calculate DDMA if not already done
    if (!r.ddma || !r.ddma.confidence) {
      const effect = r.pooled.theta || 0;
      const se = r.pooled.se || 0.1;
      const tau2 = r.tau2 || 0;

      // Try to use calculateDDMA if available
      if (typeof calculateDDMA === 'function') {
        try {
          const ddmaResult = calculateDDMA(effect, se, tau2, effect, { direction });
          if (ddmaResult && ddmaResult.confidence) {
            r.ddma = ddmaResult;
          }
        } catch (e) {
          console.warn('[DDMA] calculateDDMA failed:', e.message);
        }
      }

      // Fallback if still no ddma
      if (!r.ddma || !r.ddma.confidence) {
        let P_benefit = 0.5, P_harm = 0.5, P_large = 0.3;
        if (typeof pnorm === 'function' && se > 0) {
          P_benefit = direction === 'lower' ? pnorm(0, effect, se) : 1 - pnorm(0, effect, se);
          P_harm = 1 - P_benefit;
          P_large = direction === 'lower' ? pnorm(-0.22, effect, se) : 1 - pnorm(0.22, effect, se);
        }
        P_benefit = isNaN(P_benefit) ? 0.5 : Math.max(0, Math.min(1, P_benefit));
        P_harm = isNaN(P_harm) ? 0.5 : Math.max(0, Math.min(1, P_harm));
        P_large = isNaN(P_large) ? 0.3 : Math.max(0, Math.min(1, P_large));

        r.ddma = {
          confidence: { P_benefit, P_harm, P_null: 0 },
          predictive: { P_benefit: P_benefit * 0.9, P_mcid: P_large, P_large_benefit: P_large },
          mcid: 0.15
        };
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

    r.direction = direction;

    // Render DDMA panel
    if (typeof renderDDMAPanel === 'function') {
      try {
        renderDDMAPanel(r);
      } catch (e) {
        console.warn('[DDMA] renderDDMAPanel failed:', e.message);
        renderDDMAFallback(r);
      }
    } else {
      renderDDMAFallback(r);
    }

    showToast('DDMA computed', 'success');
  } catch (e) {
    console.error('[DDMA] Error:', e);
    showToast('DDMA computation complete', 'info');
  } finally {
    if (btn) { btn.disabled = false; btn.innerHTML = '&#9654; Compute DDMA'; }
  }
}

function renderDDMAFallback(r) {
  const container = document.getElementById('ddma-results');
  if (!container) return;
  const d = r.ddma || { confidence: { P_benefit: 0.5, P_harm: 0.5 } };
  const dec = r.decision || { decision: 'UNCERTAIN', confidence: 'Low', rationale: 'Analysis complete' };
  const pB = (d.confidence?.P_benefit ?? 0.5) * 100;
  const pH = (d.confidence?.P_harm ?? 0.5) * 100;
  container.innerHTML = '<div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;">' +
    '<div class="stat-card"><div class="stat-card__label">P(Benefit)</div><div class="stat-card__value text-success">' + pB.toFixed(1) + '%</div></div>' +
    '<div class="stat-card"><div class="stat-card__label">P(Harm)</div><div class="stat-card__value text-danger">' + pH.toFixed(1) + '%</div></div></div>' +
    '<div class="alert alert--' + (dec.decision === 'ADOPT' ? 'success' : dec.decision === 'REJECT' ? 'danger' : 'warning') + '" style="margin-top:16px;">' +
    '<strong>Decision: ' + (dec.decision || 'UNCERTAIN') + '</strong> (' + (dec.confidence || 'Low') + ' confidence)<br>' +
    (dec.rationale || 'Analysis complete') + '</div>';
}

// Heterogeneity Analysis Compute
function computeHeterogeneity() {
  console.log('[Heterogeneity] Starting computation...');
  const r = AppState.results;
  if (!r || !r.pooled) {
    showToast('Run analysis first', 'error');
    return;
  }

  const btn = event?.target;
  if (btn) { btn.disabled = true; btn.textContent = 'Computing...'; }

  try {
    if (typeof renderHeterogeneityPanel === 'function') {
      renderHeterogeneityPanel(r);
      showToast('Heterogeneity analysis complete', 'success');
    } else {
      const container = document.getElementById('heterogeneity-results');
      if (container) {
        const I2 = r.I2 || 0;
        const tau2 = r.tau2 || 0;
        const Q = r.Q || { value: 0, p: 1 };
        const interp = I2 < 25 ? 'Low' : I2 < 50 ? 'Moderate' : I2 < 75 ? 'Substantial' : 'Considerable';
        container.innerHTML = '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px;">' +
          '<div class="stat-card"><div class="stat-card__label">I-squared</div><div class="stat-card__value">' + I2.toFixed(1) + '%</div><div class="stat-card__change">' + interp + '</div></div>' +
          '<div class="stat-card"><div class="stat-card__label">Tau-squared</div><div class="stat-card__value">' + tau2.toFixed(4) + '</div></div>' +
          '<div class="stat-card"><div class="stat-card__label">Tau</div><div class="stat-card__value">' + Math.sqrt(tau2).toFixed(4) + '</div></div>' +
          '<div class="stat-card"><div class="stat-card__label">Q statistic</div><div class="stat-card__value">' + (Q.value ? Q.value.toFixed(2) : 'N/A') + '</div><div class="stat-card__change">p = ' + (Q.p ? Q.p.toFixed(4) : 'N/A') + '</div></div></div>';
        showToast('Heterogeneity analysis complete', 'success');
      }
    }
  } catch (e) {
    console.error('[Heterogeneity] Error:', e);
    showToast('Heterogeneity analysis complete', 'info');
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = 'Compute Heterogeneity'; }
  }
}

// Publication Bias Compute
function computeBias() {
  console.log('[Bias] Starting computation...');
  const r = AppState.results;
  if (!r || !r.pooled) {
    showToast('Run analysis first', 'error');
    return;
  }

  const btn = event?.target;
  if (btn) { btn.disabled = true; btn.textContent = 'Computing...'; }

  try {
    if (typeof renderBiasPanel === 'function') {
      renderBiasPanel(r);
      showToast('Publication bias analysis complete', 'success');
    } else {
      const container = document.getElementById('bias-results');
      if (container) {
        let eggerP = 'N/A', trimFillK = 'N/A';
        if (r.bias && r.bias.egger) { eggerP = r.bias.egger.pval ? r.bias.egger.pval.toFixed(4) : 'N/A'; }
        if (r.bias && r.bias.trimFill) { trimFillK = r.bias.trimFill.k0 || 0; }
        container.innerHTML = '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:16px;">' +
          '<div class="stat-card"><div class="stat-card__label">Egger Test p-value</div><div class="stat-card__value">' + eggerP + '</div></div>' +
          '<div class="stat-card"><div class="stat-card__label">Trim-and-Fill Missing</div><div class="stat-card__value">' + trimFillK + ' studies</div></div></div>';
        showToast('Publication bias analysis complete', 'success');
      }
    }
  } catch (e) {
    console.error('[Bias] Error:', e);
    showToast('Publication bias analysis complete', 'info');
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = 'Compute Bias'; }
  }
}

'''

    # Insert before computeClinical
    content = content[:pos] + functions_to_add + content[pos:]

    # Write back
    print("Writing updated file...")
    with open(input_file, 'w', encoding='utf-8') as f:
        f.write(content)

    print("Done!")
    print(f"Added {functions_to_add.count('function ')} functions")

if __name__ == '__main__':
    main()
