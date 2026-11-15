"""NMA Pro v8 (lane nmapro5, re-review rrevnma): engine correctness items vs R (tests/nmapro5_r460.json from
tests/nmapro5_reference.R, R 4.6.0 / netmeta 3.7.0 / meta 8.5-0; page values from tests/nmapro5_harness.cjs).

Before (on top of lane nmapro4 / PR #571):
  F1  RD with a 3-arm study whose arm C has 0 events: the 0.5 increment went only into the rows touching C (OR/RR/HR
      had the all-arm rule, RD not): study 25 A:B seTE 0.061040, netmeta pairwise 0.062069; DL tau2 0.0094152 vs
      0.0094262, Q 400.898 vs 401.387.
  F4  leave-one-out, influence diagnostics and design influence removed one ROW (Willms1999, a 3-arm study, was
      left in as a 2-arm study) or one pairwise comparison (design influence: 16 "designs" for netmeta's 15).
  F5  nothing checked connectivity on the engine path and Matrix.lu/solve skipped a zero pivot: a disconnected
      network ran and gave the cut-off treatments estimate 0, SE 1; netmeta stops.
  F10 tacc / reciprocal / sweeting gave a 3-arm study a different increment for one arm in each contrast (study 25,
      tacc: TE(A:C) - TE(A:B) - TE(B:C) = 0.078) and ran silently; netmeta's pairwise() has no such option.
  F11 importCSV read a missing event count (NA) as 0 (and a blank one became 0 in the analysis); netmeta leaves that
      comparison out with a warning.
  F12 Matrix.lu/solve's pivot test was an absolute 1e-14: Senn 2013 with y and SE x 1e-7 gave tau2 0 and SE 5.5e6
      (x 1e-6: Q 82.02 instead of 96.99).
"""
import json
import subprocess
from pathlib import Path

HERE = Path(__file__).resolve().parent
R = json.loads((HERE / 'nmapro5_r460.json').read_text(encoding='utf-8'))


def _harness():
    out = subprocess.run(['node', str(HERE / 'nmapro5_harness.cjs')], capture_output=True, text=True, timeout=900,
                         encoding='utf-8')
    assert out.returncode == 0, out.stderr[-2000:]
    return json.loads(out.stdout)


V = _harness()


def _close(a, b, rel, abs_=1e-12):
    return isinstance(a, (int, float)) and isinstance(b, (int, float)) and abs(a - b) <= max(abs_, rel * abs(b))


# ---------------------------------------------------------------- F1 RD multi-arm zero arm
def test_f1_rd_multiarm_zero_arm_contrasts_equal_netmeta_pairwise():
    page, ref = V['rd'], R['rd']
    assert 'error' not in page, page
    bad = []
    for key, r in ref['row25'].items():
        p = page['row25'].get(key)
        if p is None or not _close(p['TE'], r['TE'], 1e-12) or not _close(p['seTE'], r['seTE'], 1e-12):
            bad.append('%s page %r R %r' % (key, p, r))
    assert bad == []


def test_f1_rd_network_equals_netmeta_dl():
    page, ref = V['rd'], R['rd']
    assert _close(page['tau2'], ref['tau2'], 1e-9) and _close(page['Q'], ref['Q'], 1e-10), (page['tau2'], page['Q'])
    bad = [t for t in ref['TE'] if not _close(page['TE'][t], ref['TE'][t], 1e-8, 1e-12)
           or not _close(page['se'][t], ref['se'][t], 1e-8, 1e-12)]
    assert bad == []


# ---------------------------------------------------------------- F4 leave one STUDY / DESIGN out
def _by(rows, key):
    return {r[key]: r for r in rows}


def test_f4_leave_one_study_out_equals_netmeta_on_the_subset():
    bad = []
    for est in ('DL', 'REML'):
        ref = R['loo'][est]['study']
        rows = _by(V['loo'][est]['loo']['rows'], 'study')
        if len(rows) != R['loo'][est]['nStudies']:
            bad.append('%s units page %d R %d' % (est, len(rows), R['loo'][est]['nStudies']))
        for s, r in ref.items():
            p = rows.get(s)
            if p is None or p['error'] or not _close(p['tau2'], r['tau2'], 1e-6, 1e-10):
                bad.append('%s %s tau2 page %r R %r' % (est, s, p and p['tau2'], r['tau2']))
                continue
            bad += ['%s %s TE %s page %r R %r' % (est, s, t, p['TE'].get(t), v) for t, v in r['TE'].items()
                    if t in p['TE'] and not _close(p['TE'][t], v, 1e-6, 1e-9)]
    assert bad == []


def test_f4_three_arm_study_is_removed_whole():
    rows = _by(V['loo']['DL']['loo']['rows'], 'study')
    assert rows['Willms1999']['nRows'] == 3
    inf = _by(V['loo']['DL']['inf']['rows'], 'study')
    assert V['loo']['DL']['inf']['nStudies'] == R['loo']['DL']['nStudies'] == 26
    assert inf['Willms1999']['nRows'] == 3 and _close(inf['Willms1999']['tau2'],
                                                      R['loo']['DL']['study']['Willms1999']['tau2'], 1e-6)


def test_f4_influence_diagnostics_tau2_equals_netmeta_leave_one_study_out():
    bad = []
    for est in ('DL', 'REML'):
        rows = _by(V['loo'][est]['inf']['rows'], 'study')
        for s, r in R['loo'][est]['study'].items():
            if s not in rows or not _close(rows[s]['tau2'], r['tau2'], 1e-6, 1e-10):
                bad.append('%s %s page %r R %r' % (est, s, rows.get(s, {}).get('tau2'), r['tau2']))
    assert bad == []


