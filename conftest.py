# Root pytest configuration for the allmeta offline test suite.
#
# Some app directories carry legacy *standalone* Selenium runner scripts named
# `test_*.py` that live at the app root (not under `<app>/tests/`). These are
# browser-driven integration scripts meant to be run by hand
# (`python test_v19_comprehensive.py`) against a live Chrome/Firefox — they are
# NOT part of the default offline unit suite, they require a browser + network,
# and collecting the dosehtml set (which has duplicate basenames across frozen
# release snapshots) corrupts pytest's capture machinery
# ("ValueError: I/O operation on closed file" at session teardown).
#
# Exclude them from default collection here. They remain runnable directly.
# Archived snapshot copies are additionally pruned via `norecursedirs` in
# pytest.ini. Run them explicitly with: pytest <path> --import-mode=importlib
collect_ignore = [
    "dosehtml/test_dose_response_app.py",
    "dosehtml/test_dose_response_main.py",
    "dosehtml/test_v19_comprehensive.py",
    "Pairwiseai/test_hta.py",
    "Pairwiseai/test_truthcert_comprehensive.py",
    "Pairwiseai/test_truthcert_v2.py",
]
