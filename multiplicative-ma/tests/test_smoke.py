from pathlib import Path
INDEX = Path(__file__).parent.parent / "index.html"
def test_index_exists(): assert INDEX.is_file()
def test_title(): assert "multiplicative" in INDEX.read_text(encoding="utf-8").lower()
def test_uses_shared_uwls():
    h=INDEX.read_text(encoding="utf-8"); assert "../shared/uwls.js" in h and "AlmUWLS.uwls" in h
