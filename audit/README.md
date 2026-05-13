# audit/ — runtime-health auditor

Runs a Playwright L2 probe across every in-repo allmeta app and emits
`runtime-health.{json,csv,md,html}` at the repo root.

## Run

```
python audit/runtime_health.py [--workers 4] [--timeout 30]
```

## States

Apps are classified into one of six states (first-match-wins):

- UNKNOWN — probe itself crashed
- TIMEOUT — page didn't reach networkidle within timeout
- NEEDS-SERVICE — UI text indicates a backend dependency
- CONSOLE-ERRORS — non-empty console.error after filtering noise
- MISSING-MOUNT — no primary interactive landmark found
- OK — everything else

See `docs/superpowers/specs/2026-05-13-cycle-3.1-runtime-health-audit-design.md`.
