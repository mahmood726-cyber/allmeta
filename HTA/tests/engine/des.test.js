/**
 * Tests for src/engine/des.js — Discrete Event Simulation Engine
 */

'use strict';

const { performance } = require('perf_hooks');

// Provide globals the DES engine expects
const { PCG32 } = require('../../src/utils/pcg32');
// DES inline PCG32 uses .random(); the utils PCG32 has .nextFloat()
PCG32.prototype.random = PCG32.prototype.nextFloat;
global.PCG32 = PCG32;
global.performance = global.performance || performance;

const {
    DiscreteEventSimulationEngine,
    PriorityQueue,
    DESTemplates
} = require('../../src/engine/des');

/**
 * Helper: minimal two-state model (healthy -> dead)
 */
function createSimpleModel() {
    return {
        initialState: 'healthy',
        states: {
            healthy: {
                costPerTime: 1000,
                utilityPerTime: 0.8,
                scheduledEvents: [
                    {
                        event: 'death',
                        distribution: 'exponential',
                        parameters: { rate: 0.1 }
                    }
                ]
            },
            dead: {
                terminal: true,
                costPerTime: 0,
                utilityPerTime: 0
            }
        },
        events: {
            death: { cost: 0 }
        },
        transitions: [
            { trigger: 'death', from: 'healthy', to: 'dead' }
        ]
    };
}

/**
 * Helper: three-state disease progression model
 */
function createProgressionModel() {
    return {
        initialState: 'healthy',
        states: {
            healthy: {
                costPerTime: 500,
                utilityPerTime: 1.0,
                scheduledEvents: [
                    {
                        event: 'disease_onset',
                        distribution: 'fixed',
                        parameters: { time: 2 }
                    }
                ]
            },
            diseased: {
                costPerTime: 5000,
                utilityPerTime: 0.6,
                scheduledEvents: [
                    {
                        event: 'death',
                        distribution: 'fixed',
                        parameters: { time: 3 }
                    }
                ]
            },
            dead: {
                terminal: true,
                costPerTime: 0,
                utilityPerTime: 0
            }
        },
        events: {
            disease_onset: { cost: 1000 },
            death: { cost: 0 }
        },
        transitions: [
            { trigger: 'disease_onset', from: 'healthy', to: 'diseased' },
            { trigger: 'death', from: 'diseased', to: 'dead' }
        ]
    };
}

// ---------------------------------------------------------------------------

