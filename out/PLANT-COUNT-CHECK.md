# PLANT Count Check
Scope: `oa68k/ladder.py`, `oa68k/ladder_store.py`, `oa68k/obtainability.py`. Network: not used.

## Commands Used
check() call-site counts inside `_selftest`:
```powershell
python -c "import ast,pathlib,sys;s=pathlib.Path(sys.argv[1]).read_text(encoding='utf-8');f=next(n for n in ast.parse(s).body if isinstance(n,ast.FunctionDef) and n.name=='_selftest');print(sum(isinstance(n,ast.Call) and isinstance(n.func,ast.Name) and n.func.id=='check' for n in ast.walk(f)))" F:\tr-build\ladder\oa68k\ladder.py
python -c "import ast,pathlib,sys;s=pathlib.Path(sys.argv[1]).read_text(encoding='utf-8');f=next(n for n in ast.parse(s).body if isinstance(n,ast.FunctionDef) and n.name=='_selftest');print(sum(isinstance(n,ast.Call) and isinstance(n.func,ast.Name) and n.func.id=='check' for n in ast.walk(f)))" F:\tr-build\ladder\oa68k\ladder_store.py
python -c "import ast,pathlib,sys;s=pathlib.Path(sys.argv[1]).read_text(encoding='utf-8');f=next(n for n in ast.parse(s).body if isinstance(n,ast.FunctionDef) and n.name=='_selftest');print(sum(isinstance(n,ast.Call) and isinstance(n.func,ast.Name) and n.func.id=='check' for n in ast.walk(f)))" F:\tr-build\ladder\oa68k\obtainability.py
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
