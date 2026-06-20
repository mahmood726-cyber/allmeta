from audit.classifier import classify, BENIGN_ERROR_PATTERNS, NEEDS_SERVICE_PATTERNS, filter_console_errors


def _probe(**over):
    """Build a probe-result dict with sensible defaults."""
    base = {
        "key": "demo",
        "url": "http://localhost:8088/demo/",
        "probe_crashed": False,
        "load_ok": True,
        "timed_out": False,
        "console_errors": [],
        "mount_found": True,
        "ui_text_matches": [],
    }
    base.update(over)
    return base


def test_unknown_when_probe_crashed():
    r = classify(_probe(probe_crashed=True))
    assert r["state"] == "UNKNOWN"
    assert r["confidence"] == "low"


def test_timeout_when_timed_out():
    r = classify(_probe(timed_out=True, load_ok=False))
    assert r["state"] == "TIMEOUT"
    assert r["confidence"] == "low"


def test_needs_service_fires_before_console_errors():
    r = classify(_probe(
        ui_text_matches=["not reachable"],
        console_errors=["Failed to load resource: net::ERR_CONNECTION_REFUSED"],
    ))
    assert r["state"] == "NEEDS-SERVICE"
    assert any("not reachable" in s for s in r["reasons"])


def test_console_errors_when_errors_after_filter():
    r = classify(_probe(console_errors=["TypeError: foo is not a function"]))
    assert r["state"] == "CONSOLE-ERRORS"


def test_missing_mount_when_mount_false_and_no_errors():
    r = classify(_probe(mount_found=False))
    assert r["state"] == "MISSING-MOUNT"
    assert r["confidence"] == "medium"


def test_landing_page_is_ok_not_missing_mount():
    r = classify(_probe(mount_found=False, landing_page=True, nav_link_count=6))
    assert r["state"] == "OK"
    assert r["confidence"] == "high"
    assert any("landing page" in s for s in r["reasons"])


def test_missing_mount_when_no_mount_and_not_landing():
    r = classify(_probe(mount_found=False, landing_page=False))
    assert r["state"] == "MISSING-MOUNT"


def test_real_app_with_mount_is_ok_even_if_landing_flag_absent():
    # mount_found True short-circuits before the landing-page branch is consulted.
    r = classify(_probe(mount_found=True))
    assert r["state"] == "OK"


def test_ok_when_all_clean():
    r = classify(_probe())
    assert r["state"] == "OK"
    assert r["confidence"] == "high"


def test_filter_drops_csp_noise():
    out = filter_console_errors([
        "Content Security Policy: The page's settings blocked the loading...",
        "TypeError: foo is undefined",
    ])
    assert out == ["TypeError: foo is undefined"]


def test_filter_drops_favicon_noise():
    out = filter_console_errors([
        "Failed to load resource: /favicon.ico 404",
        "Real error: x",
    ])
    assert out == ["Real error: x"]


def test_filter_drops_localhost_noise():
    out = filter_console_errors([
        "Failed to load resource: http://127.0.0.1:8000/extract",
        "Failed to load resource: http://localhost:11434/api/tags",
        "Genuine error",
    ])
    assert out == ["Genuine error"]


def test_ok_when_console_errors_are_all_benign():
    r = classify(_probe(console_errors=[
        "Content Security Policy: frame-ancestors directive blocked...",
        "Failed to load resource: /favicon.ico 404",
    ]))
    assert r["state"] == "OK"


def test_needs_service_patterns_list_not_empty():
    assert len(NEEDS_SERVICE_PATTERNS) >= 5


def test_benign_error_patterns_list_not_empty():
    assert len(BENIGN_ERROR_PATTERNS) >= 3
