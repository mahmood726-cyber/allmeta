"""Static regression guards for the Design app (2026-06-08 review)."""
from pathlib import Path

INDEX = Path(__file__).parent.parent / "index.html"


def _h():
    return INDEX.read_text(encoding="utf-8")


def test_pico_textareas_have_aria_labels():
    # WCAG 1.3.1/4.1.2: the PICO textareas had only a 1-letter visual tag +
    # placeholder; screen-reader users got no accessible name.
    h = _h()
    for lbl in ('aria-label="Population"', 'aria-label="Intervention or exposure"',
                'aria-label="Comparator"', 'aria-label="Outcome"',
                'aria-label="Study design"', 'aria-label="Timeframe"'):
        assert lbl in h, f"missing PICO label: {lbl}"
    # the decorative single-letter tags are hidden from the a11y tree
    assert 'class="tag" aria-hidden="true"' in h


def test_writes_sr_project_envelope_with_screen_terms():
    h = _h()
    assert 'SR_PROJECT_KEY = "sr-project-v1"' in h
    assert "screenTerms" in h
    # the contract Screen reads: screenTerms.include / .exclude
    assert "include: splitTerms(val(\"tinc\"))" in h
    assert "exclude: splitTerms(val(\"texc\"))" in h


def test_ai_hosts_allowlisted_in_csp():
    h = _h()
    for host in ("api.openai.com", "api.anthropic.com", "generativelanguage.googleapis.com"):
        assert host in h


def test_frame_ancestors_removed_from_meta_csp():
    assert "frame-ancestors" not in _h()
