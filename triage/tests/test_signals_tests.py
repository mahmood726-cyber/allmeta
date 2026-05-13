from triage.signals import test_count, has_r_parity


def test_test_count_includes_pytest_mjs_playwright(fixtures_root):
    assert test_count(fixtures_root / "tested-app") == 3


def test_test_count_zero_no_tests_dir(fixtures_root):
    assert test_count(fixtures_root / "clean-app") == 0


def test_has_r_parity_detected(fixtures_root):
    assert has_r_parity(fixtures_root / "tested-app") is True


def test_has_r_parity_false(fixtures_root):
    assert has_r_parity(fixtures_root / "clean-app") is False
