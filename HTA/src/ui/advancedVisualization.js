/**
 * HTA Artifact Standard - Advanced Visualization Module
 * Interactive tornado diagrams, 3D scatter plots, network graphs, SVG/PNG export
 * @version 0.6.0
 */

'use strict';

// ============================================================================
// SECTION 1: TORNADO DIAGRAM (Interactive One-Way Sensitivity Analysis)
// ============================================================================

class TornadoDiagram {
    constructor(container, options = {}) {
        this.container = typeof container === 'string' ? document.querySelector(container) : container;
        this.options = {
            width: options.width || 800,
            height: options.height || 500,
            margin: options.margin || { top: 40, right: 120, bottom: 60, left: 200 },
            baselineColor: options.baselineColor || '#e2e8f0',
            positiveColor: options.positiveColor || '#22c55e',
            negativeColor: options.negativeColor || '#ef4444',
            neutralColor: options.neutralColor || '#64748b',
            baselineValue: options.baselineValue || null,
            title: options.title || 'Tornado Diagram',
            xLabel: options.xLabel || 'ICER ($/QALY)',
            onClick: options.onClick || null
        };

        this.data = [];
        this.svg = null;
        this.tooltip = null;
    }

    setData(data) {
        // Expected format: [{ parameter, lowValue, highValue, lowResult, highResult }]
        this.data = data.sort((a, b) => {
            const rangeA = Math.abs(a.highResult - a.lowResult);
            const rangeB = Math.abs(b.highResult - b.lowResult);
            return rangeB - rangeA;
        });
        return this;
    }

    render() {
        this._clear();
        this._createSVG();
        this._createTooltip();
        this._drawBars();
        this._drawBaseline();
        this._drawAxes();
        this._drawTitle();
        return this;
    }

    _clear() {
        if (this.container) {
            this.container.innerHTML = '';
        }
    }

    _createSVG() {
        const { width, height } = this.options;

        this.svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        this.svg.setAttribute('width', width);
        this.svg.setAttribute('height', height);
        this.svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
        this.svg.style.fontFamily = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';

        this.container.appendChild(this.svg);
    }

    _createTooltip() {
        this.tooltip = document.createElement('div');
        this.tooltip.style.cssText = `
            position: absolute;
            background: var(--card-bg, #fff);
            border: 1px solid var(--border, #e2e8f0);
            border-radius: 8px;
            padding: 12px;
            font-size: 13px;
            box-shadow: 0 4px 12px rgba(0,0,0,0.15);
            pointer-events: none;
            opacity: 0;
            transition: opacity 0.2s;
            z-index: 1000;
            max-width: 300px;
        `;
        document.body.appendChild(this.tooltip);
    }

    _drawBars() {
        const { margin, width, height, positiveColor, negativeColor, baselineValue } = this.options;
        const chartWidth = width - margin.left - margin.right;
        const chartHeight = height - margin.top - margin.bottom;

        const barHeight = Math.min(30, chartHeight / this.data.length - 4);
        const barSpacing = chartHeight / this.data.length;

        // Calculate x scale
        const allValues = this.data.flatMap(d => [d.lowResult, d.highResult]);
        const baseline = baselineValue !== null ? baselineValue : (allValues.reduce((a, b) => a + b, 0) / allValues.length);
        const minVal = Math.min(...allValues, baseline);
        const maxVal = Math.max(...allValues, baseline);
        const padding = (maxVal - minVal) * 0.1;

        this.xScale = (val) => margin.left + ((val - (minVal - padding)) / ((maxVal + padding) - (minVal - padding))) * chartWidth;
        this.baseline = baseline;

        const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');

        this.data.forEach((d, i) => {
            const y = margin.top + i * barSpacing + barSpacing / 2;

            // Low bar
            const lowX = this.xScale(Math.min(d.lowResult, baseline));
            const lowWidth = Math.abs(this.xScale(d.lowResult) - this.xScale(baseline));

            const lowBar = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
            lowBar.setAttribute('x', lowX);
            lowBar.setAttribute('y', y - barHeight / 2);
            lowBar.setAttribute('width', lowWidth);
            lowBar.setAttribute('height', barHeight);
            lowBar.setAttribute('fill', d.lowResult < baseline ? negativeColor : positiveColor);
            lowBar.setAttribute('rx', 3);
            lowBar.style.cursor = 'pointer';
            lowBar.style.transition = 'opacity 0.2s';

            // High bar
            const highX = this.xScale(Math.min(d.highResult, baseline));
            const highWidth = Math.abs(this.xScale(d.highResult) - this.xScale(baseline));

            const highBar = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
            highBar.setAttribute('x', highX);
            highBar.setAttribute('y', y - barHeight / 2);
            highBar.setAttribute('width', highWidth);
            highBar.setAttribute('height', barHeight);
            highBar.setAttribute('fill', d.highResult > baseline ? positiveColor : negativeColor);
            highBar.setAttribute('rx', 3);
            highBar.style.cursor = 'pointer';
            highBar.style.transition = 'opacity 0.2s';

            // Add interactivity
            [lowBar, highBar].forEach(bar => {
                bar.addEventListener('mouseenter', (e) => this._showTooltip(e, d));
                bar.addEventListener('mouseleave', () => this._hideTooltip());
                bar.addEventListener('click', () => {
                    if (this.options.onClick) this.options.onClick(d);
                });
            });

            // Parameter label
            const label = document.createElementNS('http://www.w3.org/2000/svg', 'text');
            label.setAttribute('x', margin.left - 10);
            label.setAttribute('y', y);
            label.setAttribute('text-anchor', 'end');
            label.setAttribute('dominant-baseline', 'middle');
            label.setAttribute('font-size', '12');
            label.setAttribute('fill', 'var(--text, #1e293b)');
            label.textContent = this._truncateText(d.parameter, 25);

            g.appendChild(lowBar);
            g.appendChild(highBar);
            g.appendChild(label);
        });

        this.svg.appendChild(g);
    }

