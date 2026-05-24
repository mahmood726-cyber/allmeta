# Releasing allmeta — Zenodo concept-DOI + GitHub Release workflow

> One-time setup that gives every release of allmeta a citable DOI. Run
> the connect step ONCE (per repo), then every GitHub Release auto-mints
> a fresh archived version under the stable concept DOI.

## One-time setup (~5 minutes, browser-only)

1. **Log in to [Zenodo](https://zenodo.org/) via GitHub.** Pick the
   GitHub account that owns `mahmood726-cyber/allmeta`.
2. **Go to *Settings → GitHub*** in Zenodo.
3. Find `mahmood726-cyber/allmeta` in the repo list and **toggle it ON**.
   - This installs a Zenodo webhook on the repo. From now on every
     GitHub Release triggers a Zenodo deposit.
   - The first deposit creates the *concept DOI* — a version-less DOI
     that always points to the latest archived version.
4. **Edit the deposit metadata** on the Zenodo deposit page:
   - Title: `allmeta — open browser-only tools for evidence synthesis`
   - Authors: same as `CITATION.cff`
   - License: MIT
   - Communities: consider `software`, `open-science`, optionally a
     methodology community.
   - Funding / grants: as applicable.
5. **Publish the deposit.** Zenodo issues two DOIs:
   - `10.5281/zenodo.<concept_id>` — concept DOI (use in citations,
     `CITATION.cff`, README badge).
   - `10.5281/zenodo.<version_id>` — this-release DOI.

## Each release (~2 minutes)

Per `CLAUDE.md` rule: **only tag and release when explicitly requested.**

1. Make sure `main` is green: `python -m pytest tests/` and
   `cd tests/playwright && npx playwright test verify-touched-apps.spec.ts`
   both report all-pass / soft-warns only.
2. Update `CITATION.cff` `version:` and `date-released:`.
3. Tag and push:
   ```sh
   git tag -a v1.0.0 -m "v1.0.0 — first archived release"
   git push origin v1.0.0
   ```
4. On GitHub: open the tag → **Draft release** → write release notes
   (link the relevant PROGRESS.md ledger entries) → **Publish**.
5. Zenodo picks up the release webhook within ~1 minute and creates a
   versioned deposit. The concept DOI now resolves to the new version.

## After the first deposit

Edit `CITATION.cff` to uncomment the `identifiers:` block:

```yaml
identifiers:
  - description: "Zenodo concept DOI"
    type: doi
    value: "10.5281/zenodo.<concept_id>"   # replace
```

Add a DOI badge to `README.md` (concept DOI badge):

```markdown
[![DOI](https://zenodo.org/badge/<repo_id>.svg)](https://zenodo.org/badge/latestdoi/<repo_id>)
```

`<repo_id>` is the GitHub repo numeric ID — Zenodo's "GitHub badge"
page (Settings → GitHub → click the repo) gives the exact markdown.

## What NOT to do

- Don't manually upload zip files to Zenodo — that breaks the
  concept-DOI chain (each manual upload gets a new concept DOI).
- Don't delete the GitHub Release after Zenodo has archived it. Zenodo
  keeps the deposit, but the GitHub link becomes a 404 in citations.
- Don't reuse a release tag (e.g. delete & re-tag `v1.0.0`). Zenodo
  treats each tag as immutable; re-using mismatches version numbers in
  the chain.

## Cross-references

- Spec for cite-as text: `ROADMAP.md` § *Cite as*.
- Pages deploy is independent of releases (every push to `main` rebuilds).
- The TruthCert HMAC-key rotation procedure is separate; see
  `shared/ma-studies-v1.js` and `C:\Users\mahmo\.claude\rules\lessons.md`
  ("Cryptography / Signing") for the rules that govern it.
