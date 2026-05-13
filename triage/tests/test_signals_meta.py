"""Tests for playwright_pass, kind_from_category, load_playwright_report."""
from triage.signals import playwright_pass, kind_from_category, load_playwright_report


def test_playwright_pass_true(fixtures_root):
    report = load_playwright_report(fixtures_root / "playwright-report.json")
    assert playwright_pass("forest-plot", report) is True


def test_playwright_pass_false(fixtures_root):
    report = load_playwright_report(fixtures_root / "playwright-report.json")
    assert playwright_pass("Truthcert1", report) is False


def test_playwright_pass_none_when_app_missing(fixtures_root):
    report = load_playwright_report(fixtures_root / "playwright-report.json")
    assert playwright_pass("unknown-app", report) is None


def test_playwright_pass_none_when_report_missing(tmp_path):
    assert load_playwright_report(tmp_path / "nope.json") is None


def test_kind_from_category_non_numerical():
    assert kind_from_category("Reporting") == "non-numerical"
    assert kind_from_category("Productivity") == "non-numerical"
    assert kind_from_category("Qualitative Synthesis") == "non-numerical"


def test_kind_from_category_numerical():
    assert kind_from_category("Pairwise MA") == "numerical"
    assert kind_from_category("Diagnostic Test Accuracy") == "numerical"
    assert kind_from_category(None) == "numerical"  # default