    _drawBaseline() {
        const { margin, height } = this.options;

        const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        line.setAttribute('x1', this.xScale(this.baseline));
        line.setAttribute('y1', margin.top);
        line.setAttribute('x2', this.xScale(this.baseline));
        line.setAttribute('y2', height - margin.bottom);
        line.setAttribute('stroke', 'var(--text, #1e293b)');
        line.setAttribute('stroke-width', '2');
        line.setAttribute('stroke-dasharray', '5,5');

        this.svg.appendChild(line);
    }

    _drawAxes() {
        const { margin, width, height, xLabel } = this.options;

        // X-axis label
        const xAxisLabel = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        xAxisLabel.setAttribute('x', width / 2);
        xAxisLabel.setAttribute('y', height - 10);
        xAxisLabel.setAttribute('text-anchor', 'middle');
        xAxisLabel.setAttribute('font-size', '14');
        xAxisLabel.setAttribute('fill', 'var(--text, #1e293b)');
        xAxisLabel.textContent = xLabel;

        this.svg.appendChild(xAxisLabel);

        // X-axis ticks
        const ticks = 5;
        const allValues = this.data.flatMap(d => [d.lowResult, d.highResult]);
        const minVal = Math.min(...allValues, this.baseline);
        const maxVal = Math.max(...allValues, this.baseline);
        const step = (maxVal - minVal) / ticks;

        for (let i = 0; i <= ticks; i++) {
            const val = minVal + step * i;
            const x = this.xScale(val);

            const tick = document.createElementNS('http://www.w3.org/2000/svg', 'text');
            tick.setAttribute('x', x);
            tick.setAttribute('y', height - margin.bottom + 20);
            tick.setAttribute('text-anchor', 'middle');
            tick.setAttribute('font-size', '11');
            tick.setAttribute('fill', 'var(--text-muted, #64748b)');
            tick.textContent = this._formatNumber(val);

            this.svg.appendChild(tick);
        }
    }

    _drawTitle() {
        const { width, margin, title } = this.options;

        const titleEl = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        titleEl.setAttribute('x', width / 2);
        titleEl.setAttribute('y', margin.top / 2);
        titleEl.setAttribute('text-anchor', 'middle');
        titleEl.setAttribute('font-size', '16');
        titleEl.setAttribute('font-weight', 'bold');
        titleEl.setAttribute('fill', 'var(--text, #1e293b)');
        titleEl.textContent = title;

        this.svg.appendChild(titleEl);
    }

    _showTooltip(event, data) {
        this.tooltip.innerHTML = `
            <strong>${data.parameter}</strong><br>
            <span style="color: var(--text-muted)">Low value:</span> ${this._formatNumber(data.lowValue)}<br>
            <span style="color: var(--text-muted)">Low result:</span> ${this._formatNumber(data.lowResult)}<br>
            <span style="color: var(--text-muted)">High value:</span> ${this._formatNumber(data.highValue)}<br>
            <span style="color: var(--text-muted)">High result:</span> ${this._formatNumber(data.highResult)}<br>
            <span style="color: var(--text-muted)">Range:</span> ${this._formatNumber(Math.abs(data.highResult - data.lowResult))}
        `;
        this.tooltip.style.opacity = '1';
        this.tooltip.style.left = `${event.pageX + 10}px`;
        this.tooltip.style.top = `${event.pageY - 10}px`;
    }

