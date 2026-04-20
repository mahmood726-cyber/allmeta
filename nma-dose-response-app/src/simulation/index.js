/**
 * NMA Dose Response Studio - Simulation Module
 * Collection of simulation-based methods for power analysis and validation
 */

// Simulation-Based Power Analysis
export { SimulationPowerAnalysis, default as PowerAnalysis } from './power-analysis.js';

// Default export for convenience
import { SimulationPowerAnalysis } from './power-analysis.js';

export default {
  SimulationPowerAnalysis
};
