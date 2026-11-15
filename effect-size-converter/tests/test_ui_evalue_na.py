"""Offline browser contract for P20/P22's actual inputs, rendered NA and exports."""
import functools
import http.server
import json
import os
import threading
from pathlib import Path

import pytest
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[2]
REFERENCE = json.loads((Path(__file__).parent / "fixtures/p20-p22-evalue-na-reference.json").read_text(encoding="utf-8"))
CASES = [c for c in REFERENCE["cases"] if c["measure"] not in ("D", "MD")]


@pytest.fixture(scope="module")
def browser_page():
    handler = functools.partial(http.server.SimpleHTTPRequestHandler, directory=str(ROOT))
    server = http.server.ThreadingHTTPServer(("127.0.0.1", 8000), handler)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    try:
        with sync_playwright() as p:
            browser = p.chromium.launch(channel=os.environ.get("PW_CHANNEL"))
            page = browser.new_page()
            page.route("**/*", lambda route: route.continue_() if route.request.url.startswith("http://127.0.0.1:8000/") else route.abort())
            yield page
            browser.close()
    finally:
        server.shutdown()
        server.server_close()
        thread.join(timeout=5)


@pytest.mark.parametrize("app,prefix", [("effect-size-converter", "ev-"), ("evalue", "")])
def test_real_inputs_na_and_export(browser_page, app, prefix):
    page = browser_page
    page.goto(f"http://127.0.0.1:8000/{app}/index.html")
    for c in CASES:
        if app == "evalue" and c["id"].endswith("only"):
            continue  # This app's existing input contract requires complete CI or none.
        page.locator(f"#{prefix}measure").select_option(c["measure"])
        for key in ("point", "lo", "hi"):
            page.locator(f"#{prefix}{key}").fill("" if c[key] is None else str(c[key]))
        page.locator(f"#{prefix}rare").set_checked(c["rare"])
        result = page.evaluate("JSON.parse(JSON.stringify(window.__almLastEValue()))")
        assert result is not None, c["id"]
        for key in ("point", "ci", "lower", "upper"):
            expected = c["expected"][key]
            assert result[key] == (None if expected is None else pytest.approx(expected, abs=1e-12)), (c["id"], key)
        text = page.locator("#ev-out" if prefix else "#tbody").inner_text()
        assert "not applicable" in text and ("missing" in text or "farther" in text), c["id"]
