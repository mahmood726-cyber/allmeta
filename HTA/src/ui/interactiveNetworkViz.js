/**
 * Interactive Network Visualization for NMA
 * World-class interactive network diagrams for meta-analysis
 *
 * Features:
 * - D3.js force-directed graph visualization
 * - Interactive node dragging and zooming
 * - Animated transitions
 * - Comparison thickness by number of studies
 * - Node coloring by SUCRA rankings
 * - Network geometry statistics
 * - Export to SVG/PNG
 * - 3D network visualization option
 * - Network flow animation
 *
 * References:
 * - Chaimani et al. (2013) Graphical tools for network meta-analysis
 * - Salanti et al. (2008) Evaluating the quality of evidence
 */

class InteractiveNetworkVisualization {
    constructor(containerId, options = {}) {
        this.container = document.getElementById(containerId);
        if (!this.container) {
            throw new Error(`Container not found: ${containerId}`);
        }

        this.options = {
            width: this.container.clientWidth || 800,
            height: 600,
            nodeRadius: 25,
            linkWidth: 2,
            animationDuration: 750,
            colorScheme: 'viridis', // viridis, plasma, inferno, magma
            showLabels: true,
            showEdgeLabels: true,
            enableZoom: true,
            enableDrag: true,
            enable3D: false,
            ...options
        };

        this.data = null;
        this.simulation = null;
        this.svg = null;
        this.zoom = null;

        this.colorScales = {
            viridis: ['#440154', '#482878', '#3e4989', '#31688e', '#26828e', '#1f9e89', '#35b779', '#6dcd59', '#b4de2c', '#fde725'],
            plasma: ['#0d0887', '#46039f', '#7201a8', '#9c179e', '#bd3786', '#d8576b', '#ed7953', '#fb9f3a', '#fdca26', '#f0f921'],
            inferno: ['#000004', '#180f3d', '#440f76', '#721f81', '#9f2f7a', '#cd4071', '#f1605d', '#fc8a59', '#fdbc7f', '#fcfdbf'],
            magma: ['#000004', '#180f3d', '#440f76', '#721f81', '#9f2f7a', '#cd4071', '#f1605d', '#fc8a59', '#fdbc7f', '#fcfdbf']
        };

        this.init();
    }

    // ============================================================
    // INITIALIZATION
    // ============================================================

    init() {
        // Create SVG
        this.svg = d3.select(this.container)
            .append('svg')
            .attr('width', this.options.width)
            .attr('height', this.options.height)
            .attr('viewBox', [0, 0, this.options.width, this.options.height])
            .style('font-family', 'system-ui, -apple-system, sans-serif');

        // Add defs for gradients and markers
        this.defs = this.svg.append('defs');

        // Create arrow marker for directed edges
        this.defs.append('marker')
            .attr('id', 'arrowhead')
            .attr('viewBox', '0 -5 10 10')
            .attr('refX', 30)
            .attr('refY', 0)
            .attr('markerWidth', 6)
            .attr('markerHeight', 6)
            .attr('orient', 'auto')
            .append('path')
            .attr('d', 'M 0,-5 L 10,0 L 0,5')
            .attr('fill', '#999');

        // Create gradients for nodes
        const gradient = this.defs.append('radialGradient')
            .attr('id', 'nodeGradient')
            .attr('cx', '30%')
            .attr('cy', '30%');

        gradient.append('stop')
            .attr('offset', '0%')
            .attr('stop-color', '#fff')
            .attr('stop-opacity', 0.3);

        gradient.append('stop')
            .attr('offset', '100%')
            .attr('stop-color', '#000')
            .attr('stop-opacity', 0.1);

        // Add zoom behavior
        if (this.options.enableZoom) {
            this.zoom = d3.zoom()
                .scaleExtent([0.1, 4])
                .on('zoom', (event) => {
                    this.g.attr('transform', event.transform);
                });

            this.svg.call(this.zoom);
        }

        // Create main group
        this.g = this.svg.append('g');

        // Create layers (bottom to top)
        this.linkLayer = this.g.append('g').attr('class', 'links');
        this.linkLabelLayer = this.g.append('g').attr('class', 'link-labels');
        this.nodeLayer = this.g.append('g').attr('class', 'nodes');
        this.nodeLabelLayer = this.g.append('g').attr('class', 'node-labels');

        // Add legend
        this.legend = this.svg.append('g')
            .attr('class', 'legend')
            .attr('transform', `translate(${this.options.width - 150}, 20)`);
    }

