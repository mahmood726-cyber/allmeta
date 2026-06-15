"""
dgp_nma.py -- Known-truth data-generating process for NETWORK meta-analysis.

A network is a set of treatments {0..T-1} (0 = reference) connected by two-arm
studies. The truth is a vector of basic parameters d = (d_01, ..., d_0,T-1) on a
generic additive scale (mean-difference / log-OR / log-HR); under CONSISTENCY
the relative effect of b vs a is d_ab = d_0b - d_0a. On top of that truth we can
inject, independently and at known magnitude:

  * between-study heterogeneity  tau2   (study-level random effects, common-tau2)
  * loop INCONSISTENCY           incons (true direct != indirect on loop-closing
                                         edges; zero on a spanning tree so the
                                         basic parameters stay identified to d)
  * small-study / selection      scenario (per-study publication selection on the
                                         one-sided p-value, reusing the pairwise
                                         step/copas mechanisms)

Network GEOMETRY controls which comparisons carry direct studies:
  star   -- every treatment vs reference only (no loops; (a,b) a,b!=0 are
            INDIRECT-ONLY -> the under-determined regime for partial-ID).
  loop   -- T=3 triangle, all three pairwise edges (exactly one loop).
  ladder -- chain 0-1-2-...-(T-1) plus every-other shortcut edges (several loops).
  dense  -- complete graph, all T*(T-1)/2 edges (maximally many loops).

Everything is seeded (numpy Generator) -> fully reproducible. Truth-first: the
true d, the true relative-effect matrix, and the true best treatment are returned
alongside the data so no harness ever hand-enters a target.

Two-arm studies only (v1). Multi-arm trials add a within-study shared-control
sampling covariance (the platformtrialma failure mode) and are deliberately
out of scope here -- flagged honestly rather than approximated.
"""
from __future__ import annotations

import numpy as np

# Selection scenarios reused verbatim from the pairwise bench dgp.
SCENARIOS = ["none", "step_weak", "step_strong", "copas_weak", "copas_strong"]
GEOMETRIES = ["star", "loop", "ladder", "dense"]

_STEP_CUTS = np.array([0.025, 0.05])
_STEP_WEIGHTS = {"weak": np.array([1.0, 0.75, 0.55]),
                 "strong": np.array([1.0, 0.35, 0.10])}
_COPAS = {"weak": {"g0": -0.10, "g1": 0.12, "rho": 0.50},
          "strong": {"g0": -0.20, "g1": 0.12, "rho": 0.90}}


def _step_weight(p_one, weights):
    if p_one < _STEP_CUTS[0]:
        return weights[0]
    if p_one < _STEP_CUTS[1]:
        return weights[1]
    return weights[2]


def _draw_se(rng, n, se_lo, se_hi):
    lo, hi = np.log(se_lo), np.log(se_hi)
    return np.exp(lo + (hi - lo) * rng.random(n))


# ---------------------------------------------------------------------------
# Geometry -> edge list + spanning tree (consistent edges)
# ---------------------------------------------------------------------------
def edges_for(geometry, T):
    """Return (edges, tree_mask). edges is a list of (a,b) with a<b. tree_mask[i]
    is True if edge i is on a spanning tree (kept consistent; inconsistency is
    injected only on the NON-tree / loop-closing edges so d stays identified)."""
    if geometry == "star":
        edges = [(0, t) for t in range(1, T)]
    elif geometry == "loop":
        T = 3
        edges = [(0, 1), (0, 2), (1, 2)]
    elif geometry == "ladder":
        edges = [(t, t + 1) for t in range(T - 1)]          # the chain (a tree)
        edges += [(t, t + 2) for t in range(T - 2)]         # shortcuts -> loops
    elif geometry == "dense":
        edges = [(a, b) for a in range(T) for b in range(a + 1, T)]
    else:
        raise ValueError(f"unknown geometry {geometry!r}")

    # Spanning tree via union-find over the edge list (first edges that connect a
    # new node are the tree; the rest are loop-closing).
    parent = list(range(T))

    def find(x):
        while parent[x] != x:
            parent[x] = parent[parent[x]]
            x = parent[x]
        return x

    tree_mask = []
    for (a, b) in edges:
        ra, rb = find(a), find(b)
        if ra != rb:
            parent[ra] = rb
            tree_mask.append(True)
        else:
            tree_mask.append(False)
    return edges, np.array(tree_mask, bool)


