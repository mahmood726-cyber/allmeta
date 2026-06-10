"""Smoke test for paper/assets/js/alm-paper-bridge.js.

Asserts the bridge assembles a RapidMeta.state of the shape Paper Studio reads
(protocol.{pop,int,comp,out}, pico.{intervention,primaryOutcome}, trials[].{title,
authors,year,n}, results.{estimate,ciLow,ciHigh}) from the allmeta buses. Runs
under Node with a localStorage + MaStudies/MaPooled shim. Skipped if Node absent.
"""
from __future__ import annotations

import json
import shutil
import subprocess
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parent.parent
BRIDGE = ROOT / "paper" / "assets" / "js" / "alm-paper-bridge.js"

NODE = shutil.which("node")
pytestmark = pytest.mark.skipif(NODE is None, reason="node not installed")


def _run(script: str) -> object:
    r = subprocess.run([NODE, "-e", script], capture_output=True, text=True,
                       timeout=30, check=False, cwd=str(ROOT))
    if r.returncode != 0:
        raise AssertionError(f"node exited {r.returncode}\nSTDOUT:\n{r.stdout}\nSTDERR:\n{r.stderr}")
    lines = [ln for ln in r.stdout.strip().splitlines() if ln.strip()]
    assert lines, f"no output.\nSTDERR:\n{r.stderr}"
    return json.loads(lines[-1])


# A node harness that shims localStorage + the MaStudies/MaPooled bus globals,
# loads the bridge, and prints the assembled state.
HARNESS = """
  var store = {{
    "sr-project-v1": JSON.stringify({{ pico: {{ pop: "Adults with CKD + T2D", int: "Finerenone", comp: "Placebo", out: "CV death or HF hospitalisation" }}, protocolUrl: "https://example.org/protocol" }}),
    "sr-records-v1": JSON.stringify({{ _schema: "sr-records-v1", records: [
      {{ title: "FIDELIO-DKD", authors: ["Bakris G"], year: "2020", n: 5674, r1: {{ d: "include" }}, r2: {{ d: "include" }} }},
      {{ title: "FIGARO-DKD", authors: ["Pitt B"], year: "2021", n: 7437, r1: {{ d: "include" }}, r2: {{ d: "include" }} }},
      {{ title: "Off-topic study", year: "2019", r1: {{ d: "exclude" }}, r2: {{ d: "exclude" }} }},
      {{ title: "A duplicate", dup: true, r1: {{ d: "include" }} }}
    ] }})
  }};
  global.localStorage = {{
    getItem: function (k) {{ return Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null; }},
    setItem: function (k, v) {{ store[k] = String(v); }},
    removeItem: function (k) {{ delete store[k]; }}
  }};
  global.MaStudies = {{ read: function () {{ return [
    {{ label: "Bakris 2020", est: -0.18, se: 0.06, year: 2020 }},
    {{ label: "Pitt 2021", est: -0.13, se: 0.05, year: 2021 }}
  ]; }} }};
  global.MaPooled = {{ read: function () {{ return [
    {{ pointEstimate: -0.15, ciLo: -0.24, ciHi: -0.06, tau2: 0.002, measure: "logHR", scale: "ratio", k: 2 }}
  ]; }} }};
  var B = require({bridge});
  var s = B.buildState();
  console.log(JSON.stringify(s));
"""


def _state():
    return _run(HARNESS.format(bridge=json.dumps(str(BRIDGE))))


def test_protocol_and_pico_from_sr_project():
    s = _state()
    assert s["protocol"]["int"] == "Finerenone"
    assert s["protocol"]["comp"] == "Placebo"
    assert s["protocol"]["pop"].startswith("Adults")
    assert s["protocol"]["url"] == "https://example.org/protocol"
    assert s["pico"]["intervention"] == "Finerenone"
    assert s["pico"]["primaryOutcome"].startswith("CV death")


def test_trials_are_consensus_included_non_duplicate():
    s = _state()
    titles = [t["title"] for t in s["trials"]]
    assert "FIDELIO-DKD" in titles and "FIGARO-DKD" in titles
    assert "Off-topic study" not in titles      # both reviewers excluded
    assert "A duplicate" not in titles          # dup flag
    assert len(s["trials"]) == 2
    # merged with ma-studies effect + sr-records n
    t0 = next(t for t in s["trials"] if t["title"] == "FIDELIO-DKD")
    assert t0["n"] == 5674
    assert t0["authors"] == "Bakris G"
    assert t0["effect"]["est"] == -0.18


def test_results_from_ma_pooled():
    s = _state()
    r = s["results"]
    assert r["estimate"] == -0.15
    assert r["ciLow"] == -0.24 and r["ciHigh"] == -0.06
    assert r["tau2"] == 0.002
    assert r["k"] == 2


def test_search_counts_reflect_records():
    s = _state()
    assert s["search"]["count"] == 4
    assert s["search"]["included"] == 2
    assert s["activeTab"] == "paper"
