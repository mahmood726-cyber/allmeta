from pathlib import Path
from triage.signals import has_index, has_readme, total_size_kb


def test_has_index_true(fixtures_root):
    assert has_index(fixtures_root / "stub-app") is True


def test_has_index_false(tmp_path):
    (tmp_path / "no-index").mkdir()
    assert has_index(tmp_path / "no-index") is False


def test_has_readme_false_when_absent(fixtures_root):
    assert has_readme(fixtures_root / "stub-app") is False


def test_total_size_kb_sums_html_js_css(fixtures_root):
    kb = total_size_kb(fixtures_root / "clean-app")
    assert kb > 0.0 and kb < 5.0  # tiny file
