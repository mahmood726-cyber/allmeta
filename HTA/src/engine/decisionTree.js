/**
 * Decision Tree Engine with Roll-back Analysis
 * Full decision tree support matching TreeAge Pro capabilities
 *
 * Features:
 * - Decision nodes, Chance nodes, Terminal nodes
 * - Automatic roll-back calculation
 * - Path probability tracking
 * - Expected value computation
 * - Risk profile analysis
 * - Sensitivity analysis on any parameter
 */

class DecisionTreeEngine {
    constructor(options = {}) {
        this.discountRate = options.discountRate || 0;
        this.perspective = options.perspective || 'healthcare_payer';
        this.currency = options.currency || 'OMR';
        this.precision = options.precision || 6;
        this.nodes = new Map();
        this.rootId = null;
        this.calculationCache = new Map();
    }

    /**
     * Node Types
     */
    static NodeType = {
        DECISION: 'decision',
        CHANCE: 'chance',
        TERMINAL: 'terminal',
        MARKOV: 'markov',
        LOGIC: 'logic'
    };

    /**
     * Create a decision node
     */
    createDecisionNode(id, name, options = {}) {
        const node = {
            id: id,
            type: DecisionTreeEngine.NodeType.DECISION,
            name: name,
            description: options.description || '',
            children: [],
            parent: null,
            collapsed: false,
            color: options.color || '#3b82f6',
            position: options.position || { x: 0, y: 0 },
            metadata: options.metadata || {}
        };
        this.nodes.set(id, node);
        return node;
    }

    /**
     * Create a chance node
     */
    createChanceNode(id, name, options = {}) {
        const node = {
            id: id,
            type: DecisionTreeEngine.NodeType.CHANCE,
            name: name,
            description: options.description || '',
            children: [],
            parent: null,
            probabilities: [], // Probability for each child branch
            collapsed: false,
            color: options.color || '#10b981',
            position: options.position || { x: 0, y: 0 },
            metadata: options.metadata || {}
        };
        this.nodes.set(id, node);
        return node;
    }

    /**
     * Create a terminal node
     */
    createTerminalNode(id, name, options = {}) {
        const node = {
            id: id,
            type: DecisionTreeEngine.NodeType.TERMINAL,
            name: name,
            description: options.description || '',
            parent: null,
            payoff: {
                cost: options.cost || 0,
                effectiveness: options.effectiveness || 0,
                utility: options.utility || 0,
                qaly: options.qaly || 0,
                lys: options.lys || 0
            },
            color: options.color || '#ef4444',
            position: options.position || { x: 0, y: 0 },
            metadata: options.metadata || {}
        };
        this.nodes.set(id, node);
        return node;
    }

    /**
     * Create a Markov node (embeds Markov model)
     */
    createMarkovNode(id, name, markovConfig, options = {}) {
        const node = {
            id: id,
            type: DecisionTreeEngine.NodeType.MARKOV,
            name: name,
            description: options.description || '',
            parent: null,
            markovConfig: markovConfig, // { states, transitions, rewards, cycles }
            collapsed: false,
            color: options.color || '#8b5cf6',
            position: options.position || { x: 0, y: 0 },
            metadata: options.metadata || {}
        };
        this.nodes.set(id, node);
        return node;
    }

    /**
     * Create a logic node (conditional branching)
     */
    createLogicNode(id, name, condition, options = {}) {
        const node = {
            id: id,
            type: DecisionTreeEngine.NodeType.LOGIC,
            name: name,
            description: options.description || '',
            condition: condition, // Function that returns branch index
            children: [],
            parent: null,
            collapsed: false,
            color: options.color || '#f59e0b',
            position: options.position || { x: 0, y: 0 },
            metadata: options.metadata || {}
        };
        this.nodes.set(id, node);
        return node;
    }

