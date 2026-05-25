"""Tests for shared/report-bundle.js — self-contained HTML report exporter."""
from __future__ import annotations

import json
import re
import shutil
import subprocess
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parent.parent
MODULE = ROOT / "shared" / "report-bundle.js"

NODE = shutil.which("node")
pytestmark = pytest.mark.skipif(NODE is None, reason="node not installed")


def _run_node(script: str):
    # encoding='utf-8' is critical on Windows — without it subprocess.run uses
    # the locale default (cp1252) and mangles any non-ASCII output from node
    # (the em-dash in the report title, Unicode citations, etc.).
    result = subprocess.run(
        [NODE, "-e", script],
        capture_output=True, encoding="utf-8", errors="replace",
        timeout=20, check=False, cwd=str(ROOT),
    )
    if result.returncode != 0:
        raise AssertionError(
            f"node exited {result.returncode}\nSTDOUT:\n{result.stdout}\nSTDERR:\n{result.stderr}"
        )
    return result.stdout


def _build_html(opts_js: str) -> str:
    """Calls buildHtml(opts) and prints the raw HTML to stdout."""
    return _run_node(f"""
        const R = require({json.dumps(str(MODULE))});
        process.stdout.write(R.buildHtml({opts_js}));
    """)


def test_buildHtml_outputs_complete_html_doc():
    html = _build_html('{ title: "Test analysis" }')
    assert html.startswith("<!DOCTYPE html>")
    assert html.rstrip().endswith("</html>")
    # Title uses U+2014 em-dash. Use chr() to avoid Windows cp1252 surprises
    # when the .py file is read with the platform default codec.
    em = chr(0x2014)
    assert f"Test analysis {em} allmeta report" in html
    assert "allmeta" in html


def test_buildHtml_inlines_inputs_options_and_studies():
    html = _build_html("""{
        title: "Forest plot",
        inputs: {
          options: { model: "REML", alpha: 0.05 },
          studies: [
            { label: "Smith 2020", est: -0.31, se: 0.12 },
            { label: "Jones 2021", est: -0.22, se: 0.09 }
          ]
        }
    }""")
    assert "<h2>Inputs</h2>" in html
    assert "REML" in html and "0.05" in html
    assert "Smith 2020" in html and "Jones 2021" in html
    # Both studies should appear as table rows.
    assert html.count("-0.31") >= 1
    assert html.count("-0.22") >= 1


def test_buildHtml_renders_results_kv_table():
    html = _build_html("""{
        title: "x",
        results: { effect: -0.34, tau2: 0.05, I2: 23.4 }
    }""")
    assert "<h2>Results</h2>" in html
    assert "effect" in html and "-0.34" in html
    assert "tau2" in html and "0.05" in html
    assert "I2" in html and "23.4" in html


def test_buildHtml_includes_provenance_block_with_buildInfo():
    html = _run_node(f"""
        globalThis.AlmBuildInfo = {{
            app: "allmeta", version: "v11.7",
            sha: "abc123def456abc123def456abc123def456abcd",
            shortSha: "abc123d", builtAt: "2026-05-25T00:00:00Z",
            url: "https://example.invalid/"
        }};
        const R = require({json.dumps(str(MODULE))});
        process.stdout.write(R.buildHtml({{ title: "x", seed: 12345, seedSource: "user", appKey: "forest-plot" }}));
    """)
    assert "<h2>Provenance</h2>" in html
    assert "v11.7" in html
    assert "abc123def456abc123def456abc123def456abcd" in html
    assert "12345" in html
    assert "user" in html
    assert "forest-plot" in html


def test_buildHtml_inlines_method_paper_citations():
    html = _build_html("""{
        title: "x",
        citations: [
          { vancouver: "Stijnen T, Hamza TH, Ozdemir P. Random effects meta-analysis of event outcome. Stat Med. 2010;29(29):3046-3067." },
          { vancouver: "Hedges LV, Tipton E, Johnson MC. Robust variance estimation. Res Synth Methods. 2010;1(1):39-65." }
        ]
    }""")
    assert "<h2>Method papers</h2>" in html
    assert "Stijnen" in html
    assert "Hedges" in html
    # Both as list items
    assert html.count("<li>") >= 2


def test_buildHtml_inlines_r_script_block():
    html = _build_html(r"""{
        title: "x",
        rScript: "library(metafor)\nrma(yi, vi, data=dat, method='REML')"
    }""")
    assert "R script" in html
    assert "library(metafor)" in html
    assert 'rma(yi, vi, data=dat, method=' in html


def test_buildHtml_escapes_user_provided_strings():
    """Inputs are caller-supplied; even though apps are trusted, defense in
    depth requires escaping (XSS via study label, etc.)."""
    html = _build_html(r"""{
        title: "<script>alert('xss')</script>",
        inputs: { studies: [{ label: "<img src=x>", est: 0, se: 1 }] }
    }""")
    assert "<script>alert" not in html
    assert "&lt;script&gt;" in html or "&lt;script>" in html
    assert "<img src=x>" not in html
    assert "&lt;img" in html


def test_filenameFor_includes_date_appkey_seed():
    out = _run_node(f"""
        const R = require({json.dumps(str(MODULE))});
        const f = R._filenameFor({{ appKey: "forest-plot", seed: 12345678 }});
        console.log(JSON.stringify(f));
    """)
    fn = json.loads(out.strip().splitlines()[-1])
    assert fn.startswith("allmeta-forest-plot-")
    assert fn.endswith("-12345678.html")
    assert re.match(r"^allmeta-forest-plot-\d{8}-12345678\.html$", fn)


def test_filenameFor_handles_missing_seed():
    out = _run_node(f"""
        const R = require({json.dumps(str(MODULE))});
        const f = R._filenameFor({{ appKey: "forest-plot" }});
        console.log(JSON.stringify(f));
    """)
    fn = json.loads(out.strip().splitlines()[-1])
    assert "noseed" in fn
    assert fn.endswith(".html")


def test_buildHtml_is_idempotent_for_same_inputs():
    """Same inputs → same HTML (except for the generatedAt timestamp). This
    matters for diffing two runs: only the timestamp should change."""
    html1 = _build_html('{ title: "x", results: { x: 1 }, seed: 7 }')
    html2 = _build_html('{ title: "x", results: { x: 1 }, seed: 7 }')
    # Strip the generatedAt rows for the comparison.
    strip = lambda s: re.sub(r"<tr><th>generatedAt</th>.*?</tr>", "", s)
    assert strip(html1) == strip(html2)
