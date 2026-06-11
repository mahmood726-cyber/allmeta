"""Master orchestrator for the registry-native synthesis system. Runs the pipeline stages in
dependency order, skipping any whose output already exists (use --force to re-run all). AACT-dependent
stages run from the aact-kit dir; Bayesian stages use the compiled nutpie backend.

Usage: python run_all.py [--force] [--fast]   (--fast skips the slow Bayesian/AACT-load stages)
"""
import sys, subprocess, time, os, re

HERE = r'C:/Projects/glp1-doseresp-nma/glp1-obesity-mbnma'
AACT = r'C:/Projects/aact-kit'
FORCE = '--force' in sys.argv
FAST = '--fast' in sys.argv

# (stage, script, cwd, output-file-to-skip-on, slow?)
STAGES = [
    ('1 discover',            'discovery.py',                 AACT, 'candidates.csv',           True),
    ('2 extract',             'extract_full.py',              AACT, 'arms_full.csv',            True),
    ('4a synthesize (freq)',  'fit_network.py',               HERE, 'ranking.json',             False),
    ('4b synthesize (NUTS)',  'pymc_onestep.py',              HERE, 'onestep_ranking.json',     True),
    ('5 completeness',        'run_medline_compare.py',       AACT, 'medline_compare.csv',      True),
    ('5b multi-strategy',     'fix1_medline_multistrategy.py', AACT, 'medline_multistrategy.json', True),
    ('6 transitivity',        'workstream_C_transitivity.py', AACT, 'transitivity.csv',         True),
    ('6b population',         None,                           None, 'population_conditions.csv', True),  # produced inline; see commit history
    ('6c robustness',         'workstream_D_robustness.py',   HERE, 'robustness.json',          False),
    ('7 benefit-risk',        'workstream_H_benefitrisk.py',  AACT, 'benefit_risk.json',        True),
    ('8a transport (Bayes)',  'pymc_bayesian_transport.py',   HERE, 'bayesian_transport.json',  True),
    ('8b agent-gamma',        'pymc_agent_gamma.py',          HERE, 'agent_gamma_transport.json', True),
    ('8c BMI modifier',       'workstream_bmi.py',            HERE, 'bmi_modifier.json',         False),
    ('8d transport atlas',    'workstream_transport_atlas.py', HERE, 'transport_atlas.json',     False),
    ('8e obese-subset atlas', 'workstream_obese_subset.py',   HERE, 'transport_atlas_obese.json', False),
    ('9a transport validate', 'fix2_transport_validation.py', HERE, 'transport_validation.json', False),
    ('9b joint sensitivity',  'fix3_joint_sensitivity.py',    HERE, 'transport_joint_sensitivity.json', False),
    ('10 synthesis',          'workstream_synthesis.py',      AACT, 'synthesis.json',           True),
    ('11 report',             'build_continuous_report.py',   HERE, 'continuous_report.html',   False),
    # --- transport (needed by HTA/CNMA/GRADE) ---
    ('8f transport v2 (NUTS)', 'pymc_transport_v2.py',        HERE, 'transport_v2.json',        True),
    # --- wide-gap, clinician-facing methods ---
    ('W1 component NMA',      'cnma_incretin.py',             HERE, 'cnma_incretin.json',       False),
    ('W3 joint benefit-risk', 'joint_benefit_risk.py',        HERE, 'joint_benefit_risk.json',  False),
    ('W4 registry pub-bias',  'registry_pubbias.py',          HERE, 'registry_pubbias.json',    False),
    ('W2a harvest CVOT wt',   'harvest_cvot_weight.py',       AACT, 'cvot_weight_outcomes.csv',  True),
    ('W2b surrogate (k=6)',   'surrogate_validation.py',      AACT, 'surrogate_validation.json', True),
    ('W2c harvest class wt',  'harvest_class_weight.py',      AACT, 'class_surrogate_pairs.csv', True),
    ('W2d surrogate (class)', 'extend_surrogate.py',          HERE, 'extend_surrogate.json',    False),
    ('W5 TSA + pipeline',     'trial_sequential.py',          AACT, 'trial_sequential.json',     True),
    # --- HTA integrator ---
    ('H1 HTA network MCDA',   'hta_mcda.py',                  HERE, 'hta_mcda.json',            False),
    ('H2 HTA EVPPI handoff',  'hta_evppi_handoff.js',         HERE, 'hta_evppi.json',           False),
    # --- exact contrast + league (NUTS; league reuses nma_draws.npz) ---
    ('N1 exact contrast',     'nma_contrast.py',              HERE, 'nma_contrast.json',        True),
    ('N2 league table',       'nma_league.py',                HERE, 'nma_league.json',          True),
    # --- guideline chain (GRADE -> CINeMA -> exports) ---
    ('G0 GRADE inputs',       'grade_inputs.py',              HERE, 'grade_inputs.json',        False),
    ('G1 GRADE certainty',    'grade_recommendation.js',      HERE, 'grade_recommendation.json', False),
    ('G2 CINeMA confidence',  'cinema_confidence.py',         HERE, 'cinema_confidence.json',   False),
    ('G3 GRADEpro/SoF export', 'grade_export.py',             HERE, 'grade_export.html',        False),
    ('G4 league export',      'nma_league_export.py',         HERE, 'nma_league.html',          False),
    ('G4b decision sensitivity', 'decision_sensitivity.py',   HERE, 'decision_sensitivity.json', False),
    ('G5 guideline dashboard', 'dashboard.py',                HERE, 'dashboard.html',           False),
]

