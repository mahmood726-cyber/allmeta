/**
 * Tests for src/ui/advancedVisualization.js -
 * TornadoDiagram, Scatter3D, NMANetworkGraph, ForestPlot, ExportUtils
 */

'use strict';

// Mock HTMLCanvasElement.getContext before requiring the module
// jsdom doesn't implement canvas, so we provide a minimal mock
const mockCtx = {
    fillStyle: '',
    fillRect: jest.fn(),
    drawImage: jest.fn(),
    beginPath: jest.fn(),
    arc: jest.fn(),
    fill: jest.fn(),
    scale: jest.fn(),
    clearRect: jest.fn(),
    getImageData: jest.fn(() => ({ data: [] })),
    putImageData: jest.fn(),
    createImageData: jest.fn(() => []),
    setTransform: jest.fn(),
    resetTransform: jest.fn(),
    save: jest.fn(),
    restore: jest.fn()
};

HTMLCanvasElement.prototype.getContext = jest.fn(function(type) {
    if (type === '2d') return mockCtx;
    // Return null for webgl (triggers fallback to 2D in Scatter3D)
    return null;
});

HTMLCanvasElement.prototype.toDataURL = jest.fn(() => 'data:image/png;base64,mock');
HTMLCanvasElement.prototype.toBlob = jest.fn(function(cb) { cb(new Blob(['mock'])); });

const {
    TornadoDiagram,
    Scatter3D,
    NMANetworkGraph,
    ForestPlot,
    ExportUtils
} = require('../../src/ui/advancedVisualization');

// Mock XMLSerializer for SVG export
global.XMLSerializer = class {
    serializeToString(node) {
        return '<svg>mock</svg>';
    }
};

// ---- Helpers ----

function createContainer() {
    const div = document.createElement('div');
    document.body.appendChild(div);
    return div;
}

// ---- TornadoDiagram ----

describe('TornadoDiagram', () => {
    let td, container;

    beforeEach(() => {
        document.body.innerHTML = '';
        container = createContainer();
        td = new TornadoDiagram(container);
    });

    afterEach(() => {
        td.destroy();
    });

    test('constructor with default options', () => {
        expect(td.options.width).toBe(800);
        expect(td.options.height).toBe(500);
        expect(td.data).toEqual([]);
    });

    test('constructor with custom options', () => {
        const custom = new TornadoDiagram(container, { width: 600, title: 'Custom' });
        expect(custom.options.width).toBe(600);
        expect(custom.options.title).toBe('Custom');
        custom.destroy();
    });

    test('setData sorts by range (descending)', () => {
        const data = [
            { parameter: 'A', lowValue: 0.1, highValue: 0.3, lowResult: 10, highResult: 20 },
            { parameter: 'B', lowValue: 0.2, highValue: 0.4, lowResult: 5, highResult: 50 }
        ];
        td.setData(data);
        expect(td.data[0].parameter).toBe('B'); // larger range
    });

    test('setData returns this for chaining', () => {
        const result = td.setData([]);
        expect(result).toBe(td);
    });

    test('render creates SVG in container', () => {
        td.setData([
            { parameter: 'Cost', lowValue: 1000, highValue: 5000, lowResult: 20000, highResult: 60000 }
        ]);
        td.render();
        const svg = container.querySelector('svg');
        expect(svg).not.toBeNull();
        expect(svg.getAttribute('width')).toBe('800');
    });

    test('render creates tooltip in body', () => {
        td.setData([
            { parameter: 'Test', lowValue: 1, highValue: 2, lowResult: 10, highResult: 20 }
        ]);
        td.render();
        expect(td.tooltip).not.toBeNull();
    });

    test('_truncateText truncates long text', () => {
        expect(td._truncateText('Short', 10)).toBe('Short');
        expect(td._truncateText('This is a very long parameter name', 15)).toBe('This is a ver...');
    });

    test('_formatNumber formats millions', () => {
        expect(td._formatNumber(1500000)).toBe('1.5M');
    });

    test('_formatNumber formats thousands', () => {
        expect(td._formatNumber(2500)).toBe('2.5K');
    });

    test('_formatNumber formats small numbers', () => {
        expect(td._formatNumber(42.123)).toBe('42.12');
    });

    test('exportSVG returns SVG string', () => {
        td.setData([
            { parameter: 'X', lowValue: 1, highValue: 2, lowResult: 10, highResult: 20 }
        ]);
        td.render();
        const svgStr = td.exportSVG();
        expect(typeof svgStr).toBe('string');
    });

    test('destroy cleans up', () => {
        td.setData([{ parameter: 'X', lowValue: 1, highValue: 2, lowResult: 10, highResult: 20 }]);
        td.render();
        td.destroy();
        expect(container.innerHTML).toBe('');
    });
});

// ---- Scatter3D ----

describe('Scatter3D', () => {
    let s3d, container;

    beforeEach(() => {
        document.body.innerHTML = '';
        container = createContainer();
        s3d = new Scatter3D(container);
    });

    test('constructor with defaults', () => {
        expect(s3d.options.width).toBe(600);
        expect(s3d.options.height).toBe(600);
        expect(s3d.data).toEqual([]);
    });

    test('setData stores data and returns this', () => {
        const data = [{ x: 1, y: 2, z: 3 }];
        const result = s3d.setData(data);
        expect(s3d.data).toBe(data);
        expect(result).toBe(s3d);
    });

    test('_hexToRgb parses hex colors', () => {
        const rgb = s3d._hexToRgb('#ff0000');
        expect(rgb).toEqual({ r: 255, g: 0, b: 0 });
    });

    test('_hexToRgb returns default for invalid hex', () => {
        const rgb = s3d._hexToRgb('not-a-color');
        expect(rgb).toEqual({ r: 59, g: 130, b: 246 });
    });

    test('render creates a canvas', () => {
        s3d.setData([{ x: 1, y: 2, z: 3 }, { x: 4, y: 5, z: 6 }]);
        s3d.render();
        const canvas = container.querySelector('canvas');
        expect(canvas).not.toBeNull();
    });

    test('destroy cleans up', () => {
        s3d.setData([{ x: 1, y: 2, z: 3 }]);
        s3d.render();
        s3d.destroy();
        expect(container.innerHTML).toBe('');
    });
});