    _hideTooltip() {
        this.tooltip.style.opacity = '0';
    }

    _truncateText(text, maxLen) {
        return text.length > maxLen ? text.substring(0, maxLen - 2) + '...' : text;
    }

    _formatNumber(val) {
        if (Math.abs(val) >= 1000000) return (val / 1000000).toFixed(1) + 'M';
        if (Math.abs(val) >= 1000) return (val / 1000).toFixed(1) + 'K';
        return val.toFixed(2);
    }

    exportSVG() {
        const serializer = new XMLSerializer();
        return serializer.serializeToString(this.svg);
    }

    exportPNG(scale = 2) {
        return new Promise((resolve) => {
            const svgData = this.exportSVG();
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            const img = new Image();

            canvas.width = this.options.width * scale;
            canvas.height = this.options.height * scale;
            ctx.scale(scale, scale);

            img.onload = () => {
                ctx.fillStyle = 'white';
                ctx.fillRect(0, 0, canvas.width, canvas.height);
                ctx.drawImage(img, 0, 0);
                resolve(canvas.toDataURL('image/png'));
            };

            img.src = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svgData)));
        });
    }

    destroy() {
        if (this.tooltip) this.tooltip.remove();
        if (this.container) this.container.innerHTML = '';
    }
}

// ============================================================================
// SECTION 2: 3D SCATTER PLOT (WebGL-based for PSA visualization)
// ============================================================================

class Scatter3D {
    constructor(container, options = {}) {
        this.container = typeof container === 'string' ? document.querySelector(container) : container;
        this.options = {
            width: options.width || 600,
            height: options.height || 600,
            pointSize: options.pointSize || 3,
            colors: options.colors || { default: '#3b82f6', highlight: '#ef4444' },
            rotationSpeed: options.rotationSpeed || 0.005,
            autoRotate: options.autoRotate !== false,
            xLabel: options.xLabel || 'X',
            yLabel: options.yLabel || 'Y',
            zLabel: options.zLabel || 'Z'
        };

        this.data = [];
        this.canvas = null;
        this.gl = null;
        this.rotation = { x: 0.5, y: 0.5 };
        this.isDragging = false;
        this.lastMouse = { x: 0, y: 0 };
        this.animationId = null;
    }

    setData(data) {
        // Expected format: [{ x, y, z, color?, label? }]
        this.data = data;
        return this;
    }

    render() {
        this._createCanvas();
        this._initWebGL();
        if (this.gl) {
            this._createShaders();
            this._createBuffers();
            this._setupEvents();
            this._animate();
        } else {
            this._fallbackTo2D();
        }
        return this;
    }

    _createCanvas() {
        this.container.innerHTML = '';
        this.canvas = document.createElement('canvas');
        this.canvas.width = this.options.width;
        this.canvas.height = this.options.height;
        this.canvas.style.cursor = 'grab';
        this.container.appendChild(this.canvas);
    }

    _initWebGL() {
        try {
            this.gl = this.canvas.getContext('webgl') || this.canvas.getContext('experimental-webgl');
        } catch (e) {
            this.gl = null;
        }
    }

    _createShaders() {
        const gl = this.gl;

        const vertexShaderSource = `
            attribute vec3 aPosition;
            attribute vec3 aColor;
            uniform mat4 uProjection;
            uniform mat4 uModelView;
            uniform float uPointSize;
            varying vec3 vColor;

            void main() {
                gl_Position = uProjection * uModelView * vec4(aPosition, 1.0);
                gl_PointSize = uPointSize;
                vColor = aColor;
            }
        `;

        const fragmentShaderSource = `
            precision mediump float;
            varying vec3 vColor;

            void main() {
                float dist = length(gl_PointCoord - vec2(0.5));
                if (dist > 0.5) discard;
                gl_FragColor = vec4(vColor, 1.0 - dist * 2.0);
            }
        `;

        const vertexShader = gl.createShader(gl.VERTEX_SHADER);
        gl.shaderSource(vertexShader, vertexShaderSource);
        gl.compileShader(vertexShader);

        const fragmentShader = gl.createShader(gl.FRAGMENT_SHADER);
        gl.shaderSource(fragmentShader, fragmentShaderSource);
        gl.compileShader(fragmentShader);

        this.program = gl.createProgram();
        gl.attachShader(this.program, vertexShader);
        gl.attachShader(this.program, fragmentShader);
        gl.linkProgram(this.program);
        gl.useProgram(this.program);

        this.uniforms = {
            projection: gl.getUniformLocation(this.program, 'uProjection'),
            modelView: gl.getUniformLocation(this.program, 'uModelView'),
            pointSize: gl.getUniformLocation(this.program, 'uPointSize')
        };

        this.attributes = {
            position: gl.getAttribLocation(this.program, 'aPosition'),
            color: gl.getAttribLocation(this.program, 'aColor')
        };
    }

