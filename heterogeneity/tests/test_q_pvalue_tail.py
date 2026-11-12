"""Q-test p-value (pQ in poolSummary) against R's upper tail, incl. df=1 and the
series / continued-fraction branch boundary (lane integ, 2026-11-12).

pQ used to be 1 - chiSqCDF(Q, df); in the continued-fraction branch that is
1 - (1 - Q(s,x)) and cancels to exactly 0 for Q(s,x) < ~1e-16 (dat.bcg exported
Q_p 0 where R gives 1.997e-26). The fix (chiSqSF) switches branch at x/2 = df/2 + 1,
so the boundary and the smallest df the page can produce (df = 1, k = 2) are tested.
This runs the page's OWN pQ expression and helper functions (extracted from the
HTML), not a copy. Set HET_PAGE to run it on another version of the page.
Reference: R 4.6.0, pchisq(x, df, lower.tail = FALSE).
"""
import json
import os
import re
import subprocess
from pathlib import Path

PAGE = Path(os.environ.get("HET_PAGE", Path(__file__).resolve().parent.parent / "index.html"))

# [df, x, pchisq(x, df, lower.tail=FALSE)]
REF = [
    [1, 0.01, 0.92034432544594202],
    [1, 1, 0.31731050786291415],
    [1, 2.9999989999999999, 0.083264568057011018],   # just below the branch switch (x/2 = 1.5)
    [1, 3, 0.083264516663550558],                     # at the switch
    [1, 3.0000010000000001, 0.083264465270124544],    # just above
    [1, 40, 2.5396285894708649e-10],
    [1, 150, 1.733643245717827e-34],                   # df=1 far tail: 1-CDF gives 0
    [12, 13.999999000000001, 0.30070834003269975],     # switch at x/2 = 7
    [12, 14, 0.30070827617436097],
    [12, 14.000000999999999, 0.30070821231603134],
    [12, 152.23300808237346, 1.9967645908458142e-26],  # dat.bcg Q
    [2, 0.5, 0.77880078307140488],
    [2, 6, 0.049787068367863944],
    [2, 300, 7.1750959731644108e-66],
]


def _function(src, name):
    m = re.search(r"function\s+" + name + r"\s*\(", src)
    if not m:
        return ""
    i = src.index("{", m.end())
    depth = 0
    for j in range(i, len(src)):
        depth += {"{": 1, "}": -1}.get(src[j], 0)
        if depth == 0:
            return src[m.start():j + 1]
    raise AssertionError("unbalanced " + name)


def test_q_pvalue_matches_r_upper_tail_including_df1_and_branch_boundary():
    src = PAGE.read_text(encoding="utf-8")
    expr = re.search(r"const pQ\s*=\s*([^;]+);", src).group(1)
    helpers = "\n".join(_function(src, n) for n in
                        ("lnGamma", "lowerIncGamma", "upperIncGammaCF", "chiSqCDF", "chiSqSF"))
    assert "function chiSqCDF" in helpers and "function lnGamma" in helpers
    js = helpers + r"""
    const ref = JSON.parse(process.argv[1]);
    console.log(JSON.stringify(ref.map(([df, Q0]) => (""" + expr + r"""))));
    """
    out = subprocess.run(["node", "-e", js, json.dumps(REF)], capture_output=True, text=True, timeout=60)
    assert out.returncode == 0, out.stderr
    got = json.loads(out.stdout.strip().splitlines()[-1])
    bad = []
    for (df, x, want), p in zip(REF, got):
        if not (isinstance(p, (int, float)) and p > 0 and abs(p - want) / want < 1e-8):
            bad.append((df, x, want, p))
    assert not bad, "pQ differs from R pchisq(lower.tail=FALSE) [df, x, R, page]: %s" % bad
