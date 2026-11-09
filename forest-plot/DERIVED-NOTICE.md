# Derived-number notice: forest-plot shared PM/EB dependency

The shared ma-core PM/EB solver no longer returns 2^30 when its root is larger. This notice records the shared pooling dependency, directly or through another module. No existing local corpus/reference JSON or manuscript text was edited.

The table lists every changed shared-API output for synthetic `scale_60000`: yi=(-60000,0,60000), SE=(6000,6000,6000), ordinary and modified-HK pooling, plus t prediction intervals. It does not assert that this app accepts that vector as native input: specialized inputs undergo their own transformations. This is a conditional dependency notice; no changed pinned app-native fixture was found by the unit suite. User-input outputs change when the transformed PM root exceeds the old ceiling.

R 4.6.0 / metafor 5.2.1 oracle: `../hub/shared/tests/unit/tau-bracketing-reference.R` and adjacent JSON. Reproduction: `node hub/shared/tests/unit/tau-downstream-report.mjs`; raw outputs: `../tau-audit/downstream-before-after.json`. Exhaustive P05 fields, including LOO, are in `../heterogeneity/DERIVED-NOTICE.md`.

| Dataset / field | Before | After |
|---|---:|---:|
| `core.scale_60000.PM.normal.tau2` | 1073741824 | 3563999999.999999 |
| `core.scale_60000.PM.normal.se` | 19233.146943059874 | 34641.016151377546 |
| `core.scale_60000.PM.normal.ciLo` | -37696.275348155075 | -67895.14409930799 |
| `core.scale_60000.PM.normal.ciHi` | 37696.275348155075 | 67895.14409930799 |
| `core.scale_60000.PM.normal.I2` | 96.75600223210115 | 98.99999999999999 |
| `core.scale_60000.PM.normal.pi.lo` | -163481.3141185087 | -296976.5595515525 |
| `core.scale_60000.PM.normal.pi.hi` | 163481.3141185087 | 296976.5595515525 |
| `core.scale_60000.PM.normal.pi.sePred` | 37995.47032651831 | 69021.73570694958 |
| `core.scale_60000.PM.modifiedHK.tau2` | 1073741824 | 3563999999.999999 |
| `core.scale_60000.PM.modifiedHK.I2` | 96.75600223210115 | 98.99999999999999 |
| `core.scale_60000.PM.modifiedHK.pi.lo` | -205166.69876031316 | -296976.5595515525 |
| `core.scale_60000.PM.modifiedHK.pi.hi` | 205166.69876031316 | 296976.5595515525 |
| `core.scale_60000.PM.modifiedHK.pi.sePred` | 47683.76897855286 | 69021.73570694958 |
| `core.scale_60000.EB.normal.tau2` | 1073741824 | 3563999999.999999 |
| `core.scale_60000.EB.normal.se` | 19233.146943059874 | 34641.016151377546 |
| `core.scale_60000.EB.normal.ciLo` | -37696.275348155075 | -67895.14409930799 |
| `core.scale_60000.EB.normal.ciHi` | 37696.275348155075 | 67895.14409930799 |
| `core.scale_60000.EB.normal.I2` | 96.75600223210115 | 98.99999999999999 |
| `core.scale_60000.EB.normal.pi.lo` | -163481.3141185087 | -296976.5595515525 |
| `core.scale_60000.EB.normal.pi.hi` | 163481.3141185087 | 296976.5595515525 |
| `core.scale_60000.EB.normal.pi.sePred` | 37995.47032651831 | 69021.73570694958 |
| `core.scale_60000.EB.modifiedHK.tau2` | 1073741824 | 3563999999.999999 |
| `core.scale_60000.EB.modifiedHK.I2` | 96.75600223210115 | 98.99999999999999 |
| `core.scale_60000.EB.modifiedHK.pi.lo` | -205166.69876031316 | -296976.5595515525 |
| `core.scale_60000.EB.modifiedHK.pi.hi` | 205166.69876031316 | 296976.5595515525 |
| `core.scale_60000.EB.modifiedHK.pi.sePred` | 47683.76897855286 | 69021.73570694958 |
