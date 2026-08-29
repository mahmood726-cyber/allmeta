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

Not yet verified by me; Codex's sweep is counting the registered rules and checking
for a file-count cap. **Reported as UNVERIFIED rather than accepted or denied.**

---

## The rule this establishes

§11 is an architecture document, and an architecture document is a **claim**. One of
three checked claims was absent, one was misdiagnosed in a way that inverts the fix,
and one is still open. **1 of 3 confirmed as stated.** That fraction is about the
sibling's three claims — not about §11 as a whole, which has roughly thirty entries
and would need its own sweep before any fraction could be quoted about it.