print('Registry-native synthesis system — orchestrator')
print(f'(force={FORCE}, fast={FAST})\n')
ok = skip = fail = 0
for name, script, cwd, out, slow in STAGES:
    outpath = os.path.join(HERE, out)
    if script is None:
        tag = 'OK' if os.path.exists(outpath) else 'MISSING (see commit history)'
        print(f'  [{name:22s}] {tag}'); (skip := skip + 1) if os.path.exists(outpath) else None
        continue
    if FAST and slow:
        print(f'  [{name:22s}] SKIP (--fast)'); skip += 1; continue
    if os.path.exists(outpath) and not FORCE:
        print(f'  [{name:22s}] cached -> {out}'); skip += 1; continue
    t0 = time.time()
    interp = ['node'] if script.endswith('.js') else [sys.executable]
    r = subprocess.run(interp + [os.path.join(HERE, script)], cwd=cwd,
                       capture_output=True, text=True, timeout=900)
    dt = time.time() - t0
    if r.returncode == 0 and os.path.exists(outpath):
        print(f'  [{name:22s}] RAN ok ({dt:.0f}s) -> {out}'); ok += 1
    else:
        print(f'  [{name:22s}] FAIL ({dt:.0f}s): {(r.stderr or "")[-160:].strip()}'); fail += 1

print(f'\nstages: {ok} ran, {skip} cached/skipped, {fail} failed')

# --- self-verification: pin the headline results (skip with --no-verify) ---
if '--no-verify' not in sys.argv:
    print('\nverifying headline results (pytest tests)...')
    v = subprocess.run([sys.executable, '-m', 'pytest', 'tests', '--tb=line', '-rN'], cwd=HERE,
                       capture_output=True, text=True, timeout=300)
    lines = (v.stdout or v.stderr or '').strip().splitlines()
    summary = next((l for l in reversed(lines) if re.search(r'passed|failed|error', l)), lines[-1] if lines else 'no output')
    print('  ' + summary.strip())
    if v.returncode != 0:
        print('  VERIFICATION FAILED — a headline result drifted from its pinned baseline. Investigate before citing.')
print('Human-attested layer (screening / RoB-2 / GRADE) runs in the RapidMeta dashboard (stage 12, GAP_CLOSURE.md).')
