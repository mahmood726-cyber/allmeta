"""Secondary NMA Pro modules vs R (tests/secondary_r460.json from tests/secondary_reference.R; page values from
tests/secondary_harness.cjs).

Before (lane nmapro2, on top of PR #563 which removed the 1e-4 floor from the core GLS only):
  * prediction intervals used t with df = n - p - 1 = k - (number of treatments). netmeta 3.7.0 uses df.Q
    (= k - (treatments - 1) for two-arm studies) and gives no interval when df.Q < 2 (netmeta.R:
    `if (df.Q >= 2) ci(TE.random, sqrt(seTE.random^2 + tau^2), level.predict, df.Q)`). Senn 2013 (25 two-arm
    studies, 10 treatments): page t_15, netmeta t_16; a 3-study triangle (df.Q = 1) got a t_1 interval.
  * risk difference added 0.0001 to every study variance (main engine, worker engine and registry import);
    meta::metabin(sm = "RD") adds nothing and uses incr 0.5 in all cells only for a study with a zero cell.
  * meta-regression (baseline risk), robust-t, cluster-robust and component NMA (EnhancedCNMA) still applied
    max(1e-4, .) to variances: every SE below 0.01 came out as exactly 0.0100 (cluster-robust even on the
    unscaled nma-tiny data, metafor robust() SE 0.0053), and the CNMA weights were all equalised.
"""
import json
import math
import subprocess
from pathlib import Path

HERE = Path(__file__).resolve().parent
R = json.loads((HERE / 'secondary_r460.json').read_text(encoding='utf-8'))


def _harness():
    out = subprocess.run(['node', str(HERE / 'secondary_harness.cjs')], capture_output=True, text=True, timeout=300,
                         encoding='utf-8')
    assert out.returncode == 0, out.stderr[-2000:]
    return json.loads(out.stdout)


V = _harness()


def _close(a, b, rel, abs_=1e-12):
    return a is not None and b is not None and abs(a - b) <= max(abs_, rel * abs(b))


# ---------------------------------------------------------------- prediction intervals
def test_pi_df_is_netmeta_df_Q():
    bad = ['%s: page df %r, netmeta df.Q %r' % (k, V['pi'][k]['df'], r['df'])
           for k, r in R['pi'].items() if V['pi'][k]['df'] != r['df']]
    assert bad == []


def test_pi_limits_equal_netmeta():
    bad = []
    for key, r in R['pi'].items():
        if r['df'] < 2:
            continue
        p = V['pi'][key]
        rel = 1e-6 if 'REML' in key else 1e-9
        assert _close(p['tau2'], r['tau2'], 1e-5, 1e-10), (key, p['tau2'], r['tau2'])
        for t in r['lower']:
            for side in ('lower', 'upper'):
                if not _close(p[side][t], r[side][t], rel, 1e-9):
                    bad.append('%s %s %s: page %r, netmeta %r' % (key, t, side, p[side][t], r[side][t]))
    assert bad == []


def test_no_pi_when_df_Q_below_2():
    r = R['pi']['triangle_DL']
    assert r['df'] == 1 and all(x is None for x in r['lower'].values())
    p = V['pi']['triangle_DL']
    assert all(x == 'undefined' for x in list(p['lower'].values()) + list(p['upper'].values())), p


# ---------------------------------------------------------------- risk difference
def test_rd_study_variances_equal_metabin():
    want = [s * s for s in R['rd']['seTE']]
    for engine in ('main', 'worker', 'registry'):
        got = V['rd'][engine]
        assert got is not None, engine
        bad = ['%s %s: page yi %r vi %r, metabin %r %r' % (engine, R['rd']['study'][i], g['yi'], g['vi'], R['rd']['TE'][i], w)
               for i, (g, w) in enumerate(zip(got, want))
               if not (_close(g['yi'], R['rd']['TE'][i], 1e-12, 1e-14) and _close(g['vi'], w, 1e-12))]
        assert bad == []


