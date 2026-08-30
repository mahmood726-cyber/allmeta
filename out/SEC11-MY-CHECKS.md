# §11 claims I verified myself (Codex's fuller sweep is still running)

Scope: **3 of the ~30 artefacts §11 lists** — the three the sibling lane named. The
denominator is OF the sibling's three specific claims, not of §11's full table.

## 1. `multiroute_retrieve` and the "317 documents with route, date, sha256"

```
grep -rl "multiroute_retrieve" F:/allmeta C:/Projects/_rmf-live-fix   ->  no matches
```

**DOES NOT EXIST** under either root, confirming the sibling. §11 lists it as
"the sanctioned recorder" under layer 3 — a capability the map says we hold.

## 2. `hrSource` "read but never written ⇒ Gate 4 is INERT"

**FALSE AS STATED.** It is written, twice:

```
C:\Projects\_rmf-live-fix\validate_living_ma_portfolio.py
  381:  d['hrSource'] = str(body['hrSource'])
  447:  d['hrSource'] = hsm.group(1)          # re.search(r"hrSource:\s*['\"]([a-z_]+)['\"]", body)
  380:  if body.get('hrSource'):                       <- read
  727:  if t.get('publishedHR') and not t.get('hrSource'):   <- Gate 4
  799:  print(... "{n} trial(s) lack hrSource and full CI")  <- Gate 4 has a live FAIL path
```

⚠ **But the correction cuts the other way from how it reads.** Both writes are the
VALIDATOR parsing the field back OUT of a generated page. The question that matters
is whether any GENERATOR puts it in, and only **2 HTML files in the corpus contain
the string at all** (`ATTR_CM_REVIEW.html`, `INCRETIN_HFpEF_REVIEW.html`), with
`"hrSource": null` in their extraction-audit JSON.

⇒ **Gate 4 is not inert; it is close to universally-failing.** "Never written" and
"always violated" are opposite diagnoses with opposite fixes, and the evidence
supports the second. Verdict: **PARTIAL — the mechanism exists and runs; the field
is almost never populated.**

## 3. `gate10` — "10 instrumented classes"

**`gate10` does not exist under that name.** The implementation is
`C:\Projects\_rmf-live-fix\scripts\sentinel_check.py`, found by its described
behaviour rather than its label.

**3a. "10 instrumented classes is 8 rules" — CONFIRMED.** The `RULES` registry at
line 288 holds exactly eight:

```
R1_python_None  R2_apostrophe  R3_conflict_markers  R4_event_counts
R5_plotly_title R6_realdata_parses  R7_mojibake_em_dash  R8_unminified_engine
```

§11 says ten. It is eight. **8/10.**

**3b. "R6 SILENTLY disables itself above 300 files" — the disabling is real, the
word SILENTLY is wrong.** Lines 312-316:

```python
if os.environ.get("SENTINEL_FAST") == "1" or len(files) > 300:
    rules = [(n, r) for n, r in rules if n != "R6_realdata_parses"]
    print("Sentinel: large/fast mode - R6 (Node parse-check) skipped, will run at smoke step")
print(f"Sentinel scanning {len(files)} files with {len(rules)} rules...")
```

It **announces the skip by name, gives the reason, names where it will run instead,
and prints a rule count that visibly drops from 8 to 7.** That is a documented trade,
not a silent one, and the distinction matters because "silent" implies nobody could
know.

**3c. ⭐ THE REAL DEFECT IS DOWNSTREAM OF BOTH CLAIMS, AND NEITHER NAMES IT.**
The skip's stated fallback is *"will run at smoke step"*. Measured:

| | |
|---|---|
| portfolio size, per the code's own comment (line 308) | **2,178 files** |
| apps in `full_portfolio_smoke_results.json` | **99** |
| occurrences of `realData` in `full_portfolio_smoke.mjs` | **0** |

⇒ **R6 is dropped precisely when the scan is large, and the fallback that is supposed
to catch it covers 99 of 2,178 — about 4.5% of the population whose size triggered
the skip.** The smoke test loads each page in a browser and does capture console
errors (`errors: []` on all 99), so a parse failure would plausibly surface — I am
not claiming the fallback is absent. **I am claiming its coverage is 99/2178 and
that nothing states this.** This is the standing rule "verify the STEP, not the run",
and "a scan reports where it LOOKED, not the population it claims to cover".

---

## The rule this establishes

§11 is an architecture document, and an architecture document is a **claim**.
Checking three of its entries, by hand, against the filesystem:

| claim | verdict |
|---|---|
| `multiroute_retrieve` + 317 documents | **DOES NOT EXIST** |
| `hrSource` read but never written, Gate 4 inert | **FALSE AS STATED** — written at :381 and :447; the real problem is near-universal *violation*, the opposite diagnosis |
| `gate10`, 10 instrumented classes | **PARTIAL** — the file is `sentinel_check.py`, it registers **8**, and R6's skip is *announced*, not silent |

**0 of 3 held exactly as written.** ⚠ That fraction is OF the sibling lane's three
claims — **not** of §11, which has roughly thirty entries and would need its own
sweep before any fraction could be quoted about it.

⭐ **And the pattern across all three is the same: each report was directionally
useful and wrong in its specifics, and in two of three the specifics change what you
would fix.** "Never written" sends you to write it; "written but never populated"
sends you to the generator. "Silently disabled" sends you to add logging that is
already there; "fallback covers 99 of 2,178" sends you to the coverage.
