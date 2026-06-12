"""Arm-level extractor: % change body weight from AACT (CT.gov mirror) for the
GLP-1/GIP obesity dose-response NMA prototype.

Output per arm: {nct, agent, dose_mg, n, mean_pct, se, var_of_mean, timepoint, estimand_note}
Reference arm: placebo, dose_mg = 0.

Design choices (honest):
- Prefer LEAST_SQUARES_MEAN (MMRM) primary % change in body weight at the primary
  treatment-period timepoint; fall back to MEAN.
- Exclude pooled-dose arms and responder-% outcomes; never fabricate a missing arm.
- var_of_mean = SE^2 when dispersion is Standard Error; = SD^2/n when Standard Deviation.
- Fail closed per NCT: if no usable weight outcome, record reason; do not guess.
"""
import io, sys, re, json
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
import pandas as pd
from aact_kit import load_table, location_from_path

LOC = location_from_path(r'C:/Users/mahmo/AACT/20260601_pipe-delimited-export.zip')

# Flagship obesity cohort — multi-dose dose-finding + pivotal, all post-2010 molecules.
COHORT = {
    'NCT04184622': 'SURMOUNT-1 (tirzepatide 5/10/15, obesity)',
    'NCT04657003': 'SURMOUNT-2 (tirzepatide 10/15, T2D+obesity)',
    'NCT04881760': 'Retatrutide ph2 obesity (1/4/8/12)',
    'NCT05051579': 'Orforglipron ph2 obesity (12/24/36/45)',
    'NCT02453711': 'Semaglutide ph2 obesity (0.05-0.4 daily)',
    'NCT03548935': 'STEP 1 (semaglutide 2.4, obesity)',
    'NCT03552757': 'STEP 2 (semaglutide 1.0/2.4, T2D)',
    'NCT03693430': 'STEP 5 (semaglutide 2.4, 2y)',
    'NCT04667377': 'SURMOUNT-3 (tirzepatide, obesity)',
    'NCT03987919': 'STEP 3 (semaglutide 2.4 + IBT)',
}

AGENTS = ['tirzepatide', 'semaglutide', 'retatrutide', 'orforglipron',
          'survodutide', 'mazdutide', 'cagrilintide']
NEG = ('not ', 'non', 'never', 'without')


def parse_arm(title):
    """Return (agent, dose_mg) from a result-group title. None if not a clean single arm."""
    t = (title or '').lower()
    if 'pooled' in t or '/' in t.replace('mg/', 'mg '):  # drop pooled-dose arms
        if 'pooled' in t:
            return None
    if 'placebo' in t:
        return ('placebo', 0.0)
    agent = next((a for a in AGENTS if a in t), None)
    if agent is None:
        return None
    # numeric dose immediately before 'mg' (avoid 'every 4 weeks' etc.)
    m = re.findall(r'(\d+(?:\.\d+)?)\s*mg', t)
    if not m:
        return None
    # maintenance dose = the largest mg token in a single-dose title (handles "starting at 2.5 ... 15 mg")
    dose = max(float(x) for x in m)
    return (agent, dose)


def _load_cohort():
    """Load each big table ONCE, filtered to the cohort NCTs (vs 10x per-NCT loads)."""
    ncts = list(COHORT)
    print('loading AACT tables (single pass)...', flush=True)
    outcomes = load_table('outcomes', location=LOC,
                          columns=['id', 'nct_id', 'outcome_type', 'title', 'time_frame', 'param_type', 'units'])
    outcomes = outcomes[outcomes['nct_id'].isin(ncts)].copy()
    om = load_table('outcome_measurements', location=LOC,
                    columns=['nct_id', 'outcome_id', 'ctgov_group_code', 'param_type',
                             'param_value_num', 'dispersion_type', 'dispersion_value_num'])
    om = om[om['nct_id'].isin(ncts)].copy()
    rg = load_table('result_groups', location=LOC,
                    columns=['nct_id', 'result_type', 'ctgov_group_code', 'title'])
    rg = rg[rg['nct_id'].isin(ncts)].copy()
    oc = load_table('outcome_counts', location=LOC,
                    columns=['nct_id', 'outcome_id', 'ctgov_group_code', 'units', 'count'])
    oc = oc[oc['nct_id'].isin(ncts)].copy()
    print(f'  outcomes={len(outcomes)} om={len(om)} result_groups={len(rg)} outcome_counts={len(oc)}', flush=True)
    return outcomes, om, rg, oc


