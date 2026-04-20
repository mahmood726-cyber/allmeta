// PRISMA-NMA Checklist Items (PRISMA Extension for Network Meta-Analyses)
const PRISMA_NMA_CHECKLIST = {
  title: { id: 1, section: 'Title', item: 'Identify the report as a systematic review incorporating a network meta-analysis', done: false },
  abstract_structured: { id: 2, section: 'Abstract', item: 'Provide a structured summary including objectives, data sources, eligibility criteria, participants, interventions, study appraisal and synthesis methods, results, limitations, conclusions', done: false },
  rationale: { id: 3, section: 'Introduction', item: 'Describe the rationale for the review in the context of what is already known, including why a network meta-analysis approach is justified', done: false },
  objectives: { id: 4, section: 'Introduction', item: 'Provide an explicit statement of questions being addressed with reference to PICOS and geometry of the network', done: false },
  protocol: { id: 5, section: 'Methods', item: 'Indicate if a review protocol exists and where it can be accessed', done: false },
  eligibility: { id: 6, section: 'Methods', item: 'Specify study characteristics and report characteristics used as criteria for eligibility', done: false },
  information_sources: { id: 7, section: 'Methods', item: 'Describe all information sources and date last searched', done: false },
  search: { id: 8, section: 'Methods', item: 'Present full electronic search strategy for at least one database', done: false },
  study_selection: { id: 9, section: 'Methods', item: 'State the process for selecting studies', done: false },
  data_collection: { id: 10, section: 'Methods', item: 'Describe method of data extraction from reports', done: false },
  data_items: { id: 11, section: 'Methods', item: 'List and define all variables for which data were sought', done: false },
  risk_of_bias: { id: 12, section: 'Methods', item: 'Describe methods used for assessing risk of bias of individual studies', done: false },
  summary_measures: { id: 13, section: 'Methods', item: 'State the principal summary measures (e.g., risk ratio, mean difference)', done: false },
  planned_synthesis: { id: 14, section: 'Methods', item: 'Describe the methods of handling data and combining results including measures of consistency', done: false },
  geometry: { id: 15, section: 'Methods', item: 'Describe methods used to explore the network geometry', done: false },
  inconsistency: { id: 16, section: 'Methods', item: 'Describe methods used to assess statistical inconsistency', done: false },
  risk_of_bias_network: { id: 17, section: 'Methods', item: 'Describe any assessment of risk of bias relating to the cumulative evidence', done: false },
  additional_analyses: { id: 18, section: 'Methods', item: 'Describe methods of additional analyses if done', done: false },
  study_selection_results: { id: 19, section: 'Results', item: 'Give numbers of studies screened, assessed for eligibility, and included with reasons for exclusions at each stage (PRISMA flow diagram)', done: false },
  study_characteristics: { id: 20, section: 'Results', item: 'For each study, present characteristics for which data were extracted', done: false },
  risk_of_bias_results: { id: 21, section: 'Results', item: 'Present data on risk of bias of each study', done: false },
  individual_results: { id: 22, section: 'Results', item: 'For all outcomes considered, present for each study simple summary data', done: false },
  synthesis_results: { id: 23, section: 'Results', item: 'Present results of each meta-analysis done including confidence/credible intervals and measures of consistency', done: false },
  network_geometry_results: { id: 24, section: 'Results', item: 'Present network graph and describe its geometry', done: false },
  inconsistency_results: { id: 25, section: 'Results', item: 'Present results of the assessment of inconsistency', done: false },
  additional_results: { id: 26, section: 'Results', item: 'Give results of additional analyses if done', done: false },
  summary_evidence: { id: 27, section: 'Discussion', item: 'Summarize main findings including strength of evidence for each main outcome; consider relevance to key groups', done: false },
  limitations: { id: 28, section: 'Discussion', item: 'Discuss limitations at study and outcome level, and at review level', done: false },
  conclusions: { id: 29, section: 'Discussion', item: 'Provide a general interpretation of results in context of other evidence, and implications for future research', done: false },
  funding: { id: 30, section: 'Funding', item: 'Describe sources of funding for the systematic review', done: false }
};

