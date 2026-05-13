from pathlib import Path
from triage.signals import stub_count
import pytest


@pytest.fixture
def fixtures_root():
    return Path(__file__).parent / "fixtures"


def test_stub_count_detects_markers(fixtures_root):
    assert stub_count(fixtures_root / "stub-app") == 3  # TODO + unimpl + REPLACE_ME


def test_stub_count_zero_on_clean(fixtures_root):
    assert stub_count(fixtures_root / "clean-app") == 0


def test_stub_count_zero_on_missing_folder(tmp_path):
    assert stub_count(tmp_path / "does-not-exist") == 0
