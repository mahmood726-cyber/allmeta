// Model Diagnostics Functions

// Compute standardized residuals for meta-analysis
function computeStandardizedResiduals(effects, variances, pooledEffect, tau2) {
  const residuals = [];
  for (let i = 0; i < effects.length; i++) {
    const totalVar = variances[i] + tau2;
    const residual = effects[i] - pooledEffect;
    const stdResidual = residual / Math.sqrt(totalVar);
    residuals.push({
      index: i,
      raw: residual,
      standardized: stdResidual,
      weight: 1 / totalVar
    });
  }
  return residuals;
}

// Compute theoretical quantiles for Q-Q plot
function computeTheoreticalQuantiles(n) {
  const quantiles = [];
  for (let i = 1; i <= n; i++) {
    // Use Blom's plotting position: (i - 3/8) / (n + 1/4)
    const p = (i - 0.375) / (n + 0.25);
    quantiles.push(normalQuantile(p));
  }
  return quantiles;
}

// Prepare data for residual plot
function prepareResidualPlotData(stats) {
  const plotData = [];

  for (const stat of stats) {
    if (!stat.effects || !stat.variances || stat.pooledEffect === undefined) continue;

    const residuals = computeStandardizedResiduals(
      stat.effects,
      stat.variances,
      stat.pooledEffect,
      stat.tau2 || 0
    );

    for (const r of residuals) {
      plotData.push({
        treatment: stat.treatment,
        fitted: stat.pooledEffect,
        residual: r.standardized,
        weight: r.weight
      });
    }
  }

  return plotData;
}

// Prepare data for Q-Q plot
function prepareQQPlotData(stats) {
  const allResiduals = [];

  for (const stat of stats) {
    if (!stat.effects || !stat.variances || stat.pooledEffect === undefined) continue;

    const residuals = computeStandardizedResiduals(
      stat.effects,
      stat.variances,
      stat.pooledEffect,
      stat.tau2 || 0
    );

    allResiduals.push(...residuals.map(r => ({
      treatment: stat.treatment,
      value: r.standardized
    })));
  }

  // Sort residuals
  allResiduals.sort((a, b) => a.value - b.value);

  // Compute theoretical quantiles
  const theoretical = computeTheoreticalQuantiles(allResiduals.length);

  return allResiduals.map((r, i) => ({
    treatment: r.treatment,
    theoretical: theoretical[i],
    sample: r.value
  }));
}

// Draw residual plot on canvas
function drawResidualPlot(ctx, data, width, height) {
  const margin = { top: 40, right: 30, bottom: 50, left: 60 };
  const plotW = width - margin.left - margin.right;
  const plotH = height - margin.top - margin.bottom;

  // Clear
  ctx.fillStyle = '#1a1a2e';
  ctx.fillRect(0, 0, width, height);

  if (!data || data.length === 0) {
    ctx.fillStyle = '#888';
    ctx.font = '14px system-ui';
    ctx.textAlign = 'center';
    ctx.fillText('No residual data available', width / 2, height / 2);
    return;
  }

  // Compute ranges
  const fitted = data.map(d => d.fitted);
  const residuals = data.map(d => d.residual);
  const xMin = Math.min(...fitted);
  const xMax = Math.max(...fitted);
  const yMin = Math.min(...residuals, -2);
  const yMax = Math.max(...residuals, 2);
  const xRange = xMax - xMin || 1;
  const yRange = yMax - yMin;

  // Scales
  const xScale = x => margin.left + ((x - xMin) / xRange) * plotW;
  const yScale = y => margin.top + plotH - ((y - yMin) / yRange) * plotH;

  // Draw grid
  ctx.strokeStyle = 'rgba(255,255,255,0.1)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let i = 0; i <= 5; i++) {
    const y = margin.top + (i / 5) * plotH;
    ctx.moveTo(margin.left, y);
    ctx.lineTo(margin.left + plotW, y);
  }
  ctx.stroke();

  // Draw zero line
  ctx.strokeStyle = 'rgba(255,100,100,0.5)';
  ctx.lineWidth = 2;
  ctx.setLineDash([5, 5]);
  ctx.beginPath();
  ctx.moveTo(margin.left, yScale(0));
  ctx.lineTo(margin.left + plotW, yScale(0));
  ctx.stroke();
  ctx.setLineDash([]);

  // Draw +/- 2 lines
  ctx.strokeStyle = 'rgba(255,200,100,0.3)';
  ctx.lineWidth = 1;
  ctx.setLineDash([3, 3]);
  ctx.beginPath();
  ctx.moveTo(margin.left, yScale(2));
  ctx.lineTo(margin.left + plotW, yScale(2));
  ctx.moveTo(margin.left, yScale(-2));
  ctx.lineTo(margin.left + plotW, yScale(-2));
  ctx.stroke();
  ctx.setLineDash([]);

  // Draw points
  const colors = ['#E69F00', '#56B4E9', '#009E73', '#F0E442', '#0072B2', '#D55E00', '#CC79A7', '#999999'];
  const treatments = [...new Set(data.map(d => d.treatment))];

  for (let i = 0; i < data.length; i++) {
    const d = data[i];
    const colorIdx = treatments.indexOf(d.treatment) % colors.length;
    ctx.fillStyle = colors[colorIdx];
    ctx.beginPath();
    ctx.arc(xScale(d.fitted), yScale(d.residual), 5, 0, Math.PI * 2);
    ctx.fill();
  }

  // Axes labels
  ctx.fillStyle = '#fff';
  ctx.font = '12px system-ui';
  ctx.textAlign = 'center';
  ctx.fillText('Fitted Values', margin.left + plotW / 2, height - 10);

  ctx.save();
  ctx.translate(15, margin.top + plotH / 2);
  ctx.rotate(-Math.PI / 2);
  ctx.fillText('Standardized Residuals', 0, 0);
  ctx.restore();

  // Title
  ctx.font = 'bold 14px system-ui';
  ctx.fillText('Residuals vs Fitted', width / 2, 20);
}