// CINeMA Framework Domains for Certainty of Evidence
const CINEMA_DOMAINS = {
  withinStudyBias: {
    name: 'Within-study bias',
    description: 'Risk of bias in the studies contributing to the comparison',
    levels: ['Low', 'Some concerns', 'High'],
    weight: 1
  },
  reportingBias: {
    name: 'Reporting bias',
    description: 'Risk of bias due to missing evidence',
    levels: ['Undetected', 'Suspected', 'Strongly suspected'],
    weight: 1
  },
  indirectness: {
    name: 'Indirectness',
    description: 'How applicable is the evidence to the research question',
    levels: ['No concerns', 'Some concerns', 'Major concerns'],
    weight: 1
  },
  imprecision: {
    name: 'Imprecision',
    description: 'Precision of the treatment effect estimate',
    levels: ['No concerns', 'Some concerns', 'Major concerns'],
    weight: 1
  },
  heterogeneity: {
    name: 'Heterogeneity',
    description: 'Variability in treatment effects across studies',
    levels: ['No concerns', 'Some concerns', 'Major concerns'],
    weight: 1
  },
  incoherence: {
    name: 'Incoherence',
    description: 'Statistical disagreement between direct and indirect evidence',
    levels: ['No concerns', 'Some concerns', 'Major concerns'],
    weight: 1
  }
};

// Assess CINeMA domain based on statistics
function assessCINeMADomain(domain, stats) {
  switch (domain) {
    case 'imprecision':
      // Based on CI width relative to effect
      if (!stats.ci || !stats.effect) return 'Some concerns';
      const ciWidth = stats.ci[1] - stats.ci[0];
      const relWidth = Math.abs(ciWidth / (stats.effect || 0.001));
      if (relWidth < 0.5) return 'No concerns';
      if (relWidth < 1.5) return 'Some concerns';
      return 'Major concerns';

    case 'heterogeneity':
      // Based on I-squared
      if (stats.I2 === undefined) return 'Some concerns';
      if (stats.I2 < 25) return 'No concerns';
      if (stats.I2 < 75) return 'Some concerns';
      return 'Major concerns';

    case 'incoherence':
      // Based on node-splitting p-value or Q statistic
      if (stats.inconsistencyP === undefined) return 'Some concerns';
      if (stats.inconsistencyP > 0.10) return 'No concerns';
      if (stats.inconsistencyP > 0.01) return 'Some concerns';
      return 'Major concerns';

    default:
      return 'Some concerns'; // Default conservative assessment
  }
}

// Compute overall certainty rating
function computeOverallCertainty(domainAssessments) {
  let score = 4; // Start at HIGH

  for (const [domain, level] of Object.entries(domainAssessments)) {
    if (level === 'High' || level === 'Major concerns' || level === 'Strongly suspected') {
      score -= 2; // Two-level downgrade
    } else if (level === 'Some concerns' || level === 'Suspected') {
      score -= 1; // One-level downgrade
    }
  }

  score = Math.max(1, Math.min(4, score));

  const ratings = { 1: 'Very Low', 2: 'Low', 3: 'Moderate', 4: 'High' };
  return {
    score,
    rating: ratings[score],
    symbol: '\u2B24'.repeat(score) + '\u25CB'.repeat(4 - score) // Filled + empty circles
  };
}

