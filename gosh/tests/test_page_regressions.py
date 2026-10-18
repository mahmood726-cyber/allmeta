"""Requirements exercised against the actual page, with GOSH_PAGE baseline override."""
import html
import itertools
import json
import os
from pathlib import Path
import re
import subprocess
import xml.etree.ElementTree as ET

import pytest

HERE = Path(__file__).parent


@pytest.fixture(scope="module")
def probe():
    page = Path(os.environ.get("GOSH_PAGE", HERE.parent / "index.html")).resolve()
    proc = subprocess.run(["node", str(HERE / "page-probe.cjs"), str(page)],
                          capture_output=True, text=True, encoding="utf-8", timeout=45)
    assert proc.returncode == 0, proc.stdout + proc.stderr
    return json.loads(proc.stdout)


def message_terms(text, kind):
    """Semantic contract: case insensitive, without freezing exact copy."""
    flags = re.I
    has = lambda pattern: bool(re.search(pattern, text, flags))
    # Remove explicit negated display statements before rejecting success claims.
    positive = re.sub(r"\b(?:cannot|can['’]t|not|never)\s+(?:be\s+)?(?:displayed|shown)\b", '', text, flags=flags)
    no_success = not re.search(r"\b(?:plot|subsets?|points?)\b[^.!?]*\b(?:displayed|shown)\b", positive, flags)
    if kind == 'axis':
        return dict(axis=has(r'\b(?:axis|range|limits)\b'),
                    recovery=has(r'\b(?:widen|reset)\b'),
                    retained=has(r'\bcomputed\s+results?\b[^.!?]*\b(?:retained|available|preserved)\b'),
                    no_success=no_success)
    if kind == 'omission':
        return dict(subsets=has(r'\bsubset\s+points\b'),
                    outside=has(r'\boutside\b[^.!?]*\baxis\s+range\b'), no_success=no_success)
    return dict(draws=has(r'\b(?:draws?|count)\b'),
                integer=has(r'\b(?:whole\s+number|integer)\b'),
                recovery=has(r'\b(?:enter|adjust|reset|choose)\b'),
                bounds=has(r'\b1\s+to\s+100,?000\b'), no_success=no_success)


def svg_nodes(state, tag):
    return ET.fromstring('<svg>' + state['svg'] + '</svg>').findall(tag)


@pytest.mark.parametrize("k", [4, 5])
@pytest.mark.parametrize("model", ["FE", "DL"])
def test_every_nonempty_subset_including_singletons(probe, k, model):
    state = probe['enumeration'][f'{model}-{k}']
    expected = {tuple(c) for size in range(1, k + 1)
                for c in itertools.combinations([f'S{i}' for i in range(k)], size)}
    actual = [tuple(m) for m in state['memberships']]
    assert set(actual) == expected, f"Missing subsets: {expected - set(actual)}"
    assert len(actual) == len(state['points']) == len(svg_nodes(state, 'circle')) == 2**k - 1
    assert state['result']['n_subsets'] == 2**k - 1
    singles = [p for p in state['points'] if p['k'] == 1]
    assert len(singles) == k
    assert sorted(p['mu'] for p in singles) == pytest.approx([2**i for i in range(k)], abs=1e-12)
    for point, members in zip(state['points'], state['memberships']):
        if point['k'] == 1:
            assert point['I2'] == pytest.approx(0, abs=1e-12)
            assert state['pooled'][state['memberships'].index(members)]['Q'] == pytest.approx(0, abs=1e-12)
            assert point['mu'] == pytest.approx(2**int(members[0][1:]), rel=0, abs=1e-12)


@pytest.mark.parametrize('index', range(5), ids=['negative', 'zero', 'fraction', 'blank', 'over-cap'])
def test_invalid_draw_count_stays_visible_and_recovers(probe, index):
    states = probe['sampleRecovery'][index]
    assert states['before']['result']['n_subsets'] == 5000
    refused = states['refused']
    assert refused['sampleVisible'] == 'block'
    assert all(message_terms(refused['error'], 'draw').values()), f"Draw-count message: {refused['error']!r}"
    assert refused['result'] is None
    assert not svg_nodes(refused, 'circle')
    assert not re.search(r'\d', refused['median'] + refused['i2'])
    after = states['after']
    assert after['sampleVisible'] == 'block'
    assert not after['error']
    assert after['result']['n_subsets'] == 37
    assert len(after['points']) == len(after['memberships']) == len(svg_nodes(after, 'circle')) == 37


