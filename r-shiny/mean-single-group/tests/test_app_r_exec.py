"""Execute the app's own R server code (app.R inside app.json) with Rscript.

The audit8 tests (hub/shared/tests/unit/r-shiny-msg-pi-audit8.test.mjs) only regex-match
the R source. These run it: tests/run_app_server.R evaluates the app's server() with
minimal stand-ins for shiny's reactive()/render*() and prints the text outputs.

Reference numbers (sample data, REML), R 4.6.0 / metafor 5.2.1 (lane audit8 run/msg.R;
re-derived in lane low605):
  95%: PI [3.89, 6.82] (t(k-1) = t(3); predict() on the z fit gave [4.45, 6.26])
  90%: CI 4.94 to 5.774, PI [4.27, 6.44]

Lane low605 (review rrev2, item 2): the "statistically significant" sentence tested at
0.05 whatever output level was chosen, so at 99% it called p = 0.025 significant while
the 99% CI printed beside it contained 0. It now tests at alpha = 1 - level and says so.
SKIPs (never passes) if Rscript or metafor is missing on the host.
"""
import json

import subprocess
import sys
from pathlib import Path

import pytest

APP_DIR = Path(__file__).parent.parent
HARNESS = Path(__file__).parent / "run_app_server.R"
sys.path.insert(0, str(APP_DIR.parent.parent / "hub" / "shared" / "tests"))
from _r_parity import _rscript_path  # noqa: E402


def _app_r(tmp_path):
    files = json.loads((APP_DIR / "app.json").read_text(encoding="utf-8"))
    src = next(f["content"] for f in files if f["name"] == "app.R")
    p = tmp_path / "app.R"
    p.write_text(src, encoding="utf-8")
    return p


def _run(tmp_path, conf_level, csv=None, input_ci_level=95, method="REML"):
    rscript = _rscript_path()
    if rscript is None:
        pytest.skip("Rscript not available")
    cmd = [rscript, "--vanilla", str(HARNESS), str(_app_r(tmp_path)),
           str(conf_level), str(input_ci_level), method]
    if csv is not None:
        cmd.append(str(csv))
    proc = subprocess.run(cmd, capture_output=True, text=True, encoding="utf-8",
                          errors="replace", timeout=120)
    if proc.returncode != 0 and "there is no package called" in (proc.stderr or ""):
        pytest.skip("R package missing: " + proc.stderr.strip().splitlines()[0])
    assert proc.returncode == 0, f"Rscript exit {proc.returncode}:\n{proc.stderr}"
    out, num = {}, {}
    for line in proc.stdout.splitlines():
        parts = line.split("\t")
        if parts[0] == "OUT":
            out[parts[1]] = parts[2]
        elif parts[0] == "NUM":
            num = {k: float(v) for k, v in (kv.split("=") for kv in parts[1].split())}
    assert {"meta_ci", "sig_test", "prediction_interval"} <= out.keys(), proc.stdout
    assert num, proc.stdout
    return out, num


def _csv(tmp_path, name, means, halfwidths):
    p = tmp_path / name
    rows = ["study,mean,lower,upper,group,covariate"]
    for i, (m, h) in enumerate(zip(means, halfwidths)):
        rows.append(f"S{i + 1},{m},{m - h},{m + h},{'AB'[i % 2]},{i + 1}")
    p.write_text("\n".join(rows) + "\n", encoding="utf-8")
    return p


def test_sample_95_prediction_interval_t_k1(tmp_path):
    out, num = _run(tmp_path, 95)
    assert "Prediction Interval (95%, t with k-1 df): [3.89, 6.82]" in out["prediction_interval"], out
    assert num["k"] == 4
    assert round(num["pi.lb"], 2) == 3.89 and round(num["pi.ub"], 2) == 6.82
    # z-based predict() would be [4.45, 6.26] (the audit8 defect) - must not come back
    assert "[4.45, 6.26]" not in out["prediction_interval"]


def test_sample_90_ci_and_pi(tmp_path):
    out, num = _run(tmp_path, 90)
    assert "90 % CI for pooled mean: 4.94 to 5.774" in out["meta_ci"], out
    assert "Prediction Interval (90%, t with k-1 df): [4.27, 6.44]" in out["prediction_interval"], out
    assert abs(num["ci.lb"] - 4.94018340972644) < 1e-9 and abs(num["ci.ub"] - 5.77382383501715) < 1e-9


# p = 0.0251 (REML; scratch pick.R): significant at 5%, NOT at 1%.
P025 = ([0.30, 0.10, 0.45, 0.05], [0.28, 0.245, 0.35, 0.21])
# p = 0.0687 (REML, tau2 = 0): significant at 10%, not at 5%.
P069 = ([0.30, 0.10, 0.45, 0.05], [0.40, 0.35, 0.50, 0.30])


def test_significance_sentence_uses_output_level_99(tmp_path):
    out, num = _run(tmp_path, 99, _csv(tmp_path, "p025.csv", *P025))
    assert 0.01 < num["pval"] < 0.05, num
    assert num["ci.lb"] < 0 < num["ci.ub"]  # the 99% CI printed beside it contains 0
    s = out["sig_test"]
    assert "is not statistically significant at the 1% level" in s, s


def test_significance_sentence_uses_output_level_90(tmp_path):
    out, num = _run(tmp_path, 90, _csv(tmp_path, "p069.csv", *P069))
    assert 0.05 < num["pval"] < 0.10, num
    assert num["ci.lb"] > 0  # the 90% CI excludes 0
    s = out["sig_test"]
    assert "is statistically significant at the 10% level" in s, s
    assert "not statistically significant" not in s


def test_significance_sentence_95_control(tmp_path):
    out, num = _run(tmp_path, 95, _csv(tmp_path, "p025.csv", *P025))
    assert "is statistically significant at the 5% level" in out["sig_test"], out
    out, num = _run(tmp_path, 95)
    assert "is statistically significant at the 5% level (two-sided) ( p < 0.0001 )" in out["sig_test"], out
