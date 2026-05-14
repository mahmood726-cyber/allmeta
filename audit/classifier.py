"""Runtime-audit classifier. Six states, first-match-wins."""

from __future__ import annotations
import re


NEEDS_SERVICE_PATTERNS = [
    re.compile(r"\bnot reachable\b", re.IGNORECASE),
    re.compile(r"connection (refused|failed)", re.IGNORECASE),
    re.compile(r"\bcannot connect\b", re.IGNORECASE),
    re.compile(r"server (down|unavailable)", re.IGNORECASE),
    re.compile(r"\bunavailable\b", re.IGNORECASE),
    re.compile(r"ollama not (running|reachable)", re.IGNORECASE),
    re.compile(r"start the .* server", re.IGNORECASE),
]


BENIGN_ERROR_PATTERNS = [
    re.compile(r"Content Security Policy", re.IGNORECASE),
    re.compile(r"favicon\.ico", re.IGNORECASE),
    re.compile(r"Failed to load resource.*(?:127\.0\.0\.1|localhost):", re.IGNORECASE),
    # ERR_CONNECTION_REFUSED is expected when a local-backend probe (health check) fires
    # at page load and the optional service isn't running. It's not an app bug.
    re.compile(r"net::ERR_CONNECTION_REFUSED", re.IGNORECASE),
]


def filter_console_errors(errors: list[str]) -> list[str]:
    """Drop noise. Returns the errors that survive the filter."""
    return [
        e for e in errors
        if not any(p.search(e) for p in BENIGN_ERROR_PATTERNS)
    ]


def classify(probe: dict) -> dict:
    """Map a raw probe-result dict to {state, reasons, confidence}.
    First-match-wins, top-down."""
    reasons: list[str] = []

    if probe.get("probe_crashed"):
        reasons.append("probe crashed (Playwright error)")
        return {"state": "UNKNOWN", "reasons": reasons, "confidence": "low"}

    if probe.get("timed_out"):
        reasons.append("page did not reach networkidle within timeout")
        return {"state": "TIMEOUT", "reasons": reasons, "confidence": "low"}

    ui_matches = probe.get("ui_text_matches") or []
    if ui_matches:
        for m in ui_matches[:3]:
            reasons.append(f"UI text matched: {m!r}")
        return {"state": "NEEDS-SERVICE", "reasons": reasons, "confidence": "high"}

    raw_errors = probe.get("console_errors") or []
    filtered = filter_console_errors(raw_errors)
    if filtered:
        for e in filtered[:3]:
            reasons.append(f"console.error: {e[:120]}")
        return {"state": "CONSOLE-ERRORS", "reasons": reasons, "confidence": "high"}

    if probe.get("mount_found") is False:
        reasons.append("no primary mount landmark (svg/canvas/textarea/table input/action button)")
        return {"state": "MISSING-MOUNT", "reasons": reasons, "confidence": "medium"}

    reasons.append(f"loaded in {probe.get('load_time_ms', '?')} ms")
    return {"state": "OK", "reasons": reasons, "confidence": "high"}