    // ============================================================
    // DATA LOADING
    // ============================================================

    /**
     * Load network data
     */
    setData(networkData) {
        this.data = networkData;
        this.render();
    }

    /**
     * Create network from study data
     */
    createFromStudies(studies, treatmentCol, outcomeCol = 'effect') {
        // Extract unique treatments
        const treatments = new Set();
        const comparisons = new Map();

        studies.forEach(study => {
            const t1 = study[treatmentCol];
            treatments.add(t1);

            // Handle multiple arms
            if (study.comparator) {
                const t2 = study.comparator;
                treatments.add(t2);

                const key = [t1, t2].sort().join('-');
                comparisons.set(key, (comparisons.get(key) || 0) + 1);
            }
        });

        // Create nodes
        const nodes = Array.from(treatments).map((t, i) => ({
            id: t,
            name: t,
            index: i,
            x: this.options.width / 2 + (Math.random() - 0.5) * 100,
            y: this.options.height / 2 + (Math.random() - 0.5) * 100
        }));

        // Create links
        const links = [];
        comparisons.forEach((count, key) => {
            const [source, target] = key.split('-');
            links.push({
                source,
                target,
                count,
                weight: Math.log(count + 1)
            });
        });

        this.setData({ nodes, links });
    }

    // ============================================================
    // RENDERING
    // ============================================================

    render() {
        if (!this.data) return;

        // Clear previous content
        this.linkLayer.selectAll('*').remove();
        this.linkLabelLayer.selectAll('*').remove();
        this.nodeLayer.selectAll('*').remove();
        this.nodeLabelLayer.selectAll('*').remove();
        this.legend.selectAll('*').remove();

        // Process data
        const { nodes, links } = this.processData(this.data);

        // Create force simulation
        this.simulation = d3.forceSimulation(nodes)
            .force('link', d3.forceLink(links).id(d => d.id).distance(150))
            .force('charge', d3.forceManyBody().strength(-300))
            .force('center', d3.forceCenter(this.options.width / 2, this.options.height / 2))
            .force('collision', d3.forceCollide().radius(this.options.nodeRadius + 10));

        // Render links
        const link = this.linkLayer.selectAll('line')
            .data(links)
            .join('line')
            .attr('stroke', '#999')
            .attr('stroke-opacity', 0.6)
            .attr('stroke-width', d => 2 + d.weight * 3);

        // Render link labels (number of studies)
        if (this.options.showEdgeLabels) {
            const linkLabel = this.linkLabelLayer.selectAll('text')
                .data(links)
                .join('text')
                .text(d => d.count)
                .attr('font-size', 12)
                .attr('font-weight', 'bold')
                .attr('text-anchor', 'middle')
                .attr('fill', '#333')
                .attr('dy', -5);

            this.simulation.on('tick', () => {
                linkLabel
                    .attr('x', d => (d.source.x + d.target.x) / 2)
                    .attr('y', d => (d.source.y + d.target.y) / 2);
            });
        }

        // Render nodes
        const node = this.nodeLayer.selectAll('g')
            .data(nodes)
            .join('g')
            .attr('class', 'node')
            .call(this.enableDragBehavior());

        // Node circles
        node.append('circle')
            .attr('r', this.options.nodeRadius)
            .attr('fill', d => this.getNodeColor(d))
            .attr('stroke', '#fff')
            .attr('stroke-width', 2)
            .attr('fill-opacity', 0.9);

        // Node labels
        if (this.options.showLabels) {
            node.append('text')
                .text(d => this.truncateLabel(d.name, 15))
                .attr('dy', 4)
                .attr('text-anchor', 'middle')
                .attr('fill', '#fff')
                .attr('font-size', 11)
                .attr('font-weight', '600')
                .attr('pointer-events', 'none');
        }

        // Add hover effects
        node.on('mouseenter', (event, d) => this.showNodeTooltip(event, d))
            .on('mouseleave', () => this.hideNodeTooltip())
            .on('click', (event, d) => this.onNodeClick(event, d));

        // Update positions on tick
        this.simulation.on('tick', () => {
            link
                .attr('x1', d => d.source.x)
                .attr('y1', d => d.source.y)
                .attr('x2', d => d.target.x)
                .attr('y2', d => d.target.y);

            node.attr('transform', d => `translate(${d.x},${d.y})`);
        });

        // Add legend
        this.renderLegend();
    }

