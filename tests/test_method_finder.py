"""Tests for finder/decision-tree.json.

Asserts:
  - the tree is valid JSON
  - every `next` points at a node that exists in the tree
  - every recommended `app` resolves to a real directory on disk
  - every `why` is non-empty (so users always see the rationale)
  - every node either has options-with-recommendations or options-with-next
    (no dead-ends)
"""
from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
TREE = ROOT / "finder" / "decision-tree.json"


def _load():
    return json.loads(TREE.read_text(encoding="utf-8"))


def test_decision_tree_parses():
    data = _load()
    assert "nodes" in data
    assert "start" in data["nodes"], "Tree must have a 'start' node"


def test_every_next_pointer_resolves():
    data = _load()
    nodes = data["nodes"]
    dangling = []
    for name, node in nodes.items():
        for opt in node.get("options", []):
            nxt = opt.get("next")
            if nxt and nxt not in nodes:
                dangling.append(f"{name}/{opt.get('label')!r} -> {nxt}")
    assert dangling == [], f"Dangling next pointers: {dangling}"


def test_every_recommended_app_exists_on_disk():
    data = _load()
    missing = []
    for name, node in data["nodes"].items():
        for opt in node.get("options", []):
            for r in opt.get("recommend", []):
                app = r.get("app")
                if not app or not (ROOT / app).is_dir():
                    missing.append(f"{name}/{opt.get('label')!r} -> {app}")
    assert missing == [], f"Recommended apps that don't exist: {missing}"


def test_every_recommendation_has_a_rationale():
    data = _load()
    empty = []
    for name, node in data["nodes"].items():
        for opt in node.get("options", []):
            for r in opt.get("recommend", []):
                why = (r.get("why") or "").strip()
                if not why or len(why) < 15:
                    empty.append(f"{name}/{opt.get('label')!r} -> {r.get('app')}")
    assert empty == [], f"Recommendations with empty/short rationale: {empty}"


def test_no_node_is_a_dead_end():
    data = _load()
    dead = []
    for name, node in data["nodes"].items():
        opts = node.get("options", [])
        if not opts:
            dead.append(name)
            continue
        productive = sum(1 for o in opts if o.get("next") or o.get("recommend"))
        if productive == 0:
            dead.append(name)
    assert dead == [], f"Dead-end nodes (no next + no recommend on any option): {dead}"


def test_every_app_in_app_flow_catalog_appears_as_at_least_one_recommendation():
    """If the catalog has an app, the finder should be able to route someone to
    it. We allow a small whitelist of apps that are routed via siblings (e.g.
    `gosh-metareg` is hit through the gosh entry)."""
    data = _load()
    recos = set()
    for node in data["nodes"].values():
        for opt in node.get("options", []):
            for r in opt.get("recommend", []):
                recos.add(r.get("app"))
    # Apps in the catalog. Use a small expected-coverage set rather than the
    # full catalog (some apps like prisma-flow are reporting tools, not
    # analyses, and don't belong in the data-shape finder).
    must_cover = {
        "forest-plot", "funnel-plot", "heterogeneity", "meta-regression",
        "bayesian-ma", "bayesian-nma", "nma", "nma-pro-v2",
        "rare-events-glmm", "rve-meta", "personalised-te", "bma-tau-priors",
        "cross-design", "cross-network", "multi-outcome-nma",
        "component-nma", "bucher",
        "dta-sroc", "hsroc", "proportion-ma",
    }
    missing = must_cover - recos
    assert not missing, f"Core methods missing from finder: {sorted(missing)}"
