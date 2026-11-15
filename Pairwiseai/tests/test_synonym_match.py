"""Outcome-name and baseline-covariate synonym matching (multi-outcome panel) picks the most specific entry.

Before the fix (every build: app.js, app.min.js, the live bundle, -dist, -min, -optimized, pairwise-pro-v2_2_evalue (5)):
- parseBaselineCharacteristics tested `name === syn || name.includes(syn)` key by key in table order, so the
  short entries shadowed the specific ones: 'Age >=65' and 'age >=75' were stored as `age`, 'LVEF >=40' and
  'lvef <40' as `lvef`, 'eGFR <60' as `egfr`, and 'Female %' / '% female' / 'female sex' as `male_pct`
  ('female' contains 'male'). Two names landing on one key overwrite each other, and the covariate-adjusted
  meta-regression regresses on whatever value survived.
- mapOutcomeToStandard did an exact pass, but its substring pass ran in table order, so
  'time to first hf hospitalization (days)' -> hf_hospitalization, 'sudden cardiac death rate' -> cv_death,
  'cv death or hfh, n (%)' -> cv_death. The page's own standard keys were not synonyms of themselves:
  the multi-outcome demo's cv_death and cv_death_or_hfh were both renamed all_cause_death (overwriting each
  other and the real all_cause_death) and hf_hospitalization became custom_hf_hospitalization.
- Mixed-case synonyms ('eGFR slope', 'eGFR ml/min', ...) could never match exactly: the name is lower-cased,
  the synonym was not.
- The bundle / app.min.js / -dist / -min / -optimized dash class was [U+2010 U+2013 U+2014]; app.js had
  [U+2010-U+2015], so a U+2011 / U+2012 / U+2015 dash was normalised in app.js only.
- 2-letter synonyms matched inside words ('chronic' -> hr, i.e. heart rate).
"""
import json
import subprocess
from pathlib import Path

import pytest

HERE = Path(__file__).resolve().parent
BUILDS = ['app.js', 'app.min.js', 'TruthCert-PairwisePro-v1.0-bundle.html', 'TruthCert-PairwisePro-v1.0-dist.html',
          'TruthCert-PairwisePro-v1.0-min.html', 'TruthCert-PairwisePro-v1.0-optimized.html',
          'pairwise-pro-v2_2_evalue (5).html']

OUTCOMES = {
    'time to first hf hospitalization (days)': 'first_hf_event',
    'sudden cardiac death rate': 'sudden_cardiac_death',
    'cv death or hfh, n (%)': 'cv_death_or_hfh',
    'total hf hospitalizations (recurrent)': 'total_hf_events',
    # the page's own standard keys, as its multi-outcome demo writes them
    'cv_death': 'cv_death', 'cv_death_or_hfh': 'cv_death_or_hfh', 'all_cause_death': 'all_cause_death',
    'hf_hospitalization': 'hf_hospitalization', 'egfr_decline': 'egfr_decline', 'kccq': 'kccq',
    'new_onset_af': 'new_onset_af', '6mwd': '6mwd',
    # unchanged behaviour that must survive
    'cardiovascular death': 'cv_death', 'hfh': 'hf_hospitalization', 'mi': 'mi', 'MI (fatal or non-fatal)': 'mi',
    'all-cause mortality': 'all_cause_death', 'stroke': 'stroke',
}
# dash variants: each must be normalised to '-' and then match exactly (confidence 1)
DASHED = {'all‐cause mortality': 'all_cause_death', 'all‑cause mortality': 'all_cause_death',
          'end‒stage renal disease': 'esrd', 'all–cause mortality': 'all_cause_death',
          'all—cause mortality': 'all_cause_death', 'all―cause mortality': 'all_cause_death'}

