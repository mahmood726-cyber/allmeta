"""Offline contract checks; no browser, model downloads or Node required."""
import hashlib
import re
import unittest
from pathlib import Path

SCREEN = Path(__file__).resolve().parents[1]
PIN = "15b243065a14ecc6ce11ff3cc128d6bfa70b648a25f95116047245314100f252"

class RankCoreStatic(unittest.TestCase):
    def test_pinned_worker_import(self):
        worker = (SCREEN / "rank-worker.js").read_text()
        self.assertIn("importScripts('h2h/js/rank-core.js')", worker)
        self.assertEqual(hashlib.sha256((SCREEN / "h2h/js/rank-core.js").read_bytes()).hexdigest(), PIN)

    def test_shell_caches_all_ranking_files(self):
        sw = (SCREEN / "sw.js").read_text()
        for name in ("rank-worker.js", "rank-config.js", "rank-ui.js", "h2h/js/rank-core.js"):
            self.assertIn('"' + name + '"', sw)
        self.assertIn("screen-shell-rankcore-4", sw)

    def test_no_remote_fetch_or_import(self):
        for name in ("rank-worker.js", "rank-config.js", "rank-ui.js", "h2h/js/rank-core.js", "sw.js"):
            text = (SCREEN / name).read_text()
            self.assertIsNone(re.search(r"fetch\s*\(\s*['\"](?:https?:)?//", text))
        for name in ("rank-worker.js", "rank-config.js", "rank-ui.js"):
            self.assertNotIn("fetch(", (SCREEN / name).read_text())
        html = (SCREEN / "index.html").read_text(encoding="utf-8")
        self.assertIn("connect-src 'self'", html)
        for name in ("rank-config.js", "rank-ui.js"):
            self.assertIn('src="' + name + '"', html)

if __name__ == "__main__":
    unittest.main()
