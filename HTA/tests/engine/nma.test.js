/**
 * Tests for src/engine/nma.js — NetworkMetaAnalysis
 */

'use strict';

const { performance } = require('perf_hooks');

global.performance = global.performance || performance;

const { NetworkMetaAnalysis } = require('../../src/engine/nma');

// ---------------------------------------------------------------------------
// Helpers: reusable NMA datasets
// ---------------------------------------------------------------------------

/**
 * Triangle network: A-B, B-C, A-C (3 treatments, 3 studies, fully connected)
 */
function triangleData() {
    return [
        { study: 'S1', treatment: 'A', n: 100, events: 20 },
        { study: 'S1', treatment: 'B', n: 100, events: 15 },
        { study: 'S2', treatment: 'B', n: 120, events: 18 },
        { study: 'S2', treatment: 'C', n: 120, events: 25 },
        { study: 'S3', treatment: 'A', n: 80, events: 16 },
        { study: 'S3', treatment: 'C', n: 80, events: 20 }
    ];
}

/**
 * Star (hub-and-spoke) network: A vs B, A vs C, A vs D
 * A is the hub; no direct B-C, B-D, or C-D comparisons
 */
function starData() {
    return [
        { study: 'S1', treatment: 'A', n: 100, events: 30 },
        { study: 'S1', treatment: 'B', n: 100, events: 20 },
        { study: 'S2', treatment: 'A', n: 100, events: 28 },
        { study: 'S2', treatment: 'C', n: 100, events: 22 },
        { study: 'S3', treatment: 'A', n: 100, events: 32 },
        { study: 'S3', treatment: 'D', n: 100, events: 18 }
    ];
}

/**
 * Two-treatment pairwise data (2 studies comparing A vs B)
 */
function pairwiseData() {
    return [
        { study: 'S1', treatment: 'A', n: 100, events: 25 },
        { study: 'S1', treatment: 'B', n: 100, events: 18 },
        { study: 'S2', treatment: 'A', n: 150, events: 40 },
        { study: 'S2', treatment: 'B', n: 150, events: 28 }
    ];
}

/**
 * Disconnected network: A-B in one component, C-D in another
 */
function disconnectedData() {
    return [
        { study: 'S1', treatment: 'A', n: 100, events: 20 },
        { study: 'S1', treatment: 'B', n: 100, events: 15 },
        { study: 'S2', treatment: 'C', n: 100, events: 22 },
        { study: 'S2', treatment: 'D', n: 100, events: 18 }
    ];
}

/**
 * Single study (minimum data)
 */
function singleStudyData() {
    return [
        { study: 'S1', treatment: 'A', n: 50, events: 10 },
        { study: 'S1', treatment: 'B', n: 50, events: 8 }
    ];
}