    /**
     * Add child to a node
     */
    addChild(parentId, childId, options = {}) {
        const parent = this.nodes.get(parentId);
        const child = this.nodes.get(childId);

        if (!parent || !child) {
            throw new Error('Parent or child node not found');
        }

        if (parent.type === DecisionTreeEngine.NodeType.TERMINAL) {
            throw new Error('Cannot add children to terminal node');
        }

        child.parent = parentId;

        if (parent.type === DecisionTreeEngine.NodeType.CHANCE) {
            parent.children.push(childId);
            parent.probabilities.push(options.probability || 0);
            child.branchLabel = options.label || '';
        } else if (parent.type === DecisionTreeEngine.NodeType.DECISION) {
            parent.children.push(childId);
            child.branchLabel = options.label || '';
            child.strategyName = options.strategyName || options.label || '';
        } else {
            parent.children.push(childId);
            child.branchLabel = options.label || '';
        }

        this.invalidateCache();
        return this;
    }

    /**
     * Set root node
     */
    setRoot(nodeId) {
        if (!this.nodes.has(nodeId)) {
            throw new Error('Node not found');
        }
        this.rootId = nodeId;
        this.invalidateCache();
        return this;
    }

    /**
     * Invalidate calculation cache
     */
    invalidateCache() {
        this.calculationCache.clear();
    }

    /**
     * Roll-back analysis - calculate expected values from terminals to root
     */
    rollBack(parameters = {}) {
        if (!this.rootId) {
            throw new Error('No root node set');
        }

        const results = new Map();
        this._rollBackRecursive(this.rootId, parameters, results);

        const rootResult = results.get(this.rootId);

        // Find optimal strategy for decision nodes
        const optimalPaths = this._findOptimalPaths(this.rootId, results);

        return {
            nodeResults: Object.fromEntries(results),
            rootExpectedValue: rootResult,
            optimalStrategy: optimalPaths.strategy,
            optimalPath: optimalPaths.path,
            allStrategies: this._getAllStrategies(this.rootId, results)
        };
    }

    _rollBackRecursive(nodeId, parameters, results) {
        const node = this.nodes.get(nodeId);

        if (!node) {
            throw new Error(`Node ${nodeId} not found`);
        }

        // Check cache
        const cacheKey = `${nodeId}_${JSON.stringify(parameters)}`;
        if (this.calculationCache.has(cacheKey)) {
            results.set(nodeId, this.calculationCache.get(cacheKey));
            return this.calculationCache.get(cacheKey);
        }

        let result;

        switch (node.type) {
            case DecisionTreeEngine.NodeType.TERMINAL:
                result = this._evaluateTerminal(node, parameters);
                break;

            case DecisionTreeEngine.NodeType.MARKOV:
                result = this._evaluateMarkov(node, parameters);
                break;

            case DecisionTreeEngine.NodeType.CHANCE:
                result = this._evaluateChance(node, parameters, results);
                break;

            case DecisionTreeEngine.NodeType.DECISION:
                result = this._evaluateDecision(node, parameters, results);
                break;

            case DecisionTreeEngine.NodeType.LOGIC:
                result = this._evaluateLogic(node, parameters, results);
                break;

            default:
                throw new Error(`Unknown node type: ${node.type}`);
        }

        results.set(nodeId, result);
        this.calculationCache.set(cacheKey, result);
        return result;
    }

    _evaluateTerminal(node, parameters) {
        // Apply any parameter overrides
        const payoff = { ...node.payoff };

        for (const [key, value] of Object.entries(parameters)) {
            if (key.startsWith(`${node.id}.`)) {
                const field = key.split('.')[1];
                if (Object.hasOwn(payoff, field)) {
                    payoff[field] = value;
                }
            }
        }

        return {
            nodeId: node.id,
            nodeName: node.name,
            nodeType: node.type,
            cost: payoff.cost,
            effectiveness: payoff.effectiveness,
            utility: payoff.utility,
            qaly: payoff.qaly,
            lys: payoff.lys,
            probability: 1,
            pathProbability: 1
        };
    }