def true_d(T, spread=0.6, rng=None):
    """True basic parameters d_0t. Reference 0 has d=0. A fixed monotone ladder so
    there is an unambiguous true ranking (higher = better), unless rng given (then
    jittered, but still seeded)."""
    base = np.linspace(0.0, spread, T)            # d_00=0 ... d_0,T-1=spread
    if rng is not None:
        base = base + rng.normal(0, spread * 0.15, T)
        base[0] = 0.0
    return base


def relative_effect_matrix(d):
    """D[a,b] = d_b - d_a = true effect of b vs a under consistency."""
    return d[None, :] - d[:, None]


def generate(geometry, T, studies_per_edge, tau2, incons, scenario, rng,
             d_spread=0.6, se_lo=0.10, se_hi=0.70, max_factor=200,
             jitter_truth=False):
    """Generate one known-truth network.

    Returns (studies, truth) where:
      studies : list of dicts {a, b, y, v}  (two-arm contrast b vs a)
      truth   : dict with d (basic params), D (relative-effect matrix),
                best (argmax d), edges, tree_mask, edge_incons (true direct-effect
                offset per edge), tau2, incons, geometry, T, degenerate, sel_frac
    """
    if geometry == "loop":
        T = 3
    edges, tree_mask = edges_for(geometry, T)
    d = true_d(T, spread=d_spread, rng=(rng if jitter_truth else None))
    D = relative_effect_matrix(d)

    # Inject inconsistency on loop-closing edges: a fixed alternating sign pattern
    # scaled by `incons`. Tree edges get 0 so the consistency truth d is exactly
    # recoverable when incons==0.
    edge_incons = np.zeros(len(edges))
    sign = 1.0
    for i in range(len(edges)):
        if not tree_mask[i]:
            edge_incons[i] = sign * incons
            sign = -sign
    edge_mean = np.array([D[a, b] + edge_incons[i]
                          for i, (a, b) in enumerate(edges)])

    sd = np.sqrt(tau2)
    is_none = scenario == "none"
    kind = "weak" if scenario.endswith("weak") else "strong"
    is_step = scenario.startswith("step")
    weights = _STEP_WEIGHTS[kind] if is_step else None
    cp = None if is_step else _COPAS[kind]

    studies = []
    n_examined = 0
    n_target = studies_per_edge * len(edges)
    degenerate = False

    for i, (a, b) in enumerate(edges):
        kept = 0
        cap = max_factor * studies_per_edge
        seen = 0
        while kept < studies_per_edge and seen < cap:
            se = float(_draw_se(rng, 1, se_lo, se_hi)[0])
            theta = edge_mean[i] + sd * rng.standard_normal()      # study true eff
            eps = rng.standard_normal()
            y = theta + se * eps
            seen += 1
            n_examined += 1
            if is_none:
                publish = True
            elif is_step:
                from scipy.stats import norm
                p_one = 1.0 - norm.cdf(y / se)
                publish = rng.random() < _step_weight(p_one, weights)
            else:
                dlat = cp["rho"] * eps + np.sqrt(1 - cp["rho"] ** 2) * rng.standard_normal()
                z = cp["g0"] + cp["g1"] / se + dlat
                publish = z > 0
            if publish:
                studies.append({"a": a, "b": b, "y": y, "v": se * se})
                kept += 1
        if kept < studies_per_edge:
            degenerate = True
            # top up with unselected draws so every edge stays connected
            while kept < studies_per_edge:
                se = float(_draw_se(rng, 1, se_lo, se_hi)[0])
                y = edge_mean[i] + sd * rng.standard_normal() + se * rng.standard_normal()
                studies.append({"a": a, "b": b, "y": y, "v": se * se})
                kept += 1

    truth = {
        "d": d, "D": D, "best": int(np.argmax(d)),
        "edges": edges, "tree_mask": tree_mask, "edge_incons": edge_incons,
        "tau2": tau2, "incons": incons, "geometry": geometry, "T": T,
        "degenerate": degenerate,
        "sel_frac": (n_target / max(1, n_examined)) if not is_none else 1.0,
    }
    return studies, truth
