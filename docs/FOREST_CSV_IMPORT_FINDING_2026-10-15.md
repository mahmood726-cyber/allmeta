# Forest CSV import integrity follow-up (15 October 2026)

Status: verified source-code defect; regression test and remediation pending.

The adapter in forest-plot/index.html uses rows.filter before changing the native textarea. For an upload with study,yi,vi header and rows A,0.1,0.04 / B,0.3,0.04 / C,9,-0.04, the invalid third record is discarded and the remaining two records produce a fixed-effect estimate of 0.2. The shared parser reports the invalid variance, but Forest's onParse handler does not treat warnings as a failed import. This produces an unannounced two-study analysis of an attempted three-study dataset. A second example has missing yi and the same partial-import risk.

Required remedy: reject any CSV warning, ambiguous or duplicate header, missing row, nonrepresentable variance or label that changes native parser row interpretation; validate all rows before mutating the textarea; clear an old result on rejection and preserve Undo; test real paste and file-input flows. No numerical engine change is required.

Do not count the app as complete on the basis of this source audit or the previous scoped Forest PR #112.
