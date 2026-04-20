function renderFunnelPlot() {
    const R = APP.results, C = APP.config;
    const exp = C.exp && ['logHR', 'logRR', 'logOR'].includes(C.measure);
    const transform = v => exp ? Math.exp(v) : v;
    const pooled = R.rve || R.dl;
    const x = R.studies.map(s => transform(s.effect));
    const y = R.studies.map(s => s.se);

    // Get max SE for contour calculations
    const maxSE = Math.max(...y) * 1.1;
    const pooledEffect = transform(pooled.effect);

    // Calculate significance contours (p=0.05 and p=0.01)
    // For a two-tailed test: effect ± z * SE, where z = 1.96 for p=0.05, z = 2.576 for p=0.01
    const z_005 = 1.96;  // p=0.05
    const z_001 = 2.576; // p=0.01

    // Contour shapes - triangular regions emanating from pooled effect
    const shapes = [
        // p=0.05 contour (outer, lighter)
        {
            type: 'path',
            path: `M ${pooledEffect},0 L ${pooledEffect - z_005 * maxSE},${maxSE} L ${pooledEffect + z_005 * maxSE},${maxSE} Z`,
            fillcolor: 'rgba(168, 85, 247, 0.1)',
            line: { color: 'rgba(168, 85, 247, 0.3)', width: 1, dash: 'dot' },
            layer: 'below'
        },
        // p=0.01 contour (inner, slightly darker)
        {
            type: 'path',
            path: `M ${pooledEffect},0 L ${pooledEffect - z_001 * maxSE},${maxSE} L ${pooledEffect + z_001 * maxSE},${maxSE} Z`,
            fillcolor: 'rgba(168, 85, 247, 0.15)',
            line: { color: 'rgba(168, 85, 247, 0.4)', width: 1, dash: 'dot' },
            layer: 'below'
        }
    ];

    // Color-code studies by RoB if available
    let studyColors = R.studies.map(s => {
        if (!s.rob) return PLOT_COLORS.teal;
        const rob = s.rob.toLowerCase();
        if (rob.includes('high')) return '#ef4444';
        if (rob.includes('some concerns') || rob.includes('moderate')) return '#f59e0b';
        return '#10b981';
    });

    // Imputed studies trace (hollow circles)
    let imputedTrace = null;
    if (R.trimAndFill?.imputedStudies?.length > 0) {
        imputedTrace = {
            type: 'scatter',
            mode: 'markers',
            x: R.trimAndFill.imputedStudies.map(s => transform(s.effect)),
            y: R.trimAndFill.imputedStudies.map(s => s.se),
            marker: {
                size: 10,
                color: 'rgba(236, 72, 153, 0)',
                line: { color: PLOT_COLORS.gold, width: 2 }
            },
            text: R.trimAndFill.imputedStudies.map(s => s.study_id),
            hoverinfo: 'text+x+y',
            name: 'Imputed (Trim-and-Fill)',
            showlegend: true
        };
    }

    // Actual studies trace (filled circles)
    const trace = {
        type: 'scatter',
        mode: 'markers',
        x,
        y,
        marker: { size: 10, color: studyColors },
        text: R.studies.map(s => s.study_id + (s.rob ? ` (RoB: ${s.rob})` : '')),
        hoverinfo: 'text+x+y',
        name: 'Observed Studies',
        showlegend: true
    };

    // Pooled effect line (vertical dashed line)
    const pooledLine = {
        type: 'scatter',
        mode: 'lines',
        x: [pooledEffect, pooledEffect],
        y: [0, maxSE],
        line: { color: PLOT_COLORS.purple, width: 2.5, dash: 'dash' },
        name: 'Pooled Effect',
        showlegend: true,
        hoverinfo: 'skip'
    };

    const traces = [trace, pooledLine];
    if (imputedTrace) traces.push(imputedTrace);

    // Enhanced layout with shapes and better labels
    const funnelLayout = {
        ...plotLayout,
        xaxis: {
            ...plotLayout.xaxis,
            title: 'Effect Size',
            zeroline: true,
            zerolinecolor: '#808090',
            zerolinewidth: 1
        },
        yaxis: {
            ...plotLayout.yaxis,
            title: 'Standard Error',
            autorange: 'reversed'  // Smaller SE (more precise) at top
        },
        shapes: shapes,
        showlegend: true,
        legend: {
            x: 1.02,
            y: 1,
            xanchor: 'left',
            yanchor: 'top',
            bgcolor: 'rgba(42, 42, 50, 0.8)',
            bordercolor: PLOT_COLORS.gridGray,
            borderwidth: 1,
            font: { size: 11, color: '#f0f0f5' }
        },
        annotations: [
            {
                x: pooledEffect + z_005 * maxSE * 0.5,
                y: maxSE * 0.9,
                text: 'p=0.05',
                showarrow: false,
                font: { size: 10, color: PLOT_COLORS.purple },
                opacity: 0.6
            },
            {
                x: pooledEffect + z_001 * maxSE * 0.5,
                y: maxSE * 0.7,
                text: 'p=0.01',
                showarrow: false,
                font: { size: 10, color: PLOT_COLORS.purple },
                opacity: 0.7
            }
        ]
    };

    Plotly.newPlot('funnel-plot', traces, funnelLayout, { responsive: true });
}