def test_rd_network_equals_netmeta_pairwise():
    p, r = V['rd']['nma'], R['rd']['nma']
    assert _close(p['tau2'], r['tau2'], 1e-9), (p['tau2'], r['tau2'])
    for t in ('B', 'C'):
        assert _close(p['TE'][t], r['TE'][t], 1e-9), (t, p['TE'][t], r['TE'][t])
        assert _close(p['seTE'][t], r['seTE'][t], 1e-9), (t, p['seTE'][t], r['seTE'][t])


# ---------------------------------------------------------------- secondary modules: no 1e-4 floor
def test_metareg_inputs_and_fit_equal_metafor():
    p, r = V['metareg'], R['metareg']
    assert p['applicable'] and p['tau2'] == 0
    assert max(p['vi']) < 2e-4 and min(p['vi']) < 1e-4
    assert all(_close(a, b, 1e-12) for a, b in zip(p['yi'], r['yi']))
    assert all(_close(a, b, 1e-12) for a, b in zip(p['vi'], r['vi']))
    bad = []
    for t in ('B', 'C', 'D', 'slope'):
        if not _close(p['beta'][t], r['beta'][t], 1e-8):
            bad.append('beta %s: page %r, metafor %r' % (t, p['beta'][t], r['beta'][t]))
        if not _close(p['se'][t], r['se'][t], 1e-8):
            bad.append('se %s: page %r, metafor %r' % (t, p['se'][t], r['se'][t]))
    assert bad == []


def test_cluster_robust_equals_metafor_robust():
    bad = []
    for key, r in R['cluster'].items():
        p = V['cluster'][key]
        assert p['applicable']
        assert _close(p['tau2'], r['tau2'], 1e-5, 1e-10), (key, p['tau2'], r['tau2'])
        for t in ('B', 'C', 'D'):
            if not _close(p['beta'][t], r['beta'][t], 1e-6):
                bad.append('%s beta %s: page %r, metafor %r' % (key, t, p['beta'][t], r['beta'][t]))
            if not _close(p['se'][t], r['se'][t], 1e-5):
                bad.append('%s se %s: page %r, metafor robust %r' % (key, t, p['se'][t], r['se'][t]))
        for row in p['rows']:
            if not _close(row['seCR'], p['se'][row['treatment']], 1e-12):
                bad.append('%s rows seCR %s: %r vs effect se %r' % (key, row['treatment'], row['seCR'], p['se'][row['treatment']]))
    assert bad == []


def test_cnma_equals_netcomb():
    bad = []
    for key, r in R['cnma'].items():
        p = V['cnma'][key]
        assert p['applicable']
        for c in r['est']:
            if not _close(p['est'][c], r['est'][c], 1e-6):
                bad.append('%s est %s: page %r, netcomb %r' % (key, c, p['est'][c], r['est'][c]))
            if not _close(p['se'][c], r['se'][c], 1e-6):
                bad.append('%s se %s: page %r, netcomb %r' % (key, c, p['se'][c], r['se'][c]))
    assert bad == []


def test_robust_t_is_scale_equivariant():
    # No R implementation of this module; multiplying every y and SE by c must multiply estimates and SEs by c,
    # tau2 by c^2 and leave the Student-t weights unchanged (each step of the fit is homogeneous in y and SE).
    a, b, c = V['robust']['s1'], V['robust']['s0.01'], 0.01
    assert a['applicable'] and b['applicable']
    assert _close(b['tau2'], a['tau2'] * c * c, 1e-6, 1e-14)
    bad = []
    for t in ('B', 'C', 'D'):
        if not _close(b['beta'][t], a['beta'][t] * c, 1e-6):
            bad.append('beta %s: x0.01 %r, x1 * 0.01 %r' % (t, b['beta'][t], a['beta'][t] * c))
        if not _close(b['se'][t], a['se'][t] * c, 1e-6):
            bad.append('se %s: x0.01 %r, x1 * 0.01 %r' % (t, b['se'][t], a['se'][t] * c))
    for (na, wa), (nb, wb) in zip(a['weights'], b['weights']):
        if na != nb or not math.isclose(wa, wb, rel_tol=1e-6):
            bad.append('weight %s: %r vs %r' % (na, wa, wb))
    assert bad == []