// ---- NMANetworkGraph ----

describe('NMANetworkGraph', () => {
    let graph, container;

    const sampleData = {
        nodes: [
            { id: 'A', label: 'Treatment A', isReference: true },
            { id: 'B', label: 'Treatment B' },
            { id: 'C', label: 'Treatment C' }
        ],
        edges: [
            { source: 'A', target: 'B', weight: 2, studies: 5 },
            { source: 'A', target: 'C', weight: 1, studies: 3 },
            { source: 'B', target: 'C', weight: 1, studies: 2 }
        ]
    };

    beforeEach(() => {
        document.body.innerHTML = '';
        container = createContainer();
        graph = new NMANetworkGraph(container);
    });

    test('constructor with defaults', () => {
        expect(graph.options.width).toBe(700);
        expect(graph.options.height).toBe(700);
        expect(graph.nodes).toEqual([]);
    });

    test('setData processes nodes and edges', () => {
        const result = graph.setData(sampleData);
        expect(graph.nodes.length).toBe(3);
        expect(graph.edges.length).toBe(3);
        expect(result).toBe(graph);
    });

    test('render creates SVG', () => {
        graph.setData(sampleData).render();
        const svg = container.querySelector('svg');
        expect(svg).not.toBeNull();
    });

    test('render with physics=false uses circular layout', () => {
        const g = new NMANetworkGraph(container, { physics: false });
        g.setData(sampleData).render();
        // Nodes should be laid out in a circle — positions set
        expect(g.nodes[0].x).toBeDefined();
    });

    test('render creates edge labels when showEdgeLabels=true', () => {
        graph.setData(sampleData).render();
        const svg = container.querySelector('svg');
        const texts = svg.querySelectorAll('text');
        // Should have node labels + edge labels
        expect(texts.length).toBeGreaterThan(3);
    });

    test('reference node gets reference color', () => {
        graph.setData(sampleData).render();
        const circles = container.querySelectorAll('circle');
        const refCircle = Array.from(circles).find(c => c.getAttribute('fill') === '#22c55e');
        expect(refCircle).not.toBeNull();
    });

    test('exportSVG returns string', () => {
        graph.setData(sampleData).render();
        const str = graph.exportSVG();
        expect(typeof str).toBe('string');
    });

    test('destroy clears container', () => {
        graph.setData(sampleData).render();
        graph.destroy();
        expect(container.innerHTML).toBe('');
    });
});

// ---- ForestPlot ----

describe('ForestPlot', () => {
    let fp, container;

    const sampleStudies = [
        { study: 'Smith 2020', effect: 0.5, lower: 0.2, upper: 0.8, weight: 20 },
        { study: 'Jones 2021', effect: 0.3, lower: 0.1, upper: 0.5, weight: 30 },
        { study: 'Brown 2022', effect: 0.7, lower: 0.4, upper: 1.0, weight: 50 }
    ];

    const pooled = { effect: 0.5, lower: 0.3, upper: 0.7, label: 'Overall' };

    beforeEach(() => {
        document.body.innerHTML = '';
        container = createContainer();
        fp = new ForestPlot(container);
    });

    test('constructor with defaults', () => {
        expect(fp.options.width).toBe(900);
        expect(fp.options.lineOfNoEffect).toBe(0);
        expect(fp.data).toEqual([]);
    });

    test('setData stores data and pooled', () => {
        const result = fp.setData(sampleStudies, pooled);
        expect(fp.data.length).toBe(3);
        expect(fp.pooled).toBe(pooled);
        expect(result).toBe(fp);
    });

    test('render creates SVG', () => {
        fp.setData(sampleStudies, pooled).render();
        const svg = container.querySelector('svg');
        expect(svg).not.toBeNull();
    });

    test('_calculateDimensions auto-sizes height', () => {
        fp.setData(sampleStudies, pooled);
        fp._calculateDimensions();
        // 3 studies + 2 for pooled = 5 rows
        const expectedHeight = fp.options.margin.top + fp.options.margin.bottom + 5 * fp.options.rowHeight;
        expect(fp.options.height).toBe(expectedHeight);
    });

    test('destroy clears container', () => {
        fp.setData(sampleStudies).render();
        fp.destroy();
        expect(container.innerHTML).toBe('');
    });
});

// ---- ExportUtils ----

describe('ExportUtils', () => {
    test('downloadSVG creates blob and link', () => {
        global.URL.createObjectURL = jest.fn(() => 'blob:test');
        global.URL.revokeObjectURL = jest.fn();

        ExportUtils.downloadSVG('<svg></svg>', 'test.svg');
        expect(global.URL.createObjectURL).toHaveBeenCalled();
        expect(global.URL.revokeObjectURL).toHaveBeenCalled();
    });

    test('copyToClipboard calls navigator.clipboard', async () => {
        const mockWrite = jest.fn(() => Promise.resolve());
        Object.defineProperty(navigator, 'clipboard', {
            value: { writeText: mockWrite },
            writable: true,
            configurable: true
        });
        await ExportUtils.copyToClipboard('test text');
        expect(mockWrite).toHaveBeenCalledWith('test text');
    });
});