    _createBuffers() {
        const gl = this.gl;

        // Normalize data to [-1, 1]
        const xVals = this.data.map(d => d.x);
        const yVals = this.data.map(d => d.y);
        const zVals = this.data.map(d => d.z);

        const normalize = (vals) => {
            const min = Math.min(...vals);
            const max = Math.max(...vals);
            const range = max - min || 1;
            return vals.map(v => (v - min) / range * 2 - 1);
        };

        const normX = normalize(xVals);
        const normY = normalize(yVals);
        const normZ = normalize(zVals);

        const positions = [];
        const colors = [];

        for (let i = 0; i < this.data.length; i++) {
            positions.push(normX[i], normY[i], normZ[i]);

            const color = this.data[i].color || this.options.colors.default;
            const rgb = this._hexToRgb(color);
            colors.push(rgb.r / 255, rgb.g / 255, rgb.b / 255);
        }

        this.positionBuffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, this.positionBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(positions), gl.STATIC_DRAW);

        this.colorBuffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, this.colorBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(colors), gl.STATIC_DRAW);

        this.pointCount = this.data.length;
    }

    _setupEvents() {
        this.canvas.addEventListener('mousedown', (e) => {
            this.isDragging = true;
            this.lastMouse = { x: e.clientX, y: e.clientY };
            this.canvas.style.cursor = 'grabbing';
        });

        document.addEventListener('mouseup', () => {
            this.isDragging = false;
            this.canvas.style.cursor = 'grab';
        });

        document.addEventListener('mousemove', (e) => {
            if (!this.isDragging) return;

            const dx = e.clientX - this.lastMouse.x;
            const dy = e.clientY - this.lastMouse.y;

            this.rotation.y += dx * 0.01;
            this.rotation.x += dy * 0.01;

            this.lastMouse = { x: e.clientX, y: e.clientY };
        });

        this.canvas.addEventListener('wheel', (e) => {
            e.preventDefault();
            this.options.pointSize = Math.max(1, Math.min(10, this.options.pointSize - e.deltaY * 0.01));
        });
    }

    _animate() {
        const gl = this.gl;

        const render = () => {
            if (this.options.autoRotate && !this.isDragging) {
                this.rotation.y += this.options.rotationSpeed;
            }

            gl.viewport(0, 0, this.canvas.width, this.canvas.height);
            gl.clearColor(0.05, 0.05, 0.1, 1);
            gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
            gl.enable(gl.DEPTH_TEST);
            gl.enable(gl.BLEND);
            gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

            // Projection matrix (perspective)
            const fov = Math.PI / 4;
            const aspect = this.canvas.width / this.canvas.height;
            const near = 0.1;
            const far = 100;
            const f = 1.0 / Math.tan(fov / 2);

            const projection = new Float32Array([
                f / aspect, 0, 0, 0,
                0, f, 0, 0,
                0, 0, (far + near) / (near - far), -1,
                0, 0, (2 * far * near) / (near - far), 0
            ]);

            // Model-view matrix (rotation + translation)
            const cx = Math.cos(this.rotation.x);
            const sx = Math.sin(this.rotation.x);
            const cy = Math.cos(this.rotation.y);
            const sy = Math.sin(this.rotation.y);

            const modelView = new Float32Array([
                cy, sx * sy, -cx * sy, 0,
                0, cx, sx, 0,
                sy, -sx * cy, cx * cy, 0,
                0, 0, -4, 1
            ]);

            gl.uniformMatrix4fv(this.uniforms.projection, false, projection);
            gl.uniformMatrix4fv(this.uniforms.modelView, false, modelView);
            gl.uniform1f(this.uniforms.pointSize, this.options.pointSize * (window.devicePixelRatio || 1));

            // Draw points
            gl.bindBuffer(gl.ARRAY_BUFFER, this.positionBuffer);
            gl.enableVertexAttribArray(this.attributes.position);
            gl.vertexAttribPointer(this.attributes.position, 3, gl.FLOAT, false, 0, 0);

            gl.bindBuffer(gl.ARRAY_BUFFER, this.colorBuffer);
            gl.enableVertexAttribArray(this.attributes.color);
            gl.vertexAttribPointer(this.attributes.color, 3, gl.FLOAT, false, 0, 0);

            gl.drawArrays(gl.POINTS, 0, this.pointCount);

            this.animationId = requestAnimationFrame(render);
        };

        render();
    }

    _fallbackTo2D() {
        // Simple 2D projection fallback if WebGL not available
        const ctx = this.canvas.getContext('2d');
        const { width, height, pointSize, colors } = this.options;

        ctx.fillStyle = '#0d1117';
        ctx.fillRect(0, 0, width, height);

        // Simple projection
        this.data.forEach(d => {
            const x = (d.x / (Math.max(...this.data.map(p => p.x)) || 1)) * (width - 100) + 50;
            const y = height - ((d.y / (Math.max(...this.data.map(p => p.y)) || 1)) * (height - 100) + 50);

            ctx.beginPath();
            ctx.arc(x, y, pointSize, 0, Math.PI * 2);
            ctx.fillStyle = d.color || colors.default;
            ctx.fill();
        });
    }

    _hexToRgb(hex) {
        const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
        return result ? {
            r: parseInt(result[1], 16),
            g: parseInt(result[2], 16),
            b: parseInt(result[3], 16)
        } : { r: 59, g: 130, b: 246 };
    }

    exportPNG() {
        return this.canvas.toDataURL('image/png');
    }

    destroy() {
        if (this.animationId) cancelAnimationFrame(this.animationId);
        if (this.container) this.container.innerHTML = '';
    }
}