// ---------------------------------------------------------------------------
// Constructor
// ---------------------------------------------------------------------------
describe('NetworkMetaAnalysis', () => {
    describe('Constructor', () => {
        test('creates with default options', () => {
            const nma = new NetworkMetaAnalysis();

            expect(nma.options.model).toBe('random');
            expect(nma.options.method).toBe('bayesian');
            expect(nma.options.nIterations).toBe(10000);
            expect(nma.options.nBurnin).toBe(2000);
            expect(nma.options.nThin).toBe(1);
            expect(nma.options.nChains).toBe(2);
            expect(nma.options.seed).toBe(12345);
            expect(nma.treatments).toEqual([]);
            expect(nma.studies).toEqual([]);
            expect(nma.results).toBeNull();
        });

        test('creates with custom treatments list via options', () => {
            const nma = new NetworkMetaAnalysis({
                model: 'fixed',
                method: 'frequentist',
                seed: 42
            });

            expect(nma.options.model).toBe('fixed');
            expect(nma.options.method).toBe('frequentist');
            expect(nma.options.seed).toBe(42);
        });
    });

    // -----------------------------------------------------------------------
    // setData & addContrast
    // -----------------------------------------------------------------------
    describe('Add contrast / setData', () => {
        test('setData populates treatments, studies, and contrasts', () => {
            const nma = new NetworkMetaAnalysis({ method: 'frequentist' });
            nma.setData(triangleData(), 'binary');

            expect(nma.treatments).toHaveLength(3);
            expect(nma.studies).toHaveLength(3);
            expect(nma.contrasts.length).toBeGreaterThanOrEqual(3);
            expect(nma.network).toBeDefined();
            expect(nma.network.isConnected).toBe(true);
        });

        test('setData rejects empty input', () => {
            const nma = new NetworkMetaAnalysis();
            expect(() => nma.setData([], 'binary')).toThrow('non-empty');
        });

        test('setData validates required fields', () => {
            const nma = new NetworkMetaAnalysis();
            expect(() => nma.setData([{ study: 'S1' }], 'binary')).toThrow('treatment');
        });

        test('setData validates events within n for binary outcome', () => {
            const nma = new NetworkMetaAnalysis();
            expect(() => nma.setData([
                { study: 'S1', treatment: 'A', n: 10, events: 15 },
                { study: 'S1', treatment: 'B', n: 10, events: 5 }
            ], 'binary')).toThrow('events');
        });
    });

    // -----------------------------------------------------------------------
    // Consistency check
    // -----------------------------------------------------------------------
    describe('Consistency check', () => {
        test('consistency check runs on a connected triangle network (frequentist)', async () => {
            const nma = new NetworkMetaAnalysis({
                method: 'frequentist',
                model: 'fixed',
                seed: 12345
            });
            nma.setData(triangleData(), 'binary');
            const results = await nma.run();

            expect(results.consistency).toBeDefined();
            expect(results.consistency.globalTest).toBeDefined();
            expect(typeof results.consistency.globalTest.pValue).toBe('number');
            expect(results.consistency.globalTest.pValue).toBeGreaterThanOrEqual(0);
            expect(results.consistency.globalTest.pValue).toBeLessThanOrEqual(1);
        });
    });

    // -----------------------------------------------------------------------
    // Frequentist NMA: effects for all treatments
    // -----------------------------------------------------------------------
    describe('Frequentist NMA', () => {
        test('returns effects for all non-reference treatments', async () => {
            const nma = new NetworkMetaAnalysis({
                method: 'frequentist',
                model: 'fixed',
                seed: 12345
            });
            nma.setData(triangleData(), 'binary');
            const results = await nma.run();

            // Number of effects = nTreatments - 1 (reference excluded)
            expect(results.effects).toHaveLength(nma.treatments.length - 1);

            for (const effect of results.effects) {
                expect(effect.treatment).toBeDefined();
                expect(effect.vsReference).toBe(nma.treatments[0]);
                expect(Number.isFinite(effect.mean)).toBe(true);
                expect(Number.isFinite(effect.se)).toBe(true);
                expect(Number.isFinite(effect.ci_lower)).toBe(true);
                expect(Number.isFinite(effect.ci_upper)).toBe(true);
                expect(effect.ci_lower).toBeLessThan(effect.ci_upper);
            }

            // Heterogeneity
            expect(results.heterogeneity).toBeDefined();
            expect(Number.isFinite(results.heterogeneity.I2)).toBe(true);
        });

        test('star network produces valid effects', async () => {
            const nma = new NetworkMetaAnalysis({
                method: 'frequentist',
                model: 'random',
                seed: 12345
            });
            nma.setData(starData(), 'binary');
            const results = await nma.run();

            // 4 treatments => 3 effects vs reference
            expect(results.effects).toHaveLength(3);
            for (const effect of results.effects) {
                expect(Number.isFinite(effect.mean)).toBe(true);
            }
        });
    });

    // -----------------------------------------------------------------------
    // League table
    // -----------------------------------------------------------------------
    describe('League table', () => {
        test('generates correct dimensions (nTreatments x nTreatments)', async () => {
            const nma = new NetworkMetaAnalysis({
                method: 'frequentist',
                model: 'fixed',
                seed: 12345
            });
            nma.setData(triangleData(), 'binary');
            const results = await nma.run();

            const lt = results.leagueTable;
            expect(lt).toBeDefined();
            expect(lt.treatments).toHaveLength(3);
            expect(lt.table).toHaveLength(3);

            for (let i = 0; i < 3; i++) {
                expect(lt.table[i]).toHaveLength(3);
                // Diagonal should be self-reference
                expect(lt.table[i][i].isSelf).toBe(true);
            }

            // Off-diagonal entries have effect estimates
            for (let i = 0; i < 3; i++) {
                for (let j = 0; j < 3; j++) {
                    if (i !== j) {
                        expect(Number.isFinite(lt.table[i][j].effect)).toBe(true);
                        expect(Number.isFinite(lt.table[i][j].ci_lower)).toBe(true);
                        expect(Number.isFinite(lt.table[i][j].ci_upper)).toBe(true);
                    }
                }
            }
        });

        test('league table effects are antisymmetric (d_ij = -d_ji)', async () => {
            const nma = new NetworkMetaAnalysis({
                method: 'frequentist',
                model: 'fixed',
                seed: 12345
            });
            nma.setData(triangleData(), 'binary');
            const results = await nma.run();

            const lt = results.leagueTable.table;
            for (let i = 0; i < lt.length; i++) {
                for (let j = i + 1; j < lt.length; j++) {
                    expect(lt[i][j].effect).toBeCloseTo(-lt[j][i].effect, 8);
                }
            }
        });
    });

    // -----------------------------------------------------------------------
    // Ranking (SUCRA / P-score)
    // -----------------------------------------------------------------------
    describe('Ranking (SUCRA / P-scores)', () => {
        test('P-scores are in [0, 100] for frequentist NMA', async () => {
            const nma = new NetworkMetaAnalysis({
                method: 'frequentist',
                model: 'fixed',
                seed: 12345
            });
            nma.setData(triangleData(), 'binary');
            const results = await nma.run();

            expect(results.sucra).toBeDefined();
            expect(results.sucra).toHaveLength(3);

            for (const rank of results.sucra) {
                // P-scores expressed as percentage [0, 100]
                expect(rank.pScore).toBeGreaterThanOrEqual(0);
                expect(rank.pScore).toBeLessThanOrEqual(100);
                expect(rank.treatment).toBeDefined();
            }
        });

        test('SUCRA values are in [0, 100] for Bayesian NMA', async () => {
            const nma = new NetworkMetaAnalysis({
                method: 'bayesian',
                model: 'random',
                nIterations: 1500,
                nBurnin: 500,
                seed: 12345
            });
            nma.setData(triangleData(), 'binary');
            const results = await nma.run();

            expect(results.sucra).toBeDefined();
            expect(results.sucra).toHaveLength(3);

            for (const rank of results.sucra) {
                expect(rank.sucra).toBeGreaterThanOrEqual(0);
                expect(rank.sucra).toBeLessThanOrEqual(100);
                expect(rank.treatment).toBeDefined();
                expect(rank.meanRank).toBeGreaterThanOrEqual(1);
                expect(rank.meanRank).toBeLessThanOrEqual(3);
            }
        });
    });

    // -----------------------------------------------------------------------
    // Network connectivity
    // -----------------------------------------------------------------------
    describe('Network connectivity', () => {
        test('detects connected network', () => {
            const nma = new NetworkMetaAnalysis({ method: 'frequentist' });
            nma.setData(triangleData(), 'binary');

            expect(nma.network.isConnected).toBe(true);
        });

        test('detects disconnected network', () => {
            const nma = new NetworkMetaAnalysis({ method: 'frequentist' });
            nma.setData(disconnectedData(), 'binary');

            expect(nma.network.isConnected).toBe(false);
        });

        test('disconnected network throws on run', async () => {
            const nma = new NetworkMetaAnalysis({ method: 'frequentist' });
            nma.setData(disconnectedData(), 'binary');

            await expect(nma.run()).rejects.toThrow('not fully connected');
        });
    });

    // -----------------------------------------------------------------------
    // Two treatments: simplifies to pairwise MA
    // -----------------------------------------------------------------------
    describe('Two treatments (pairwise MA)', () => {
        test('returns single treatment effect for two-treatment network', async () => {
            const nma = new NetworkMetaAnalysis({
                method: 'frequentist',
                model: 'fixed',
                seed: 12345
            });
            nma.setData(pairwiseData(), 'binary');
            const results = await nma.run();

            expect(nma.treatments).toHaveLength(2);
            expect(results.effects).toHaveLength(1);

            const effect = results.effects[0];
            expect(Number.isFinite(effect.mean)).toBe(true);
            expect(Number.isFinite(effect.se)).toBe(true);
            expect(effect.ci_lower).toBeLessThan(effect.mean);
            expect(effect.ci_upper).toBeGreaterThan(effect.mean);
        });

        test('league table is 2x2 for pairwise comparison', async () => {
            const nma = new NetworkMetaAnalysis({
                method: 'frequentist',
                model: 'fixed',
                seed: 12345
            });
            nma.setData(pairwiseData(), 'binary');
            const results = await nma.run();

            const lt = results.leagueTable;
            expect(lt.table).toHaveLength(2);
            expect(lt.table[0]).toHaveLength(2);
        });
    });

    // -----------------------------------------------------------------------
    // Determinism: same seed => same results
    // -----------------------------------------------------------------------
    describe('Determinism', () => {
        test('same seed produces same frequentist results', async () => {
            const run = async (seed) => {
                const nma = new NetworkMetaAnalysis({
                    method: 'frequentist',
                    model: 'fixed',
                    seed
                });
                nma.setData(triangleData(), 'binary');
                return await nma.run();
            };

            const r1 = await run(12345);
            const r2 = await run(12345);

            for (let i = 0; i < r1.effects.length; i++) {
                expect(r1.effects[i].mean).toBe(r2.effects[i].mean);
                expect(r1.effects[i].se).toBe(r2.effects[i].se);
            }
        });

        test('same seed produces same Bayesian results', async () => {
            const run = async (seed) => {
                const nma = new NetworkMetaAnalysis({
                    method: 'bayesian',
                    model: 'random',
                    nIterations: 500,
                    nBurnin: 100,
                    seed
                });
                nma.setData(triangleData(), 'binary');
                return await nma.run();
            };

            const r1 = await run(42);
            const r2 = await run(42);

            for (let i = 0; i < r1.effects.length; i++) {
                expect(r1.effects[i].mean).toBe(r2.effects[i].mean);
            }
            expect(r1.tau).toEqual(r2.tau);
        });
    });

    // -----------------------------------------------------------------------
    // Edge case: single study
    // -----------------------------------------------------------------------
    describe('Edge cases', () => {
        test('single study does not crash (frequentist)', async () => {
            const nma = new NetworkMetaAnalysis({
                method: 'frequentist',
                model: 'fixed',
                seed: 12345
            });
            nma.setData(singleStudyData(), 'binary');
            const results = await nma.run();

            expect(results.effects).toHaveLength(1);
            expect(Number.isFinite(results.effects[0].mean)).toBe(true);
            expect(results.leagueTable).toBeDefined();
            expect(results.sucra).toBeDefined();
        });

        test('single study does not crash (Bayesian)', async () => {
            const nma = new NetworkMetaAnalysis({
                method: 'bayesian',
                model: 'random',
                nIterations: 500,
                nBurnin: 100,
                seed: 12345
            });
            nma.setData(singleStudyData(), 'binary');
            const results = await nma.run();

            expect(results.effects).toHaveLength(1);
            expect(Number.isFinite(results.effects[0].mean)).toBe(true);
        });

        test('continuous outcome data works', async () => {
            const continuousData = [
                { study: 'S1', treatment: 'A', n: 50, mean: 10.0, sd: 2.5 },
                { study: 'S1', treatment: 'B', n: 50, mean: 8.5, sd: 2.3 },
                { study: 'S2', treatment: 'A', n: 60, mean: 9.8, sd: 2.8 },
                { study: 'S2', treatment: 'C', n: 60, mean: 7.2, sd: 2.1 },
                { study: 'S3', treatment: 'B', n: 45, mean: 8.8, sd: 2.6 },
                { study: 'S3', treatment: 'C', n: 45, mean: 7.5, sd: 2.4 }
            ];

            const nma = new NetworkMetaAnalysis({
                method: 'frequentist',
                model: 'fixed',
                seed: 12345
            });
            nma.setData(continuousData, 'continuous');
            const results = await nma.run();

            expect(results.effects).toHaveLength(2);
            for (const e of results.effects) {
                expect(Number.isFinite(e.mean)).toBe(true);
            }
        });

        test('network geometry reports correct metrics', async () => {
            const nma = new NetworkMetaAnalysis({
                method: 'frequentist',
                model: 'fixed',
                seed: 12345
            });
            nma.setData(triangleData(), 'binary');
            const results = await nma.run();

            const geo = results.networkGeometry;
            expect(geo.nTreatments).toBe(3);
            expect(geo.nStudies).toBe(3);
            expect(geo.nEdges).toBe(3);
            expect(geo.isConnected).toBe(true);
            expect(geo.density).toBeCloseTo(1, 10); // complete triangle
            expect(geo.networkType).toBe('Complete (all treatments compared)');
        });
    });
});
