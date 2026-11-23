P16 inconsistency parity uses the retained R oracle for 12 cases under FE, DL,
and PM. Its recorded environment is R 4.6.0, netmeta 3.7.0, metafor 5.2.1, and
meta 8.5.0. Use those package versions to reproduce it.

Run these commands from the repository root (or submit them through RUN.txt):

```text
python hub/shared/tests/r/p16-prepare-reference.py
Rscript hub/shared/tests/r/p16-nma-inconsistency-reference.R
python hub/shared/tests/r/p16-retain-reference.py
node --test hub/shared/tests/unit/p16-nma-inconsistency-parity.test.mjs
```

The preparation script only translates JSON into R literals. The R script
computes the reference using netmeta/metafor and records package versions and
raw file hashes. The retention script verifies those hashes and equality with
the existing oracle; it refuses to overwrite different evidence. Neither
Python script computes statistical results.

The original R run hashed CRLF bytes for the input JSON and LF bytes for the R
script. The scoped attributes in `../.gitattributes` preserve those exact bytes
on checkout, leaving the root text attributes in effect. The Python bridge
already inherits the root LF rule. Tests hash the files as bytes with no line
ending normalization. Do not change the recorded hashes to accommodate a
checkout conversion.

The two existing TODO tests still execute their assertions: the saturated
`tree_k3` DL fit returns tau2 = 0 in the app, while the recorded netmeta result
is unavailable (`null`). This test-only repair leaves that disagreement visible.