// ============================================================================
// SECTION 3: NETWORK META-ANALYSIS GRAPH
// ============================================================================

class NMANetworkGraph {
    constructor(container, options = {}) {
        this.container = typeof container === 'string' ? document.querySelector(container) : container;
        this.options = {
            width: options.width || 700,
            height: options.height || 700,
            nodeRadius: options.nodeRadius || 30,
            nodeColor: options.nodeColor || '#3b82f6',
            edgeColor: options.edgeColor || '#94a3b8',
            referenceColor: options.referenceColor || '#22c55e',
            labelFontSize: options.labelFontSize || 12,
            showEdgeLabels: options.showEdgeLabels !== false,
            physics: options.physics !== false,
            onClick: options.onClick || null
        };

        this.nodes = [];
        this.edges = [];
        this.svg = null;
        this.simulation = null;
    }

    setData(data) {
        // Expected format: { nodes: [{ id, label, isReference? }], edges: [{ source, target, weight, studies? }] }
        this.nodes = data.nodes.map(n => ({ ...n, x: Math.random() * this.options.width, y: Math.random() * this.options.height }));
        this.edges = data.edges;
        return this;
    }

    render() {
        this._clear();
        this._createSVG();
        if (this.options.physics) {
            this._runSimulation();
        } else {
            this._layoutCircular();
        }
        this._drawEdges();
        this._drawNodes();
        return this;
    }

    _clear() {
        if (this.container) this.container.innerHTML = '';
    }

    _createSVG() {
        const { width, height } = this.options;

        this.svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        this.svg.setAttribute('width', width);
        this.svg.setAttribute('height', height);
        this.svg.style.fontFamily = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';

        // Add arrow marker for directed edges
        const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
        defs.innerHTML = `
            <marker id="arrowhead" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto">
                <polygon points="0 0, 10 3.5, 0 7" fill="${this.options.edgeColor}"/>
            </marker>
        `;
        this.svg.appendChild(defs);

        this.container.appendChild(this.svg);
    }

