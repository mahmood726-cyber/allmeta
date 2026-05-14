from triage.projects_js import load_projects, path_to_key


def test_load_projects_parses_3_entries(fixtures_root):
    rows = load_projects(fixtures_root / "mini-projects.js")
    assert len(rows) == 3
    by_key = {r["key"]: r for r in rows}
    assert "forest-plot" in by_key
    assert by_key["forest-plot"]["featuredRank"] == 1
    assert by_key["forest-plot"]["category"] == "Pairwise MA"
    assert by_key["dta-sroc"]["featuredRank"] is None
    # external URL -> last URL segment used as key
    assert "almizan" in by_key


def test_path_to_key_strip_dot_slash_and_index():
    assert path_to_key("./forest-plot/index.html") == "forest-plot"
    assert path_to_key("./Truthcert1/index.html") == "Truthcert1"
    assert path_to_key("https://example.com/almizan/") == "almizan"
    assert path_to_key("") == ""


# --- Cycle 5.5: nested-path key tests ---

def test_path_to_key_nested_path_uses_last_segment():
    """Cycle 5.5: r-shiny/annualised-plot/ should resolve to 'annualised-plot',
    not 'r-shiny' (the parent folder). All 3 r-shiny apps share the parent."""
    assert path_to_key("./r-shiny/annualised-plot/") == "annualised-plot"
    assert path_to_key("./r-shiny/dta-diagnostic/") == "dta-diagnostic"
    assert path_to_key("./r-shiny/mean-single-group/") == "mean-single-group"


def test_path_to_key_still_handles_flat_paths():
    """Sanity: flat paths still work the same way."""
    assert path_to_key("./forest-plot/index.html") == "forest-plot"
    assert path_to_key("./Pairwiseai/index.html") == "Pairwiseai"


def test_load_projects_exposes_app_dir_for_nested_paths(fixtures_root, tmp_path):
    """load_projects should return both `key` (unique id) and `app_dir`
    (filesystem location relative to repo root). For nested paths these differ."""
    from triage.projects_js import load_projects
    # Write a minimal projects.js with one flat + one nested entry
    pjs = tmp_path / "projects.js"
    pjs.write_text(
        'window.HTML_APPS_PROJECTS = [\n'
        '  { name: "Forest", path: "./forest-plot/index.html", category: "X" },\n'
        '  { name: "Annualised", path: "./r-shiny/annualised-plot/", category: "Y" },\n'
        '];\n',
        encoding="utf-8",
    )
    rows = load_projects(pjs)
    by_key = {r["key"]: r for r in rows}
    assert "forest-plot" in by_key
    assert by_key["forest-plot"]["app_dir"] == "forest-plot"
    assert "annualised-plot" in by_key
    assert by_key["annualised-plot"]["app_dir"] == "r-shiny/annualised-plot"