    _evaluateMarkov(node, parameters) {
        // Run embedded Markov model
        const config = node.markovConfig;
        const cycles = config.cycles || 100;
        const states = config.states || [];
        const transitions = config.transitions || [];
        const rewards = config.rewards || {};

        // Simplified Markov evaluation
        let cohort = new Array(states.length).fill(0);
        cohort[0] = 1; // Start in first state

        let totalCost = 0;
        let totalQALY = 0;
        let totalLYs = 0;

        for (let cycle = 0; cycle < cycles; cycle++) {
            const discount = Math.pow(1 + this.discountRate, -cycle);

            // Calculate rewards for this cycle
            for (let s = 0; s < states.length; s++) {
                const stateName = states[s];
                const stateReward = rewards[stateName] || { cost: 0, utility: 1 };
                totalCost += cohort[s] * (stateReward.cost || 0) * discount;
                totalQALY += cohort[s] * (stateReward.utility || 1) * discount;
                totalLYs += cohort[s] * discount;
            }

            // Apply transitions
            const newCohort = new Array(states.length).fill(0);
            for (let from = 0; from < states.length; from++) {
                for (let to = 0; to < states.length; to++) {
                    const transProb = transitions[from]?.[to] || (from === to ? 1 : 0);
                    newCohort[to] += cohort[from] * transProb;
                }
            }
            cohort = newCohort;
        }

        return {
            nodeId: node.id,
            nodeName: node.name,
            nodeType: node.type,
            cost: totalCost,
            effectiveness: totalQALY,
            utility: totalQALY / cycles,
            qaly: totalQALY,
            lys: totalLYs,
            probability: 1,
            pathProbability: 1,
            finalCohort: cohort
        };
    }

    _evaluateChance(node, parameters, results) {
        // Calculate children first
        const childResults = [];
        let totalProb = 0;

        for (let i = 0; i < node.children.length; i++) {
            const childId = node.children[i];
            let prob = node.probabilities[i];

            // Check for parameter override
            const probKey = `${node.id}.prob_${i}`;
            if (Object.hasOwn(parameters, probKey)) {
                prob = parameters[probKey];
            }

            const childResult = this._rollBackRecursive(childId, parameters, results);
            childResults.push({
                ...childResult,
                branchProbability: prob
            });
            totalProb += prob;
        }

        // Normalize probabilities if needed
        if (Math.abs(totalProb - 1) > 0.001 && totalProb > 0) {
            for (const cr of childResults) {
                cr.branchProbability /= totalProb;
            }
        }

        // Calculate expected values
        let expectedCost = 0;
        let expectedEffectiveness = 0;
        let expectedQALY = 0;
        let expectedLYs = 0;

        for (const cr of childResults) {
            expectedCost += cr.cost * cr.branchProbability;
            expectedEffectiveness += cr.effectiveness * cr.branchProbability;
            expectedQALY += cr.qaly * cr.branchProbability;
            expectedLYs += cr.lys * cr.branchProbability;
        }

        return {
            nodeId: node.id,
            nodeName: node.name,
            nodeType: node.type,
            cost: expectedCost,
            effectiveness: expectedEffectiveness,
            utility: expectedEffectiveness,
            qaly: expectedQALY,
            lys: expectedLYs,
            probability: 1,
            pathProbability: 1,
            childResults: childResults
        };
    }

