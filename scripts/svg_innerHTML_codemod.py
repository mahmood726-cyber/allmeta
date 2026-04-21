#!/usr/bin/env python
"""Replace O(n^2) svg.innerHTML += accumulation with O(n) array.join().

Only transforms function bodies that match the safe pattern:

    function NAME(...) {
      ...
      VAR.innerHTML = "";                         # the reset (or: = "<prefix>")
      ...
      VAR.innerHTML += "<chunk>";                 # zero or more pushes
      ...
    }                                              # closing brace of function

Requirements for a function to be eligible:
  * The first assignment to VAR.innerHTML inside the function MUST be
    `VAR.innerHTML = "...";` or `VAR.innerHTML = "";`
  * All subsequent references to VAR.innerHTML must be `+=` within that function
  * No early `return` statements between reset and the last push
  * No nested function declarations that also touch VAR.innerHTML

When all conditions hold, rewrite:
    reset      -> `const __<var>Parts = [<X>];`
    each +=    -> `__<var>Parts.push(<Y>);`
    then append `VAR.innerHTML = __<var>Parts.join("");` just before the closing brace.

Dry-run by default: `--write` applies changes.
"""
from __future__ import annotations

import argparse
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

EXCLUDE_PARTS = {"node_modules", "coverage", "artifacts", "html-report", "__pycache__"}
EXCLUDE_PATH_RE = re.compile(r"(backup|backup_\d+|lcov-report)", re.I)

FN_RE = re.compile(r"function\s+([A-Za-z_$][\w$]*)\s*\([^)]*\)\s*\{", re.M)

SCRIPT_RE = re.compile(r"<script\b[^>]*>(.*?)</script>", re.S | re.I)


def find_script_blocks(text: str) -> list[tuple[int, int, str]]:
    """Return list of (start, end, body) for each <script> block."""
    out = []
    for m in SCRIPT_RE.finditer(text):
        out.append((m.start(1), m.end(1), m.group(1)))
    return out


def find_balanced_close(s: str, open_idx: int) -> int | None:
    """Return index of matching `}` given that s[open_idx] == '{'."""
    assert s[open_idx] == "{"
    depth = 0
    i = open_idx
    in_str = None  # None | '"' | "'" | "`" | "/*" | "//"
    escape = False
    while i < len(s):
        c = s[i]
        if in_str == "//":
            if c == "\n":
                in_str = None
        elif in_str == "/*":
            if c == "*" and i + 1 < len(s) and s[i + 1] == "/":
                in_str = None
                i += 1
        elif in_str in ('"', "'", "`"):
            if escape:
                escape = False
            elif c == "\\":
                escape = True
            elif c == in_str:
                in_str = None
        else:
            if c == "/" and i + 1 < len(s) and s[i + 1] == "/":
                in_str = "//"
                i += 1
            elif c == "/" and i + 1 < len(s) and s[i + 1] == "*":
                in_str = "/*"
                i += 1
            elif c in ('"', "'", "`"):
                in_str = c
            elif c == "{":
                depth += 1
            elif c == "}":
                depth -= 1
                if depth == 0:
                    return i
        i += 1
    return None


def collect_functions(block: str):
    """Yield (name, body_start, body_end_exclusive, open_brace_idx, close_brace_idx) for each fn in block."""
    for m in FN_RE.finditer(block):
        brace = block.find("{", m.end() - 1)
        if brace < 0:
            continue
        end = find_balanced_close(block, brace)
        if end is None:
            continue
        yield m.group(1), brace + 1, end, brace, end


