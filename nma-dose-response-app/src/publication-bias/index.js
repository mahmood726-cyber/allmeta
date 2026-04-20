/**
 * NMA Dose Response Studio - Publication Bias Module
 * Collection of novel publication bias adjustment methods
 */

// IPW Publication Bias Adjustment
export { IPWPublicationBiasAdjustment, default as IPWAdjustment } from './ipw-adjustment.js';

// Default export for convenience
import { IPWPublicationBiasAdjustment } from './ipw-adjustment.js';

export default {
  IPWPublicationBiasAdjustment
};