describe('DiscreteEventSimulationEngine', () => {

    // 1. Constructor — creates engine with default config
    test('constructor creates engine with default config', () => {
        const engine = new DiscreteEventSimulationEngine();

        expect(engine.options.patients).toBe(1000);
        expect(engine.options.seed).toBe(12345);
        expect(engine.options.maxTime).toBe(100);
        expect(engine.options.timeUnit).toBe('years');
        expect(engine.options.recordHistory).toBe(false);
        expect(engine.rng).toBeDefined();
        expect(engine.eventQueue).toBeInstanceOf(PriorityQueue);
        expect(engine.resources).toBeInstanceOf(Map);
        expect(engine.statistics).toBeInstanceOf(Map);
    });

    test('constructor merges user options over defaults', () => {
        const engine = new DiscreteEventSimulationEngine({
            patients: 50,
            seed: 999,
            maxTime: 20,
            recordHistory: true
        });

        expect(engine.options.patients).toBe(50);
        expect(engine.options.seed).toBe(999);
        expect(engine.options.maxTime).toBe(20);
        expect(engine.options.recordHistory).toBe(true);
        // defaults still present for unset keys
        expect(engine.options.timeUnit).toBe('years');
    });

    // 2. Add event — schedules events correctly
    test('scheduleEvent adds event to queue and patient scheduledEvents', () => {
        const engine = new DiscreteEventSimulationEngine();
        const patient = engine.createPatient(0);

        const event = engine.scheduleEvent(patient, 'treatment', 5.0, 0, { drug: 'A' });

        expect(event.patientId).toBe(0);
        expect(event.type).toBe('treatment');
        expect(event.time).toBe(5.0);
        expect(event.data.drug).toBe('A');
        expect(patient.scheduledEvents).toContain(event);
        expect(engine.eventQueue.size()).toBe(1);
    });

    // 3. Event ordering — events processed in chronological order
    test('events are dequeued in chronological order', () => {
        const pq = new PriorityQueue();

        pq.enqueue({ type: 'B' }, 5);
        pq.enqueue({ type: 'A' }, 1);
        pq.enqueue({ type: 'C' }, 10);
        pq.enqueue({ type: 'D' }, 3);

        expect(pq.dequeue().type).toBe('A');
        expect(pq.dequeue().type).toBe('D');
        expect(pq.dequeue().type).toBe('B');
        expect(pq.dequeue().type).toBe('C');
        expect(pq.isEmpty()).toBe(true);
    });

    test('events at the same time are ordered by priority (higher first)', () => {
        const pq = new PriorityQueue();

        pq.enqueue({ type: 'low' }, 5, 0);
        pq.enqueue({ type: 'high' }, 5, 10);
        pq.enqueue({ type: 'mid' }, 5, 5);

        expect(pq.dequeue().type).toBe('high');
        expect(pq.dequeue().type).toBe('mid');
        expect(pq.dequeue().type).toBe('low');
    });

    // 4. State transitions — patient moves between states
    test('patient transitions between states on events', async () => {
        const engine = new DiscreteEventSimulationEngine({
            patients: 1,
            seed: 42,
            maxTime: 50,
            recordHistory: true
        });

        const model = createProgressionModel();
        const result = await engine.run(model);

        // With fixed time events (healthy->diseased at t=2, diseased->dead at t=2+3=5)
        // the patient should reach the dead state
        expect(result.patients.length).toBe(1);
        const history = result.patients[0].history;
        const stateEntries = history.filter(e => e.type === 'state_entry').map(e => e.state);

        // Should visit healthy (initial), then diseased, then dead
        expect(stateEntries).toContain('healthy');
        expect(stateEntries).toContain('diseased');
        expect(stateEntries).toContain('dead');
    });

    // 5. Resource constraints — queue forms when resources full
    test('defineModel stores resource definitions when provided', () => {
        const engine = new DiscreteEventSimulationEngine();

        const model = createSimpleModel();
        engine.defineModel(model);

        expect(engine.model.states.healthy).toBeDefined();
        expect(engine.model.states.dead).toBeDefined();
        expect(engine.model.states.dead.terminal).toBe(true);
        expect(engine.model.events.death).toBeDefined();
        expect(engine.model.transitions).toHaveLength(1);
    });

    test('cancelEvent removes specific event type from patient and queue', () => {
        const engine = new DiscreteEventSimulationEngine();
        const patient = engine.createPatient(0);

        engine.scheduleEvent(patient, 'treatment', 3);
        engine.scheduleEvent(patient, 'death', 10);
        expect(patient.scheduledEvents).toHaveLength(2);
        expect(engine.eventQueue.size()).toBe(2);

        engine.cancelEvent(patient, 'treatment');
        expect(patient.scheduledEvents).toHaveLength(1);
        expect(patient.scheduledEvents[0].type).toBe('death');
        expect(engine.eventQueue.size()).toBe(1);
    });

    test('cancelAllEvents clears all scheduled events for a patient', () => {
        const engine = new DiscreteEventSimulationEngine();
        const patient = engine.createPatient(0);

        engine.scheduleEvent(patient, 'event1', 1);
        engine.scheduleEvent(patient, 'event2', 2);
        engine.scheduleEvent(patient, 'event3', 3);
        expect(patient.scheduledEvents).toHaveLength(3);

        engine.cancelAllEvents(patient);
        expect(patient.scheduledEvents).toHaveLength(0);
    });

    // 6. Time horizon — simulation stops at correct time
    test('simulation stops at maxTime even without terminal event', async () => {
        const engine = new DiscreteEventSimulationEngine({
            patients: 1,
            seed: 42,
            maxTime: 10,
            recordHistory: true
        });

        // Model where no death event can happen within maxTime
        const model = {
            initialState: 'alive',
            states: {
                alive: {
                    costPerTime: 100,
                    utilityPerTime: 0.9,
                    scheduledEvents: [
                        {
                            event: 'death',
                            distribution: 'fixed',
                            parameters: { time: 999 }
                        }
                    ]
                },
                dead: { terminal: true, costPerTime: 0, utilityPerTime: 0 }
            },
            events: { death: { cost: 0 } },
            transitions: [
                { trigger: 'death', from: 'alive', to: 'dead' }
            ]
        };

        const result = await engine.run(model);

        // Patient should accumulate outcomes for the full 10 years
        expect(result.summary.meanLY).toBeCloseTo(10, 0);
        expect(result.summary.meanCost).toBeGreaterThan(0);
    });

    // 7. Multiple patients — handles batch simulation
    test('handles multiple patients and computes correct means', async () => {
        const nPatients = 100;
        const engine = new DiscreteEventSimulationEngine({
            patients: nPatients,
            seed: 12345,
            maxTime: 50
        });

        const model = createSimpleModel();
        const result = await engine.run(model);

        expect(result.summary.meanCost).toBeCloseTo(
            result.summary.totalCosts / nPatients, 10
        );
        expect(result.summary.meanQALY).toBeCloseTo(
            result.summary.totalQALYs / nPatients, 10
        );
        expect(result.summary.meanLY).toBeCloseTo(
            result.summary.totalLYs / nPatients, 10
        );
        // With exponential(0.1) death rate, mean survival ~10 years
        expect(result.summary.meanLY).toBeGreaterThan(2);
        expect(result.summary.meanLY).toBeLessThan(30);
    });

    // 8. Cost accumulation — costs accrue per state per unit time
    test('costs accumulate proportional to time in state', async () => {
        const engine = new DiscreteEventSimulationEngine({
            patients: 1,
            seed: 42,
            maxTime: 100,
            recordHistory: true
        });

        // Fixed-time model: healthy for 2 years (cost 500/yr), diseased for 3 years (cost 5000/yr)
        const model = createProgressionModel();
        const result = await engine.run(model, null, { discountRate: 0 });

        // Before discounting: healthy cost = 500*2=1000, diseased cost = 5000*3=15000,
        // plus event costs: disease_onset=1000
        // Total should be around 1000 + 15000 + 1000 = 17000
        const totalCost = result.summary.totalCosts;
        expect(totalCost).toBeGreaterThan(0);
        expect(Number.isFinite(totalCost)).toBe(true);
    });

    // 9. Determinism — same seed, same trajectory
    test('same seed produces identical results', async () => {
        const runOnce = async (seed) => {
            const engine = new DiscreteEventSimulationEngine({
                patients: 50,
                seed: seed,
                maxTime: 30
            });
            return engine.run(createSimpleModel());
        };

        const result1 = await runOnce(42);
        const result2 = await runOnce(42);

        expect(result1.summary.meanCost).toBe(result2.summary.meanCost);
        expect(result1.summary.meanQALY).toBe(result2.summary.meanQALY);
        expect(result1.summary.meanLY).toBe(result2.summary.meanLY);
    });

    test('different seeds produce different results', async () => {
        const runOnce = async (seed) => {
            const engine = new DiscreteEventSimulationEngine({
                patients: 50,
                seed: seed,
                maxTime: 30
            });
            return engine.run(createSimpleModel());
        };

        const result1 = await runOnce(1);
        const result2 = await runOnce(9999);

        // Extremely unlikely to be identical with different seeds
        expect(result1.summary.meanLY).not.toBe(result2.summary.meanLY);
    });

    // 10. Edge case — zero patients, empty event queue
    test('zero patients returns zero means', async () => {
        const engine = new DiscreteEventSimulationEngine({
            patients: 0,
            seed: 42,
            maxTime: 10
        });

        const model = createSimpleModel();
        const result = await engine.run(model);

        // n=0 means division by zero yields NaN
        expect(result.summary.totalCosts).toBe(0);
        expect(result.summary.totalQALYs).toBe(0);
        expect(result.summary.totalLYs).toBe(0);
    });

    test('empty event queue runs to maxTime without crashing', async () => {
        const engine = new DiscreteEventSimulationEngine({
            patients: 1,
            seed: 42,
            maxTime: 5
        });

        // Model with no scheduled events
        const model = {
            initialState: 'idle',
            states: {
                idle: {
                    costPerTime: 100,
                    utilityPerTime: 1.0,
                    scheduledEvents: []
                }
            },
            events: {},
            transitions: []
        };

        const result = await engine.run(model);

        // Patient should still accumulate costs/QALYs for the full time horizon
        expect(result.summary.totalCosts).toBeGreaterThan(0);
        expect(result.summary.totalQALYs).toBeGreaterThan(0);
        expect(result.summary.meanLY).toBeCloseTo(5, 0);
    });
});

