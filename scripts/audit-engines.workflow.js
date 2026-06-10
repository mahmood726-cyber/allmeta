export const meta = {
  name: 'allmeta-engine-audit',
  description: 'Adversarially audit allmeta shared numerical engines for residual statistical/numerical defects',
  phases: [
    { title: 'Audit', detail: 'one finder per shared numerical engine, grounded in the gotcha rules' },
    { title: 'Verify', detail: 'diverse-lens skeptics try to refute each candidate finding' },
  ],
}

const REPO = 'C:/Projects/allmeta'

// The genuinely-numerical shared engines (UI/IO/schema modules excluded).
const ENGINES = [
  'ma-core', 'stats-qt', 'heterogeneity-ci', 'egger', 'trimfill', 'evalue',
  'poth', 'uwls', 'cluster-deff', 'permutest', 'sequential-ma', 'multiplicative-nma',
  'location-scale', 'rare-events-glmm', 'rve', 'dose-response', 'dta-bivariate',
  'multi-outcome-ma', 'multi-outcome-nma', 'selmodel', 'bma-tau', 'nma-meta-regression',
  'cross-network-synthesis', 'everything-model', 'multivariate-ma', 'multilevel-reml',
  'network-bias-adjust', 'spec-collapse', 'personalised-te', 'cross-design', 'doi-lfk',
  'fragility',
]

// Compact, project-specific gotcha checklist (from advanced-stats.md + lessons.md).
const GOTCHAS = `
STATISTICAL GOTCHAS (check the engine against EVERY relevant one; these are mistake-prevention rules, not all will apply):
- DL bias: never use DerSimonian-Laird for k<10 as the only estimator — REML/PM should be available.
- HKSJ floor: if Q < k-1, HKSJ narrows CI below DL — must floor at max(1, Q/(k-1)).
- HKSJ df: use qt(alpha/2, k-1) NOT qnorm. t-distribution matters when k<30.
- OR->SMD constant: sqrt(3)/pi ~= 0.5513, NOT sqrt(3/pi).
- Fisher z variance: 1/(n-3) exact — not n-2. Clamp r to [-0.9999,0.9999] before atanh.
- Log scale: pool logRR/logOR/logHR then back-transform; natural-scale RE = Simpson's paradox.
- Zero cells: add 0.5 ONLY if >=1 cell is zero (conditional). Unconditional correction biases OR->1.
- PI df: Cochrane v6.5 uses t_{k-1}*sqrt(tau2+SE^2); IntHout t_{k-2}. allmeta standard = t_{k-1}. Undefined for k<3.
- DOR = exp(mu1 + mu2), NOT mu1 - mu2 (DTA).
- SROC sign: logit(Spec) = -logit(FPR); sign flips on conversion.
- Bivariate prediction region uses sqrt(chi2_{alpha,2}), not univariate z.
- HSROC AUC: normalCDF (Phi), NOT logistic.
- Clopper-Pearson: qbeta(alpha/2, x, n-x+1) — the alpha/2 IS correct (agents false-flag this).
- logit(0)/logit(1): clamp to [1e-10, 1-1e-10]. NPD matrix: nearPD (Higham), not eigenvalue clamp.
- Egger: df = k-2; low power k<10. Trim-fill: sensitivity only.
- PET-PEESE: PET first, switch to PEESE only if PET rejects null (conditional).
- SUCRA != effect size; POTH<0.5 => hierarchy non-informative.
- Multi-arm NMA: off-diagonal covariance = tau^2/2 (shared control).
- Design effect REDUCES N_eff (N/DEFF), not inflates.
- RMST: pool differences not ratios; state tau*.
- Fragility Index: modify ONE arm only.
- O'Brien-Fleming: z_k = z_alpha / sqrt(t_k). TSA futility must be non-binding if ignorable.
- Numerical edge cases: k=1, k=2, tau2=0, empty input, all-equal yi, divide-by-zero in weights/Q/I2.
- Float === comparisons; || dropping legitimate 0 (use ?? for numeric); parseFloat(x)||null drops 0.0.
`

phase('Audit')

const FINDINGS_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    engine: { type: 'string' },
    summary: { type: 'string', description: 'one-line verdict: clean, or N issues' },
    findings: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          title: { type: 'string' },
          file: { type: 'string', description: 'repo-relative path, e.g. shared/ma-core.js' },
          line: { type: 'string', description: 'line number or range' },
          severity: { type: 'string', enum: ['high', 'medium', 'low'] },
          rule: { type: 'string', description: 'which gotcha/category it maps to' },
          bug: { type: 'string', description: 'precise description of the defect with the offending expression' },
          fix: { type: 'string', description: 'concrete corrected code or change' },
          confidence: { type: 'number', description: '0-1 self-rated confidence it is a real bug' },
        },
        required: ['title', 'file', 'line', 'severity', 'rule', 'bug', 'fix', 'confidence'],
      },
    },
  },
  required: ['engine', 'summary', 'findings'],
}

