"""Mirror of the multilevel-ma index.html JS engine in Python.

Used ONCE to compute exact fixture values before pasting into test_against_metafor.py.
The algorithm is the iterated moment-of-moments (Cheung 2014 / Raudenbush style)
as documented in the footer of multilevel-ma/index.html.
"""
import math
import csv
from pathlib import Path

def fit(rows):
    """Replicate the JS fit() function exactly."""
    studies = list(dict.fromkeys(r['study'] for r in rows))
    byStudy = {s: [r for r in rows if r['study'] == s] for s in studies}

    def feStudy(grp):
        w = [1 / (r['se'] ** 2) for r in grp]
        sw = sum(w)
        mean = sum(w[i] * grp[i]['te'] for i in range(len(grp))) / sw
        se2 = 1 / sw
        return {'mean': mean, 'se': math.sqrt(se2)}

    studyPools = [feStudy(byStudy[s]) for s in studies]
    ws = [1 / (p['se'] ** 2) for p in studyPools]
    sws = sum(ws)
    mu0 = sum(ws[i] * studyPools[i]['mean'] for i in range(len(studies))) / sws
    Q0 = sum(ws[i] * (studyPools[i]['mean'] - mu0) ** 2 for i in range(len(studies)))
    dfStudy = len(studies) - 1
    sumW2 = sum(w * w for w in ws)
    tau2_study = max(0, (Q0 - dfStudy) / (sws - sumW2 / sws)) if dfStudy > 0 else 0

    # Within-study tau2 initial
    withinQs = []
    for s in studies:
        grp = byStudy[s]
        if len(grp) < 2:
            continue
        w = [1 / (r['se'] ** 2) for r in grp]
        sw = sum(w)
        m = sum(w[i] * grp[i]['te'] for i in range(len(grp))) / sw
        Q = sum(w[i] * (grp[i]['te'] - m) ** 2 for i in range(len(grp)))
        df = len(grp) - 1
        sW2 = sum(x * x for x in w)
        t2 = max(0, (Q - df) / (sw - sW2 / sw)) if df > 0 else 0
        withinQs.append(t2)
    tau2_within = sum(withinQs) / len(withinQs) if withinQs else 0

    # Iterate to convergence
    for it in range(30):
        # -- update tau2_study --
        studyMeans = []
        for s in studies:
            grp = byStudy[s]
            wg = [1 / (r['se'] ** 2 + tau2_within) for r in grp]
            swg = sum(wg)
            mg = sum(wg[i] * grp[i]['te'] for i in range(len(grp))) / swg
            studyMeans.append({'mean': mg, 'se': math.sqrt(1 / swg)})
        wsNew = [1 / (p['se'] ** 2) for p in studyMeans]
        swsNew = sum(wsNew)
        muS = sum(wsNew[i] * studyMeans[i]['mean'] for i in range(len(studies))) / swsNew
        Qs = sum(wsNew[i] * (studyMeans[i]['mean'] - muS) ** 2 for i in range(len(studies)))
        dfS = len(studies) - 1
        sW2s = sum(w * w for w in wsNew)
        new_tau2_study = max(0, (Qs - dfS) / (swsNew - sW2s / swsNew)) if dfS > 0 else 0

        # -- update tau2_within --
        Qw = 0; dfw = 0; sumW2w = 0; sumWw = 0
        for s in studies:
            grp = byStudy[s]
            if len(grp) < 2:
                continue
            wg = [1 / (r['se'] ** 2) for r in grp]
            swg = sum(wg)
            mg = sum(wg[i] * grp[i]['te'] for i in range(len(grp))) / swg
            Qw += sum(wg[i] * (grp[i]['te'] - mg) ** 2 for i in range(len(grp)))
            dfw += len(grp) - 1
            sumWw += swg
            sumW2w += sum(x * x for x in wg)
        new_tau2_within = max(0, (Qw - dfw) / (sumWw - sumW2w / sumWw)) if dfw > 0 else 0

        if abs(new_tau2_study - tau2_study) < 1e-6 and abs(new_tau2_within - tau2_within) < 1e-6:
            tau2_study = new_tau2_study
            tau2_within = new_tau2_within
            break
        tau2_study = new_tau2_study
        tau2_within = new_tau2_within

    wFinal = [1 / (r['se'] ** 2 + tau2_within + tau2_study) for r in rows]
    swFinal = sum(wFinal)
    mu = sum(wFinal[i] * rows[i]['te'] for i in range(len(rows))) / swFinal
    seMu = math.sqrt(1 / swFinal)

    # HKSJ
    J = len(studies)
    dfHK = max(1, J - 1)
    qStar = sum(wFinal[i] * (rows[i]['te'] - mu) ** 2 for i in range(len(rows))) / dfHK
    qFloored = max(1, qStar)
    seMuHK = math.sqrt(qFloored / swFinal)

    # I^2 decomposition
    wSamp = [1 / (r['se'] ** 2) for r in rows]
    sumWsamp = sum(wSamp)
    sumW2samp = sum(w * w for w in wSamp)
    denomSig = sumWsamp ** 2 - sumW2samp
    sigma2_typical = ((len(rows) - 1) * sumWsamp) / denomSig if denomSig > 1e-12 else 0

    k = len(rows)
    return {
        'mu': mu,
        'seMu': seMu,
        'seMuHK': seMuHK,
        'tau2_study': tau2_study,
        'tau2_within': tau2_within,
        'k': k,
        'J': J,
    }


if __name__ == '__main__':
    fix = Path(__file__).parent / 'mlma-tiny.csv'
    with open(fix, encoding='utf-8') as f:
        reader = csv.DictReader(f)
        rows = [{'study': r['study'], 'te': float(r['effect']), 'se': float(r['SE']), 'label': r.get('label','')} for r in reader]

    result = fit(rows)
    print("=== mlma-tiny.csv engine output ===")
    for k, v in result.items():
        print(f"  {k} = {v!r}")

    ci_lb_z = result['mu'] - 1.96 * result['seMu']
    ci_ub_z = result['mu'] + 1.96 * result['seMu']
    print(f"  ci_lb_z = {ci_lb_z!r}")
    print(f"  ci_ub_z = {ci_ub_z!r}")