    _runSimulation() {
        const { width, height } = this.options;
        const centerX = width / 2;
        const centerY = height / 2;

        // Simple force-directed layout
        const iterations = 200;
        const k = Math.sqrt((width * height) / this.nodes.length) * 0.5;

        for (let iter = 0; iter < iterations; iter++) {
            // Repulsion between nodes
            for (let i = 0; i < this.nodes.length; i++) {
                for (let j = i + 1; j < this.nodes.length; j++) {
                    const dx = this.nodes[j].x - this.nodes[i].x;
                    const dy = this.nodes[j].y - this.nodes[i].y;
                    const dist = Math.sqrt(dx * dx + dy * dy) || 0.1;
                    const force = (k * k) / dist;

                    const fx = (dx / dist) * force;
                    const fy = (dy / dist) * force;

                    this.nodes[i].x -= fx;
                    this.nodes[i].y -= fy;
                    this.nodes[j].x += fx;
                    this.nodes[j].y += fy;
                }
            }

            // Attraction along edges
            for (const edge of this.edges) {
                const source = this.nodes.find(n => n.id === edge.source);
                const target = this.nodes.find(n => n.id === edge.target);
                if (!source || !target) continue;

                const dx = target.x - source.x;
                const dy = target.y - source.y;
                const dist = Math.sqrt(dx * dx + dy * dy) || 0.1;
                const force = (dist * dist) / k * 0.1;

                const fx = (dx / dist) * force;
                const fy = (dy / dist) * force;

                source.x += fx;
                source.y += fy;
                target.x -= fx;
                target.y -= fy;
            }

            // Center gravity
            for (const node of this.nodes) {
                node.x += (centerX - node.x) * 0.01;
                node.y += (centerY - node.y) * 0.01;

                // Keep within bounds
                node.x = Math.max(50, Math.min(width - 50, node.x));
                node.y = Math.max(50, Math.min(height - 50, node.y));
            }
        }
    }

    _layoutCircular() {
        const { width, height } = this.options;
        const centerX = width / 2;
        const centerY = height / 2;
        const radius = Math.min(width, height) * 0.35;

        this.nodes.forEach((node, i) => {
            const angle = (2 * Math.PI * i) / this.nodes.length - Math.PI / 2;
            node.x = centerX + radius * Math.cos(angle);
            node.y = centerY + radius * Math.sin(angle);
        });
    }

    _drawEdges() {
        const { edgeColor, showEdgeLabels } = this.options;
        const edgeGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');

        for (const edge of this.edges) {
            const source = this.nodes.find(n => n.id === edge.source);
            const target = this.nodes.find(n => n.id === edge.target);
            if (!source || !target) continue;

            const strokeWidth = Math.max(1, Math.min(8, (edge.weight || edge.studies || 1) * 2));

            const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
            line.setAttribute('x1', source.x);
            line.setAttribute('y1', source.y);
            line.setAttribute('x2', target.x);
            line.setAttribute('y2', target.y);
            line.setAttribute('stroke', edgeColor);
            line.setAttribute('stroke-width', strokeWidth);
            line.setAttribute('stroke-opacity', '0.6');
            edgeGroup.appendChild(line);

            // Edge label
            if (showEdgeLabels && (edge.weight || edge.studies)) {
                const midX = (source.x + target.x) / 2;
                const midY = (source.y + target.y) / 2;

                const label = document.createElementNS('http://www.w3.org/2000/svg', 'text');
                label.setAttribute('x', midX);
                label.setAttribute('y', midY);
                label.setAttribute('text-anchor', 'middle');
                label.setAttribute('dominant-baseline', 'middle');
                label.setAttribute('font-size', '10');
                label.setAttribute('fill', 'var(--text-muted, #64748b)');
                label.setAttribute('background', 'white');
                label.textContent = edge.studies ? `n=${edge.studies}` : edge.weight?.toFixed(2);
                edgeGroup.appendChild(label);
            }
        }

        this.svg.appendChild(edgeGroup);
    }

    _drawNodes() {
        const { nodeRadius, nodeColor, referenceColor, labelFontSize } = this.options;
        const nodeGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');

        for (const node of this.nodes) {
            const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
            g.style.cursor = 'pointer';

            // Node circle
            const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
            circle.setAttribute('cx', node.x);
            circle.setAttribute('cy', node.y);
            circle.setAttribute('r', nodeRadius);
            circle.setAttribute('fill', node.isReference ? referenceColor : nodeColor);
            circle.setAttribute('stroke', 'white');
            circle.setAttribute('stroke-width', '3');

            // Node label
            const label = document.createElementNS('http://www.w3.org/2000/svg', 'text');
            label.setAttribute('x', node.x);
            label.setAttribute('y', node.y);
            label.setAttribute('text-anchor', 'middle');
            label.setAttribute('dominant-baseline', 'middle');
            label.setAttribute('font-size', labelFontSize);
            label.setAttribute('fill', 'white');
            label.setAttribute('font-weight', 'bold');
            label.textContent = node.label?.substring(0, 3) || node.id?.substring(0, 3);

            // Full label below
            const fullLabel = document.createElementNS('http://www.w3.org/2000/svg', 'text');
            fullLabel.setAttribute('x', node.x);
            fullLabel.setAttribute('y', node.y + nodeRadius + 15);
            fullLabel.setAttribute('text-anchor', 'middle');
            fullLabel.setAttribute('font-size', '11');
            fullLabel.setAttribute('fill', 'var(--text, #1e293b)');
            fullLabel.textContent = node.label || node.id;

            // Click handler
            g.addEventListener('click', () => {
                if (this.options.onClick) this.options.onClick(node);
            });

            // Hover effect
            g.addEventListener('mouseenter', () => {
                circle.setAttribute('r', nodeRadius * 1.15);
            });
            g.addEventListener('mouseleave', () => {
                circle.setAttribute('r', nodeRadius);
            });

            g.appendChild(circle);
            g.appendChild(label);
            g.appendChild(fullLabel);
            nodeGroup.appendChild(g);
        }

        this.svg.appendChild(nodeGroup);
    }