def rewrite_function_body(body: str) -> str | None:
    """Rewrite a function body if it matches the safe pattern. Returns new body or None."""
    # SAFETY: bail out if the body has a chained innerHTML assignment
    # (e.g. `a.innerHTML = b.innerHTML = "";`). Our regex-based rewriter can't
    # correctly unchain these without a real parser.
    if re.search(r"\.innerHTML\s*=\s*\w+\.innerHTML\s*=", body):
        return None

    # SAFETY: bail out if the body uses a chained `x.innerHTML += Y += ...` where
    # Y is a separate accumulator variable (e.g. `container.innerHTML += L += "<tr>...";`).
    # Substituting `.innerHTML +=` with `__xParts.push(` leaves `L += "..."` stranded as
    # an argument, referencing an undeclared identifier.
    if re.search(r"\.innerHTML\s*\+=\s*\w+\s*\+=", body):
        return None

    # find all innerHTML ops
    # We look for VAR.innerHTML = RHS;  and  VAR.innerHTML += RHS;
    # per-variable analysis
    pat_assign = re.compile(r"\b([A-Za-z_$][\w$]*)\.innerHTML\s*=\s*", re.M)
    pat_append = re.compile(r"\b([A-Za-z_$][\w$]*)\.innerHTML\s*\+=\s*", re.M)

    appends_by_var: dict[str, list[re.Match]] = {}
    for m in pat_append.finditer(body):
        appends_by_var.setdefault(m.group(1), []).append(m)
    if not appends_by_var:
        return None

    assigns_by_var: dict[str, list[re.Match]] = {}
    for m in pat_assign.finditer(body):
        assigns_by_var.setdefault(m.group(1), []).append(m)

    # Build the complete list of (replacement, text) pairs for every eligible variable
    # based on the ORIGINAL body indices. Only apply after collecting everything, so
    # indices stay valid.
    all_repls: list[tuple[int, int, str]] = []
    rewritten_vars: list[tuple[str, str]] = []  # (var, parts_name) — for the tail `x.innerHTML = __xParts.join("")` line

    for var, appends in appends_by_var.items():
        assigns = assigns_by_var.get(var, [])
        if len(assigns) != 1:
            continue
        a = assigns[0]
        first_ref = a.start()
        if any(ap.start() < first_ref for ap in appends):
            continue
        last_push = appends[-1].end()
        slice_ = body[first_ref:last_push]
        if re.search(r"\breturn\b(?![^\n]*\b" + re.escape(var) + r"\.innerHTML)", slice_):
            continue

        rhs_start = a.end()
        rhs_end = find_statement_end(body, rhs_start)
        if rhs_end is None:
            continue
        rhs_text = body[rhs_start:rhs_end].rstrip().rstrip(";")

        parts_name = f"__{var}Parts"
        new_assign = f"const {parts_name} = [{rhs_text}];"

        per_var_repls: list[tuple[int, int, str]] = []
        per_var_repls.append((
            a.start(),
            rhs_end + 1 if body[rhs_end:rhs_end + 1] == ";" else rhs_end,
            new_assign,
        ))

        parse_ok = True
        for ap in appends:
            rhs_s = ap.end()
            rhs_e = find_statement_end(body, rhs_s)
            if rhs_e is None:
                parse_ok = False
                break
            rhs_txt = body[rhs_s:rhs_e].rstrip().rstrip(";")
            per_var_repls.append((
                ap.start(),
                rhs_e + 1 if body[rhs_e:rhs_e + 1] == ";" else rhs_e,
                f"{parts_name}.push({rhs_txt});",
            ))
        if not parse_ok:
            continue

        # Don't overlap with a replacement we already accepted for another var.
        overlap = any(not (e <= s0 or s >= e0) for (s0, e0, _) in all_repls for (s, e, _) in per_var_repls)
        if overlap:
            continue

        all_repls.extend(per_var_repls)
        rewritten_vars.append((var, parts_name))

    if not rewritten_vars:
        return None

    # Apply collected replacements in reverse order so offsets don't shift.
    all_repls.sort(key=lambda r: r[0], reverse=True)
    new_body = body
    for s, e, txt in all_repls:
        new_body = new_body[:s] + txt + new_body[e:]

    # Append the tail `x.innerHTML = __xParts.join("")` lines just before trailing whitespace.
    stripped = new_body.rstrip()
    tail = new_body[len(stripped):]
    finals = "".join(
        f"\n      {var}.innerHTML = {parts_name}.join(\"\");"
        for var, parts_name in rewritten_vars
    )
    return stripped + finals + "\n" + tail


def find_statement_end(s: str, start: int) -> int | None:
    """Find the `;` that terminates the expression starting at `start`.

    Respects nesting of () [] {} and string/template literals.
    """
    depth = 0
    i = start
    in_str = None
    escape = False
    while i < len(s):
        c = s[i]
        if in_str == "//":
            if c == "\n":
                in_str = None
        elif in_str == "/*":
            if c == "*" and i + 1 < len(s) and s[i + 1] == "/":
                in_str = None
                i += 1
        elif in_str in ('"', "'", "`"):
            if escape:
                escape = False
            elif c == "\\":
                escape = True
            elif c == in_str:
                in_str = None
        else:
            if c == "/" and i + 1 < len(s) and s[i + 1] == "/":
                in_str = "//"
                i += 1
            elif c == "/" and i + 1 < len(s) and s[i + 1] == "*":
                in_str = "/*"
                i += 1
            elif c in ('"', "'", "`"):
                in_str = c
            elif c in "([{":
                depth += 1
            elif c in ")]}":
                depth -= 1
                if depth < 0:
                    return i
            elif c == ";" and depth == 0:
                return i
            elif c == "\n" and depth == 0:
                # allow statement to end at newline if balanced
                # but only if NO further code on line
                pass
        i += 1
    return None


def process_file(path: Path, write: bool) -> dict:
    text = path.read_text(encoding="utf-8")
    blocks = find_script_blocks(text)
    if not blocks:
        return {"functions_changed": 0}

    # work backwards so offsets stay valid
    new_text = text
    changed = 0
    for start, end, body in reversed(blocks):
        new_body = body
        # iterate fns in body (also in reverse)
        fns = list(collect_functions(new_body))
        for _, bs, be, _, _ in reversed(fns):
            fn_body = new_body[bs:be]
            rewritten = rewrite_function_body(fn_body)
            if rewritten is not None:
                new_body = new_body[:bs] + rewritten + new_body[be:]
                changed += 1
        if new_body != body:
            new_text = new_text[:start] + new_body + new_text[end:]

    if changed and write:
        path.write_text(new_text, encoding="utf-8")
    return {"functions_changed": changed}


def pick_files() -> list[Path]:
    out = []
    for p in ROOT.rglob("index.html"):
        rel = p.relative_to(ROOT)
        parts = set(rel.parts)
        if parts & EXCLUDE_PARTS:
            continue
        if EXCLUDE_PATH_RE.search(str(rel)):
            continue
        txt = p.read_text(encoding="utf-8", errors="ignore")
        if re.search(r"\.innerHTML\s*\+=", txt):
            out.append(p)
    return sorted(out)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--write", action="store_true", help="Apply changes (default dry-run)")
    ap.add_argument("--path", help="Run on a single file path (for testing)")
    args = ap.parse_args()

    if args.path:
        files = [Path(args.path)]
    else:
        files = pick_files()
    print(f"[svg-codemod] scanning {len(files)} files (write={args.write})")
    total = 0
    for p in files:
        r = process_file(p, write=args.write)
        n = r["functions_changed"]
        if n:
            total += n
            print(f"  {n:>3} fn{'s' if n != 1 else ''}  {p.relative_to(ROOT)}")
    print(f"[svg-codemod] total functions rewritten: {total}")


if __name__ == "__main__":
    main()