    _evaluateDecision(node, parameters, results) {
        // Calculate all children (strategies)
        const strategyResults = [];

        for (let i = 0; i < node.children.length; i++) {
            const childId = node.children[i];
            const childNode = this.nodes.get(childId);
            const childResult = this._rollBackRecursive(childId, parameters, results);

            strategyResults.push({
                ...childResult,
                strategyIndex: i,
                strategyName: childNode.strategyName || childNode.branchLabel || childNode.name
            });
        }

        // Find optimal strategy (maximize effectiveness or minimize cost, or NMB)
        const criterion = parameters.decisionCriterion || 'effectiveness';
        let optimalIndex = 0;
        let optimalValue = -Infinity;

        for (let i = 0; i < strategyResults.length; i++) {
            let value;
            switch (criterion) {
                case 'cost':
                    value = -strategyResults[i].cost; // Minimize cost
                    break;
                case 'effectiveness':
                    value = strategyResults[i].effectiveness;
                    break;
                case 'qaly':
                    value = strategyResults[i].qaly;
                    break;
                case 'nmb':
                    const wtp = parameters.wtp || 15800;
                    value = strategyResults[i].qaly * wtp - strategyResults[i].cost;
                    break;
                default:
                    value = strategyResults[i].effectiveness;
            }

            if (value > optimalValue) {
                optimalValue = value;
                optimalIndex = i;
            }
        }

        const optimal = strategyResults[optimalIndex];

        return {
            nodeId: node.id,
            nodeName: node.name,
            nodeType: node.type,
            cost: optimal.cost,
            effectiveness: optimal.effectiveness,
            utility: optimal.utility,
            qaly: optimal.qaly,
            lys: optimal.lys,
            probability: 1,
            pathProbability: 1,
            optimalStrategyIndex: optimalIndex,
            optimalStrategyName: optimal.strategyName,
            strategyResults: strategyResults
        };
    }

    _evaluateLogic(node, parameters, results) {
        // Evaluate condition to determine which branch
        const branchIndex = typeof node.condition === 'function'
            ? node.condition(parameters)
            : 0;

        const childId = node.children[branchIndex] || node.children[0];
        return this._rollBackRecursive(childId, parameters, results);
    }

    _findOptimalPaths(nodeId, results) {
        const node = this.nodes.get(nodeId);
        const result = results.get(nodeId);
        const path = [{ nodeId, nodeName: node.name, nodeType: node.type }];

        if (node.type === DecisionTreeEngine.NodeType.TERMINAL ||
            node.type === DecisionTreeEngine.NodeType.MARKOV) {
            return { strategy: node.name, path };
        }

        if (node.type === DecisionTreeEngine.NodeType.DECISION && result.optimalStrategyIndex !== undefined) {
            const optimalChildId = node.children[result.optimalStrategyIndex];
            const childPaths = this._findOptimalPaths(optimalChildId, results);
            return {
                strategy: result.optimalStrategyName,
                path: [...path, ...childPaths.path]
            };
        }

        // For chance nodes, follow all paths weighted by probability
        if (node.children && node.children.length > 0) {
            const childPaths = this._findOptimalPaths(node.children[0], results);
            return {
                strategy: childPaths.strategy,
                path: [...path, ...childPaths.path]
            };
        }

        return { strategy: node.name, path };
    }

    _getAllStrategies(nodeId, results) {
        const strategies = [];
        this._collectStrategies(nodeId, results, [], 1, strategies);
        return strategies;
    }

    _collectStrategies(nodeId, results, currentPath, currentProb, strategies) {
        const node = this.nodes.get(nodeId);
        const result = results.get(nodeId);

        if (node.type === DecisionTreeEngine.NodeType.TERMINAL ||
            node.type === DecisionTreeEngine.NodeType.MARKOV) {
            strategies.push({
                path: [...currentPath, node.name],
                probability: currentProb,
                cost: result.cost,
                effectiveness: result.effectiveness,
                qaly: result.qaly
            });
            return;
        }

        if (node.type === DecisionTreeEngine.NodeType.DECISION) {
            for (let i = 0; i < node.children.length; i++) {
                const childId = node.children[i];
                const childNode = this.nodes.get(childId);
                const strategyName = childNode.strategyName || childNode.name;
                this._collectStrategies(
                    childId, results,
                    [...currentPath, strategyName],
                    currentProb,
                    strategies
                );
            }
        } else if (node.type === DecisionTreeEngine.NodeType.CHANCE) {
            for (let i = 0; i < node.children.length; i++) {
                const childId = node.children[i];
                const prob = node.probabilities[i] || 0;
                this._collectStrategies(
                    childId, results,
                    currentPath,
                    currentProb * prob,
                    strategies
                );
            }
        }
    }

