"""Static guards for the first-run / ASReview-interop quick wins (feat/screen-ux-quickwins)."""
import re
from pathlib import Path

ROOT = Path(__file__).parent.parent
INDEX = ROOT / "index.html"
UX_FILES = [ROOT / "ux.js", ROOT / "ux-ui.js"]


def _h():
    return INDEX.read_text(encoding="utf-8")


def test_ux_scripts_loaded_in_order_and_cached_offline():
    h = _h()
    order = [h.index('src="workflow.js"'), h.index('src="ux.js"'), h.index("<script>\n"), h.index('src="hybrid-ui.js"'), h.index('src="ux-ui.js"')]
    assert order == sorted(order), "ux.js must load before the inline app and ux-ui.js after hybrid-ui.js"
    sw = (ROOT / "sw.js").read_text(encoding="utf-8")
    assert '"ux.js"' in sw and '"ux-ui.js"' in sw, "offline shell must cache the new scripts"
    assert "screen-shell-hybrid-1'" not in sw, "shell cache version must be bumped so old caches are replaced"


def test_ux_code_makes_no_network_calls():
    for f in UX_FILES:
        s = f.read_text(encoding="utf-8")
        for bad in ("fetch(", "XMLHttpRequest", "WebSocket", "sendBeacon", "http://", "https://", "import("):
            assert bad not in s, f"{f.name} must stay offline: {bad}"
    assert "connect-src 'self'" in _h()


def test_no_stopping_or_recall_guarantee_language():
    texts = [_h()] + [f.read_text(encoding="utf-8") for f in UX_FILES]
    for s in texts:
        low = s.lower()
        for bad in ("safe to stop", "you can stop", "stop screening now", "recall guarantee", "guaranteed recall"):
            assert bad not in low, bad
    assert "do not estimate how many relevant records remain" in _h()


def test_ux_ui_does_not_touch_ranking_math_or_cadence():
    s = (ROOT / "ux-ui.js").read_text(encoding="utf-8")
    # It may only click the existing trainer and mirror the existing opt-in checkbox.
    assert "$('hy-train').click()" in s
    for bad in ("ScreenHybrid", "hybridScore =", "hybridScore=", "DEFAULTS", "postMessage", "new Worker", "mlTrain", "onTrain", "autoRank"):
        assert bad not in s, bad


def test_new_controls_have_unique_ids_and_balanced_markup():
    h = _h()
    ids = re.findall(r'id="([^"]+)"', h)
    dupes = {i for i in ids if ids.count(i) > 1}
    assert not dupes, dupes
    for i in ("btn-export-asreview", "ux-strip", "ux-gate", "ux-start-ai", "ux-auto", "ux-progress"):
        assert f'id="{i}"' in h
    assert len(re.findall(r"<div[\s>]", h)) == h.count("</div>")
    inline = h[h.index("<script>\n"):]
    inline = inline[:inline.index("</script>")]
    assert "</script" not in inline[len("<script>"):]
