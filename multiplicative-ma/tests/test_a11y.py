from pathlib import Path
INDEX = Path(__file__).parent.parent / "index.html"
def test_lang(): assert 'lang="' in INDEX.read_text(encoding="utf-8")
def test_title_h1():
    h=INDEX.read_text(encoding="utf-8"); assert "<title>" in h and "<h1" in h
def test_forced_colors(): assert "forced-colors.css" in INDEX.read_text(encoding="utf-8")