    /**
     * Risk Profile Analysis
     */
    riskProfile(parameters = {}) {
        const rollBackResult = this.rollBack(parameters);
        const strategies = rollBackResult.allStrategies;

        // Group by strategy
        const strategyProfiles = new Map();

        for (const s of strategies) {
            const strategyKey = s.path[0] || 'Unknown';
            if (!strategyProfiles.has(strategyKey)) {
                strategyProfiles.set(strategyKey, {
                    name: strategyKey,
                    outcomes: [],
                    totalProbability: 0,
                    expectedCost: 0,
                    expectedQALY: 0
                });
            }

            const profile = strategyProfiles.get(strategyKey);
            profile.outcomes.push({
                path: s.path,
                probability: s.probability,
                cost: s.cost,
                qaly: s.qaly
            });
            profile.totalProbability += s.probability;
            profile.expectedCost += s.cost * s.probability;
            profile.expectedQALY += s.qaly * s.probability;
        }

        // Calculate risk measures
        for (const [key, profile] of strategyProfiles) {
            // Sort outcomes by cost for cumulative distribution
            profile.outcomes.sort((a, b) => a.cost - b.cost);

            // Calculate variance and std dev
            let costVariance = 0;
            let qalyVariance = 0;
            for (const outcome of profile.outcomes) {
                costVariance += Math.pow(outcome.cost - profile.expectedCost, 2) * outcome.probability;
                qalyVariance += Math.pow(outcome.qaly - profile.expectedQALY, 2) * outcome.probability;
            }
            profile.costStdDev = Math.sqrt(costVariance);
            profile.qalyStdDev = Math.sqrt(qalyVariance);

            // Calculate percentiles
            let cumProb = 0;
            profile.costPercentiles = {};
            for (const outcome of profile.outcomes) {
                cumProb += outcome.probability;
                if (cumProb >= 0.05 && !profile.costPercentiles.p5) {
                    profile.costPercentiles.p5 = outcome.cost;
                }
                if (cumProb >= 0.25 && !profile.costPercentiles.p25) {
                    profile.costPercentiles.p25 = outcome.cost;
                }
                if (cumProb >= 0.50 && !profile.costPercentiles.p50) {
                    profile.costPercentiles.p50 = outcome.cost;
                }
                if (cumProb >= 0.75 && !profile.costPercentiles.p75) {
                    profile.costPercentiles.p75 = outcome.cost;
                }
                if (cumProb >= 0.95 && !profile.costPercentiles.p95) {
                    profile.costPercentiles.p95 = outcome.cost;
                }
            }
        }

        return {
            strategies: Object.fromEntries(strategyProfiles),
            comparison: this._compareStrategies(strategyProfiles, parameters)
        };
    }

    _compareStrategies(strategyProfiles, parameters) {
        const strategies = Array.from(strategyProfiles.values());
        if (strategies.length < 2) return null;

        const comparisons = [];
        const baseline = strategies[0];

        for (let i = 1; i < strategies.length; i++) {
            const comparator = strategies[i];
            const incrementalCost = comparator.expectedCost - baseline.expectedCost;
            const incrementalQALY = comparator.expectedQALY - baseline.expectedQALY;
            const icer = incrementalQALY !== 0 ? incrementalCost / incrementalQALY : Infinity;

            comparisons.push({
                baseline: baseline.name,
                comparator: comparator.name,
                incrementalCost,
                incrementalQALY,
                icer,
                nmb: (parameters.wtp || 15800) * incrementalQALY - incrementalCost
            });
        }

        return comparisons;
    }

