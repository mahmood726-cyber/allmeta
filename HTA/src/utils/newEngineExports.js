/**
 * HTA Artifact Standard - New Engine Exports Module
 * Export results from 10 new v0.8 engines to R code, Python code, and Excel-ready CSV
 * @version 0.8.0
 */

'use strict';

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Escape a value for CSV output. Handles null, undefined, commas, quotes, newlines.
 */
function escapeCSV(value) {
    if (value === null || value === undefined) return '';
    const str = String(value);
    if (str.includes(',') || str.includes('"') || str.includes('\n')) {
        return '"' + str.replace(/"/g, '""') + '"';
    }
    return str;
}

/**
 * Generate a standard R header comment block
 */
function rHeader(engineName) {
    return `# HTA Artifact Standard - ${engineName} Export
# Generated: ${new Date().toISOString()}
# Engine: ${engineName}
# Version: 0.8.0
#
# This code was automatically generated. Please verify all parameters before use.

`;
}

/**
 * Generate a standard Python header comment block
 */
function pyHeader(engineName) {
    return `# HTA Artifact Standard - ${engineName} Export
# Generated: ${new Date().toISOString()}
# Engine: ${engineName}
# Version: 0.8.0
#
# This code was automatically generated. Please verify all parameters before use.

`;
}

/**
 * Format a numeric value safely (avoids 'undefined' in output)
 */
function safeNum(v, fallback) {
    if (fallback === undefined) fallback = 0;
    if (v === null || v === undefined || (typeof v === 'number' && isNaN(v))) return fallback;
    return v;
}

/**
 * Format an array for R: c(1, 2, 3)
 */
function rVec(arr) {
    if (!arr || arr.length === 0) return 'c()';
    return 'c(' + arr.map(v => safeNum(v)).join(', ') + ')';
}

/**
 * Format a string array for R: c("a", "b")
 */
function rStrVec(arr) {
    if (!arr || arr.length === 0) return 'c()';
    return 'c(' + arr.map(v => `"${String(v ?? '')}"`).join(', ') + ')';
}

/**
 * Format an array for Python: [1, 2, 3]
 */
function pyVec(arr) {
    if (!arr || arr.length === 0) return '[]';
    return '[' + arr.map(v => safeNum(v)).join(', ') + ']';
}

/**
 * Format a string array for Python: ["a", "b"]
 */
function pyStrVec(arr) {
    if (!arr || arr.length === 0) return '[]';
    return '[' + arr.map(v => `"${String(v ?? '')}"`).join(', ') + ']';
}

/**
 * Build CSV string from headers array and rows (array of arrays)
 */
function buildCSV(headers, rows) {
    let csv = headers.map(h => escapeCSV(h)).join(',') + '\n';
    for (const row of rows) {
        csv += row.map(v => escapeCSV(safeNum(v, v))).join(',') + '\n';
    }
    return csv;
}

// ============================================================================
// CLASS: NewEngineExporter
// ============================================================================

class NewEngineExporter {
    constructor() {
        this.supportedFormats = ['r', 'csv', 'python'];
    }

    // ========================================================================
    // 1. Budget Impact Analysis (BIA)
    // ========================================================================

    /**
     * Export BIA results
     * @param {Object} biaResult - { years: [1,2,...], budget: [100,200,...], strategyName, ... }
     * @param {'r'|'csv'|'python'} format
     * @returns {string}
     */
    exportBIA(biaResult, format) {
        this._validateFormat(format);
        const r = biaResult || {};
        const years = r.years || [];
        const budget = r.budget || [];
        const strategyName = r.strategyName || 'Intervention';

        switch (format) {
            case 'r':
                return this._biaR(years, budget, strategyName);
            case 'csv':
                return this._biaCSV(years, budget, strategyName);
            case 'python':
                return this._biaPython(years, budget, strategyName);
        }
    }

    _biaR(years, budget, strategyName) {
        let code = rHeader('Budget Impact Analysis');
        code += `# Load required packages\n`;
        code += `library(ggplot2)\n`;
        code += `library(BCEA)\n\n`;
        code += `# Budget impact data\n`;
        code += `bia_data <- data.frame(\n`;
        code += `  year = ${rVec(years)},\n`;
        code += `  budget = ${rVec(budget)},\n`;
        code += `  strategy = rep("${strategyName}", ${years.length})\n`;
        code += `)\n\n`;
        code += `# Budget impact bar chart\n`;
        code += `ggplot(bia_data, aes(x = year, y = budget, fill = strategy)) +\n`;
        code += `  geom_bar(stat = "identity") +\n`;
        code += `  labs(title = "Budget Impact Analysis",\n`;
        code += `       x = "Year", y = "Budget Impact ($)") +\n`;
        code += `  theme_minimal()\n`;
        return code;
    }

    _biaCSV(years, budget, strategyName) {
        const headers = ['Year', 'Budget', 'Strategy'];
        const rows = years.map((y, i) => [safeNum(y), safeNum(budget[i]), strategyName]);
        return buildCSV(headers, rows);
    }

    _biaPython(years, budget, strategyName) {
        let code = pyHeader('Budget Impact Analysis');
        code += `import pandas as pd\n`;
        code += `import numpy as np\n`;
        code += `import matplotlib.pyplot as plt\n\n`;
        code += `# Budget impact data\n`;
        code += `bia_data = pd.DataFrame({\n`;
        code += `    "Year": ${pyVec(years)},\n`;
        code += `    "Budget": ${pyVec(budget)},\n`;
        code += `    "Strategy": ${pyStrVec(years.map(() => strategyName))}\n`;
        code += `})\n\n`;
        code += `# Bar chart\n`;
        code += `plt.figure(figsize=(10, 6))\n`;
        code += `plt.bar(bia_data["Year"], bia_data["Budget"])\n`;
        code += `plt.xlabel("Year")\n`;
        code += `plt.ylabel("Budget Impact ($)")\n`;
        code += `plt.title("Budget Impact Analysis")\n`;
        code += `plt.tight_layout()\n`;
        code += `plt.show()\n`;
        return code;
    }

    // ========================================================================
    // 2. Multi-Criteria Decision Analysis (MCDA)
    // ========================================================================

    /**
     * Export MCDA results
     * @param {Object} mcdaResult - { alternatives: [...], criteria: [...], scores: [[...]], weights: [...] }
     * @param {'r'|'csv'|'python'} format
     * @returns {string}
     */
    exportMCDA(mcdaResult, format) {
        this._validateFormat(format);
        const r = mcdaResult || {};
        const alternatives = r.alternatives || [];
        const criteria = r.criteria || [];
        const scores = r.scores || [];
        const weights = r.weights || [];

        switch (format) {
            case 'r':
                return this._mcdaR(alternatives, criteria, scores, weights);
            case 'csv':
                return this._mcdaCSV(alternatives, criteria, scores, weights);
            case 'python':
                return this._mcdaPython(alternatives, criteria, scores, weights);
        }
    }

    _mcdaR(alternatives, criteria, scores, weights) {
        let code = rHeader('Multi-Criteria Decision Analysis');
        code += `# Load required packages\n`;
        code += `library(MCDA)\n`;
        code += `library(ggplot2)\n\n`;
        code += `# Alternatives and criteria\n`;
        code += `alternatives <- ${rStrVec(alternatives)}\n`;
        code += `criteria <- ${rStrVec(criteria)}\n\n`;
        code += `# Score matrix (alternatives x criteria)\n`;
        code += `score_matrix <- matrix(\n`;
        code += `  c(${scores.flat().map(v => safeNum(v)).join(', ')}),\n`;
        code += `  nrow = ${alternatives.length},\n`;
        code += `  ncol = ${criteria.length},\n`;
        code += `  byrow = TRUE,\n`;
        code += `  dimnames = list(alternatives, criteria)\n`;
        code += `)\n\n`;
        code += `# Criteria weights\n`;
        code += `weights <- ${rVec(weights)}\n`;
        code += `names(weights) <- criteria\n\n`;
        code += `# Weighted sum model\n`;
        code += `weighted_scores <- score_matrix %*% diag(weights)\n`;
        code += `total_scores <- rowSums(weighted_scores)\n`;
        code += `ranking <- data.frame(Alternative = alternatives, Score = total_scores)\n`;
        code += `ranking <- ranking[order(-ranking$Score), ]\n`;
        code += `print(ranking)\n`;
        return code;
    }

    _mcdaCSV(alternatives, criteria, scores, weights) {
        const headers = ['Alternative', ...criteria, 'Weight'];
        const rows = alternatives.map((alt, i) => {
            const row = [alt, ...(scores[i] || []).map(v => safeNum(v))];
            return row;
        });
        // Add weights row
        const weightRow = ['Weights', ...weights.map(v => safeNum(v))];
        return buildCSV(headers, [...rows, weightRow]);
    }

    _mcdaPython(alternatives, criteria, scores, weights) {
        let code = pyHeader('Multi-Criteria Decision Analysis');
        code += `import pandas as pd\n`;
        code += `import numpy as np\n`;
        code += `import matplotlib.pyplot as plt\n\n`;
        code += `# Score matrix\n`;
        code += `alternatives = ${pyStrVec(alternatives)}\n`;
        code += `criteria = ${pyStrVec(criteria)}\n`;
        code += `scores = np.array([\n`;
        for (const row of scores) {
            code += `    ${pyVec(row)},\n`;
        }
        code += `])\n`;
        code += `weights = np.array(${pyVec(weights)})\n\n`;
        code += `# Create DataFrame\n`;
        code += `df = pd.DataFrame(scores, index=alternatives, columns=criteria)\n`;
        code += `print(df)\n\n`;
        code += `# Radar chart\n`;
        code += `angles = np.linspace(0, 2 * np.pi, len(criteria), endpoint=False).tolist()\n`;
        code += `angles += angles[:1]\n`;
        code += `fig, ax = plt.subplots(figsize=(8, 8), subplot_kw=dict(polar=True))\n`;
        code += `for i, alt in enumerate(alternatives):\n`;
        code += `    values = scores[i].tolist() + [scores[i][0]]\n`;
        code += `    ax.plot(angles, values, label=alt)\n`;
        code += `    ax.fill(angles, values, alpha=0.1)\n`;
        code += `ax.set_xticks(angles[:-1])\n`;
        code += `ax.set_xticklabels(criteria)\n`;
        code += `ax.legend(loc="upper right")\n`;
        code += `plt.title("MCDA Radar Chart")\n`;
        code += `plt.tight_layout()\n`;
        code += `plt.show()\n`;
        return code;
    }

    // ========================================================================
    // 3. Competing Risks
    // ========================================================================

    /**
     * Export Competing Risks results
     * @param {Object} crResult - { times: [...], cif: { cause1: [...], cause2: [...] }, se: { cause1: [...], cause2: [...] }, causes: [...] }
     * @param {'r'|'csv'|'python'} format
     * @returns {string}
     */
    exportCompetingRisks(crResult, format) {
        this._validateFormat(format);
        const r = crResult || {};
        const times = r.times || [];
        const causes = r.causes || Object.keys(r.cif || {});
        const cif = r.cif || {};
        const se = r.se || {};

        switch (format) {
            case 'r':
                return this._crR(times, causes, cif, se);
            case 'csv':
                return this._crCSV(times, causes, cif, se);
            case 'python':
                return this._crPython(times, causes, cif, se);
        }
    }

    _crR(times, causes, cif, se) {
        let code = rHeader('Competing Risks Analysis');
        code += `# Load required packages\n`;
        code += `library(cmprsk)\n`;
        code += `library(ggplot2)\n\n`;
        code += `# CIF data\n`;
        code += `times <- ${rVec(times)}\n`;
        for (const cause of causes) {
            code += `cif_${this._sanitizeVarName(cause)} <- ${rVec(cif[cause] || [])}\n`;
            if (se[cause]) {
                code += `se_${this._sanitizeVarName(cause)} <- ${rVec(se[cause])}\n`;
            }
        }
        code += `\n`;
        code += `# CIF data frame\n`;
        code += `cif_data <- data.frame(\n`;
        code += `  time = times`;
        for (const cause of causes) {
            code += `,\n  CIF_${this._sanitizeVarName(cause)} = cif_${this._sanitizeVarName(cause)}`;
            if (se[cause]) {
                code += `,\n  SE_${this._sanitizeVarName(cause)} = se_${this._sanitizeVarName(cause)}`;
            }
        }
        code += `\n)\n\n`;
        code += `# Gray's test (if raw data available)\n`;
        code += `# gray_test <- cuminc(ftime, fstatus, group)\n`;
        code += `# print(gray_test$Tests)\n\n`;
        code += `# Plot CIF curves\n`;
        code += `print(cif_data)\n`;
        return code;
    }

    _crCSV(times, causes, cif, se) {
        const headers = ['Time'];
        for (const cause of causes) {
            headers.push(`CIF_${cause}`);
            if (se[cause]) {
                headers.push(`SE_${cause}`);
            }
        }
        const rows = times.map((t, i) => {
            const row = [safeNum(t)];
            for (const cause of causes) {
                row.push(safeNum((cif[cause] || [])[i]));
                if (se[cause]) {
                    row.push(safeNum((se[cause])[i]));
                }
            }
            return row;
        });
        return buildCSV(headers, rows);
    }

    _crPython(times, causes, cif, se) {
        let code = pyHeader('Competing Risks Analysis');
        code += `import pandas as pd\n`;
        code += `import numpy as np\n`;
        code += `import matplotlib.pyplot as plt\n\n`;
        code += `# CIF data\n`;
        code += `data = {\n`;
        code += `    "Time": ${pyVec(times)},\n`;
        for (const cause of causes) {
            code += `    "CIF_${cause}": ${pyVec(cif[cause] || [])},\n`;
            if (se[cause]) {
                code += `    "SE_${cause}": ${pyVec(se[cause])},\n`;
            }
        }
        code += `}\n`;
        code += `df = pd.DataFrame(data)\n`;
        code += `print(df)\n\n`;
        code += `# Plot CIF curves\n`;
        code += `plt.figure(figsize=(10, 6))\n`;
        for (const cause of causes) {
            code += `plt.step(df["Time"], df["CIF_${cause}"], where="post", label="${cause}")\n`;
        }
        code += `plt.xlabel("Time")\n`;
        code += `plt.ylabel("Cumulative Incidence")\n`;
        code += `plt.title("Competing Risks - CIF")\n`;
        code += `plt.legend()\n`;
        code += `plt.tight_layout()\n`;
        code += `plt.show()\n`;
        return code;
    }

    // ========================================================================
    // 4. Cure Model
    // ========================================================================

    /**
     * Export Cure Model results
     * @param {Object} cureResult - { times: [...], survival: [...], hazard: [...], curedProb: number, distribution: string }
     * @param {'r'|'csv'|'python'} format
     * @returns {string}
     */
    exportCureModel(cureResult, format) {
        this._validateFormat(format);
        const r = cureResult || {};
        const times = r.times || [];
        const survival = r.survival || [];
        const hazard = r.hazard || [];
        const curedProb = safeNum(r.curedProb, 0);
        const distribution = r.distribution || 'weibull';

        switch (format) {
            case 'r':
                return this._cureR(times, survival, hazard, curedProb, distribution);
            case 'csv':
                return this._cureCSV(times, survival, hazard, curedProb);
            case 'python':
                return this._curePython(times, survival, hazard, curedProb, distribution);
        }
    }

    _cureR(times, survival, hazard, curedProb, distribution) {
        let code = rHeader('Cure Model');
        code += `# Load required packages\n`;
        code += `library(flexsurvcure)\n`;
        code += `library(ggplot2)\n\n`;
        code += `# Cure model results\n`;
        code += `cure_data <- data.frame(\n`;
        code += `  time = ${rVec(times)},\n`;
        code += `  survival = ${rVec(survival)},\n`;
        code += `  hazard = ${rVec(hazard)}\n`;
        code += `)\n\n`;
        code += `# Cured fraction\n`;
        code += `cured_prob <- ${curedProb}\n`;
        code += `cat("Estimated cured fraction:", cured_prob, "\\n")\n\n`;
        code += `# Distribution: ${distribution}\n`;
        code += `# To fit from raw data:\n`;
        code += `# fit <- flexsurvcure(Surv(time, status) ~ 1, data = raw_data,\n`;
        code += `#                      dist = "${distribution}", mixture = TRUE)\n`;
        code += `# summary(fit)\n\n`;
        code += `# Plot survival curve\n`;
        code += `ggplot(cure_data, aes(x = time, y = survival)) +\n`;
        code += `  geom_line() +\n`;
        code += `  geom_hline(yintercept = cured_prob, linetype = "dashed", color = "red") +\n`;
        code += `  labs(title = "Cure Model Survival Curve",\n`;
        code += `       x = "Time", y = "Survival Probability") +\n`;
        code += `  annotate("text", x = max(cure_data$time) * 0.8, y = cured_prob + 0.03,\n`;
        code += `           label = paste0("Cured: ", round(cured_prob * 100, 1), "%")) +\n`;
        code += `  theme_minimal()\n`;
        return code;
    }

    _cureCSV(times, survival, hazard, curedProb) {
        const headers = ['Time', 'Survival', 'Hazard', 'Cured_Prob'];
        const rows = times.map((t, i) => [
            safeNum(t), safeNum(survival[i]), safeNum(hazard[i]), curedProb
        ]);
        return buildCSV(headers, rows);
    }

    _curePython(times, survival, hazard, curedProb, distribution) {
        let code = pyHeader('Cure Model');
        code += `import pandas as pd\n`;
        code += `import numpy as np\n`;
        code += `import matplotlib.pyplot as plt\n\n`;
        code += `# Cure model results\n`;
        code += `cure_data = pd.DataFrame({\n`;
        code += `    "Time": ${pyVec(times)},\n`;
        code += `    "Survival": ${pyVec(survival)},\n`;
        code += `    "Hazard": ${pyVec(hazard)}\n`;
        code += `})\n\n`;
        code += `cured_prob = ${curedProb}\n`;
        code += `distribution = "${distribution}"\n`;
        code += `print(f"Cured fraction: {cured_prob:.3f}")\n`;
        code += `print(f"Distribution: {distribution}")\n\n`;
        code += `# Plot survival curve\n`;
        code += `plt.figure(figsize=(10, 6))\n`;
        code += `plt.plot(cure_data["Time"], cure_data["Survival"], label="Survival")\n`;
        code += `plt.axhline(y=cured_prob, color="r", linestyle="--", label=f"Cured: {cured_prob:.1%}")\n`;
        code += `plt.xlabel("Time")\n`;
        code += `plt.ylabel("Survival Probability")\n`;
        code += `plt.title("Cure Model Survival Curve")\n`;
        code += `plt.legend()\n`;
        code += `plt.tight_layout()\n`;
        code += `plt.show()\n`;
        return code;
    }

    // ========================================================================
    // 5. Semi-Markov Model
    // ========================================================================

    /**
     * Export Semi-Markov results
     * @param {Object} smResult - { states: [...], cycles: number, trace: { state1: [...], ... }, transitionMatrix: [[...]] }
     * @param {'r'|'csv'|'python'} format
     * @returns {string}
     */
    exportSemiMarkov(smResult, format) {
        this._validateFormat(format);
        const r = smResult || {};
        const states = r.states || [];
        const cycles = r.cycles || 0;
        const trace = r.trace || {};

        switch (format) {
            case 'r':
                return this._smR(states, cycles, trace, r.transitionMatrix);
            case 'csv':
                return this._smCSV(states, cycles, trace);
            case 'python':
                return this._smPython(states, cycles, trace);
        }
    }

    _smR(states, cycles, trace, transitionMatrix) {
        let code = rHeader('Semi-Markov Model');
        code += `# Load required packages\n`;
        code += `library(heemod)\n`;
        code += `library(msm)\n`;
        code += `library(ggplot2)\n\n`;
        code += `# State names\n`;
        code += `states <- ${rStrVec(states)}\n\n`;
        code += `# State trace data\n`;
        code += `trace_data <- data.frame(\n`;
        code += `  cycle = 0:${Math.max(0, cycles - 1)}`;
        for (const state of states) {
            const vals = trace[state] || [];
            code += `,\n  ${this._sanitizeVarName(state)} = ${rVec(vals)}`;
        }
        code += `\n)\n\n`;
        if (transitionMatrix) {
            code += `# Transition matrix\n`;
            code += `trans_mat <- matrix(\n`;
            code += `  c(${transitionMatrix.flat().map(v => safeNum(v)).join(', ')}),\n`;
            code += `  nrow = ${states.length}, ncol = ${states.length}, byrow = TRUE,\n`;
            code += `  dimnames = list(states, states)\n`;
            code += `)\n`;
            code += `print(trans_mat)\n\n`;
        }
        code += `# Plot state trace\n`;
        code += `matplot(trace_data$cycle, trace_data[, -1], type = "l", lty = 1,\n`;
        code += `        xlab = "Cycle", ylab = "Proportion",\n`;
        code += `        main = "Semi-Markov State Trace")\n`;
        code += `legend("topright", legend = states, col = 1:${states.length}, lty = 1)\n`;
        return code;
    }

    _smCSV(states, cycles, trace) {
        const headers = ['Cycle', ...states];
        const nCycles = cycles || (states.length > 0 ? (trace[states[0]] || []).length : 0);
        const rows = [];
        for (let c = 0; c < nCycles; c++) {
            const row = [c];
            for (const state of states) {
                row.push(safeNum((trace[state] || [])[c]));
            }
            rows.push(row);
        }
        return buildCSV(headers, rows);
    }

    _smPython(states, cycles, trace) {
        let code = pyHeader('Semi-Markov Model');
        code += `import pandas as pd\n`;
        code += `import numpy as np\n`;
        code += `import matplotlib.pyplot as plt\n\n`;
        code += `# State trace data\n`;
        code += `states = ${pyStrVec(states)}\n`;
        code += `trace_data = {\n`;
        code += `    "Cycle": list(range(${cycles})),\n`;
        for (const state of states) {
            code += `    "${state}": ${pyVec(trace[state] || [])},\n`;
        }
        code += `}\n`;
        code += `df = pd.DataFrame(trace_data)\n`;
        code += `print(df)\n\n`;
        code += `# Plot state trace\n`;
        code += `plt.figure(figsize=(10, 6))\n`;
        code += `for state in states:\n`;
        code += `    plt.plot(df["Cycle"], df[state], label=state)\n`;
        code += `plt.xlabel("Cycle")\n`;
        code += `plt.ylabel("Proportion")\n`;
        code += `plt.title("Semi-Markov State Trace")\n`;
        code += `plt.legend()\n`;
        code += `plt.tight_layout()\n`;
        code += `plt.show()\n`;
        return code;
    }

    // ========================================================================
    // 6. Correlated PSA
    // ========================================================================

    /**
     * Export Correlated PSA results
     * @param {Object} psaResult - { iterations: [{ params: {...}, cost: n, qaly: n }, ...], paramNames: [...] }
     * @param {'r'|'csv'|'python'} format
     * @returns {string}
     */
    exportCorrelatedPSA(psaResult, format) {
        this._validateFormat(format);
        const r = psaResult || {};
        const iterations = r.iterations || [];
        const paramNames = r.paramNames || (iterations.length > 0 ? Object.keys(iterations[0].params || {}) : []);

        switch (format) {
            case 'r':
                return this._psaR(iterations, paramNames);
            case 'csv':
                return this._psaCSV(iterations, paramNames);
            case 'python':
                return this._psaPython(iterations, paramNames);
        }
    }

    _psaR(iterations, paramNames) {
        let code = rHeader('Correlated PSA');
        code += `# Load required packages\n`;
        code += `library(BCEA)\n`;
        code += `library(ggplot2)\n\n`;
        code += `# PSA iterations\n`;
        code += `n_iter <- ${iterations.length}\n\n`;
        // Parameter columns
        for (const pName of paramNames) {
            const vals = iterations.map(it => safeNum((it.params || {})[pName]));
            code += `${this._sanitizeVarName(pName)} <- ${rVec(vals)}\n`;
        }
        code += `\n`;
        code += `# Costs and QALYs\n`;
        code += `costs <- ${rVec(iterations.map(it => safeNum(it.cost)))}\n`;
        code += `qalys <- ${rVec(iterations.map(it => safeNum(it.qaly)))}\n\n`;
        code += `# PSA data frame\n`;
        code += `psa_data <- data.frame(\n`;
        code += `  iteration = 1:n_iter,\n`;
        for (const pName of paramNames) {
            code += `  ${this._sanitizeVarName(pName)} = ${this._sanitizeVarName(pName)},\n`;
        }
        code += `  cost = costs,\n`;
        code += `  qaly = qalys\n`;
        code += `)\n\n`;
        code += `# BCEA analysis\n`;
        code += `# bcea_result <- bcea(e = matrix(qalys, ncol = 1),\n`;
        code += `#                      c = matrix(costs, ncol = 1))\n`;
        code += `# summary(bcea_result)\n\n`;
        code += `# CE scatter plot\n`;
        code += `ggplot(psa_data, aes(x = qaly, y = cost)) +\n`;
        code += `  geom_point(alpha = 0.3) +\n`;
        code += `  labs(title = "Correlated PSA - CE Plane",\n`;
        code += `       x = "QALYs", y = "Cost ($)") +\n`;
        code += `  theme_minimal()\n`;
        return code;
    }

    _psaCSV(iterations, paramNames) {
        const headers = ['Iteration', ...paramNames, 'Cost', 'QALY'];
        const rows = iterations.map((it, i) => {
            const row = [i + 1];
            for (const pName of paramNames) {
                row.push(safeNum((it.params || {})[pName]));
            }
            row.push(safeNum(it.cost));
            row.push(safeNum(it.qaly));
            return row;
        });
        return buildCSV(headers, rows);
    }

    _psaPython(iterations, paramNames) {
        let code = pyHeader('Correlated PSA');
        code += `import pandas as pd\n`;
        code += `import numpy as np\n`;
        code += `import matplotlib.pyplot as plt\n`;
        code += `import seaborn as sns\n\n`;
        code += `# PSA data\n`;
        code += `data = {\n`;
        code += `    "Iteration": list(range(1, ${iterations.length + 1})),\n`;
        for (const pName of paramNames) {
            code += `    "${pName}": ${pyVec(iterations.map(it => safeNum((it.params || {})[pName])))},\n`;
        }
        code += `    "Cost": ${pyVec(iterations.map(it => safeNum(it.cost)))},\n`;
        code += `    "QALY": ${pyVec(iterations.map(it => safeNum(it.qaly)))}\n`;
        code += `}\n`;
        code += `df = pd.DataFrame(data)\n`;
        code += `print(df.describe())\n\n`;
        code += `# CE scatter plot\n`;
        code += `plt.figure(figsize=(10, 8))\n`;
        code += `sns.scatterplot(data=df, x="QALY", y="Cost", alpha=0.3)\n`;
        code += `plt.title("Correlated PSA - CE Plane")\n`;
        code += `plt.xlabel("QALYs")\n`;
        code += `plt.ylabel("Cost ($)")\n`;
        code += `plt.tight_layout()\n`;
        code += `plt.show()\n`;
        return code;
    }

    // ========================================================================
    // 7. Threshold Analysis
    // ========================================================================

    /**
     * Export Threshold Analysis results
     * @param {Object} threshResult - { parameters: [{ name, low, high, swing, baseValue }, ...], icer: number }
     * @param {'r'|'csv'|'python'} format
     * @returns {string}
     */
    exportThreshold(threshResult, format) {
        this._validateFormat(format);
        const r = threshResult || {};
        const parameters = r.parameters || [];
        const icer = safeNum(r.icer, 0);

        switch (format) {
            case 'r':
                return this._threshR(parameters, icer);
            case 'csv':
                return this._threshCSV(parameters, icer);
            case 'python':
                return this._threshPython(parameters, icer);
        }
    }

    _threshR(parameters, icer) {
        let code = rHeader('Threshold Analysis');
        code += `# Load required packages\n`;
        code += `library(ggplot2)\n\n`;
        code += `# Threshold analysis data\n`;
        code += `thresh_data <- data.frame(\n`;
        code += `  parameter = ${rStrVec(parameters.map(p => p.name || ''))},\n`;
        code += `  low = ${rVec(parameters.map(p => safeNum(p.low)))},\n`;
        code += `  high = ${rVec(parameters.map(p => safeNum(p.high)))},\n`;
        code += `  swing = ${rVec(parameters.map(p => safeNum(p.swing)))},\n`;
        code += `  base_value = ${rVec(parameters.map(p => safeNum(p.baseValue)))}\n`;
        code += `)\n\n`;
        code += `# Base ICER\n`;
        code += `base_icer <- ${icer}\n\n`;
        code += `# Sort by swing (largest first for tornado)\n`;
        code += `thresh_data <- thresh_data[order(thresh_data$swing, decreasing = TRUE), ]\n`;
        code += `thresh_data$parameter <- factor(thresh_data$parameter,\n`;
        code += `                                 levels = rev(thresh_data$parameter))\n\n`;
        code += `# Tornado diagram\n`;
        code += `ggplot(thresh_data) +\n`;
        code += `  geom_segment(aes(x = low, xend = high, y = parameter, yend = parameter),\n`;
        code += `               linewidth = 6, color = "steelblue") +\n`;
        code += `  geom_vline(xintercept = base_icer, linetype = "dashed") +\n`;
        code += `  labs(title = "Tornado Diagram - Threshold Analysis",\n`;
        code += `       x = "ICER ($/QALY)", y = "Parameter") +\n`;
        code += `  theme_minimal()\n`;
        return code;
    }

    _threshCSV(parameters, icer) {
        const headers = ['Parameter', 'Low', 'High', 'Swing', 'Base_Value', 'Base_ICER'];
        const rows = parameters.map(p => [
            p.name || '', safeNum(p.low), safeNum(p.high), safeNum(p.swing), safeNum(p.baseValue), icer
        ]);
        return buildCSV(headers, rows);
    }

    _threshPython(parameters, icer) {
        let code = pyHeader('Threshold Analysis');
        code += `import pandas as pd\n`;
        code += `import numpy as np\n`;
        code += `import matplotlib.pyplot as plt\n\n`;
        code += `# Threshold analysis data\n`;
        code += `thresh_data = pd.DataFrame({\n`;
        code += `    "Parameter": ${pyStrVec(parameters.map(p => p.name || ''))},\n`;
        code += `    "Low": ${pyVec(parameters.map(p => safeNum(p.low)))},\n`;
        code += `    "High": ${pyVec(parameters.map(p => safeNum(p.high)))},\n`;
        code += `    "Swing": ${pyVec(parameters.map(p => safeNum(p.swing)))},\n`;
        code += `    "Base_Value": ${pyVec(parameters.map(p => safeNum(p.baseValue)))}\n`;
        code += `})\n`;
        code += `base_icer = ${icer}\n\n`;
        code += `# Sort by swing\n`;
        code += `thresh_data = thresh_data.sort_values("Swing", ascending=True)\n\n`;
        code += `# Tornado diagram\n`;
        code += `fig, ax = plt.subplots(figsize=(10, 6))\n`;
        code += `ax.barh(thresh_data["Parameter"],\n`;
        code += `        thresh_data["High"] - thresh_data["Low"],\n`;
        code += `        left=thresh_data["Low"], color="steelblue")\n`;
        code += `ax.axvline(x=base_icer, color="black", linestyle="--", label="Base ICER")\n`;
        code += `ax.set_xlabel("ICER ($/QALY)")\n`;
        code += `ax.set_title("Tornado Diagram - Threshold Analysis")\n`;
        code += `ax.legend()\n`;
        code += `plt.tight_layout()\n`;
        code += `plt.show()\n`;
        return code;
    }

    // ========================================================================
    // 8. Scenario Analysis
    // ========================================================================

    /**
     * Export Scenario Analysis results
     * @param {Object} scenResult - { scenarios: [{ name, cost, qaly, icer }, ...], baseScenario: string }
     * @param {'r'|'csv'|'python'} format
     * @returns {string}
     */
    exportScenario(scenResult, format) {
        this._validateFormat(format);
        const r = scenResult || {};
        const scenarios = r.scenarios || [];
        const baseScenario = r.baseScenario || '';

        switch (format) {
            case 'r':
                return this._scenR(scenarios, baseScenario);
            case 'csv':
                return this._scenCSV(scenarios, baseScenario);
            case 'python':
                return this._scenPython(scenarios, baseScenario);
        }
    }

    _scenR(scenarios, baseScenario) {
        let code = rHeader('Scenario Analysis');
        code += `# Load required packages\n`;
        code += `library(ggplot2)\n\n`;
        code += `# Scenario comparison\n`;
        code += `scenario_data <- data.frame(\n`;
        code += `  scenario = ${rStrVec(scenarios.map(s => s.name || ''))},\n`;
        code += `  cost = ${rVec(scenarios.map(s => safeNum(s.cost)))},\n`;
        code += `  qaly = ${rVec(scenarios.map(s => safeNum(s.qaly)))},\n`;
        code += `  icer = ${rVec(scenarios.map(s => safeNum(s.icer)))}\n`;
        code += `)\n\n`;
        code += `# Base scenario: ${baseScenario}\n`;
        code += `print(scenario_data)\n\n`;
        code += `# Comparison plot\n`;
        code += `ggplot(scenario_data, aes(x = qaly, y = cost, label = scenario)) +\n`;
        code += `  geom_point(size = 4) +\n`;
        code += `  geom_text(vjust = -1) +\n`;
        code += `  labs(title = "Scenario Analysis Comparison",\n`;
        code += `       x = "QALYs", y = "Cost ($)") +\n`;
        code += `  theme_minimal()\n`;
        return code;
    }

    _scenCSV(scenarios, baseScenario) {
        const headers = ['Scenario', 'Cost', 'QALY', 'ICER', 'Is_Base'];
        const rows = scenarios.map(s => [
            s.name || '', safeNum(s.cost), safeNum(s.qaly), safeNum(s.icer),
            (s.name === baseScenario) ? 'Yes' : 'No'
        ]);
        return buildCSV(headers, rows);
    }

    _scenPython(scenarios, baseScenario) {
        let code = pyHeader('Scenario Analysis');
        code += `import pandas as pd\n`;
        code += `import numpy as np\n`;
        code += `import matplotlib.pyplot as plt\n\n`;
        code += `# Scenario comparison\n`;
        code += `scenario_data = pd.DataFrame({\n`;
        code += `    "Scenario": ${pyStrVec(scenarios.map(s => s.name || ''))},\n`;
        code += `    "Cost": ${pyVec(scenarios.map(s => safeNum(s.cost)))},\n`;
        code += `    "QALY": ${pyVec(scenarios.map(s => safeNum(s.qaly)))},\n`;
        code += `    "ICER": ${pyVec(scenarios.map(s => safeNum(s.icer)))}\n`;
        code += `})\n`;
        code += `print(scenario_data)\n\n`;
        code += `# Comparison scatter\n`;
        code += `plt.figure(figsize=(10, 6))\n`;
        code += `plt.scatter(scenario_data["QALY"], scenario_data["Cost"], s=100)\n`;
        code += `for i, row in scenario_data.iterrows():\n`;
        code += `    plt.annotate(row["Scenario"], (row["QALY"], row["Cost"]),\n`;
        code += `                 textcoords="offset points", xytext=(5, 5))\n`;
        code += `plt.xlabel("QALYs")\n`;
        code += `plt.ylabel("Cost ($)")\n`;
        code += `plt.title("Scenario Analysis Comparison")\n`;
        code += `plt.tight_layout()\n`;
        code += `plt.show()\n`;
        return code;
    }

    // ========================================================================
    // 9. Model Averaging
    // ========================================================================

    /**
     * Export Model Averaging results
     * @param {Object} maResult - { distributions: [{ name, aic, bic, weight, params: {...} }], times: [...], survivalCurves: { dist1: [...], ... } }
     * @param {'r'|'csv'|'python'} format
     * @returns {string}
     */
    exportModelAveraging(maResult, format) {
        this._validateFormat(format);
        const r = maResult || {};
        const distributions = r.distributions || [];
        const times = r.times || [];
        const survivalCurves = r.survivalCurves || {};

        switch (format) {
            case 'r':
                return this._maR(distributions, times, survivalCurves);
            case 'csv':
                return this._maCSV(distributions);
            case 'python':
                return this._maPython(distributions, times, survivalCurves);
        }
    }

    _maR(distributions, times, survivalCurves) {
        let code = rHeader('Model Averaging');
        code += `# Load required packages\n`;
        code += `library(flexsurv)\n`;
        code += `library(ggplot2)\n\n`;
        code += `# Model comparison\n`;
        code += `model_table <- data.frame(\n`;
        code += `  distribution = ${rStrVec(distributions.map(d => d.name || ''))},\n`;
        code += `  AIC = ${rVec(distributions.map(d => safeNum(d.aic)))},\n`;
        code += `  BIC = ${rVec(distributions.map(d => safeNum(d.bic)))},\n`;
        code += `  weight = ${rVec(distributions.map(d => safeNum(d.weight)))}\n`;
        code += `)\n`;
        code += `print(model_table)\n\n`;
        if (times.length > 0) {
            code += `# Survival curves\n`;
            code += `times <- ${rVec(times)}\n`;
            code += `surv_data <- data.frame(time = times)\n`;
            for (const dist of distributions) {
                const name = dist.name || 'unknown';
                const vals = survivalCurves[name] || [];
                if (vals.length > 0) {
                    code += `surv_data$${this._sanitizeVarName(name)} <- ${rVec(vals)}\n`;
                }
            }
            code += `\n# Plot survival curves\n`;
            code += `# Use ggplot2 with gather/melt for overlaid curves\n`;
        }
        code += `\n# Model-averaged survival\n`;
        code += `# weighted_surv <- Reduce("+", Map("*", surv_curves, model_table$weight))\n`;
        return code;
    }

    _maCSV(distributions) {
        const headers = ['Distribution', 'AIC', 'BIC', 'Weight'];
        const rows = distributions.map(d => [
            d.name || '', safeNum(d.aic), safeNum(d.bic), safeNum(d.weight)
        ]);
        return buildCSV(headers, rows);
    }

    _maPython(distributions, times, survivalCurves) {
        let code = pyHeader('Model Averaging');
        code += `import pandas as pd\n`;
        code += `import numpy as np\n`;
        code += `import matplotlib.pyplot as plt\n`;
        code += `from scipy import stats\n\n`;
        code += `# Model comparison\n`;
        code += `model_data = pd.DataFrame({\n`;
        code += `    "Distribution": ${pyStrVec(distributions.map(d => d.name || ''))},\n`;
        code += `    "AIC": ${pyVec(distributions.map(d => safeNum(d.aic)))},\n`;
        code += `    "BIC": ${pyVec(distributions.map(d => safeNum(d.bic)))},\n`;
        code += `    "Weight": ${pyVec(distributions.map(d => safeNum(d.weight)))}\n`;
        code += `})\n`;
        code += `print(model_data)\n\n`;
        if (times.length > 0) {
            code += `# Survival curves\n`;
            code += `times = ${pyVec(times)}\n`;
            code += `plt.figure(figsize=(10, 6))\n`;
            for (const dist of distributions) {
                const name = dist.name || 'unknown';
                const vals = survivalCurves[name] || [];
                if (vals.length > 0) {
                    code += `plt.plot(times, ${pyVec(vals)}, label="${name}")\n`;
                }
            }
            code += `plt.xlabel("Time")\n`;
            code += `plt.ylabel("Survival Probability")\n`;
            code += `plt.title("Model Averaging - Survival Curves")\n`;
            code += `plt.legend()\n`;
            code += `plt.tight_layout()\n`;
            code += `plt.show()\n`;
        }
        return code;
    }

    // ========================================================================
    // 10. EVSI (Expected Value of Sample Information)
    // ========================================================================

    /**
     * Export EVSI results
     * @param {Object} evsiResult - { sampleSizes: [...], evsi: [...], cost: [...], netValue: [...], optimalN: number }
     * @param {'r'|'csv'|'python'} format
     * @returns {string}
     */
    exportEVSI(evsiResult, format) {
        this._validateFormat(format);
        const r = evsiResult || {};
        const sampleSizes = r.sampleSizes || [];
        const evsi = r.evsi || [];
        const cost = r.cost || [];
        const netValue = r.netValue || [];
        const optimalN = safeNum(r.optimalN, 0);

        switch (format) {
            case 'r':
                return this._evsiR(sampleSizes, evsi, cost, netValue, optimalN);
            case 'csv':
                return this._evsiCSV(sampleSizes, evsi, cost, netValue);
            case 'python':
                return this._evsiPython(sampleSizes, evsi, cost, netValue, optimalN);
        }
    }

    _evsiR(sampleSizes, evsi, cost, netValue, optimalN) {
        let code = rHeader('EVSI Analysis');
        code += `# Load required packages\n`;
        code += `library(ggplot2)\n\n`;
        code += `# EVSI data\n`;
        code += `evsi_data <- data.frame(\n`;
        code += `  sample_size = ${rVec(sampleSizes)},\n`;
        code += `  evsi = ${rVec(evsi)},\n`;
        code += `  cost = ${rVec(cost)},\n`;
        code += `  net_value = ${rVec(netValue)}\n`;
        code += `)\n\n`;
        code += `# Optimal sample size\n`;
        code += `optimal_n <- ${optimalN}\n`;
        code += `cat("Optimal sample size:", optimal_n, "\\n")\n\n`;
        code += `# EVSI curve plot\n`;
        code += `ggplot(evsi_data, aes(x = sample_size)) +\n`;
        code += `  geom_line(aes(y = evsi, color = "EVSI")) +\n`;
        code += `  geom_line(aes(y = cost, color = "Study Cost")) +\n`;
        code += `  geom_line(aes(y = net_value, color = "Net Value")) +\n`;
        code += `  geom_vline(xintercept = optimal_n, linetype = "dashed") +\n`;
        code += `  labs(title = "EVSI Analysis",\n`;
        code += `       x = "Sample Size", y = "Value ($)", color = "Metric") +\n`;
        code += `  theme_minimal()\n`;
        return code;
    }

    _evsiCSV(sampleSizes, evsi, cost, netValue) {
        const headers = ['Sample_Size', 'EVSI', 'Cost', 'Net_Value'];
        const rows = sampleSizes.map((n, i) => [
            safeNum(n), safeNum(evsi[i]), safeNum(cost[i]), safeNum(netValue[i])
        ]);
        return buildCSV(headers, rows);
    }

    _evsiPython(sampleSizes, evsi, cost, netValue, optimalN) {
        let code = pyHeader('EVSI Analysis');
        code += `import pandas as pd\n`;
        code += `import numpy as np\n`;
        code += `import matplotlib.pyplot as plt\n\n`;
        code += `# EVSI data\n`;
        code += `evsi_data = pd.DataFrame({\n`;
        code += `    "Sample_Size": ${pyVec(sampleSizes)},\n`;
        code += `    "EVSI": ${pyVec(evsi)},\n`;
        code += `    "Cost": ${pyVec(cost)},\n`;
        code += `    "Net_Value": ${pyVec(netValue)}\n`;
        code += `})\n`;
        code += `print(evsi_data)\n\n`;
        code += `optimal_n = ${optimalN}\n`;
        code += `print(f"Optimal sample size: {optimal_n}")\n\n`;
        code += `# EVSI curve plot\n`;
        code += `fig, ax = plt.subplots(figsize=(10, 6))\n`;
        code += `ax.plot(evsi_data["Sample_Size"], evsi_data["EVSI"], label="EVSI")\n`;
        code += `ax.plot(evsi_data["Sample_Size"], evsi_data["Cost"], label="Study Cost")\n`;
        code += `ax.plot(evsi_data["Sample_Size"], evsi_data["Net_Value"], label="Net Value")\n`;
        code += `ax.axvline(x=optimal_n, color="black", linestyle="--", label=f"Optimal N={optimal_n}")\n`;
        code += `ax.set_xlabel("Sample Size")\n`;
        code += `ax.set_ylabel("Value ($)")\n`;
        code += `ax.set_title("EVSI Analysis")\n`;
        code += `ax.legend()\n`;
        code += `plt.tight_layout()\n`;
        code += `plt.show()\n`;
        return code;
    }

    // ========================================================================
    // exportAll — convenience method
    // ========================================================================

    /**
     * Detect result type and call appropriate exporter
     * @param {Object} results - Result object with _type field or detectable structure
     * @param {'r'|'csv'|'python'} format
     * @returns {string}
     */
    exportAll(results, format) {
        this._validateFormat(format);
        if (!results) return '';

        const type = results._type || this._detectType(results);

        switch (type) {
            case 'bia':          return this.exportBIA(results, format);
            case 'mcda':         return this.exportMCDA(results, format);
            case 'competingRisks': return this.exportCompetingRisks(results, format);
            case 'cureModel':    return this.exportCureModel(results, format);
            case 'semiMarkov':   return this.exportSemiMarkov(results, format);
            case 'correlatedPSA': return this.exportCorrelatedPSA(results, format);
            case 'threshold':    return this.exportThreshold(results, format);
            case 'scenario':     return this.exportScenario(results, format);
            case 'modelAveraging': return this.exportModelAveraging(results, format);
            case 'evsi':         return this.exportEVSI(results, format);
            default:
                return `# Unknown result type. Cannot export.\n`;
        }
    }

    // ========================================================================
    // Private helpers
    // ========================================================================

    _validateFormat(format) {
        if (!this.supportedFormats.includes(format)) {
            throw new Error(`Unsupported export format: "${format}". Use one of: ${this.supportedFormats.join(', ')}`);
        }
    }

    _detectType(results) {
        if (results.budget && results.years) return 'bia';
        if (results.alternatives && results.criteria) return 'mcda';
        if (results.cif) return 'competingRisks';
        if (results.curedProb !== undefined) return 'cureModel';
        if (results.trace && results.states && Array.isArray(results.states)) return 'semiMarkov';
        if (results.iterations && results.paramNames) return 'correlatedPSA';
        if (results.parameters && results.icer !== undefined) return 'threshold';
        if (results.scenarios) return 'scenario';
        if (results.distributions) return 'modelAveraging';
        if (results.evsi || results.sampleSizes) return 'evsi';
        return 'unknown';
    }

    _sanitizeVarName(name) {
        return String(name || 'x').replace(/[^a-zA-Z0-9_]/g, '_').replace(/^(\d)/, '_$1');
    }
}

// ============================================================================
// EXPORT
// ============================================================================

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { NewEngineExporter };
} else if (typeof window !== 'undefined') {
    window.NewEngineExporter = NewEngineExporter;
}
