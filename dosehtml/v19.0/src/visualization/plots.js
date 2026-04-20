/**
 * Dose Response Pro v19.0 - Visualization Module
 *
 * Interactive plotting functions using Plotly.js
 *
 * @module Plots
 * @author M25 Evidence Synthesis Lab
 * @version 19.0.0
 */

import { Stats } from '../math/stats.js';

/**
 * Visualization functions
 */
export const Plots = {
  /**
   * Network plot for NMA
   */
  networkPlot(network, elementId, options = {}) {
    const opts = {
      width: options.width || 800,
      height: options.height || 600,
      showLabels: options.showLabels !== false,
      colorScheme: options.colorScheme || 'category10',
      ...options
    };

    // Create nodes
    const nodes = network.nodes.map(n => ({
      id: n.name,
      label: n.name,
      degree: n.degree,
      x: Math.random() * opts.width,
      y: Math.random() * opts.height
    }));

    // Create edges
    const edges = [];
    network.edges.forEach((e, i) => {
      const source = nodes.find(n => n.id === e.treatmentA);
      const target = nodes.find(n => n.id === e.treatmentB);

      if (source && target) {
        edges.push({
          source: source.id,
          target: target.id,
          width: 2,
          effect: e.effect,
          study: e.study
        });
      }
    });

    // Plotly trace
    const trace = {
      type: 'scatter',
      mode: 'markers+text',
      x: nodes.map(n => n.x),
      y: nodes.map(n => n.y),
      text: opts.showLabels ? nodes.map(n => n.label) : [],
      textposition: 'middle center',
      textfont: { size: 12, color: '#333' },
      marker: {
        size: nodes.map(n => 20 + n.degree * 5),
        color: nodes.map((_, i) => i),
        colorscale: opts.colorScheme,
        line: { width: 2, color: '#333' }
      },
      hovertemplate: '%{text}<br>Degree: %{marker.size}<extra></extra>',
      name: 'Treatments'
    };

    const edgeTrace = {
      type: 'scatter',
      mode: 'lines',
      x: edges.flatMap(e => [nodes.find(n => n.id === e.source).x,
                            nodes.find(n => n.id === e.target).x,
                            null]),
      y: edges.flatMap(e => [nodes.find(n => n.id === e.source).y,
                            nodes.find(n => n.id === e.target).y,
                            null]),
      line: { width: 2, color: '#999' },
      hoverinfo: 'skip',
      name: 'Comparisons'
    };

    const layout = {
      title: opts.title || 'Network Plot',
      showlegend: false,
      xaxis: { showgrid: false, showticklabels: false },
      yaxis: { showgrid: false, showticklabels: false },
      width: opts.width,
      height: opts.height,
      margin: { l: 50, r: 50, t: 50, b: 50 },
      plot_bgcolor: '#f8f9fa',
      paper_bgcolor: '#ffffff'
    };

    Plotly.newPlot(elementId, [edgeTrace, trace], layout, {
      displayModeBar: false,
      responsive: true
    });

    return { plot: Plotly, elementId, data: [edgeTrace, trace], layout };
  },

  /**
   * NMA forest plot
   */
  nmaForestPlot(results, elementId, options = {}) {
    const { effects, reference } = results;
    const y = effects.map((e, i) => e.treatment || `Treatment ${i}`);
    const x = effects.map(e => e.effect);
    const error_x = effects.map(e => [
      e.effect - e.ci[0],
      e.ci[1] - e.effect
    ]);

    const trace = {
      type: 'scatter',
      x: x,
      y: y,
      error_x: {
        type: 'data',
        symmetric: false,
        arrayminus: error_x.map(e => e[0]),
        arrayplus: error_x.map(e => e[1]),
        color: '#333',
        thickness: 2
      },
      mode: 'markers',
      marker: {
        size: 10,
        color: x.map((xi, i) => i === 0 ? '#666' : effects[i].effect > 0 ? '#e74c3c' : '#3498db')
      },
      hovertemplate: '%{y}: %{x:.3f} (%{error_x.arrayminus[0]:.3f}, %{error_x.arrayplus[0]:.3f})<extra></extra>'
    };

    const referenceLine = {
      type: 'scatter',
      x: [0, 0],
      y: [y[0], y[y.length - 1]],
      mode: 'lines',
      line: { color: '#000', width: 1, dash: 'dash' },
      hoverinfo: 'skip',
      showlegend: false
    };

    const layout = {
      title: options.title || `Network Meta-Analysis (Reference: ${reference})`,
      xaxis: { title: 'Effect Size', zeroline: true },
      yaxis: { title: 'Treatment', autorange: 'reversed' },
      width: options.width || 800,
      height: options.height || 600,
      margin: { l: 150, r: 50, t: 50, b: 50 }
    };

    Plotly.newPlot(elementId, [referenceLine, trace], layout, {
      responsive: true
    });

    return { plot: Plotly, elementId, data: [trace], layout };
  },

  /**
   * NMA rankings plot (SUCRA)
   */
  nmaRankingsPlot(results, elementId, options = {}) {
    const { rankings } = results;
    const type = options.type || 'sucra';

    if (type === 'sucra') {
      // Horizontal bar chart of SUCRA
      const trace = {
        type: 'bar',
        x: rankings.map(r => r.sucra),
        y: rankings.map(r => r.treatment),
        orientation: 'h',
        marker: {
          color: rankings.map((_, i) => i),
          colorscale: 'Viridis'
        },
        text: rankings.map(r => `${r.sucra.toFixed(1)}%`),
        textposition: 'outside',
        hovertemplate: '%{y}: %{x:.1f}%<extra></extra>'
      };

      const layout = {
        title: options.title || 'Treatment Rankings (SUCRA)',
        xaxis: { title: 'Surface Under Cumulative Ranking Curve (%)', range: [0, 100] },
        yaxis: { title: 'Treatment' },
        width: options.width || 800,
        height: options.height || 400,
        margin: { l: 150, r: 50, t: 50, b: 50 }
      };

      Plotly.newPlot(elementId, [trace], layout, { responsive: true });
    }

    return { plot: Plotly, elementId };
  },

  /**
   * Funnel plot for publication bias
   */
  funnelPlot(data, results, elementId, options = {}) {
    const opts = {
      showContours: options.showContours !== false,
      showTrimFill: options.showTrimFill || false,
      ...options
    };

    // Prepare data
    const effects = data.map(d => d.effect || d.logEffect);
    const se = data.map(d => d.se || Math.sqrt(d.variance));
    const precision = se.map(s => 1 / s);

    const trace = {
      type: 'scatter',
      x: effects,
      y: precision,
      mode: 'markers',
      marker: {
        size: 10,
        color: '#3498db',
        line: { color: '#2980b9', width: 1 }
      },
      text: data.map((d, i) => d.study || d.author || `Study ${i + 1}`),
      hovertemplate: '%{text}<br>Effect: %{x:.3f}<br>Precision: %{y:.3f}<extra></extra>'
    };

    const traces = [trace];

    // Add contour shapes
    if (opts.showContours) {
      const contours = this._generateFunnelContours(effects, precision);
      traces.push(...contours);
    }

    // Add imputed studies from trim and fill
    if (opts.showTrimFill && results?.trimFill?.imputed) {
      const imputedTrace = {
        type: 'scatter',
        x: results.trimFill.imputed.map(s => s.effect),
        y: results.trimFill.imputed.map(s => 1 / Math.sqrt(s.variance)),
        mode: 'markers',
        marker: {
          size: 10,
          color: '#e74c3c',
          symbol: 'circle-open',
          line: { color: '#c0392b', width: 1 }
        },
        name: 'Imputed',
        hovertemplate: 'Imputed<br>Effect: %{x:.3f}<extra></extra>'
      };
      traces.push(imputedTrace);
    }

    // Pooled effect line
    if (results?.pooledEffect !== undefined) {
      const pooledEffect = results.pooledEffect;
      const pooledTrace = {
        type: 'scatter',
        x: [pooledEffect, pooledEffect],
        y: [0, Math.max(...precision)],
        mode: 'lines',
        line: { color: '#e74c3c', width: 2, dash: 'dash' },
        name: 'Pooled',
        hoverinfo: 'skip'
      };
      traces.push(pooledTrace);
    }

    // Confidence interval lines
    const ci95 = 1.96;
    const CITrace = {
      type: 'scatter',
      x: [ci95, -ci95, -ci95, ci95],
      y: [precision[precision.length - 1], precision[precision.length - 1], precision[0], precision[0]],
      mode: 'lines',
      fill: 'toself',
      fillcolor: 'rgba(0,0,0,0.05)',
      line: { color: '#999', width: 1 },
      name: '95% CI',
      hoverinfo: 'skip'
    };
    traces.unshift(CITrace);

    const layout = {
      title: opts.title || 'Funnel Plot',
      xaxis: { title: 'Effect Size', zeroline: true },
      yaxis: { title: 'Precision (1/SE)', zeroline: false },
      showlegend: true,
      width: opts.width || 700,
      height: opts.height || 500,
      margin: { l: 80, r: 50, t: 50, b: 50 }
    };

    Plotly.newPlot(elementId, traces, layout, { responsive: true });

    return { plot: Plotly, elementId, data: traces, layout };
  },

  /**
   * Generate funnel plot contour shapes
   * @private
   */
  _generateFunnelContours(effects, precision) {
    const maxPrec = Math.max(...precision);
    const minPrec = Math.min(...precision);

    const contours = [];

    // Significance regions (two-sided)
    const levels = [0.9, 0.95, 0.99];

    levels.forEach((level, idx) => {
      const z = Stats.normalQuantile((1 + level) / 2);

      // Create polygon for significance region
      const x = [];
      const y = [];

      for (let prec = minPrec; prec <= maxPrec; prec += (maxPrec - minPrec) / 50) {
        const se = 1 / prec;
        const bound = z * se;

        x.push(bound);
        y.push(prec);
      }

      for (let i = x.length - 1; i >= 0; i--) {
        x.push(-x[i]);
        y.push(y[i]);
      }

      contours.push({
        type: 'scatter',
        x,
        y,
        mode: 'lines',
        fill: idx === 0 ? 'toself' : 'none',
        fillcolor: idx === 0 ? 'rgba(255, 255, 0, 0.1)' :
                     idx === 1 ? 'rgba(255, 165, 0, 0.1)' : 'rgba(255, 0, 0, 0.1)',
        line: { color: idx === 0 ? 'yellow' : idx === 1 ? 'orange' : 'red', width: 1 },
        name: `${(level * 100).toFixed(0)}% CI`,
        hoverinfo: 'name'
      });
    });

    return contours;
  },

  /**
   * Contour-enhanced funnel plot
   */
  contourFunnelPlot(data, elementId, options = {}) {
    const effects = data.map(d => d.effect || d.logEffect);
    const se = data.map(d => d.se || Math.sqrt(d.variance));
    const alpha = options.alpha || 0.05;

    // Create grid for contour
    const nGrid = 50;
    const xRange = [Math.min(...effects) - 2, Math.max(...effects) + 2];
    const yRange = [Math.min(...se) * 0.5, Math.max(...se) * 2];

    const x = Array.from({ length: nGrid }, (_, i) =>
      xRange[0] + (xRange[1] - xRange[0]) * i / (nGrid - 1)
    );
    const y = Array.from({ length: nGrid }, (_, i) =>
      yRange[0] + (yRange[1] - yRange[0]) * i / (nGrid - 1)
    );

    // Calculate z-scores for each grid point
    const z = x.map(xi =>
      y.map(yj =>
        yj === 0 ? 0 : xi / yj
      )
    );

    // P-values
    const p = z.map(row =>
      row.map(zi => 2 * (1 - Stats.normalCDF(Math.abs(zi))))
    );

    const trace = {
      type: 'contour',
      x,
      y,
      z: p,
      colorscale: [
        [0, 'rgb(255, 255, 204)'],
        [0.05, 'rgb(255, 255, 153)'],
        [0.10, 'rgb(255, 255, 102)'],
        [1, 'rgb(255, 255, 255)']
      ],
      contours: {
        start: 0.01,
        end: 0.10,
        size: 0.01,
        showlabels: true
      },
      colorbar: {
        title: 'P-value',
        titleside: 'right'
      },
      hovertemplate: 'Effect: %{x:.3f}<br>SE: %{y:.3f}<br>P: %{z:.3f}<extra></extra>'
    };

    // Add study points
    const points = {
      type: 'scatter',
      x: effects,
      y: se,
      mode: 'markers',
      marker: { size: 10, color: '#333' },
      text: data.map((d, i) => d.study || `Study ${i + 1}`),
      hovertemplate: '%{text}<extra></extra>'
    };

    const layout = {
      title: 'Contour-Enhanced Funnel Plot',
      xaxis: { title: 'Effect Size' },
      yaxis: { title: 'Standard Error' },
      width: options.width || 700,
      height: options.height || 500
    };

    Plotly.newPlot(elementId, [trace, points], layout, { responsive: true });

    return { plot: Plotly, elementId };
  },

  /**
   * Radial plot (Galbraith plot)
   */
  radialPlot(data, elementId, options = {}) {
    const effects = data.map(d => d.effect || d.logEffect);
    const se = data.map(d => d.se || Math.sqrt(d.variance));
    const z = effects.map((e, i) => e / se[i]);

    const theta = Array.from({ length: effects.length }, (_, i) =>
      (i / effects.length) * 2 * Math.PI
    );

    const r = z.map(zi => Math.abs(zi));
    const x = r.map((ri, i) => ri * Math.cos(theta[i]));
    const y = r.map((ri, i) => ri * Math.sin(theta[i]));

    const trace = {
      type: 'scatter',
      x,
      y,
      mode: 'markers+text',
      marker: {
        size: 10,
        color: z.map(zi => zi > 0 ? '#e74c3c' : '#3498db')
      },
      text: data.map((d, i) => d.study || `S${i + 1}`),
      textposition: 'top center',
      hovertemplate: '%{text}<br>Z: %{marker.color === "rgb(51, 152, 219)" ? "Negative" : "Positive"}<extra></extra>'
    };

    // Reference line at z = 1
    const refLine = {
      type: 'scatter',
      mode: 'lines',
      x: [0, Math.cos(theta[0]), 0],
      y: [0, Math.sin(theta[0]), 0],
      line: { color: '#000', width: 1, dash: 'dash' },
      hoverinfo: 'skip',
      showlegend: false
    };

    const layout = {
      title: options.title || 'Radial Plot (Galbraith Plot)',
      xaxis: { title: '', range: [-Math.max(...r) * 1.1, Math.max(...r) * 1.1], zeroline: true },
      yaxis: { title: '', range: [-Math.max(...r) * 1.1, Math.max(...r) * 1.1], zeroline: true },
      showlegend: false,
      aspectratio: 1,
      width: options.width || 600,
      height: options.height || 600
    };

    Plotly.newPlot(elementId, [refLine, trace], layout, { responsive: true });

    return { plot: Plotly, elementId };
  },

  /**
   * Doi plot
   */
  doiPlot(data, elementId, options = {}) {
    const effects = data.map(d => d.effect || d.logEffect);
    const variances = data.map(d => d.variance || d.se ** 2);

    // Sort by precision
    const sorted = data.map((d, i) => ({
      effect: effects[i],
      variance: variances[i],
      precision: 1 / Math.sqrt(variances[i])
    })).sort((a, b) => a.precision - b.precision);

    const cumulativePrecision = sorted.reduce((acc, _, i) => {
      acc.push((acc[i - 1] || 0) + sorted[i].precision);
      return acc;
    }, []);

    const xi = cumulativePrecision.map(cp => cp - Math.max(...cumulativePrecision) / 2);
    const yi = sorted.map(s => s.effect);

    const trace = {
      type: 'scatter',
      x: xi,
      y: yi,
      mode: 'markers+lines',
      marker: { size: 8, color: '#3498db' },
      line: { color: '#2980b9', width: 1 },
      text: sorted.map((s, i) => `n=${i + 1}`),
      hovertemplate: 'Cumulative: %{x:.3f}<br>Effect: %{y:.3f}<extra></extra>'
    };

    const layout = {
      title: options.title || 'Doi Plot',
      xaxis: { title: 'Centered Precision' },
      yaxis: { title: 'Effect Size' },
      showlegend: false,
      width: options.width || 700,
      height: options.height || 400
    };

    Plotly.newPlot(elementId, [trace], layout, { responsive: true });

    return { plot: Plotly, elementId };
  },

  /**
   * Kaplan-Meier plot
   */
  kaplanMeierPlot(ipdData, elementId, options = {}) {
    const { patients, treatments } = ipdData;
    const stratifyByStudy = options.stratifyByStudy || false;

    const traces = [];

    if (stratifyByStudy) {
      // One curve per study
      const studies = [...new Set(patients.map(p => p.study_id))];

      studies.forEach(studyId => {
        const studyPatients = patients.filter(p => p.study_id === studyId);
        const km = this._calculateKaplanMeier(studyPatients);

        traces.push({
          x: km.times,
          y: km.survival,
          mode: 'lines',
          name: studyId,
          line: { shape: 'hv' }
        });
      });
    } else {
      // One curve per treatment
      treatments.forEach(treatment => {
        const treatmentPatients = patients.filter(p => p.treatment === treatment);
        const km = this._calculateKaplanMeier(treatmentPatients);

        traces.push({
          x: km.times,
          y: km.survival,
          mode: 'lines',
          name: treatment,
          line: { shape: 'hv' }
        });
      });
    }

    const layout = {
      title: options.title || 'Kaplan-Meier Survival Curves',
      xaxis: { title: 'Time' },
      yaxis: { title: 'Survival Probability', range: [0, 1] },
      showlegend: true,
      width: options.width || 800,
      height: options.height || 500
    };

    Plotly.newPlot(elementId, traces, layout, { responsive: true });

    return { plot: Plotly, elementId };
  },

  /**
   * Calculate Kaplan-Meier estimates
   * @private
   */
  _calculateKaplanMeier(patients) {
    const sorted = [...patients].sort((a, b) => a.time - b.time);

    const times = [];
    const survival = [1];
    const atRisk = [patients.length];

    let currentSurvival = 1;
    let currentAtRisk = patients.length;

    sorted.forEach((patient, i) => {
      if (i === 0 || sorted[i - 1].time !== patient.time) {
        times.push(patient.time);
        atRisk.push(currentAtRisk);
      }

      if (patient.event === 1) {
        currentSurvival *= (currentAtRisk - 1) / currentAtRisk;
        survival.push(currentSurvival);
      }

      currentAtRisk--;
    });

    return { times, survival, atRisk };
  },

  /**
   * IPD forest plot
   */
  ipdForestPlot(results, elementId, options = {}) {
    const { stage1, stage2, method } = results;

    if (method !== 'twostage') {
      throw new Error('Forest plot only available for two-stage IPD');
    }

    const y = stage1.map(s => s.study_id);
    const x = stage1.map(s => s.model.hazardRatio);
    const error_x = stage1.map(s => [
      s.model.hazardRatio - s.model.ciLower,
      s.model.ciUpper - s.model.hazardRatio
    ]);

    const studyTrace = {
      type: 'scatter',
      x,
      y,
      error_x: {
        type: 'data',
        symmetric: false,
        arrayminus: error_x.map(e => e[0]),
        arrayplus: error_x.map(e => e[1])
      },
      mode: 'markers',
      name: 'Study-specific',
      marker: { size: 8, color: '#3498db' }
    };

    // Pooled effect
    const pooledTrace = {
      type: 'scatter',
      x: [stage2.pooledEffect.hazardRatio],
      y: ['Pooled'],
      error_x: {
        type: 'data',
        symmetric: false,
        arrayminus: [[stage2.pooledEffect.hazardRatio - stage2.pooledEffect.ciLower]],
        arrayplus: [[stage2.pooledEffect.ciUpper - stage2.pooledEffect.hazardRatio]]
      },
      mode: 'markers',
      name: 'Pooled',
      marker: { size: 12, color: '#e74c3c' }
    };

    const referenceLine = {
      type: 'scatter',
      x: [1, 1],
      y: [y[0], y[y.length - 1]],
      mode: 'lines',
      line: { color: '#000', width: 1, dash: 'dash' },
      hoverinfo: 'skip',
      showlegend: false
    };

    const layout = {
      title: options.title || 'IPD Meta-Analysis Forest Plot',
      xaxis: { title: 'Hazard Ratio', type: 'log', range: [0.1, 10] },
      yaxis: { title: 'Study' },
      showlegend: true,
      width: options.width || 700,
      height: options.height || 400 + y.length * 30
    };

    Plotly.newPlot(elementId, [referenceLine, studyTrace, pooledTrace], layout, {
      responsive: true
    });

    return { plot: Plotly, elementId };
  },

  /**
   * Interaction plot for IPD
   */
  interactionPlot(ipdData, covariate, elementId, options = {}) {
    const { patients, treatments } = ipdData;
    const covIdx = patients[0].covariateNames.indexOf(covariate);

    if (covIdx === -1) {
      throw new Error(`Covariate ${covariate} not found`);
    }

    // Calculate treatment effect across covariate quantiles
    const covValues = patients.map(p => p.covariates[covIdx]);
    const quantiles = Stats.quantile(covValues, [0.25, 0.5, 0.75]);

    const traces = [];
    const colors = ['#3498db', '#e74c3c', '#2ecc71'];

    quantiles.forEach((q, idx) => {
      const subset = patients.filter(p => p.covariates[covIdx] <= q);
      const treatmentGroup = subset.filter(p => p.treatment === treatments[1]);
      const controlGroup = subset.filter(p => p.treatment === treatments[0]);

      // Simple hazard ratio calculation
      const events = {
        treatment: treatmentGroup.filter(p => p.event === 1).length,
        control: controlGroup.filter(p => p.event === 1).length
      };

      const py = {
        treatment: treatmentGroup.reduce((sum, p) => sum + p.time, 0),
        control: controlGroup.reduce((sum, p) => sum + p.time, 0)
      };

      const hr = events.treatment / py.treatment / (events.control / py.control);

      traces.push({
        type: 'scatter',
        x: [q],
        y: [hr],
        mode: 'markers+lines',
        name: `Q${idx + 1} (${quantiles[idx].toFixed(2)})`,
        marker: { size: 12, color: colors[idx] },
        line: { width: 2 }
      });
    });

    const layout = {
      title: options.title || `Treatment Effect by ${covariate}`,
      xaxis: { title: covariate },
      yaxis: { title: 'Hazard Ratio', type: 'log', range: [0.1, 10] },
      showlegend: true,
      width: options.width || 600,
      height: options.height || 400
    };

    Plotly.newPlot(elementId, traces, layout, { responsive: true });

    return { plot: Plotly, elementId };
  }
};

export default Plots;
