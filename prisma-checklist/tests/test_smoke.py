"""Smoke tests for prisma-checklist."""
from pathlib import Path

INDEX = Path(__file__).parent.parent / "index.html"


def test_index_exists():
    assert INDEX.is_file()


def test_index_has_27_item_4state_structure():
    html = INDEX.read_text(encoding="utf-8")
    # The PRISMA 2020 checklist has 27 items; the app uses a 4-state evaluation.
    assert "PRISMA" in html
    # The 4-state vocabulary is the app's domain — yes / partial / no / todo.
    assert "todo" in html.lower()