const VERDICT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    refuted: { type: 'boolean', description: 'true if this is NOT a real bug (false positive)' },
    reason: { type: 'string' },
    corrected_fix: { type: 'string', description: 'if real, the fix you would actually apply (may refine the original)' },
  },
  required: ['refuted', 'reason'],
}

const LENSES = [
  { key: 'math', prompt: 'the MATHEMATICAL-CORRECTNESS lens: derive the correct formula from first principles and compare. Many flagged "bugs" are the code being right and the reviewer misremembering the formula (DOR, Clopper-Pearson alpha/2, Fisher z 1/(n-3) are classic false-flags).' },
  { key: 'rparity', prompt: 'the R-PARITY lens: the engine header documents a metafor/meta/netmeta/mada baseline it claims to match to ~1e-6. Check whether the claimed bug would actually break that documented parity. If the parity test exists and passes, the "bug" is likely a false positive.' },
  { key: 'fp', prompt: 'the FALSE-POSITIVE-SKEPTIC lens: assume the finding is wrong and try hard to prove it. Check for upstream guards (clamps, early returns, k<3 checks), conditional branches, and whether the "offending" line is actually reachable with the inputs described.' },
]

const audited = await pipeline(
  ENGINES,
  // Stage 1: find candidate defects in one engine.
  (name) => agent(
    `You are auditing ONE numerical engine module in the allmeta evidence-synthesis suite for residual correctness defects.

File: ${REPO}/shared/${name}.js
Read it in full (it is small, <600 lines). Also read its test/baseline if present: search ${REPO}/tests and ${REPO}/hub/shared/tests for "${name}".

These engines are already R-validated (most have a metafor/meta/netmeta/mada parity baseline in the header comment). So OBVIOUS errors are unlikely. Hunt for SUBTLE residual defects ONLY:
- wrong constant / wrong degrees of freedom / wrong sign on a transform
- a missing edge-case guard (k=1, k=2, tau2=0, zero cells, empty input, all-equal effects, divide-by-zero)
- a conditional-correction applied unconditionally (or vice versa)
- a JS numeric trap: || dropping a legitimate 0, float ===, parseFloat||null dropping 0.0, off-by-one
- documented-vs-implemented drift (the header claims method X, the code does Y)

${GOTCHAS}

Be RIGOROUS and HONEST. If the engine is correct, return an empty findings array with summary "clean". Do NOT invent issues to look productive — a false finding wastes downstream effort. Report at most the 3 strongest candidates. For each, give the exact line, the offending expression, why it is wrong, and the concrete fix. Self-rate confidence honestly.`,
    { label: `audit:${name}`, phase: 'Audit', schema: FINDINGS_SCHEMA }
  ),
  // Stage 2: adversarially verify each finding with 3 diverse-lens skeptics.
  (result, name) => {
    if (!result || !result.findings || result.findings.length === 0) return []
    return parallel(
      result.findings.map((f) => () =>
        parallel(
          LENSES.map((lens) => () =>
            agent(
              `You are adversarially verifying a claimed defect in an allmeta numerical engine, through ${lens.prompt}

Engine file: ${REPO}/shared/${f.file.replace(/^.*shared\//, 'shared/') || `shared/${name}.js`}
Read the file (and any parity test for "${name}" under ${REPO}/tests or ${REPO}/hub/shared/tests) before judging.

CLAIMED DEFECT
  title: ${f.title}
  location: ${f.file}:${f.line}
  rule/category: ${f.rule}
  bug: ${f.bug}
  proposed fix: ${f.fix}

${GOTCHAS}

Decide: is this a REAL bug, or a false positive? Default to refuted=true if you are not convinced — the cost of a false fix to a validated engine is high. If real, provide the fix you would actually apply.`,
              { label: `verify:${name}:${lens.key}`, phase: 'Verify', schema: VERDICT_SCHEMA }
            )
          )
        ).then((verdicts) => {
          const v = verdicts.filter(Boolean)
          const refutes = v.filter((x) => x.refuted).length
          const real = refutes < 2 // survives if fewer than 2 of 3 lenses refute
          const corrected = v.find((x) => !x.refuted && x.corrected_fix)?.corrected_fix
          return { ...f, engine: name, verdict: { real, refutes, total: v.length, corrected_fix: corrected || f.fix, reasons: v.map((x) => x.reason) } }
        })
      )
    )
  }
)

const all = audited.flat().filter(Boolean)
const confirmed = all.filter((f) => f.verdict && f.verdict.real)
log(`Audit complete: ${all.length} candidate findings, ${confirmed.length} survived adversarial verification`)

return {
  totalCandidates: all.length,
  confirmed: confirmed.sort((a, b) => {
    const sev = { high: 0, medium: 1, low: 2 }
    return sev[a.severity] - sev[b.severity]
  }),
  refuted: all.filter((f) => !(f.verdict && f.verdict.real)).map((f) => ({ engine: f.engine, title: f.title, refutes: f.verdict?.refutes })),
}
