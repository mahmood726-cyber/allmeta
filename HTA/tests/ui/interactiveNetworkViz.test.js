/**
 * Tests for src/ui/interactiveNetworkViz.js - InteractiveNetworkVisualization
 */

'use strict';

// ---- Mock D3.js ----
// InteractiveNetworkVisualization requires D3 heavily.
// We create a mock D3 that supports the method-chaining pattern.

function createChainableMock() {
    const obj = {};
    const handler = {
        get(target, prop) {
            if (prop === '__data__') return {};
            if (prop === 'node') return () => document.createElementNS('http://www.w3.org/2000/svg', 'svg');
            if (typeof target[prop] === 'function') return target[prop];
            // Return a function that returns the proxy for chaining
            return function(...args) {
                return new Proxy(obj, handler);
            };
        }
    };
    return new Proxy(obj, handler);
}

const chainable = () => createChainableMock();

global.d3 = {
    select: chainable,
    selectAll: chainable,
    zoom: () => createChainableMock(),
    drag: () => createChainableMock(),
    forceSimulation: () => createChainableMock(),
    forceLink: () => createChainableMock(),
    forceManyBody: () => createChainableMock(),
    forceCenter: () => createChainableMock(),
    forceCollide: () => createChainableMock()
};

// Mock XMLSerializer
global.XMLSerializer = class {
    serializeToString() { return '<svg>mock</svg>'; }
};

// ---- Load module ----
const InteractiveNetworkVisualization = require('../../src/ui/interactiveNetworkViz');

// ---- Helpers ----

function setupContainer() {
    document.body.innerHTML = '<div id="network-container" style="width:800px;height:600px;"></div>';
}

const sampleData = {
    nodes: [
        { id: 'A', name: 'Treatment A', sucra: 0.9, nStudies: 5 },
        { id: 'B', name: 'Treatment B', sucra: 0.6, nStudies: 3 },
        { id: 'C', name: 'Treatment C', sucra: 0.3, nStudies: 2 }
    ],
    links: [
        { source: { id: 'A' }, target: { id: 'B' }, count: 4 },
        { source: { id: 'A' }, target: { id: 'C' }, count: 2 },
        { source: { id: 'B' }, target: { id: 'C' }, count: 1 }
    ]
};

// ---- Tests ----

