from pathlib import Path


def test_canonical_entrypoint_exists():
    root = Path(__file__).resolve().parents[1]
    assert (root / "dose-response-pro.html").exists()
    assert (root / "README.md").exists()
    assert (root / "docs" / "Version_Comparison.md").exists()