    exportSVG() {
        const serializer = new XMLSerializer();
        return serializer.serializeToString(this.svg);
    }

    destroy() {
        if (this.container) this.container.innerHTML = '';
    }
}

// ============================================================================
// SECTION 4: FOREST PLOT
// ============================================================================

class ForestPlot {
    constructor(container, options = {}) {
        this.container = typeof container === 'string' ? document.querySelector(container) : container;
        this.options = {
            width: options.width || 900,
            height: options.height || null, // Auto-calculated
            margin: options.margin || { top: 60, right: 150, bottom: 60, left: 250 },
            rowHeight: options.rowHeight || 28,
            pointSize: options.pointSize || 6,
            diamondHeight: options.diamondHeight || 12,
            lineOfNoEffect: options.lineOfNoEffect || 0,
            effectLabel: options.effectLabel || 'Effect (95% CI)',
            showHeterogeneity: options.showHeterogeneity !== false,
            onClick: options.onClick || null
        };

        this.data = [];
        this.pooled = null;
        this.svg = null;
    }

    setData(data, pooled = null) {
        // Expected format: [{ study, effect, lower, upper, weight?, subgroup? }]
        this.data = data;
        this.pooled = pooled; // { effect, lower, upper, label? }
        return this;
    }

    render() {
        this._clear();
        this._calculateDimensions();
        this._createSVG();
        this._drawPlot();
        return this;
    }

    _clear() {
        if (this.container) this.container.innerHTML = '';
    }

    _calculateDimensions() {
        const rowCount = this.data.length + (this.pooled ? 2 : 0);
        this.options.height = this.options.margin.top + this.options.margin.bottom + rowCount * this.options.rowHeight;
    }

    _createSVG() {
        const { width, height } = this.options;

        this.svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        this.svg.setAttribute('width', width);
        this.svg.setAttribute('height', height);
        this.svg.style.fontFamily = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';

        this.container.appendChild(this.svg);
    }

    _drawPlot() {
        const { margin, width, height, rowHeight, lineOfNoEffect, pointSize, diamondHeight } = this.options;
        const chartWidth = width - margin.left - margin.right;

        // Calculate x scale
        const allValues = this.data.flatMap(d => [d.lower, d.upper]);
        if (this.pooled) {
            allValues.push(this.pooled.lower, this.pooled.upper);
        }
        const minVal = Math.min(...allValues, lineOfNoEffect);
        const maxVal = Math.max(...allValues, lineOfNoEffect);
        const padding = (maxVal - minVal) * 0.15;

        const xScale = (val) => margin.left + ((val - (minVal - padding)) / ((maxVal + padding) - (minVal - padding))) * chartWidth;

        // Header
        this._drawText('Study', margin.left - 10, margin.top - 20, 'end', 'bold');
        this._drawText(this.options.effectLabel, width - margin.right + 10, margin.top - 20, 'start', 'bold');

        // Line of no effect
        const noEffectX = xScale(lineOfNoEffect);
        this._drawLine(noEffectX, margin.top, noEffectX, height - margin.bottom, '#94a3b8', 1, '4,4');

        // Draw each study
        this.data.forEach((d, i) => {
            const y = margin.top + i * rowHeight + rowHeight / 2;

            // Study name
            this._drawText(d.study, margin.left - 10, y, 'end');

            // Confidence interval line
            this._drawLine(xScale(d.lower), y, xScale(d.upper), y, '#1e293b', 2);

            // Point estimate
            const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
            circle.setAttribute('cx', xScale(d.effect));
            circle.setAttribute('cy', y);
            circle.setAttribute('r', d.weight ? Math.sqrt(d.weight) * 2 + pointSize : pointSize);
            circle.setAttribute('fill', '#3b82f6');
            circle.style.cursor = 'pointer';

            circle.addEventListener('click', () => {
                if (this.options.onClick) this.options.onClick(d);
            });

            this.svg.appendChild(circle);

            // Effect text
            const effectText = `${d.effect.toFixed(2)} [${d.lower.toFixed(2)}, ${d.upper.toFixed(2)}]`;
            this._drawText(effectText, width - margin.right + 10, y, 'start', 'normal', '11');
        });

        // Pooled estimate (diamond)
        if (this.pooled) {
            const y = margin.top + this.data.length * rowHeight + rowHeight * 1.5;

            // Separator line
            this._drawLine(margin.left - 200, y - rowHeight / 2, width - margin.right + 100, y - rowHeight / 2, '#e2e8f0', 1);

            // Diamond
            const points = [
                `${xScale(this.pooled.effect)},${y - diamondHeight}`,
                `${xScale(this.pooled.upper)},${y}`,
                `${xScale(this.pooled.effect)},${y + diamondHeight}`,
                `${xScale(this.pooled.lower)},${y}`
            ].join(' ');

            const diamond = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
            diamond.setAttribute('points', points);
            diamond.setAttribute('fill', '#22c55e');
            this.svg.appendChild(diamond);

            // Label
            this._drawText(this.pooled.label || 'Pooled', margin.left - 10, y, 'end', 'bold');

            // Effect text
            const effectText = `${this.pooled.effect.toFixed(2)} [${this.pooled.lower.toFixed(2)}, ${this.pooled.upper.toFixed(2)}]`;
            this._drawText(effectText, width - margin.right + 10, y, 'start', 'bold', '11');
        }

        // X-axis
        this._drawAxis(xScale, minVal - padding, maxVal + padding, height - margin.bottom + 20);
    }