describe('InteractiveNetworkVisualization', () => {

    let viz;

    beforeEach(() => {
        setupContainer();
        viz = new InteractiveNetworkVisualization('network-container');
    });

    // ---- Constructor ----

    describe('constructor', () => {
        test('stores container reference', () => {
            expect(viz.container).not.toBeNull();
        });

        test('sets default options', () => {
            expect(viz.options.nodeRadius).toBe(25);
            expect(viz.options.linkWidth).toBe(2);
            expect(viz.options.colorScheme).toBe('viridis');
            expect(viz.options.showLabels).toBe(true);
            expect(viz.options.enableZoom).toBe(true);
            expect(viz.options.enableDrag).toBe(true);
        });

        test('accepts custom options', () => {
            const custom = new InteractiveNetworkVisualization('network-container', {
                nodeRadius: 40,
                colorScheme: 'plasma'
            });
            expect(custom.options.nodeRadius).toBe(40);
            expect(custom.options.colorScheme).toBe('plasma');
        });

        test('throws for missing container', () => {
            expect(() => new InteractiveNetworkVisualization('nonexistent')).toThrow('Container not found');
        });

        test('has color scales defined', () => {
            expect(viz.colorScales.viridis.length).toBe(10);
            expect(viz.colorScales.plasma.length).toBe(10);
            expect(viz.colorScales.inferno.length).toBe(10);
            expect(viz.colorScales.magma.length).toBe(10);
        });

        test('data is initially null', () => {
            expect(viz.data).toBeNull();
        });
    });

    // ---- Color and Styling ----

    describe('getNodeColor', () => {
        test('returns color from scheme based on SUCRA', () => {
            const color = viz.getNodeColor({ sucra: 0.5 });
            const scheme = viz.colorScales.viridis;
            const expectedIdx = Math.floor(0.5 * (scheme.length - 1));
            expect(color).toBe(scheme[expectedIdx]);
        });

        test('returns first color for sucra=0', () => {
            const color = viz.getNodeColor({ sucra: 0 });
            expect(color).toBe(viz.colorScales.viridis[0]);
        });

        test('returns last color for sucra=1', () => {
            const color = viz.getNodeColor({ sucra: 1 });
            expect(color).toBe(viz.colorScales.viridis[9]);
        });
    });

    // ---- Label Truncation ----

    describe('truncateLabel', () => {
        test('returns full label if short', () => {
            expect(viz.truncateLabel('ABC', 10)).toBe('ABC');
        });

        test('truncates long label', () => {
            expect(viz.truncateLabel('Very Long Treatment Name', 10)).toBe('Very Long ...');
        });
    });

    // ---- processData ----

    describe('processData', () => {
        test('adds sucra to nodes without it', () => {
            const data = {
                nodes: [{ id: 'X', name: 'X' }],
                links: []
            };
            const processed = viz.processData(data);
            expect(processed.nodes[0].sucra).toBeDefined();
        });

        test('preserves existing sucra', () => {
            const data = {
                nodes: [{ id: 'X', name: 'X', sucra: 0.75 }],
                links: []
            };
            const processed = viz.processData(data);
            expect(processed.nodes[0].sucra).toBe(0.75);
        });

        test('computes link weights from count', () => {
            const data = {
                nodes: [],
                links: [{ count: 4 }]
            };
            const processed = viz.processData(data);
            expect(processed.links[0].weight).toBeCloseTo(Math.log(5), 5);
        });
    });

    // ---- Network Statistics ----

    describe('getNetworkStatistics', () => {
        test('returns null when no data', () => {
            expect(viz.getNetworkStatistics()).toBeNull();
        });

        test('computes correct statistics', () => {
            viz.data = sampleData;
            const stats = viz.getNetworkStatistics();
            expect(stats.nNodes).toBe(3);
            expect(stats.nLinks).toBe(3);
            expect(stats.density).toBeCloseTo(1.0, 5); // fully connected triangle
            expect(stats.avgDegree).toBe(2);
        });
    });

    // ---- getNeighbors ----

    describe('getNeighbors', () => {
        test('finds neighbors of a node', () => {
            viz.data = sampleData;
            const neighbors = viz.getNeighbors('A');
            expect(neighbors).toContain('B');
            expect(neighbors).toContain('C');
        });

        test('returns empty for isolated node', () => {
            viz.data = { nodes: [{ id: 'X' }], links: [] };
            const neighbors = viz.getNeighbors('X');
            expect(neighbors).toEqual([]);
        });
    });

    // ---- hasLink ----

    describe('hasLink', () => {
        test('returns true for connected nodes', () => {
            viz.data = sampleData;
            expect(viz.hasLink('A', 'B')).toBe(true);
        });

        test('returns true for reversed direction', () => {
            viz.data = sampleData;
            expect(viz.hasLink('B', 'A')).toBe(true);
        });

        test('returns false for unconnected nodes', () => {
            viz.data = {
                nodes: [{ id: 'X' }, { id: 'Y' }],
                links: []
            };
            expect(viz.hasLink('X', 'Y')).toBe(false);
        });
    });

    // ---- isConnected ----

    describe('isConnected', () => {
        test('returns true for connected network', () => {
            viz.data = sampleData;
            expect(viz.isConnected()).toBe(true);
        });

        test('returns true for empty network', () => {
            viz.data = { nodes: [], links: [] };
            expect(viz.isConnected()).toBe(true);
        });

        test('returns false for disconnected network', () => {
            viz.data = {
                nodes: [{ id: 'A' }, { id: 'B' }, { id: 'C' }],
                links: [{ source: { id: 'A' }, target: { id: 'B' } }]
            };
            expect(viz.isConnected()).toBe(false);
        });
    });

    // ---- calculateClusteringCoefficient ----

    describe('calculateClusteringCoefficient', () => {
        test('returns 0 for fewer than 3 nodes', () => {
            viz.data = { nodes: [{ id: 'A' }, { id: 'B' }], links: [] };
            expect(viz.calculateClusteringCoefficient()).toBe(0);
        });

        test('returns positive value for triangle', () => {
            viz.data = sampleData;
            const cc = viz.calculateClusteringCoefficient();
            expect(cc).toBeGreaterThan(0);
        });
    });

    // ---- calculateDegrees ----

    describe('calculateDegrees', () => {
        test('computes degree for each node', () => {
            viz.data = sampleData;
            const degrees = viz.calculateDegrees();
            expect(degrees['A']).toBe(2);
            expect(degrees['B']).toBe(2);
            expect(degrees['C']).toBe(2);
        });
    });

    // ---- createFromStudies ----

    describe('createFromStudies', () => {
        test('creates network from study data', () => {
            const studies = [
                { treatment: 'A', comparator: 'B' },
                { treatment: 'A', comparator: 'C' },
                { treatment: 'B', comparator: 'C' },
                { treatment: 'A', comparator: 'B' }
            ];
            // setData will call render which uses D3 mocks
            const spy = jest.spyOn(viz, 'setData').mockImplementation(data => {
                viz.data = data;
            });
            viz.createFromStudies(studies, 'treatment');
            expect(spy).toHaveBeenCalled();
            expect(viz.data.nodes.length).toBe(3);
            expect(viz.data.links.length).toBe(3);
            // A-B appears twice
            const abLink = viz.data.links.find(l => {
                const key = [l.source, l.target].sort().join('-');
                return key === 'A-B';
            });
            expect(abLink.count).toBe(2);
        });
    });
});
