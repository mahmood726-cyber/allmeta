// ============================================================================
// EXPORT UTILITIES - DOCX and LaTeX
// NMA Dose-Response Studio
// ============================================================================

/**
 * Export summary statistics as LaTeX table code
 * @param {Array} stats - Summary statistics from state.lastStats
 * @returns {string} LaTeX code
 */
function exportLatexTables(stats) {
  if (!stats || !stats.length) return '% No data available\\n';

  let latex = '\\begin{table}[htbp]\\n\\centering\\n';
  latex += '\\caption{Model Summary}\\n\\label{tab:model-summary}\\n';
  latex += '\\begin{tabular}{lcccccc}\\n\\hline\\n';
  latex += 'Treatment & Model & Emax & ED50 & AICc & SUCRA & P(best) \\\\\\n\\hline\\n';

  stats.forEach(item => {
    const t = escapeLatex(item.treatment || '');
    const m = escapeLatex(item.modelDetail || 'N/A');
    const emax = formatLatexNumber(item.emax);
    const ed50 = formatLatexNumber(item.ed50);
    const aicc = formatLatexNumber(item.aicc);
    const sucra = formatLatexNumber(item.sucra);
    const pbest = formatLatexNumber(item.pbest);

    latex += `${t} & ${m} & ${emax} & ${ed50} & ${aicc} & ${sucra} & ${pbest} \\\\\\n`;
  });

  latex += '\\hline\\n\\end{tabular}\\n\\end{table}\\n\\n';
  return latex;
}

/**
 * Export full analysis as LaTeX document
 * @param {Object} data - Complete analysis data
 * @returns {string} Complete LaTeX document
 */
function exportLatexDocument(data) {
  const { stats, curves, globalMetrics } = data;

  let latex = '\\documentclass{article}\\n\\usepackage{booktabs}\\n\\usepackage{longtable}\\n\\usepackage{graphicx}\\n\n';
  latex += '\\title{Network Meta-Analysis Dose-Response Results}\\n';
  latex += '\\author{NMA Dose-Response Studio}\\n\\date{\\today}\\n\\begin{document}\\n\\maketitle\\n\n';

  // Summary statistics section
  latex += '\\section{Model Summary}\\n';
  latex += exportLatexTables(stats);

  // Heterogeneity statistics
  if (globalMetrics) {
    latex += '\\section{Heterogeneity}\\n\\begin{itemize}\\n';
    latex += `\\item Q-statistic: ${formatLatexNumber(globalMetrics.Q)}\\n`;
    latex += `\\item I\\textsuperscript{2}: ${formatLatexNumber(globalMetrics.I2)}\\%\\n`;
    latex += `\\item \\texttau\\textsuperscript{2}: ${formatLatexNumber(globalMetrics.tau2)}\\n`;
    latex += '\\end{itemize}\\n\\n';
  }

  latex += '\\end{document}';
  return latex;
}

/**
 * Export as DOCX using docx.js library
 * @param {Object} data - Analysis data
 * @returns {Promise<Blob>} DOCX file blob
 */
async function exportDocx(data) {
  // Requires docx.js library
  // Load from: https://cdn.jsdelivr.net/npm/docx@7.1.0/build/index.js

  const { Document, Packer, Paragraph, Table, TableRow, TableCell, WidthType } = docx;
  const { stats } = data;

  if (!stats || stats.length === 0) {
    throw new Error('No statistics data available for export');
  }

  const tableRows = [
    new TableRow({
      children: [
        new TableCell({ children: [new Paragraph('Treatment')] }),
        new TableCell({ children: [new Paragraph('Model')] }),
        new TableCell({ children: [new Paragraph('Emax')] }),
        new TableCell({ children: [new Paragraph('ED50')] }),
        new TableCell({ children: [new Paragraph('AICc')] }),
        new TableCell({ children: [new Paragraph('SUCRA')] }),
        new TableCell({ children: [new Paragraph('P(best)')] }),
      ],
    }),
  ];

  stats.forEach(item => {
    tableRows.push(
      new TableRow({
        children: [
          new TableCell({ children: [new Paragraph(item.treatment || '')] }),
          new TableCell({ children: [new Paragraph(item.modelDetail || 'N/A')] }),
          new TableCell({ children: [new Paragraph(formatNumber(item.emax))] }),
          new TableCell({ children: [new Paragraph(formatNumber(item.ed50))] }),
          new TableCell({ children: [new Paragraph(formatNumber(item.aicc))] }),
          new TableCell({ children: [new Paragraph(formatNumber(item.sucra))] }),
          new TableCell({ children: [new Paragraph(formatNumber(item.pbest))] }),
        ],
      })
    );
  });

  const doc = new Document({
    sections: [{
      properties: {},
      children: [
        new Paragraph({
          text: 'NMA Dose-Response Analysis Results',
          heading: 'Heading1',
        }),
        new Paragraph({
          text: `Generated: ${new Date().toLocaleDateString()}`,
        }),
        new Table({
          rows: tableRows,
          width: {
            size: 100,
            type: WidthType.PERCENTAGE,
          },
        }),
      ],
    }],
  });

  return await Packer.toBlob(doc);
}

/**
 * Escape special LaTeX characters
 * @param {string} text - Text to escape
 * @returns {string} Escaped text
 */
function escapeLatex(text) {
  if (!text) return '';
  return String(text)
    .replace(/\\/g, '\\textbackslash{}')
    .replace(/&/g, '\\&')
    .replace(/%/g, '\\%')
    .replace(/\$/g, '\\$')
    .replace(/#/g, '\\#')
    .replace(/_/g, '\\_')
    .replace(/\{/g, '\\{')
    .replace(/\}/g, '\\}')
    .replace(/~/g, '\\textasciitilde{}')
    .replace(/\^/g, '\\textasciicircum{}');
}

/**
 * Format number for LaTeX output
 * @param {number} num - Number to format
 * @returns {string} Formatted number
 */
function formatLatexNumber(num) {
  if (num === null || num === undefined || isNaN(num)) return 'N/A';
  return Number(num).toFixed(3);
}

/**
 * Format number for display
 * @param {number} num - Number to format
 * @returns {string} Formatted number
 */
function formatNumber(num) {
  if (num === null || num === undefined || isNaN(num)) return 'N/A';
  return Number(num).toFixed(3);
}
