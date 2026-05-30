# Governance

allmeta is a browser-only suite of evidence-synthesis tools. This document
describes how decisions are made and how methodology contributions are validated.

## Roles

- **Maintainer** — reviews and merges changes, owns releases, and is the final
  arbiter on methodology and scope. Listed in `CITATION.cff`.
- **Contributor** — anyone who opens an issue or pull request.

## How decisions are made

- Routine changes (bug fixes, docs, tests, accessibility) are merged by a
  maintainer once review and CI pass.
- Methodology changes (new estimators, changes to statistical formulas, default
  settings) require, in addition:
  1. a cited reference for the method, and
  2. a **numerical R-parity test** committed alongside the change, comparing the
     JS implementation against an established R package (`metafor`, `meta`,
     `netmeta`, `mada`, `robumeta`, `bayesmeta`, …) to a stated tolerance.
  This is the core quality bar: *the app must agree with the reference software
  before it ships.*
- Disagreements are resolved by discussion in the relevant issue/PR; the
  maintainer decides if consensus is not reached.

## Methodology validation

Every quantitative claim an app makes should be backed by a version-controlled
parity or regression test (see `*/tests/test_against_*.py` and
`hub/shared/tests/*-parity.spec.mjs`). A change that alters a number a user sees
must update or add the corresponding test and cite the evidence in the commit
message.

## Releases

Releases follow [Semantic Versioning](https://semver.org). The `Unreleased`
section of [CHANGELOG.md](CHANGELOG.md) accumulates work between tags.

## Code of Conduct

Participation is governed by the [Code of Conduct](CODE_OF_CONDUCT.md).