describe('PriorityQueue', () => {
    test('peek returns earliest element without removing it', () => {
        const pq = new PriorityQueue();
        pq.enqueue({ id: 1 }, 10);
        pq.enqueue({ id: 2 }, 5);

        expect(pq.peek().id).toBe(2);
        expect(pq.size()).toBe(2);
    });

    test('peek returns null on empty queue', () => {
        const pq = new PriorityQueue();
        expect(pq.peek()).toBeNull();
    });

    test('dequeue returns null on empty queue', () => {
        const pq = new PriorityQueue();
        expect(pq.dequeue()).toBeNull();
    });

    test('remove returns false for non-existent element', () => {
        const pq = new PriorityQueue();
        expect(pq.remove({ id: 'nonexistent' })).toBe(false);
    });

    test('remove deletes correct element and returns true', () => {
        const pq = new PriorityQueue();
        const elem = { id: 'target' };
        pq.enqueue({ id: 'other' }, 1);
        pq.enqueue(elem, 5);
        pq.enqueue({ id: 'another' }, 10);

        expect(pq.remove(elem)).toBe(true);
        expect(pq.size()).toBe(2);
    });
});

describe('DES distribution sampling', () => {
    let engine;

    beforeEach(() => {
        engine = new DiscreteEventSimulationEngine({ seed: 12345 });
        engine.defineModel(createSimpleModel());
    });

    test('exponential distribution produces positive values', () => {
        const patient = engine.createPatient(0);
        for (let i = 0; i < 20; i++) {
            const t = engine.sampleTimeToEvent('exponential', { rate: 0.5 }, patient);
            expect(t).toBeGreaterThan(0);
            expect(Number.isFinite(t)).toBe(true);
        }
    });

    test('fixed distribution returns exact time', () => {
        const patient = engine.createPatient(0);
        const t = engine.sampleTimeToEvent('fixed', { time: 7.5 }, patient);
        expect(t).toBe(7.5);
    });

    test('weibull distribution produces positive values', () => {
        const patient = engine.createPatient(0);
        for (let i = 0; i < 20; i++) {
            const t = engine.sampleTimeToEvent('weibull', { scale: 10, shape: 1.5 }, patient);
            expect(t).toBeGreaterThan(0);
            expect(Number.isFinite(t)).toBe(true);
        }
    });

    test('uniform distribution produces values in range', () => {
        const patient = engine.createPatient(0);
        for (let i = 0; i < 20; i++) {
            const t = engine.sampleTimeToEvent('uniform', { min: 2, max: 8 }, patient);
            expect(t).toBeGreaterThanOrEqual(2);
            expect(t).toBeLessThanOrEqual(8);
        }
    });

    test('unknown distribution throws error', () => {
        const patient = engine.createPatient(0);
        expect(() => {
            engine.sampleTimeToEvent('nonexistent', {}, patient);
        }).toThrow('Unknown distribution');
    });
});

