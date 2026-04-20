# Release Freeze Status

Status: ACTIVE
Start Date: February 12, 2026

## Policy

- Feature development is paused.
- Allowed work: bug fixes, test hardening, release-blocker remediation, documentation clarifications.
- Not allowed: net-new features, large refactors unrelated to release blockers, scope expansion.

## Gate

Run:

```bash
python dev/build-scripts/release_checklist.py --freeze
```

A release candidate remains blocked until all checks pass.

## Exit Criteria

1. Release freeze gate passes consistently.
2. No open critical/high release blockers.
3. Final sign-off to resume feature development.