def readable(markup):
    return html.unescape(re.sub(r'<[^>]+>', ' ', markup))


def test_sampling_does_not_claim_metafor_default_parity(probe):
    markup = re.sub(r'<(script|style)\b[^>]*>.*?</\1>', '', probe['html'], flags=re.S)
    text = re.sub(r'\s+', ' ', readable(markup)).lower()
    # Inspect every sentence referencing metafor's sampling/enumeration policy.
    statements = [s for s in re.split(r'[.!?](?:\s|$)', text)
                  if 'metafor' in s and re.search(r'sampl|draw|subset|enumerat|default|switch', s)]
    assert statements, 'Sampling policy must disclose its relationship to metafor'
    for statement in statements:
        assert not re.search(r'\b(?:matches?|same as|identical to|equivalent to|aligns? with)\b', statement), statement
        assert re.search(r'\b(?:differ\w*|unlike|not|instead|whereas)\b', statement), statement


def test_displayed_default_equals_actual_draw_count(probe):
    label = re.search(r'<label\b[^>]*id="sample-label"[^>]*>(.*?)</label>', probe['html'], re.S)[1]
    # Check both visible hint and accessible input description; tolerate wording
    # and thousands separators rather than requiring the patched exact string.
    descriptions = [readable(label)] + re.findall(r'(?:aria-label|title)="([^"]+)"', label)
    declarations = []
    for description in descriptions:
        declarations.extend(int(re.sub(r'\D', '', n)) for n in
                            re.findall(r'default\s*[:=]?\s*(\d+(?:[,\s]\d{3})*)', html.unescape(description), re.I))
    assert declarations, 'The UI must state its default draw count'
    state = probe['sampled']
    actual = len(state['points'])
    assert all(n == actual for n in declarations), f'UI defaults {declarations}; actual draws {actual}'
    assert probe['defaultDraws'] == actual == len(state['memberships']) == len(svg_nodes(state, 'circle'))
    assert state['result']['sampled'] is True
    assert state['result']['n_subsets'] == actual
    assert int(state['count'].replace(',', '')) == actual


@pytest.mark.parametrize("index", [0, 1], ids=["fewer-than-three", "more-than-100"])
def test_refusal_clears_plot_and_medians_then_recovers(probe, index):
    states = probe['recovery'][index]
    assert states['before']['result'] is not None
    assert svg_nodes(states['before'], 'circle')
    refused = states['refused']
    assert refused['result'] is None
    assert not svg_nodes(refused, 'circle'), 'Refused input must clear previous plotted points'
    for key in ['median', 'i2']:
        assert not re.search(r'\d', refused[key]), f'Stale {key}: {refused[key]}'
    assert states['after'] == states['before'], 'A later valid run must fully recover'


def test_explicit_x_limits_map_points_to_plot_edges(probe):
    state = probe['axis']
    circles = svg_nodes(state, 'circle')
    assert len(circles) == len(state['points'])
    # Read plot edges from its horizontal axis, independently of engine padding.
    horizontal = [line for line in svg_nodes(state, 'line')
                  if line.get('y1') == line.get('y2') and line.get('x1') != line.get('x2')]
    axis = horizontal[0]
    edges = [float(axis.get('x1')), float(axis.get('x2'))]
    for limit, edge in zip(state['limits'], edges):
        matches = [float(circle.get('cx')) for p, circle in zip(state['points'], circles)
                   if abs(p['mu'] - limit) < 1e-12]
        assert matches, f'Fixture must contain a point at requested limit {limit}'
        assert matches == pytest.approx([edge] * len(matches), abs=1e-9)


@pytest.mark.parametrize('index', range(6))
def test_axis_sweep_coordinates_and_ticks(probe, index):
    import math
    state = probe['axisSweep'][index]
    assert state['svg'] and not state['plotError']
    for node in ET.fromstring('<svg>' + state['svg'] + '</svg>'):
        for key, value in node.attrib.items():
            if key in ('x', 'x1', 'x2', 'cx', 'y', 'y1', 'y2', 'cy'):
                number = float(value)
                assert math.isfinite(number)
                assert 0 <= number <= (600 if key.startswith(('x', 'cx')) else 420)
        if node.get('transform'):
            angle, x, y = map(float, re.fullmatch(r'rotate\(([^)]+)\)', node.get('transform'))[1].split())
            assert all(math.isfinite(v) for v in (angle, x, y))
            assert 0 <= x <= 600 and 0 <= y <= 420
    for axis, location in [('x', 388), ('y', 52)]:
        ticks = [n for n in svg_nodes(state, 'text')
                 if float(n.get('y' if axis == 'x' else 'x')) == location]
        values = [float(n.text.rstrip('%')) for n in ticks]
        assert values == sorted(values)
        limits = state['limits'].get(axis, [None, None])
        if limits[0] is not None:
            assert values[0] == pytest.approx(limits[0])
        if limits[1] is not None:
            assert values[-1] == pytest.approx(limits[1])
        for value, node in zip(values, ticks):
            if limits[0] is not None:
                assert value >= limits[0]
            if limits[1] is not None:
                assert value <= limits[1]
            coordinate = float(node.get('x' if axis == 'x' else 'y'))
            assert (60 <= coordinate <= 580) if axis == 'x' else (20 <= coordinate - 4 <= 370)