    /**
     * One-way Sensitivity Analysis on Decision Tree
     */
    oneWaySensitivity(parameterId, range, steps = 20, baseParameters = {}) {
        const results = [];
        const stepSize = (range.max - range.min) / steps;

        for (let i = 0; i <= steps; i++) {
            const value = range.min + i * stepSize;
            const params = { ...baseParameters, [parameterId]: value };
            const rollBack = this.rollBack(params);

            results.push({
                parameterValue: value,
                optimalStrategy: rollBack.optimalStrategy,
                expectedCost: rollBack.rootExpectedValue.cost,
                expectedQALY: rollBack.rootExpectedValue.qaly,
                allStrategyCosts: rollBack.rootExpectedValue.strategyResults?.map(s => ({
                    name: s.strategyName,
                    cost: s.cost,
                    qaly: s.qaly
                }))
            });
        }

        // Find threshold points where optimal strategy changes
        const thresholds = [];
        for (let i = 1; i < results.length; i++) {
            if (results[i].optimalStrategy !== results[i - 1].optimalStrategy) {
                // Linear interpolation to find exact threshold
                const x1 = results[i - 1].parameterValue;
                const x2 = results[i].parameterValue;
                thresholds.push({
                    value: (x1 + x2) / 2,
                    from: results[i - 1].optimalStrategy,
                    to: results[i].optimalStrategy
                });
            }
        }

        return {
            parameterId,
            range,
            results,
            thresholds,
            baseOptimal: results[Math.floor(steps / 2)]?.optimalStrategy
        };
    }

    /**
     * Two-way Sensitivity Analysis
     */
    twoWaySensitivity(param1, range1, param2, range2, steps = 20, baseParameters = {}) {
        const results = [];
        const step1 = (range1.max - range1.min) / steps;
        const step2 = (range2.max - range2.min) / steps;

        for (let i = 0; i <= steps; i++) {
            const value1 = range1.min + i * step1;
            for (let j = 0; j <= steps; j++) {
                const value2 = range2.min + j * step2;
                const params = {
                    ...baseParameters,
                    [param1]: value1,
                    [param2]: value2
                };
                const rollBack = this.rollBack(params);

                results.push({
                    [param1]: value1,
                    [param2]: value2,
                    optimalStrategy: rollBack.optimalStrategy,
                    expectedCost: rollBack.rootExpectedValue.cost,
                    expectedQALY: rollBack.rootExpectedValue.qaly
                });
            }
        }

        return {
            param1,
            range1,
            param2,
            range2,
            results,
            grid: this._createGrid(results, param1, param2, steps)
        };
    }

    _createGrid(results, param1, param2, steps) {
        const grid = [];
        for (let i = 0; i <= steps; i++) {
            const row = [];
            for (let j = 0; j <= steps; j++) {
                const idx = i * (steps + 1) + j;
                row.push(results[idx]?.optimalStrategy || '');
            }
            grid.push(row);
        }
        return grid;
    }

    /**
     * Threshold Analysis - find where ICER = WTP
     */
    thresholdAnalysis(parameterId, range, wtp = 15800, baseParameters = {}) {
        const sensitivity = this.oneWaySensitivity(parameterId, range, 100, baseParameters);

        // Find threshold where NMB = 0 (ICER = WTP)
        const thresholds = [];

        for (let i = 1; i < sensitivity.results.length; i++) {
            const prev = sensitivity.results[i - 1];
            const curr = sensitivity.results[i];

            // For each pair of strategies
            if (prev.allStrategyCosts && curr.allStrategyCosts) {
                for (let s = 1; s < prev.allStrategyCosts.length; s++) {
                    const prevNMB = prev.allStrategyCosts[s].qaly * wtp - prev.allStrategyCosts[s].cost -
                                   (prev.allStrategyCosts[0].qaly * wtp - prev.allStrategyCosts[0].cost);
                    const currNMB = curr.allStrategyCosts[s].qaly * wtp - curr.allStrategyCosts[s].cost -
                                   (curr.allStrategyCosts[0].qaly * wtp - curr.allStrategyCosts[0].cost);

                    if ((prevNMB > 0 && currNMB < 0) || (prevNMB < 0 && currNMB > 0)) {
                        // Linear interpolation
                        const threshold = prev.parameterValue +
                            (curr.parameterValue - prev.parameterValue) * Math.abs(prevNMB) / (Math.abs(prevNMB) + Math.abs(currNMB));

                        thresholds.push({
                            parameter: parameterId,
                            threshold: threshold,
                            strategies: [prev.allStrategyCosts[0].name, prev.allStrategyCosts[s].name],
                            wtp: wtp
                        });
                    }
                }
            }
        }

        return {
            parameterId,
            wtp,
            thresholds,
            sensitivity
        };
    }