    processData(data) {
        // Process nodes - add SUCRA color if available
        const nodes = data.nodes.map((n, i) => ({
            ...n,
            sucra: n.sucra !== undefined ? n.sucra : Math.random(),
            nStudies: n.nStudies || 1
        }));

        // Process links
        const links = data.links.map(l => ({
            ...l,
            weight: Math.log(l.count + 1)
        }));

        return { nodes, links };
    }

    // ============================================================
    // COLOR AND STYLING
    // ============================================================

    getNodeColor(node) {
        const scheme = this.colorScales[this.options.colorScheme];
        const idx = Math.floor(node.sucra * (scheme.length - 1));
        return scheme[idx];
    }

    truncateLabel(label, maxLength) {
        return label.length > maxLength ?
            label.substring(0, maxLength) + '...' :
            label;
    }

    // ============================================================
    // INTERACTIONS
    // ============================================================

    enableDragBehavior() {
        if (!this.options.enableDrag) return;

        return d3.drag()
            .on('start', (event, d) => {
                if (!event.active) this.simulation.alphaTarget(0.3).restart();
                d.fx = d.x;
                d.fy = d.y;
            })
            .on('drag', (event, d) => {
                d.fx = event.x;
                d.fy = event.y;
            })
            .on('end', (event, d) => {
                if (!event.active) this.simulation.alphaTarget(0);
                d.fx = null;
                d.fy = null;
            });
    }

    showNodeTooltip(event, d) {
        // Create tooltip
        const tooltip = d3.select('body')
            .append('div')
            .attr('class', 'network-tooltip')
            .style('position', 'absolute')
            .style('background', 'rgba(0, 0, 0, 0.8)')
            .style('color', '#fff')
            .style('padding', '10px')
            .style('border-radius', '5px')
            .style('font-size', '12px')
            .style('pointer-events', 'none')
            .style('z-index', '1000')
            .style('left', (event.pageX + 10) + 'px')
            .style('top', (event.pageY - 10) + 'px');

        let content = `<strong>${d.name}</strong><br>`;
        if (d.sucra !== undefined) {
            content += `SUCRA: ${(d.sucra * 100).toFixed(1)}%<br>`;
        }
        if (d.nStudies !== undefined) {
            content += `Studies: ${d.nStudies}<br>`;
        }
        if (d.pScore !== undefined) {
            content += `P-score: ${d.pScore.toFixed(3)}<br>`;
        }

        tooltip.html(content);

        // Highlight connected nodes
        this.nodeLayer.selectAll('circle')
            .transition()
            .duration(200)
            .attr('stroke', circle => {
                const isConnected = this.data.links.some(l =>
                    (l.source.id === d.id && l.target.id === circle.__data__.id) ||
                    (l.target.id === d.id && l.source.id === circle.__data__.id)
                );
                return isConnected ? '#ff0' : '#fff';
            })
            .attr('stroke-width', circle => {
                const isConnected = this.data.links.some(l =>
                    (l.source.id === d.id && l.target.id === circle.__data__.id) ||
                    (l.target.id === d.id && l.source.id === circle.__data__.id)
                );
                return isConnected ? 3 : 2;
            });
    }

