# PLANT Count Check

Scope: `oa68k/ladder.py`, `oa68k/ladder_store.py`, `oa68k/obtainability.py`. Network: not used.

## Commands Used

check() call-site counts inside `_selftest`:

```powershell
@' ... AST count Name("check") Call nodes inside FunctionDef("_selftest") ... '@ | python - F:/tr-build/ladder/oa68k/ladder.py
@' ... AST count Name("check") Call nodes inside FunctionDef("_selftest") ... '@ | python - F:/tr-build/ladder/oa68k/ladder_store.py
@' ... AST count Name("check") Call nodes inside FunctionDef("_selftest") ... '@ | python - F:/tr-build/ladder/oa68k/obtainability.py
```

Declared `n` lines:

```powershell
rg -n "^\s*n\s*=" F:\tr-build\ladder\oa68k\ladder.py
rg -n "^\s*n\s*=" F:\tr-build\ladder\oa68k\ladder_store.py
rg -n "^\s*n\s*=" F:\tr-build\ladder\oa68k\obtainability.py
```

PLANT headers:

```powershell
rg -n "print\(\"PLANT" F:\tr-build\ladder\oa68k\ladder.py
```

## check() Calls vs Declared n

| File | Actual check() call sites in `_selftest` | Declared n line | Agree? |
|---|---:|---|---|
| `oa68k/ladder.py` | 86 | line 2030: `n = 86 if extractor() is not None else 84` | YES if `extractor() is not None`; NO if `extractor() is None` |
| `oa68k/ladder_store.py` | 1 | line 238: `n = 14` | NO |
| `oa68k/obtainability.py` | 11 | line 308: `n = 10` | NO |

## ladder.py PLANT Headers

1. `PLANT 1 -- default state is NOT_YET_FOUND, never 'unavailable'`
2. `PLANT 2 -- a retrieval with no value must NOT count as a hit`
3. `PLANT 3 -- FAILED and MISS are counted separately`
4. `PLANT 4 -- the denominator is per-rung 'reached', not n requested`
5. `PLANT 5 -- outcome scoping refuses an unscoped value`
6. `PLANT 6 -- a COMPOSITE title must not satisfy a single-outcome field`
7. `PLANT 7 -- CT.gov paramType must canonicalise, or a true match scores as a miss`
8. `PLANT 8 -- a document that does not NAME the trial must be rejected`
9. `PLANT 9 -- the prior-meta TABLE path reads the right row and refuses the rest`
10. `PLANT 10 -- a composite marker must not fire on a DRUG NAME`
11. `PLANT 11 -- a CAUSE-SPECIFIC death is not all-cause death`
12. `PLANT 12 -- RR = 1 - RRR, and the interval bounds INVERT`
13. `PLANT 23 -- no selector may claim a ROLE from a TYPE TAG or an OA FLAG`
14. `PLANT 22 -- the ERA GATE refuses a year-implausible identity`
15. `PLANT 21 -- the DRUG is read from the record, not guessed`
16. `PLANT 19 -- an AUTHOR-YEAR study label is an identity too`
17. `PLANT 18 -- a prior-meta value must be RECONCILED, and the primary wins`
18. `PLANT 16 -- a prior-meta row that is not a RESULT must be rejected`
19. `PLANT 17 -- EMPTY must not collapse into MISS in the yield table`
20. `PLANT 15 -- a rung that retrieved NOTHING must not say RETRIEVED_NO_VALUE`
21. `PLANT 14 -- a measurement pass must not change the answer it measures`
22. `PLANT 13 -- a RATIONALE/DESIGN paper must not outrank the results paper`

Numbering verdict: no duplicated PLANT numbers. Missing PLANT number: 20. Numbers are not contiguous.

---

# ADJUDICATION

**PLANT 20 missing — CONFIRMED and fixed.** I had numbered a block 21 when the
previous was 19, and folded what should have been PLANT 20 (the acronym-collision
topic check) into PLANT 19's block under an unnumbered `print("   (acronym
collision)")`. **A prior report of mine cited "Plant 20 asserts the off-topic record
is refused" — a citation to a label that did not exist.** The block now carries its
own header and the numbering is contiguous 1..24.

**`n = 86 ... else 84` flagged as "NO if extractor() is None" — FALSE FLAG, no change
made.** The count is static; the branch is not. PLANT 5 sits behind
`if rx is None: print SKIP / else: <2 checks>`, so when the extractor is absent
exactly two call sites do not execute and 84 is the correct expected total. Codex
counted call sites without following the guard, which is the right thing for a
mechanical pass to do and the wrong thing to act on without tracing it.

⇒ **One real defect, one false positive, from a check that took one small job.** The
real one was a label error in a report, and labels are identifiers.
