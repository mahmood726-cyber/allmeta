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


def test_both_ingestion_paths_use_the_shared_whole_token_parser():
    """The page has two readers — the textarea (parse()) and the CSV upload
    (__almCopasLoad). parseFloat is a prefix parser, so ".4oops" reads as 0.4
    and "30oops" as 30; a malformed row then becomes a schema-valid but
    semantically wrong study that nothing downstream can detect. Fixing one
    reader and not the other left the defect live for every user who uploads a
    CSV instead of pasting."""
    html = INDEX.read_text(encoding="utf-8")
    i = html.index("window.__almCopasLoad")
    body = html[i:html.index("\n    };", i)]
    assert "parseFloat" not in body, (
        "__almCopasLoad still uses parseFloat — it must use the shared "
        "whole-token parser (num === CC.parseNumToken) like parse() does")
    assert re.search(r"\bnum\(", body), (
        "__almCopasLoad does not call the shared num() parser")
    # And the page must not re-declare the rule locally: one rule, one place.
    assert "CC.parseNumToken" in html, (
        "the page must take its number rule from shared/copas-core.js so it "
        "can be tested without a browser")
    assert html.count(r"^[+-]?(\d+\.?\d*|\.\d+)") == 0, (
        "the number-token regex is re-declared in the page; it belongs only "
        "in shared/copas-core.js")


def test_both_shared_modules_are_checked_before_use():
    """copas-core.js and ma-core.js are hard dependencies of this page. A 404
    or a load-order change used to throw a bare TypeError inside run() with
    nothing on screen."""
    html = INDEX.read_text(encoding="utf-8")
    assert "window.AlmCopasCore" in html and "window.AlmMaCore" in html
    head = html[html.index("window.AlmCopasCore"):]
    head = head[:4000]
    assert "copas-core.js" in head and "ma-core.js" in head, \
        "the missing-module message should name the files that failed to load"
    assert re.search(r"typeof\s+CC\.copas\s*!==\s*['\"]function['\"]", head), \
        "copas-core.js is not verified to have actually loaded"
    assert re.search(r"typeof\s+MaCore\.pool\s*!==\s*['\"]function['\"]", head), \
        "ma-core.js is not verified to have actually loaded"


def test_counts_are_not_rendered_with_bare_toFixed():
    """N.unpubl is Inf wherever an implied selection probability underflows —
    R gives Inf there too, so the value stays faithful, but
    (Infinity).toFixed(1) puts the literal string "Infinity" in a table
    cell."""
    html = INDEX.read_text(encoding="utf-8")
    for bad in ("N_unpubl_adj.toFixed", "nUnpubl.toFixed"):
        assert bad not in html, (
            f"{bad} renders Infinity as the string 'Infinity'; use fmtCount()")
    assert "function fmtCount" in html, "fmtCount() is missing"


def test_every_refusal_reason_the_engine_can_return_is_explained():
    """copas() refuses with a distinct string per reason. If the page does not
    handle one, the user gets the generic 'at least 3 studies' message for a
    completely different problem."""
    core = (ROOT / "shared" / "copas-core.js").read_text(encoding="utf-8")
    reasons = set(re.findall(r'refused:\s*"([^"]+)"', core))
    assert reasons, "could not find any refusal reasons in shared/copas-core.js"
    html = INDEX.read_text(encoding="utf-8")
    # Reasons that cannot reach run(): the page never supplies TE_contour.
    validation_only = {"TE_contour.length!=ngrid^2"}
    missing = sorted(r for r in reasons - validation_only if r not in html)
    assert not missing, (
        f"copas/index.html does not explain these refusal reasons: {missing}")


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
