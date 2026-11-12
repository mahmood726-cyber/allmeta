"""The conformal prediction interval is NOT provided by this tool, and every place that
shows it must say so honestly.

Why it is not provided (traced 2026-11-12, lane amisc):
- runAnalysis() never calls predictionInterval_Conformal(); since 2dad6ef6 it stores a stub.
- The function that exists is not what it says. It returns theta_full +/- the
  ceil((1-a)(k+1))-th smallest leave-one-out |residual| -- the plain jackknife -- under the
  label "Jackknife+" with a note claiming a guaranteed >= 1-2a coverage, which is the
  jackknife+ result (Barber et al. 2021), not this one. And for k < 19 at a = 0.05 that rank
  exceeds k, so the conformal interval is unbounded; the function clamps it to the largest
  residual. Checked against R (metafor REML LOO) on dat.bcg (k=13), dat.molloy2014 (k=16):
  jackknife+ is (-Inf, Inf) on both, while the function prints a finite interval.
Wiring it would therefore print a wrong interval with a false guarantee; a correct one is a
new method (jackknife+), out of scope for a wording fix.
"""
import re
from pathlib import Path

ROOT = Path(__file__).parent.parent
FILES = [ROOT / "app.js", ROOT / "TruthCert-PairwisePro-v1.0-bundle.html"]


def _text(p):
    return p.read_text(encoding="utf-8-sig")


def _stub(s):
    m = re.search(r"predictionInterval_Noma\(h\.theta, h\.se, p, m, c\),\s*w = \{(.*?)\}", s, re.S)
    assert m, "conformal stub not found"
    return m.group(1)


def test_card_says_the_interval_is_not_provided():
    for f in FILES:
        stub = _stub(_text(f))
        w = re.search(r'warning:\s*"([^"]+)"', stub).group(1)
        assert w.startswith("Not provided"), f"{f.name}: {w!r}"
        # "in this analysis" implies another analysis would compute it -- none does
        assert "in this analysis" not in w
        # the stub must not carry the Jackknife+ label of the (mislabelled) function
        assert "Jackknife+" not in stub, f"{f.name}: stub labelled Jackknife+"


def test_pi_table_does_not_blame_k():
    # The PI-methods table said "Requires k>=10" for a non-valid conformal row, but the
    # interval is not computed at any k.
    for f in FILES:
        s = _text(f)
        assert '"Distribution-free":"Requires k' not in s, f"{f.name}: table blames k"
        assert '"Distribution-free":"Not provided"' in s


def test_dead_function_is_marked_not_jackknife_plus():
    for f in FILES:
        s = _text(f)
        i = s.index("function predictionInterval_Conformal(")
        assert "NOT jackknife+" in s[max(0, i - 900):i], f"{f.name}: no warning comment"