// Draw Q-Q plot on canvas
function drawQQPlot(ctx, data, width, height) {
  const margin = { top: 40, right: 30, bottom: 50, left: 60 };
  const plotW = width - margin.left - margin.right;
  const plotH = height - margin.top - margin.bottom;

  // Clear
  ctx.fillStyle = '#1a1a2e';
  ctx.fillRect(0, 0, width, height);

  if (!data || data.length === 0) {
    ctx.fillStyle = '#888';
    ctx.font = '14px system-ui';
    ctx.textAlign = 'center';
    ctx.fillText('No Q-Q data available', width / 2, height / 2);
    return;
  }

  // Compute ranges
  const theoretical = data.map(d => d.theoretical);
  const sample = data.map(d => d.sample);
  const allVals = [...theoretical, ...sample];
  const vMin = Math.min(...allVals);
  const vMax = Math.max(...allVals);
  const range = vMax - vMin || 1;

  // Scales
  const xScale = x => margin.left + ((x - vMin) / range) * plotW;
  const yScale = y => margin.top + plotH - ((y - vMin) / range) * plotH;

  // Draw grid
  ctx.strokeStyle = 'rgba(255,255,255,0.1)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let i = 0; i <= 5; i++) {
    const pos = margin.top + (i / 5) * plotH;
    ctx.moveTo(margin.left, pos);
    ctx.lineTo(margin.left + plotW, pos);
    ctx.moveTo(margin.left + (i / 5) * plotW, margin.top);
    ctx.lineTo(margin.left + (i / 5) * plotW, margin.top + plotH);
  }
  ctx.stroke();

  // Draw reference line (y = x)
  ctx.strokeStyle = 'rgba(100,255,100,0.5)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(xScale(vMin), yScale(vMin));
  ctx.lineTo(xScale(vMax), yScale(vMax));
  ctx.stroke();

  // Draw points
  const colors = ['#E69F00', '#56B4E9', '#009E73', '#F0E442', '#0072B2', '#D55E00', '#CC79A7', '#999999'];
  const treatments = [...new Set(data.map(d => d.treatment))];

  for (const d of data) {
    const colorIdx = treatments.indexOf(d.treatment) % colors.length;
    ctx.fillStyle = colors[colorIdx];
    ctx.beginPath();
    ctx.arc(xScale(d.theoretical), yScale(d.sample), 5, 0, Math.PI * 2);
    ctx.fill();
  }

  // Axes labels
  ctx.fillStyle = '#fff';
  ctx.font = '12px system-ui';
  ctx.textAlign = 'center';
  ctx.fillText('Theoretical Quantiles', margin.left + plotW / 2, height - 10);

  ctx.save();
  ctx.translate(15, margin.top + plotH / 2);
  ctx.rotate(-Math.PI / 2);
  ctx.fillText('Sample Quantiles', 0, 0);
  ctx.restore();

  // Title
  ctx.font = 'bold 14px system-ui';
  ctx.fillText('Normal Q-Q Plot', width / 2, 20);
}