def extract_nct(nct, OUTCOMES, OM, RG, OC):
    rows = []
    out = OUTCOMES[OUTCOMES['nct_id'] == nct]
    if out.empty:
        return rows, 'no outcomes posted'
    w = out[out['title'].str.contains('percent change', case=False, na=False)
            & out['title'].str.contains('weight', case=False, na=False)
            & ~out['title'].str.contains('pooled|achieve|>=|≥|participants who', case=False, na=False, regex=True)]
    if w.empty:
        # fallback: any % body weight mean
        w = out[out['title'].str.contains('weight', case=False, na=False)
                & out['units'].str.contains('percent', case=False, na=False)
                & ~out['title'].str.contains('pooled|achieve|≥|participants who', case=False, na=False, regex=True)]
    if w.empty:
        return rows, 'no % body-weight outcome'
    # prefer primary, prefer the longest (primary-period) timeframe row
    w = w.sort_values(['outcome_type', 'time_frame'], key=lambda s: s.map(
        lambda v: {'PRIMARY': 0, 'SECONDARY': 1}.get(v, 2) if v in ('PRIMARY', 'SECONDARY') else v))
    oid = int(w['id'].iloc[0])
    chosen = w.iloc[0]

    # CRITICAL: ctgov_group_code (OG000, OG001, ...) is reused across trials, so every
    # join MUST be scoped to this nct_id or titles cross-wire between trials.
    om = OM[(OM['nct_id'] == nct) & (OM['outcome_id'] == oid)]
    rg = RG[(RG['nct_id'] == nct) & (RG['result_type'] == 'Outcome')] \
        .drop_duplicates('ctgov_group_code').set_index('ctgov_group_code')['title']
    oc = OC[(OC['nct_id'] == nct) & (OC['outcome_id'] == oid)]
    if not oc.empty:
        ncount = oc[oc['units'].str.contains('participant', case=False, na=False)].set_index('ctgov_group_code')['count']
    else:
        ncount = pd.Series(dtype=float)

    for _, r in om.iterrows():
        code = r['ctgov_group_code']
        title = rg.get(code, '')
        if any(neg in (title or '').lower() for neg in NEG):
            continue
        arm = parse_arm(title)
        if arm is None:
            continue
        agent, dose = arm
        mean = r.get('param_value_num')
        if pd.isna(mean):
            continue
        disp_t = (r.get('dispersion_type') or '').lower()
        disp = r.get('dispersion_value_num')
        n = ncount.get(code)
        n = float(n) if pd.notna(n) else None
        if 'error' in disp_t and pd.notna(disp):
            var = float(disp) ** 2
        elif 'deviation' in disp_t and pd.notna(disp) and n:
            var = float(disp) ** 2 / n
        else:
            var = None
        rows.append({
            'nct': nct, 'agent': agent, 'dose_mg': dose,
            'n': n, 'mean_pct': float(mean),
            'dispersion': disp_t, 'disp_value': (float(disp) if pd.notna(disp) else None),
            'var_of_mean': var, 'timepoint': chosen['time_frame'],
            'param_type': chosen['param_type'],
        })
    return rows, ('ok' if rows else 'outcome found but no parseable arms')


def main():
    OUTCOMES, OM, RG, OC = _load_cohort()
    all_rows, summary = [], []
    for nct, label in COHORT.items():
        rows, status = extract_nct(nct, OUTCOMES, OM, RG, OC)
        summary.append({'nct': nct, 'label': label, 'arms': len(rows), 'status': status})
        all_rows.extend(rows)
        print(f"{nct}  {len(rows):2d} arms  [{status}]  {label}", flush=True)
    df = pd.DataFrame(all_rows)
    print('\n=== extracted arm table ===')
    if not df.empty:
        show = df[['nct', 'agent', 'dose_mg', 'n', 'mean_pct', 'dispersion', 'disp_value', 'var_of_mean', 'timepoint']]
        print(show.to_string(index=False))
        print(f"\nTotal arms: {len(df)} across {df['nct'].nunique()} trials; "
              f"agents: {sorted(df['agent'].unique())}")
        df.to_csv(r'C:/Projects/glp1-doseresp-nma/glp1-obesity-mbnma/arms.csv', index=False)
        json.dump(all_rows, open(r'C:/Projects/glp1-doseresp-nma/glp1-obesity-mbnma/arms.json', 'w'), indent=2)
        print('wrote arms.csv / arms.json')


if __name__ == '__main__':
    main()
