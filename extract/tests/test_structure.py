from pathlib import Path

INDEX = Path(__file__).parent.parent / "index.html"


def _h():
    return INDEX.read_text(encoding="utf-8")


def test_csp_and_main():
    h = _h()
    assert 'http-equiv="Content-Security-Policy"' in h
    assert "<main" in h.lower()
    assert "frame-ancestors" not in h  # ignored in <meta>, must not be present


def test_no_cdn():
    h = _h()
    assert 'src="http' not in h and 'href="http' not in h


def test_hub_back():
    assert 'id="hub-back"' in _h()


def test_test_hook_present():
    assert "__almExtract" in _h()


def test_extraction_engine_functions():
    h = _h()
    for fn in ("function extractEffects", "function extractSampleSizes", "function extractEvents",
               "function extractRoB", "function extractDesign", "function extractPICO", "function toMaStudy"):
        assert fn in h, f"missing engine fn: {fn}"


def test_feeds_ma_studies_bus():
    h = _h()
    assert "ma-studies-v1.js" in h
    assert "MaStudies.fromCI" in h and "MaStudies.write" in h


def test_negation_guard_present():
    # "Not randomized 1807" trap (rules/lessons.md) must be guarded.
    assert "NEG" in _h() and "not|non|never" in _h()


def test_no_placeholder_or_hardcoded_key():
    h = _h()
    for bad in ("{{", "REPLACE_ME", "__PLACEHOLDER__", ">None<", "/None", "sk-proj-", "sk-SECRET"):
        assert bad not in h


def test_csv_injection_guard_excludes_hyphen():
    h = _h()
    assert r"/^[=+@\t\r]/" in h
    assert r"/^[=+\-@\t\r]/" not in h


def test_pdf_ingestion_wired():
    # P0: offline PDF ingestion via the vendored pdf.js + the pdf-extract module.
    h = _h()
    assert "../shared/vendor/pdfjs/pdf.min.js" in h, "vendored pdf.js not loaded"
    assert "../shared/pdf-extract-v1.js" in h
    assert 'id="btn-import-pdf"' in h and 'id="file-pdf"' in h
    assert "onPdfFiles" in h and "SrPdf" in h
    # full text feeds the deterministic engine
    assert "fullText" in h and "function appendRecords" in h


def test_span_grounding_wired():
    # P0: every surfaced value is traceable; LLM quotes are validated, not trusted.
    h = _h()
    assert "../shared/extract-grounding-v1.js" in h
    assert "SrGrounding" in h and "function groundingLine" in h
    assert "validateQuote" in h            # LLM grounding path
    assert "ungrounded" in h               # ungrounded LLM values are flagged
    # the AI prompt requests a verbatim supporting quote
    assert "quote" in h and "verbatim" in h.lower()


def test_pdf_fulltext_not_persisted():
    # full text is in-memory only; the saved/exported envelope must not carry it.
    h = _h()
    # envelope() builds the persisted record list; ensure fullText isn't mapped into it
    start = h.index("function envelope")
    env_block = h[start:start + 900]
    assert "fullText" not in env_block, "fullText must not be written to localStorage/exports"


def test_pdfjs_vendored_offline():
    # the vendored lib + worker exist on disk (no CDN at runtime)
    base = Path(__file__).parent.parent.parent / "shared" / "vendor" / "pdfjs"
    assert (base / "pdf.min.js").is_file()
    assert (base / "pdf.worker.min.js").is_file()
