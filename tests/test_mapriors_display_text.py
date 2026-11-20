"""mapriors (paper 36): engine UI strings must not show a literal '?' where a character was lost.

The P36 figure capture recorded the summary line as "beta ~ N(0, 2?)": the superscript two of
N(mean, SD^2) and the ellipsis of "Integrating posterior..." were saved as '?'. Static check of the
page source (the strings are built in engineSummaryHTML() and runMAP()).
"""
from pathlib import Path

PAGE = Path(__file__).resolve().parent.parent / "mapriors" / "index.html"


def test_beta_prior_shows_sd_squared_not_question_mark():
    h = PAGE.read_text(encoding="utf-8")
    assert "r.settings.betaSD+'?)" not in h
    assert "r.settings.betaSD+'\u00b2)" in h


def test_progress_label_has_no_lost_ellipsis():
    h = PAGE.read_text(encoding="utf-8")
    assert "'Integrating posterior?'" not in h
    assert "'Integrating posterior\u2026'" in h
