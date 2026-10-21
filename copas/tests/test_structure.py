"""Structural integrity tests for copas: hub conventions + security baseline.

Also guards the contract of the back-compatibility hook
`window.__almCopasProfileMLE` against the browser parity spec that calls it
(hub/shared/tests/copas-parity.spec.mjs). That spec and its R oracle live
outside this directory, and the hook is the only thing joining them, so a
field dropped from the hook's return object turns every assertion on that
field into `expect(Math.abs(undefined - x))` — NaN, which `toBeLessThan`
reports as a pass-shaped failure only when the browser suite actually runs.
These checks are cheap, hermetic and run in the Python gate.
"""
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
INDEX = Path(__file__).parent.parent / "index.html"
PARITY_SPEC = ROOT / "hub" / "shared" / "tests" / "copas-parity.spec.mjs"
ORACLE = Path(__file__).parent / "fixtures" / "copas-oracle.json"
ORACLE_GEN = Path(__file__).parent / "fixtures" / "copas-oracle.R"


def test_has_csp_meta():
    """Every allmeta app ships an inline CSP meta tag (defence-in-depth)."""
    html = INDEX.read_text(encoding="utf-8")
    assert 'http-equiv="Content-Security-Policy"' in html, "CSP meta tag missing"


def test_has_skip_link_or_main_landmark():
    """WCAG 2.4.1 — page should expose a skip-link or a <main> landmark."""
    html = INDEX.read_text(encoding="utf-8")
    has_skip = 'class="skip-link"' in html or 'href="#main"' in html or 'href="#content"' in html
    has_main = "<main" in html.lower()
    assert has_skip or has_main, "no skip-link and no <main> landmark"


def test_back_to_hub_navigation():
    """allmeta apps include a back-to-hub link so users can navigate home."""
    html = INDEX.read_text(encoding="utf-8")
    has_hub_back = 'id="hub-back"' in html or 'href="../"' in html or 'href="..\"' in html
    assert has_hub_back, "no back-to-hub navigation found"


# --------------------------------------------------------------------------
# The __almCopasProfileMLE <-> copas-parity.spec.mjs contract
# --------------------------------------------------------------------------
def _hook_returned_fields() -> set[str]:
    """Keys present on EVERY object literal `window.__almCopasProfileMLE`
    returns. The intersection, not the union: the early refusal path and the
    success path must agree, or a caller reading a field gets `undefined` on
    whichever branch omits it."""
    html = INDEX.read_text(encoding="utf-8")
    i = html.index("window.__almCopasProfileMLE")
    # The hook is a function-expression assignment; it ends at the first `};`
    # at the assignment's own indentation. Bounding it matters: without this,
    # the scan runs on into fitCopas()'s own `return { refused: ... }`.
    end = html.index("\n    };", i)
    body = html[i:end]
    per_return = [{km.group(1) for km in re.finditer(r"([A-Za-z_]\w*)\s*:", m.group(1))}
                  for m in re.finditer(r"return\s*\{([^}]*)\}", body)]
    assert per_return, "could not parse __almCopasProfileMLE's return object"
    return set.intersection(*per_return)


def test_parity_spec_oracle_is_present():
    """The browser parity spec loads this oracle by relative path; if the
    fixture is missing the spec dies at import with ENOENT and CI is red on an
    unchanged head. It is this app's fixture, not the deleted Python test's."""
    assert PARITY_SPEC.is_file(), f"{PARITY_SPEC} is gone — update this test"
    spec = PARITY_SPEC.read_text(encoding="utf-8")
    assert "copas-oracle.json" in spec
    assert ORACLE.is_file(), (
        "copas/tests/fixtures/copas-oracle.json is missing but "
        "hub/shared/tests/copas-parity.spec.mjs reads it")
    assert ORACLE_GEN.is_file(), (
        "copas-oracle.json has no committed generator; an unreproducible "
        "oracle cannot be re-derived when metasens changes")


def test_profile_mle_hook_returns_every_field_the_parity_spec_asserts():
    """Whatever the browser spec reads off the hook must be returned by it."""
    spec = PARITY_SPEC.read_text(encoding="utf-8")
    asserted = set(re.findall(r"\bgot\.([A-Za-z_]\w*)", spec))
    assert asserted, "parity spec no longer reads fields off the hook"
    missing = sorted(asserted - _hook_returned_fields())
    assert not missing, (
        "window.__almCopasProfileMLE no longer returns "
        f"{missing} but hub/shared/tests/copas-parity.spec.mjs asserts on "
        "them; every such assertion would compare against undefined")


def test_no_private_notes_file_is_cited_in_shipped_text():
    """`advanced-stats.md` is a private local rules file. Citing it in text a
    user reads points at something no reader can consult, and the paper's
    figures are captured from this page."""
    html = INDEX.read_text(encoding="utf-8")
    bad = [n for n in ("advanced-stats.md", "lessons.md", "AGENTS.md", "CLAUDE.md")
           if n in html]
    assert not bad, f"shipped page cites private notes file(s): {bad}"


def test_page_does_not_claim_the_likelihood_is_never_worse_than_metasens():
    """The validation archive reports the attained objective IS worse than
    metasens's at 84 of 42,498 comparable points (16 of 138 configurations),
    recorded as a pre-registered requirement NOT met. A blanket "never worse"
    in the footer would contradict the project's own report, in the artefact
    the paper describes."""
    html = INDEX.read_text(encoding="utf-8")
    flat = re.sub(r"<[^>]+>", " ", html)
    flat = re.sub(r"\s+", " ", flat).lower()
    for claim in ("never worse than metasens",
                  "is never worse", "never worse at any"):
        assert claim not in flat, f"page claims {claim!r}"
    # ...and it must still disclose the shortfall with both denominators.
    assert "84 of 42,498" in flat, "the disclosed shortfall is missing"
    assert "16 of 138" in flat, "the per-configuration denominator is missing"
    assert "deviations.md" in flat, "the file recording the shortfall is not named"


def test_profile_mle_hook_keeps_the_documented_back_compat_contract():
    """The hook is kept solely for the earlier parity spec, so its advertised
    shape {TE, rho, tau, seTE, seTEdiag, nll} is the contract — not just the
    subset the current spec happens to assert on."""
    missing = sorted({"TE", "rho", "tau", "seTE", "seTEdiag", "nll"}
                     - _hook_returned_fields())
    assert not missing, f"back-compat hook dropped {missing}"