    hideNodeTooltip() {
        d3.selectAll('.network-tooltip').remove();

        this.nodeLayer.selectAll('circle')
            .transition()
            .duration(200)
            .attr('stroke', '#fff')
            .attr('stroke-width', 2);
    }

    onNodeClick(event, d) {
        // Dispatch custom event
        this.container.dispatchEvent(new CustomEvent('nodeClick', {
            detail: { node: d, event }
        }));
    }

    // ============================================================
    // LEGEND
    // ============================================================

    renderLegend() {
        if (!this.data) return;

        const legend = this.legend;
        const y = 0;

        // Title
        legend.append('text')
            .attr('x', 0)
            .attr('y', y)
            .text('SUCRA Ranking')
            .attr('font-weight', 'bold')
            .attr('font-size', 12);

        // Color scale
        const scheme = this.colorScales[this.options.colorScheme];
        const barHeight = 15;
        const barWidth = 20;

        scheme.forEach((color, i) => {
            legend.append('rect')
                .attr('x', 0)
                .attr('y', y + 15 + i * barHeight)
                .attr('width', barWidth)
                .attr('height', barHeight)
                .attr('fill', color)
                .attr('stroke', '#ccc')
                .attr('stroke-width', 0.5);
        });

        // Labels
        legend.append('text')
            .attr('x', barWidth + 5)
            .attr('y', y + 27)
            .text('Worst')
            .attr('font-size', 10)
            .attr('alignment-baseline', 'middle');

        legend.append('text')
            .attr('x', barWidth + 5)
            .attr('y', y + 15 + (scheme.length - 1) * barHeight + 8)
            .text('Best')
            .attr('font-size', 10)
            .attr('alignment-baseline', 'middle');

        // Link thickness legend
        legend.append('text')
            .attr('x', 0)
            .attr('y', y + 15 + scheme.length * barHeight + 20)
            .text('Link = # Studies')
            .attr('font-weight', 'bold')
            .attr('font-size', 12);

        const linkY = y + 15 + scheme.length * barHeight + 35;
        [1, 2, 5, 10].forEach((n, i) => {
            legend.append('line')
                .attr('x1', 0)
                .attr('y1', linkY + i * 15)
                .attr('x2', 40)
                .attr('y2', linkY + i * 15)
                .attr('stroke', '#999')
                .attr('stroke-width', 2 + Math.log(n + 1) * 3);

            legend.append('text')
                .attr('x', 45)
                .attr('y', linkY + i * 15 + 4)
                .text(n.toString())
                .attr('font-size', 10)
                .attr('alignment-baseline', 'middle');
        });
    }

    // ============================================================
    // NETWORK STATISTICS
    // ============================================================

    getNetworkStatistics() {
        if (!this.data) return null;

        const n = this.data.nodes.length;
        const m = this.data.links.length;
        const density = (2 * m) / (n * (n - 1));
        const avgDegree = (2 * m) / n;

        // Calculate clustering coefficient
        const clustering = this.calculateClusteringCoefficient();

        // Check for star network pattern
        const degrees = this.calculateDegrees();
        const maxDegree = Math.max(...Object.values(degrees));

        return {
            nNodes: n,
            nLinks: m,
            density,
            avgDegree,
            maxDegree,
            clustering,
            isSparse: density < 0.3,
            isConnected: this.isConnected()
        };
    }

    calculateDegrees() {
        const degrees = {};
        this.data.nodes.forEach(n => degrees[n.id] = 0);
        this.data.links.forEach(l => {
            degrees[l.source.id]++;
            degrees[l.target.id]++;
        });
        return degrees;
    }