// Generate PRISMA-NMA checklist as markdown
function generatePRISMAChecklist(analysisData) {
  const checklist = JSON.parse(JSON.stringify(PRISMA_NMA_CHECKLIST));

  // Auto-check items based on available data
  if (analysisData.treatments && analysisData.treatments.length > 0) {
    checklist.geometry.done = true;
    checklist.network_geometry_results.done = true;
  }
  if (analysisData.pooledResult) {
    checklist.summary_measures.done = true;
    checklist.synthesis_results.done = true;
  }
  if (analysisData.modelFit) {
    checklist.planned_synthesis.done = true;
  }
  if (analysisData.tau2 !== undefined) {
    checklist.inconsistency.done = true;
    checklist.inconsistency_results.done = true;
  }

  // Generate markdown
  let md = '# PRISMA-NMA Checklist\n\n';
  md += '| Section | Item | Reported | Page |\n';
  md += '|---------|------|----------|------|\n';

  for (const [key, item] of Object.entries(checklist)) {
    const check = item.done ? '\u2713' : '\u2717';
    md += `| ${item.section} | ${item.item} | ${check} | |\n`;
  }

  return md;
}

// Compute prediction interval for random-effects meta-analysis
function computePredictionInterval(effect, se, tau2, k, alpha = 0.05) {
  if (k < 3) {
    return { lower: NaN, upper: NaN, warning: 'Prediction interval requires at least 3 studies' };
  }

  // Prediction interval variance = SE^2 + tau^2
  const predVar = se * se + tau2;
  const predSE = Math.sqrt(predVar);

  // Use t-distribution with k-2 degrees of freedom
  const df = k - 2;
  const tCrit = tQuantile(1 - alpha / 2, df);

  return {
    lower: effect - tCrit * predSE,
    upper: effect + tCrit * predSE,
    df: df,
    predSE: predSE
  };
}

// Node-splitting for inconsistency assessment
function performNodeSplitting(studies, comparison) {
  // Separate direct and indirect evidence
  const directStudies = studies.filter(s =>
    (s.treatment1 === comparison[0] && s.treatment2 === comparison[1]) ||
    (s.treatment1 === comparison[1] && s.treatment2 === comparison[0])
  );

  if (directStudies.length === 0) {
    return {
      direct: NaN,
      indirect: NaN,
      difference: NaN,
      pValue: NaN,
      message: 'No direct evidence for this comparison'
    };
  }

  // Direct estimate (simple pooling)
  let sumW = 0, sumWY = 0;
  for (const s of directStudies) {
    const w = 1 / (s.se * s.se);
    const effect = s.treatment1 === comparison[0] ? s.effect : -s.effect;
    sumW += w;
    sumWY += w * effect;
  }
  const directEffect = sumWY / sumW;
  const directVar = 1 / sumW;

  // For indirect, would need full network solution excluding direct
  // Simplified: return direct only with warning
  return {
    direct: directEffect,
    directSE: Math.sqrt(directVar),
    directCI: [directEffect - 1.96 * Math.sqrt(directVar), directEffect + 1.96 * Math.sqrt(directVar)],
    indirect: NaN,
    indirectSE: NaN,
    difference: NaN,
    pValue: NaN,
    nDirect: directStudies.length,
    message: 'Full node-splitting requires network meta-analysis model'
  };
}

// Comparison-adjusted funnel plot data preparation
function prepareComparisonAdjustedFunnel(studies, reference) {
  const plotData = [];

  for (const study of studies) {
    let effect = study.effect;
    // Adjust sign so all comparisons are vs reference
    if (study.treatment2 === reference) {
      effect = -effect;
    }

    plotData.push({
      x: effect,
      y: 1 / study.se,
      study: study.study,
      comparison: `${study.treatment1} vs ${study.treatment2}`
    });
  }

  return plotData;
}

// Export functions by adding to window or returning
if (typeof window !== 'undefined') {
  window.PRISMA_NMA_CHECKLIST = PRISMA_NMA_CHECKLIST;
  window.CINEMA_DOMAINS = CINEMA_DOMAINS;
  window.assessCINeMADomain = assessCINeMADomain;
  window.computeOverallCertainty = computeOverallCertainty;
  window.generatePRISMAChecklist = generatePRISMAChecklist;
  window.computePredictionInterval = computePredictionInterval;
  window.performNodeSplitting = performNodeSplitting;
  window.prepareComparisonAdjustedFunnel = prepareComparisonAdjustedFunnel;
}
