from pathlib import Path
INDEX = Path(__file__).parent.parent / "index.html"
def test_csp(): assert 'http-equiv="Content-Security-Policy"' in INDEX.read_text(encoding="utf-8")
def test_main(): assert "<main" in INDEX.read_text(encoding="utf-8").lower()
def test_hub(): 
    h=INDEX.read_text(encoding="utf-8"); assert 'id="hub-back"' in h or 'href="../"' in h
def test_no_cdn():
    h=INDEX.read_text(encoding="utf-8"); assert 'src="http' not in h and 'href="http' not in h