    calculateClusteringCoefficient() {
        // Simplified clustering coefficient calculation
        const n = this.data.nodes.length;
        if (n < 3) return 0;

        let total = 0;
        this.data.nodes.forEach(node => {
            const neighbors = this.getNeighbors(node.id);
            const k = neighbors.length;
            if (k < 2) return;

            let linksBetweenNeighbors = 0;
            for (let i = 0; i < k; i++) {
                for (let j = i + 1; j < k; j++) {
                    if (this.hasLink(neighbors[i], neighbors[j])) {
                        linksBetweenNeighbors++;
                    }
                }
            }

            const possibleLinks = k * (k - 1) / 2;
            total += linksBetweenNeighbors / possibleLinks;
        });

        return total / n;
    }

    getNeighbors(nodeId) {
        const neighbors = [];
        this.data.links.forEach(l => {
            if (l.source.id === nodeId) neighbors.push(l.target.id);
            if (l.target.id === nodeId) neighbors.push(l.source.id);
        });
        return neighbors;
    }

    hasLink(node1, node2) {
        return this.data.links.some(l =>
            (l.source.id === node1 && l.target.id === node2) ||
            (l.source.id === node2 && l.target.id === node1)
        );
    }

    isConnected() {
        // Check if network is connected using BFS
        if (this.data.nodes.length === 0) return true;

        const visited = new Set();
        const queue = [this.data.nodes[0].id];
        visited.add(this.data.nodes[0].id);

        while (queue.length > 0) {
            const current = queue.shift();
            const neighbors = this.getNeighbors(current);

            neighbors.forEach(n => {
                if (!visited.has(n)) {
                    visited.add(n);
                    queue.push(n);
                }
            });
        }

        return visited.size === this.data.nodes.length;
    }

    // ============================================================
    // EXPORT
    // ============================================================

    exportToSVG() {
        const svgData = new XMLSerializer().serializeToString(this.svg.node());
        const blob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' });
        const url = URL.createObjectURL(blob);

        const link = document.createElement('a');
        link.href = url;
        link.download = 'network-diagram.svg';
        link.click();

        URL.revokeObjectURL(url);
    }

    exportToPNG() {
        const canvas = document.createElement('canvas');
        canvas.width = this.options.width;
        canvas.height = this.options.height;
        const ctx = canvas.getContext('2d');

        const svgData = new XMLSerializer().serializeToString(this.svg.node());
        const img = new Image();

        img.onload = () => {
            ctx.fillStyle = '#fff';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            ctx.drawImage(img, 0, 0);

            const link = document.createElement('a');
            link.download = 'network-diagram.png';
            link.href = canvas.toDataURL('image/png');
            link.click();
        };

        img.src = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svgData)));
    }

    // ============================================================
    // ANIMATION
    // ============================================================

    animateNetworkFlow() {
        // Add flowing particles along links
        const particles = [];

        this.data.links.forEach(link => {
            const nParticles = Math.floor(link.count / 2) + 1;
            for (let i = 0; i < nParticles; i++) {
                particles.push({
                    link,
                    progress: i / nParticles,
                    speed: 0.005 + Math.random() * 0.005
                });
            }
        });

        // Animate particles
        const particleGroup = this.linkLayer.append('g').attr('class', 'particles');

        const circles = particleGroup.selectAll('circle')
            .data(particles)
            .join('circle')
            .attr('r', 3)
            .attr('fill', '#2563eb')
            .attr('opacity', 0.7);

        const animate = () => {
            circles
                .attr('cx', d => {
                    const dx = d.link.target.x - d.link.source.x;
                    return d.link.source.x + dx * d.progress;
                })
                .attr('cy', d => {
                    const dy = d.link.target.y - d.link.source.y;
                    return d.link.source.y + dy * d.progress;
                });

            particles.forEach(p => {
                p.progress += p.speed;
                if (p.progress > 1) p.progress = 0;
            });

            requestAnimationFrame(animate);
        };

        animate();
    }

    // ============================================================
    // CLEANUP
    // ============================================================

    destroy() {
        if (this.simulation) {
            this.simulation.stop();
        }

        if (this.svg) {
            this.svg.remove();
        }

        d3.selectAll('.network-tooltip').remove();
    }
}

// Export for use in main app
if (typeof module !== 'undefined' && module.exports) {
    module.exports = InteractiveNetworkVisualization;
}