    /**
     * Export tree structure
     */
    export() {
        return {
            rootId: this.rootId,
            nodes: Object.fromEntries(this.nodes),
            settings: {
                discountRate: this.discountRate,
                perspective: this.perspective,
                currency: this.currency
            }
        };
    }

    /**
     * Import tree structure
     */
    import(data) {
        this.rootId = data.rootId;
        this.nodes = new Map(Object.entries(data.nodes));
        if (data.settings) {
            this.discountRate = data.settings.discountRate || 0;
            this.perspective = data.settings.perspective || 'healthcare_payer';
            this.currency = data.settings.currency || 'OMR';
        }
        this.invalidateCache();
        return this;
    }

    /**
     * Clone tree
     */
    clone() {
        const newTree = new DecisionTreeEngine({
            discountRate: this.discountRate,
            perspective: this.perspective,
            currency: this.currency
        });
        newTree.import(JSON.parse(JSON.stringify(this.export())));
        return newTree;
    }

    /**
     * Validate tree structure
     */
    validate() {
        const errors = [];
        const warnings = [];

        if (!this.rootId) {
            errors.push('No root node defined');
            return { valid: false, errors, warnings };
        }

        // Check all nodes are reachable from root
        const visited = new Set();
        this._visitNodes(this.rootId, visited);

        for (const [id, node] of this.nodes) {
            if (!visited.has(id)) {
                warnings.push(`Node "${node.name}" (${id}) is not reachable from root`);
            }
        }

        // Check chance node probabilities sum to 1
        for (const [id, node] of this.nodes) {
            if (node.type === DecisionTreeEngine.NodeType.CHANCE) {
                const sum = node.probabilities.reduce((a, b) => a + b, 0);
                if (Math.abs(sum - 1) > 0.001) {
                    errors.push(`Chance node "${node.name}" probabilities sum to ${sum.toFixed(4)}, not 1`);
                }
            }
        }

        // Check for cycles
        const cycleCheck = this._checkCycles(this.rootId, new Set());
        if (cycleCheck) {
            errors.push(`Cycle detected involving node: ${cycleCheck}`);
        }

        return {
            valid: errors.length === 0,
            errors,
            warnings
        };
    }

    _visitNodes(nodeId, visited) {
        if (visited.has(nodeId)) return;
        visited.add(nodeId);

        const node = this.nodes.get(nodeId);
        if (node && node.children) {
            for (const childId of node.children) {
                this._visitNodes(childId, visited);
            }
        }
    }

    _checkCycles(nodeId, ancestors) {
        if (ancestors.has(nodeId)) {
            return nodeId;
        }

        ancestors.add(nodeId);
        const node = this.nodes.get(nodeId);

        if (node && node.children) {
            for (const childId of node.children) {
                const cycle = this._checkCycles(childId, new Set(ancestors));
                if (cycle) return cycle;
            }
        }

        return null;
    }
}

// Export
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { DecisionTreeEngine };
}

if (typeof window !== 'undefined') {
    window.DecisionTreeEngine = DecisionTreeEngine;
}
