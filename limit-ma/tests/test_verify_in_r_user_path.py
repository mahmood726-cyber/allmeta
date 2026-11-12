"""User path: "Verify in R" opens the WebR validator with the studies on screen.

Found 2026-11-12 in real Chrome on the live site: with the default example run,
pressing "Verify in R" showed "No studies on the shared bus yet" and opened
nothing, because the button was attached without a studies provider. The
validator's random-effects re-fit also defaulted to Paule-Mandel while this
app's random-effects line is DerSimonian-Laird.
"""
import json
import os
import subprocess
from pathlib import Path

import pytest

HERE = Path(__file__).parent


@pytest.fixture(scope="module")
def probe():
    page = Path(os.environ.get("LIMIT_MA_PAGE", HERE.parent / "index.html")).resolve()
    proc = subprocess.run(["node", str(HERE / "verify-in-r-probe.cjs"), str(page)],
                          capture_output=True, text=True, encoding="utf-8", check=True, timeout=120)
    return json.loads(proc.stdout.strip().splitlines()[-1])


def test_default_example_opens_the_validator_without_a_bus_save(probe):
    assert probe["alerts"] == [], probe["alerts"]
    assert len(probe["opened"]) == 1, probe["opened"]
    assert probe["opened"][0].startswith("../webr-validator/?fromBus=1&")


def test_validator_receives_exactly_the_fitted_studies(probe):
    studies = probe["busStudies"]
    assert studies is not None and len(studies) == probe["k"] == 10
    rows = [line.split(",") for line in probe["src"].splitlines() if line.strip()]
    assert [(s["est"], s["se"], s["label"]) for s in studies] == \
        [(float(r[0]), float(r[1]), r[2].strip()) for r in rows]


def test_validator_refits_the_apps_dl_random_effects_model(probe):
    url = probe["opened"][0]
    assert "from=limit-ma" in url
    assert "method=DL" in url and "test=z" in url, url
