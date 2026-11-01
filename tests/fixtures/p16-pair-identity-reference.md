This fixture is the unchanged `p16-r3-reference.json` produced by the requested
native R run after pass 2. SHA-256:
`f931082a74f705289d8f264edd6d4924d6ed9ba070c39b58f34171d4cc2a7330`.

It records the input rows, full-network treatment IDs, full and leave-one-study-out
R fits for the delimiter-name plant and relabelled control, each under FE/DL/PM.
The JSON includes the actual R, netmeta, metafor and jsonlite versions. All six
export scripts passed 329/329 checks. No values were typed from memory or rounded.

The generating R collector is stored alongside this JSON as
`p16-pair-identity-reference.R`, copied byte-for-byte from the script used in the
observed run. `hub/shared/tests/unit/p16-export-replay.R` retains the original run
entry point. The collector executes the actual native-R exports produced by
`hub/shared/tests/unit/p16-export-replay.mjs`, collects their R objects, and writes
the reference and run results into the system temporary directory. Run these in
that order from the repository root to reproduce; do not replace this fixture
automatically. The generator uses `nma-inconsistency/plus-core.js`'s R fit function
calling netmeta::netsplit, netmeta::decomp.design and metafor's PM equation.

`hub/shared/tests/unit/p16-pair-identity-parity.test.mjs` checks the shipped engine,
graph, model comparison and sensitivity results against these R values with the
existing tolerances: 1e-9 relative to max(1, |R|), 1e-6 for PM, p-values 1e-9
absolute, and exact membership, degrees of freedom and decision flags.