@pytest.mark.parametrize('index', range(8))
def test_axis_guard_retains_results_and_recovers(probe, index):
    case = probe['invalidAxes'][index]
    state = case['refused']
    assert not state['svg']
    assert all(message_terms(state['plotError'], 'axis').values()), f"Axis error meaning: {state['plotError']!r}"
    assert state['result'] == case['before']['result']
    assert state['points'] == case['before']['points']
    assert state['result']['n_subsets'] == 15
    assert state['median'] == case['before']['median']
    assert state['i2'] == case['before']['i2']
    assert case['after']['svg'] == case['before']['svg']
    assert case['after']['result'] == case['before']['result']
    assert not case['after']['plotError']


def test_excluded_points_are_omitted(probe):
    state = probe['excluded']
    expected = sum(1.5 <= p['mu'] <= 2 for p in state['points'])
    assert len(svg_nodes(state, 'circle')) == expected
    assert state['svg'] and not state['plotError']
    assert state['result']['n_subsets'] == 15

@pytest.mark.parametrize('index', range(20))
def test_independent_explicit_coordinate_oracle(probe, index):
    from .axis_oracle import coordinates
    state = probe['coordinateCases'][index]
    expected = coordinates(state['points'], state['limits'])
    actual = [[float(c.get('cx')), float(c.get('cy'))] for c in svg_nodes(state, 'circle')]
    assert expected, 'Fixture must retain points'
    assert len(actual) == len(expected)
    for observed, wanted in zip(actual, expected):
        assert observed == pytest.approx(wanted, rel=1e-9, abs=1e-9)
    assert state['result'] == state['original']


@pytest.mark.parametrize('index', range(20))
def test_omission_notice_matches_independent_oracle(probe, index):
    from .axis_oracle import coordinates
    state = probe['coordinateCases'][index]
    omitted = len(state['points']) - len(coordinates(state['points'], state['limits']))
    if state['limits'] == {'x': [2.5, 4], 'y': [10, 80]}:
        # Both axes must independently contribute to the combined exclusion.
        for axis in ('x', 'y'):
            only = {axis: state['limits'][axis]}
            assert omitted > len(state['points']) - len(coordinates(state['points'], only))
    notice = state['plotNote'].strip()
    assert bool(notice) == bool(omitted), f'Omission notice presence: {notice!r}; expected {omitted}'
    if omitted:
        assert all(message_terms(notice, 'omission').values()), f'Omission notice meaning: {notice!r}'
        match = re.match(r'^(\d+)\s+subset points\b', notice, re.I)
        assert match, f'Omission notice lacks a count: {notice!r}'
        assert int(match[1]) == omitted, f'Omission notice count: {notice!r}; expected {omitted}'


def test_plot_messages_clear_on_refusal_and_recover(probe):
    for case in probe['messageRecovery']:
        assert case['before']['plotNote' if case['source'] == 'note' else 'plotError']
        refused = case['refused']
        assert not refused['plotNote'] and not refused['plotError'], case
        assert refused['result'] is None and not refused['svg']
        assert case['after']['result'] and case['after']['svg']
        assert not case['after']['plotNote'] and not case['after']['plotError']


def test_subnormal_automatic_padding(probe):
    from .axis_oracle import coordinates
    for state in probe['subnormal']:
        assert not state['plotError']
        assert len(state['points']) == 15
        actual = [[float(c.get('cx')), float(c.get('cy'))] for c in svg_nodes(state, 'circle')]
        assert actual == coordinates(state['points'], {})
        assert len(actual) == 15
        ticks = [float(n.text) for n in svg_nodes(state, 'text') if n.get('y') == '388']
        assert ticks[0] < ticks[-1]