    _drawText(text, x, y, anchor = 'start', weight = 'normal', size = '12') {
        const el = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        el.setAttribute('x', x);
        el.setAttribute('y', y);
        el.setAttribute('text-anchor', anchor);
        el.setAttribute('dominant-baseline', 'middle');
        el.setAttribute('font-size', size);
        el.setAttribute('font-weight', weight);
        el.setAttribute('fill', 'var(--text, #1e293b)');
        el.textContent = text;
        this.svg.appendChild(el);
    }

    _drawLine(x1, y1, x2, y2, color, width, dash = '') {
        const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        line.setAttribute('x1', x1);
        line.setAttribute('y1', y1);
        line.setAttribute('x2', x2);
        line.setAttribute('y2', y2);
        line.setAttribute('stroke', color);
        line.setAttribute('stroke-width', width);
        if (dash) line.setAttribute('stroke-dasharray', dash);
        this.svg.appendChild(line);
    }

    _drawAxis(scale, min, max, y) {
        const ticks = 7;
        const step = (max - min) / ticks;

        for (let i = 0; i <= ticks; i++) {
            const val = min + step * i;
            const x = scale(val);

            this._drawText(val.toFixed(1), x, y, 'middle', 'normal', '10');
        }
    }

    exportSVG() {
        const serializer = new XMLSerializer();
        return serializer.serializeToString(this.svg);
    }

    destroy() {
        if (this.container) this.container.innerHTML = '';
    }
}

// ============================================================================
// SECTION 5: EXPORT UTILITIES
// ============================================================================

const ExportUtils = {
    downloadSVG(svgString, filename = 'chart.svg') {
        const blob = new Blob([svgString], { type: 'image/svg+xml' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        a.click();
        URL.revokeObjectURL(url);
    },

    async downloadPNG(svgString, width, height, filename = 'chart.png', scale = 2) {
        return new Promise((resolve) => {
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            const img = new Image();

            canvas.width = width * scale;
            canvas.height = height * scale;

            img.onload = () => {
                ctx.fillStyle = 'white';
                ctx.fillRect(0, 0, canvas.width, canvas.height);
                ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

                canvas.toBlob((blob) => {
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = filename;
                    a.click();
                    URL.revokeObjectURL(url);
                    resolve();
                }, 'image/png');
            };

            img.src = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svgString)));
        });
    },

    copyToClipboard(text) {
        return navigator.clipboard.writeText(text);
    }
};

// ============================================================================
// EXPORT
// ============================================================================

if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        TornadoDiagram,
        Scatter3D,
        NMANetworkGraph,
        ForestPlot,
        ExportUtils
    };
} else if (typeof window !== 'undefined') {
    window.TornadoDiagram = TornadoDiagram;
    window.Scatter3D = Scatter3D;
    window.NMANetworkGraph = NMANetworkGraph;
    window.ForestPlot = ForestPlot;
    window.ExportUtils = ExportUtils;
}