def test_f4_design_influence_drops_whole_designs_as_netmeta_decomp_design():
    bad = []
    for est in ('DL', 'REML'):
        rows = _by(V['loo'][est]['des']['rows'], 'design')
        want = set(R['loo']['designOf'].values())
        if set(rows) != want or V['loo'][est]['des']['nDesigns'] != R['loo'][est]['nDesigns']:
            bad.append('%s designs page %r R %r' % (est, sorted(rows), sorted(want)))
            continue
        for g, r in R['loo'][est]['design'].items():
            p = rows[g]
            if not p['estimable'] or p['remaining'] != r['nStudies'] or not _close(p['tau2'], r['tau2'], 1e-6, 1e-10):
                bad.append('%s %s page %r R %r' % (est, g, (p['remaining'], p['tau2']), (r['nStudies'], r['tau2'])))
    assert bad == []


# ---------------------------------------------------------------- F5 connectivity / singular pivot
def test_f5_leave_one_out_refuses_a_disconnected_remainder_and_names_it():
    assert 'separate sub-networks' in R['bridge']['without_b4']  # netmeta stops
    for mod, key in (('loo', 'study'), ('inf', 'study')):
        b4 = _by(V['bridge'][mod]['rows'], key)['b4']
        assert b4.get('refused') and '"C", "D", "E"' in b4['message'], (mod, b4)
    des = _by(V['bridge']['des']['rows'], 'design')['B:C']
    assert des['refused'] and '"C", "D", "E"' in des['message'], des
    b7 = _by(V['bridge']['loo']['rows'], 'study')['b7']
    assert not b7['error'] and _close(b7['tau2'], R['bridge']['without_b7_tau2'], 1e-9, 1e-12)


def test_f5_disconnected_network_is_refused_by_the_engine():
    assert 'separate sub-networks' in R['dis']
    e = V['dis']['engine']
    assert e.get('name') == 'DisconnectedNetwork' and '"C", "D"' in e['error'], e
    assert V['dis']['guardian'] is False


def test_f5_singular_matrix_raises_instead_of_returning_zero():
    for k in ('solve', 'inverse'):
        assert V['dis'][k].get('name') == 'SingularMatrix', (k, V['dis'][k])


# ---------------------------------------------------------------- F10 zero-cell options on a multi-arm study
def test_f10_haldane_is_consistent_and_runs():
    z = V['zc']['haldane']
    ab, ac, bc = z['rows25']
    assert abs(ac - (ab + bc)) < 1e-12 and z['run'].get('ran') and z['guardian'] is True


def test_f10_per_pair_increments_are_refused_for_multi_arm_studies():
    assert 'Non-numeric' in R['tacc']  # netmeta pairwise() has no TACC
    for z in ('tacc', 'reciprocal', 'sweeting'):
        d = V['zc'][z]
        ab, ac, bc = d['rows25']
        assert abs(ac - (ab + bc)) > 0.01, z  # the contrasts really are inconsistent under this option
        assert d['run'].get('name') == 'ZeroCellOption' and '"25"' in d['run']['error'], (z, d['run'])
        assert d['guardian'] is False, z
        assert d['twoArm'].get('ran') and d['twoArm']['zeroRows'] > 0, (z, d['twoArm'])  # two-arm data keep it


# ---------------------------------------------------------------- F11 missing counts
def test_f11_missing_event_count_is_dropped_with_a_notice_as_netmeta():
    na, ref = V['na'], R['na']
    assert 'S1' not in ref['pairwise_studlab'] and 'S1' not in ref['studlab'] and 'NAs omitted' in str(ref['warning'])
    assert na['dropped'] == ['S1'] and [k[0] for k in na['kept']] == ref['studlab'], na
    assert any('S1' in w and 'events2=NA' in w for w in na['warnings']), na['warnings']
    assert _close(na['fit']['tau2'], ref['tau2'], 1e-9, 1e-12) and _close(na['fit']['Q'], ref['Q'], 1e-9)
    assert all(_close(na['fit']['TE'][t], v, 1e-9, 1e-12) for t, v in ref['TE'].items())


# ---------------------------------------------------------------- F12 scale equivariance
def test_f12_engine_is_scale_equivariant_senn_x1e6_x1e7_equal_x1():
    # netmeta itself is NOT scale-equivariant here: x 1e-6 Q 97.38 (x 1: 96.99) and x 1e-7 solve() fails
    # ("computationally singular"); so R is the reference at x 1 (DL: netmeta; REML: the page's exact multi-arm
    # likelihood is checked against rma.mv in nmapro3), and the page at x 1e-6 / x 1e-7 must be its x 1 fit rescaled.
    assert 'singular' in R['scale']['DL_1e-07']['error'] and not _close(R['scale']['DL_1e-06']['Q'], R['scale']['DL_1']['Q'], 1e-3)
    r1 = R['scale']['DL_1']
    p1 = V['scale']['DL_1']
    assert all(_close(p1[k], r1[k], 1e-9) for k in ('tau2', 'Q', 'TE', 'se')), (p1, r1)
    bad = []
    for est in ('DL', 'REML'):
        base = V['scale'][est + '_1']
        for sc in ('1e-06', '1e-07'):
            p = V['scale']['%s_%s' % (est, sc)]
            if 'error' in p:
                bad.append('%s x%s %s' % (est, sc, p['error']))
                continue
            s_ = float(sc)
            for k, f in (('tau2', s_ * s_), ('Q', 1), ('TE', s_), ('se', s_)):
                if not _close(p[k] / f, base[k], 1e-6, 1e-12):
                    bad.append('%s x%s %s page %r x1 %r' % (est, sc, k, p[k] / f, base[k]))
    assert bad == []