BASELINE = {
    'Age ≥65': 'age_gte_65', 'age ≥75': 'age_gte_75', 'age >=65': 'age_gte_65', 'Age 75+': 'age_gte_75',
    'LVEF ≥40': 'lvef_gte_40', 'lvef <40': 'lvef_lt_40', 'lvef < 40': 'lvef_lt_40', 'eGFR <60': 'egfr_lt_60',
    'Female %': 'female_pct', '% female': 'female_pct', 'female sex': 'female_pct', 'women': 'female_pct',
    'eGFR ml/min': 'egfr', 'Mean age': 'age', 'age': 'age', 'lvef': 'lvef', 'Male %': 'male_pct', 'egfr': 'egfr',
    'hfref': 'lvef_lt_40', 'nyha class iii': 'nyha_3_pct', 'heart rate': 'hr', 'HR': 'hr', 'EF (%)': 'lvef',
    'COPD (chronic obstructive pulmonary disease)': None,
}


def _run(build, outcomes, baseline):
    out = subprocess.run(['node', str(HERE / 'synonym_harness.cjs'), build], capture_output=True, timeout=120,
                         input=json.dumps({'outcomes': list(outcomes), 'baseline': list(baseline)}).encode('utf-8'))
    assert out.returncode == 0, out.stderr.decode('utf-8', 'replace')[-2000:]
    return json.loads(out.stdout.decode('utf-8'))


@pytest.mark.parametrize('build', BUILDS)
def test_outcome_names_map_to_the_most_specific_entry(build):
    got = _run(build, OUTCOMES, [])['outcomes']
    assert {k: v['key'] for k, v in got.items() if v['key'] != OUTCOMES[k]} == {}


@pytest.mark.parametrize('build', BUILDS)
def test_every_dash_is_normalised(build):
    got = _run(build, DASHED, [])['outcomes']
    assert {k.encode('unicode_escape').decode(): v for k, v in got.items()
            if (v['key'], v['confidence']) != (DASHED[k], 1)} == {}


@pytest.mark.parametrize('build', BUILDS)
def test_baseline_names_map_to_the_most_specific_entry(build):
    got = _run(build, [], BASELINE)['baseline']
    assert {k: v for k, v in got.items() if v != BASELINE[k]} == {}


def _tables():
    src = (HERE.parent / 'app.js').read_text(encoding='utf-8')
    out = subprocess.run(['node', '-e', r'''
const s=require("fs").readFileSync(0,"utf8");
function grab(re){const m=re.exec(s);let d=0,i=s.indexOf("{",m.index);for(let k=i;k<s.length;k++){if(s[k]==="{")d++;else if(s[k]==="}"&&--d===0)return s.slice(m.index,k+1)}}
const o=eval("({"+grab(/OUTCOME_DICTIONARY\s*=\s*\{/).replace(/^OUTCOME_DICTIONARY\s*=\s*\{/,"")+")");
const b=eval("({"+grab(/BASELINE_COVARIATE_MAP\s*=\s*\{/).replace(/^BASELINE_COVARIATE_MAP\s*=\s*\{/,"")+")");
process.stdout.write(JSON.stringify({o,b}));'''], input=src.encode('utf-8'), capture_output=True, timeout=60)
    assert out.returncode == 0, out.stderr.decode('utf-8', 'replace')
    return json.loads(out.stdout.decode('utf-8'))


@pytest.mark.parametrize('build', BUILDS)
def test_no_table_entry_is_dead(build):
    """Every synonym, typed as a name, maps to its own entry (a synonym listed under two entries goes to the first)."""
    t = _tables()

    def owner(table, s):
        return next(k for k, v in table.items() if s.lower() in [x.lower() for x in v])
    so = [s for v in t['o'].values() for s in v]
    sb = [s for v in t['b'].values() for s in v]
    got = _run(build, so, sb)
    dead_o = {s: got['outcomes'][s]['key'] for s in so if got['outcomes'][s]['key'] != owner(t['o'], s)}
    dead_b = {s: got['baseline'][s] for s in sb if got['baseline'][s] != owner(t['b'], s)}
    assert (dead_o, dead_b) == ({}, {})