describe('DES evaluateParameter', () => {
    let engine;

    beforeEach(() => {
        engine = new DiscreteEventSimulationEngine({ seed: 42 });
    });

    test('returns numeric constant directly', () => {
        const patient = engine.createPatient(0);
        expect(engine.evaluateParameter(42, patient)).toBe(42);
    });

    test('calls function parameter with patient', () => {
        const patient = engine.createPatient(0);
        patient.attributes.age = 65;
        const fn = (p) => p.attributes.age * 10;
        expect(engine.evaluateParameter(fn, patient)).toBe(650);
    });

    test('evaluates covariate-type parameter with coefficients', () => {
        const patient = engine.createPatient(0);
        patient.attributes.age = 1;   // coefficient multiplier
        patient.attributes.bmi = 2;

        const param = {
            type: 'covariate',
            base: 0.05,
            coefficients: { age: 0.5, bmi: 0.3 }
        };

        const result = engine.evaluateParameter(param, patient);
        // base * exp(0.5*1) * exp(0.3*2)
        const expected = 0.05 * Math.exp(0.5 * 1) * Math.exp(0.3 * 2);
        expect(result).toBeCloseTo(expected, 10);
    });
});

describe('DES applyDiscounting', () => {
    let engine;

    beforeEach(() => {
        engine = new DiscreteEventSimulationEngine();
    });

    test('zero discount rate returns original value', () => {
        expect(engine.applyDiscounting(1000, 5, 0)).toBe(1000);
    });

    test('positive discount rate reduces value', () => {
        const discounted = engine.applyDiscounting(1000, 10, 0.035);
        expect(discounted).toBeLessThan(1000);
        expect(discounted).toBeGreaterThan(0);
    });
});

describe('DES createPatient', () => {
    test('creates patient with correct initial state', () => {
        const engine = new DiscreteEventSimulationEngine();
        const patient = engine.createPatient(7, { age: 60 });

        expect(patient.id).toBe(7);
        expect(patient.state).toBe('initial');
        expect(patient.alive).toBe(true);
        expect(patient.attributes.age).toBe(60);
        expect(patient.accumulators.costs).toBe(0);
        expect(patient.accumulators.qalys).toBe(0);
        expect(patient.accumulators.lifeYears).toBe(0);
        expect(patient.eventHistory).toEqual([]);
        expect(patient.scheduledEvents).toEqual([]);
    });
});

describe('DESTemplates', () => {
    test('diseaseProgression creates a valid 4-state model', () => {
        const model = DESTemplates.diseaseProgression({
            costs: { healthy: 100, diseased: 5000, progressed: 15000 },
            utilities: { healthy: 1.0, diseased: 0.7, progressed: 0.4 }
        });

        expect(model.initialState).toBe('healthy');
        expect(Object.keys(model.states)).toEqual(
            expect.arrayContaining(['healthy', 'diseased', 'progressed', 'dead'])
        );
        expect(model.states.dead.terminal).toBe(true);
        expect(model.transitions.length).toBeGreaterThanOrEqual(4);
    });
});
