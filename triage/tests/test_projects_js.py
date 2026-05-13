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
