"""Unit tests for svg_innerHTML_codemod.rewrite_function_body.

Exercises the pattern-matching and safety bailouts. Each test builds a
minimal <script>-free function body string, runs the rewriter, and asserts
either a specific output or that the rewriter bailed out (returns None).

The codemod is regex-based and has miscompiled twice in production use
(chained `=`, chained `+=`). These tests pin the safe patterns so
regressions get caught before the tool rewrites ~50 HTML files.
"""
from __future__ import annotations

import sys
import textwrap
from pathlib import Path

import pytest

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent))
from svg_innerHTML_codemod import rewrite_function_body  # noqa: E402


def body(src: str) -> str:
    """Dedent and strip leading blank line for readable test literals."""
    return textwrap.dedent(src).lstrip("\n")


# ---------- eligible patterns ----------

def test_single_var_empty_reset_then_pushes():
    src = body("""
        const svg = document.getElementById("plot");
        svg.innerHTML = "";
        for (const p of items) {
          svg.innerHTML += `<rect x="${p}"/>`;
        }
    """)
    out = rewrite_function_body(src)
    assert out is not None
    # Empty-string reset collapses to an empty array (SE-9: avoid dead `[""]` element).
    assert "const __svgParts = [];" in out
    assert "__svgParts.push(`<rect x=\"${p}\"/>`);" in out
    assert "svg.innerHTML = __svgParts.join(\"\");" in out
    # Original += must be gone
    assert "svg.innerHTML +=" not in out


def test_single_var_reset_with_prefix_content():
    src = body("""
        x.innerHTML = "<header/>";
        x.innerHTML += "<row/>";
    """)
    out = rewrite_function_body(src)
    assert out is not None
    assert 'const __xParts = ["<header/>"];' in out
    assert '__xParts.push("<row/>");' in out
    assert "x.innerHTML = __xParts.join(\"\");" in out


def test_multiple_non_overlapping_vars():
    src = body("""
        a.innerHTML = "";
        a.innerHTML += "<a1/>";
        a.innerHTML += "<a2/>";
        b.innerHTML = "";
        b.innerHTML += "<b1/>";
    """)
    out = rewrite_function_body(src)
    assert out is not None
    # Both vars converted; empty resets become `[]`.
    assert "const __aParts = [];" in out
    assert "const __bParts = [];" in out
    assert "__aParts.push(\"<a1/>\");" in out
    assert "__bParts.push(\"<b1/>\");" in out
    assert "a.innerHTML = __aParts.join(\"\");" in out
    assert "b.innerHTML = __bParts.join(\"\");" in out


def test_multi_line_template_literal_rhs():
    src = body("""
        svg.innerHTML = "";
        svg.innerHTML += `
          <rect x="${p.x}"
                y="${p.y}"/>`;
    """)
    out = rewrite_function_body(src)
    assert out is not None
    # Must preserve the multi-line template verbatim
    assert "<rect x=\"${p.x}\"" in out
    assert "__svgParts.push(" in out


# ---------- safety bailouts ----------

def test_chained_assignment_bails_out():
    """`a.innerHTML = b.innerHTML = ""` would require a real parser to unchain."""
    src = body("""
        a.innerHTML = b.innerHTML = "";
        a.innerHTML += "<x/>";
    """)
    assert rewrite_function_body(src) is None


def test_chained_plus_assignment_bails_out():
    """`container.innerHTML += L += "..."` would leave `L` dangling after substitution."""
    src = body("""
        perBody.innerHTML = "";
        perBody.innerHTML += L += `<tr/>`;
    """)
    assert rewrite_function_body(src) is None


def test_append_before_assignment_bails():
    """If a += appears before the single `=` reset, the transform is incorrect."""
    src = body("""
        svg.innerHTML += "<stray/>";
        svg.innerHTML = "";
        svg.innerHTML += "<row/>";
    """)
    assert rewrite_function_body(src) is None


def test_multiple_assignments_for_same_var_bails():
    """Two resets in one function can't be safely collapsed to one array."""
    src = body("""
        svg.innerHTML = "<a/>";
        svg.innerHTML += "<b/>";
        svg.innerHTML = "<c/>";
        svg.innerHTML += "<d/>";
    """)
    assert rewrite_function_body(src) is None


def test_early_return_between_reset_and_push_bails():
    """Early `return` in the middle breaks the single-flush-at-end invariant."""
    src = body("""
        svg.innerHTML = "";
        if (!items) return;
        svg.innerHTML += "<x/>";
    """)
    assert rewrite_function_body(src) is None


def test_no_appends_returns_none():
    """A function that only resets innerHTML has nothing to rewrite."""
    src = body("""
        svg.innerHTML = "";
        svg.setAttribute("viewBox", "0 0 100 100");
    """)
    assert rewrite_function_body(src) is None


def test_comma_expression_rhs_bails_out():
    """`x.innerHTML += a, b;` would collapse to push(a, b) — two elements not a comma expr."""
    src = body("""
        svg.innerHTML = a, "<init/>";
        svg.innerHTML += "<x/>";
    """)
    assert rewrite_function_body(src) is None


def test_commas_inside_brackets_are_safe():
    """Commas inside function calls / arrays should NOT trigger the top-level-comma guard."""
    src = body("""
        svg.innerHTML = "";
        svg.innerHTML += tmpl("<x/>", id, {a: 1, b: 2});
    """)
    out = rewrite_function_body(src)
    assert out is not None
    assert 'tmpl("<x/>", id, {a: 1, b: 2})' in out


def test_interleaved_vars_both_rejected():
    """
    When two vars' append ranges overlap (e.g. A's reset..last-push spans
    some of B's pushes), both must be rejected, not silently leave one half-converted.
    """
    src = body("""
        a.innerHTML = "";
        b.innerHTML = "";
        a.innerHTML += "<a1/>";
        b.innerHTML += "<b1/>";
        a.innerHTML += "<a2/>";
    """)
    # This is interleaved — the span for `a` (reset..last a-push) includes b's push.
    # The tool should reject both vars to avoid mixed-state output.
    out = rewrite_function_body(src)
    if out is not None:
        # If the tool DID convert, it must have converted BOTH (not half-converted one).
        # Raw `a.innerHTML += "<a2/>"` or `b.innerHTML += "<b1/>"` surviving is the bug.
        assert "a.innerHTML +=" not in out, "a left half-converted — the interleaving bug"
        assert "b.innerHTML +=" not in out, "b left half-converted — the interleaving bug"


# ---------- idempotence ----------

def test_idempotent_on_already_converted_code():
    """Running twice should be a no-op (no += patterns remain on second pass)."""
    src = body("""
        const __svgParts = [""];
        __svgParts.push("<x/>");
        svg.innerHTML = __svgParts.join("");
    """)
    out = rewrite_function_body(src)
    assert out is None, "should not rewrite already-converted code"


# ---------- edge cases ----------

def test_semicolon_optional():
    """Trailing `;` should not be required but must be handled."""
    src1 = body('svg.innerHTML = ""\nsvg.innerHTML += "<x/>"\n')
    src2 = body('svg.innerHTML = "";\nsvg.innerHTML += "<x/>";\n')
    # Both either rewrite cleanly OR bail out — but must not produce garbage.
    for src in (src1, src2):
        out = rewrite_function_body(src)
        if out is not None:
            assert "svg.innerHTML +=" not in out
            assert "__svgParts" in out
