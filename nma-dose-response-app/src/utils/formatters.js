/**
 * NMA Dose Response Studio - Formatters Module
 * Number formatting utilities with null-safety and statistical conventions
 */

// Cached number formatters for performance (Intl.NumberFormat instances)
export const numFmt = {
  int: new Intl.NumberFormat('en', { maximumFractionDigits: 0 }),
  dec2: new Intl.NumberFormat('en', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
  dec3: new Intl.NumberFormat('en', { minimumFractionDigits: 3, maximumFractionDigits: 3 }),
  dec4: new Intl.NumberFormat('en', { minimumFractionDigits: 4, maximumFractionDigits: 4 }),
  pct: new Intl.NumberFormat('en', { style: 'percent', minimumFractionDigits: 1 }),

  formatEffect: (n) => n == null || isNaN(n) ? 'NA' : numFmt.dec3.format(n),
  formatSE: (n) => n == null || isNaN(n) ? 'NA' : numFmt.dec4.format(n),
  formatPct: (n) => n == null || isNaN(n) ? 'NA' : (n * 100).toFixed(1) + '%',
  formatP: (n) => n == null || isNaN(n) ? 'NA' : n < 0.001 ? '<0.001' : numFmt.dec3.format(n)
};

// Safe formatting utilities to prevent errors on undefined values
export const safeFormat = {
  toFixed(val, digits = 3) {
    if (val == null || typeof val !== 'number' || isNaN(val)) return 'N/A';
    return val.toFixed(digits);
  },

  percent(val, digits = 1) {
    if (val == null || typeof val !== 'number' || isNaN(val)) return 'N/A';
    return (val * 100).toFixed(digits) + '%';
  },

  ci(lower, upper, digits = 3) {
    const l = this.toFixed(lower, digits);
    const u = this.toFixed(upper, digits);
    return `[${l}, ${u}]`;
  },

  setText(el, text) {
    if (el && el.textContent !== undefined) {
      el.textContent = text;
    }
  }
};

/**
 * Format number with appropriate precision based on magnitude
 * @param {number} value - The value to format
 * @returns {string} Formatted number string
 */
export function formatNumber(value) {
  if (!Number.isFinite(value)) return "-";
  const abs = Math.abs(value);
  if (abs >= 1000) return value.toFixed(1);
  if (abs >= 10) return value.toFixed(2);
  return value.toFixed(3);
}

/**
 * Format confidence interval range
 * @param {number} low - Lower bound
 * @param {number} high - Upper bound
 * @returns {string} Formatted CI string
 */
export function formatCI(low, high) {
  if (!Number.isFinite(low) || !Number.isFinite(high)) return "-";
  return `${formatNumber(low)} to ${formatNumber(high)}`;
}

/**
 * Format probability/percentage value
 * @param {number} value - Probability value (0-1)
 * @returns {string} Formatted percentage string
 */
export function formatProbability(value) {
  if (!Number.isFinite(value)) return "-";
  return `${(value * 100).toFixed(1)}%`;
}

/**
 * Format p-value according to statistical conventions with significance indicators
 * @param {number} p - P-value
 * @returns {string} Formatted p-value with significance stars
 */
export function formatPValue(p) {
  if (!Number.isFinite(p)) return "N/A";
  if (p < 0.001) return "p < 0.001***";
  if (p < 0.01) return `p = ${p.toFixed(3)}**`;
  if (p < 0.05) return `p = ${p.toFixed(3)}*`;
  if (p < 0.10) return `p = ${p.toFixed(3)}†`;
  return `p = ${p.toFixed(3)}`;
}

/**
 * Get significance level indicator from p-value
 * @param {number} p - P-value
 * @returns {string} Significance indicator (***, **, *, †, or empty)
 */
export function getSignificanceLevel(p) {
  if (!Number.isFinite(p)) return "";
  if (p < 0.001) return "***";
  if (p < 0.01) return "**";
  if (p < 0.05) return "*";
  if (p < 0.10) return "†";
  return "";
}

/**
 * Format dose value for display
 * @param {number} dose - Dose value
 * @returns {string} Formatted dose
 */
export function formatDose(dose) {
  if (!Number.isFinite(dose)) return "-";
  if (dose === 0) return "0";
  if (dose < 0.01 || dose >= 1000) {
    return dose.toExponential(2);
  }
  return formatNumber(dose);
}

/**
 * Format treatment effect for forest plots
 * @param {number} effect - Effect size
 * @param {number} se - Standard error
 * @returns {object} Object with formatted effect, SE, and CI
 */
export function formatEffectForDisplay(effect, se) {
  const ciLow = effect - 1.96 * se;
  const ciHigh = effect + 1.96 * se;
  return {
    effect: formatNumber(effect),
    se: formatNumber(se),
    ci: formatCI(ciLow, ciHigh)
  };
}

export default {
  numFmt,
  safeFormat,
  formatNumber,
  formatCI,
  formatProbability,
  formatPValue,
  getSignificanceLevel,
  formatDose,
  formatEffectForDisplay
};
