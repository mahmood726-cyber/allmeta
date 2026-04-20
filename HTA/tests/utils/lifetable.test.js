/**
 * Tests for src/utils/lifetable.js — LifeTable and MortalityConverter
 */

'use strict';

const { LifeTable, MortalityConverter } = require('../../src/utils/lifetable');

// ---------------------------------------------------------------------------
// LifeTable — constructor
// ---------------------------------------------------------------------------
describe('LifeTable — constructor', () => {
    test('default constructor creates UK 2020 table', () => {
        const lt = new LifeTable();
        expect(lt.country).toBe('UK');
        expect(lt.year).toBe(2020);
    });

    test('tables contain male and female keys', () => {
        const lt = new LifeTable();
        expect(lt.tables.male).toBeDefined();
        expect(lt.tables.female).toBeDefined();
    });

    test('male qx has 100 entries (ages 0-99)', () => {
        const lt = new LifeTable();
        expect(lt.tables.male.qx.length).toBe(100);
    });

    test('female qx has 100 entries (ages 0-99)', () => {
        const lt = new LifeTable();
        expect(lt.tables.female.qx.length).toBe(100);
    });
});

// ---------------------------------------------------------------------------
// LifeTable — getMortality
// ---------------------------------------------------------------------------
describe('LifeTable — getMortality', () => {
    let lt;
    beforeEach(() => {
        lt = new LifeTable();
    });

    test('returns valid probability for age 0 male', () => {
        const qx = lt.getMortality(0, 'male');
        expect(qx).toBeGreaterThan(0);
        expect(qx).toBeLessThan(1);
        expect(qx).toBeCloseTo(0.00389, 5);
    });

    test('returns valid probability for age 0 female', () => {
        const qx = lt.getMortality(0, 'female');
        expect(qx).toBeGreaterThan(0);
        expect(qx).toBeLessThan(1);
        expect(qx).toBeCloseTo(0.00321, 5);
    });

    test('age 60 male approximately 0.01075 (ONS data)', () => {
        const qx = lt.getMortality(60, 'male');
        expect(qx).toBeCloseTo(0.01075, 5);
    });

    test('age 60 female approximately 0.00813 (ONS data)', () => {
        const qx = lt.getMortality(60, 'female');
        expect(qx).toBeCloseTo(0.00813, 5);
    });

    test('male vs female mortality rates differ', () => {
        const maleMort = lt.getMortality(60, 'male');
        const femaleMort = lt.getMortality(60, 'female');
        expect(maleMort).not.toBe(femaleMort);
        // Males generally have higher mortality
        expect(maleMort).toBeGreaterThan(femaleMort);
    });

    test('mortality increases with age (monotonic from ~30 onward)', () => {
        for (let age = 30; age < 95; age++) {
            const q1 = lt.getMortality(age, 'male');
            const q2 = lt.getMortality(age + 1, 'male');
            expect(q2).toBeGreaterThanOrEqual(q1);
        }
    });

    test('age 98 and 99 have qx = 1.0 (certain death)', () => {
        expect(lt.getMortality(98, 'male')).toBe(1.0);
        expect(lt.getMortality(99, 'male')).toBe(1.0);
        expect(lt.getMortality(98, 'female')).toBe(1.0);
        expect(lt.getMortality(99, 'female')).toBe(1.0);
    });

    test('age 100+ returns last entry (clamped at max index)', () => {
        const q100 = lt.getMortality(100, 'male');
        const q150 = lt.getMortality(150, 'male');
        expect(q100).toBe(1.0);
        expect(q150).toBe(1.0);
    });

    test('negative age returns age 0 value (clamped at 0)', () => {
        const qNeg = lt.getMortality(-5, 'male');
        const q0 = lt.getMortality(0, 'male');
        expect(qNeg).toBe(q0);
    });

    test('unknown sex defaults to male', () => {
        const qUnknown = lt.getMortality(60, 'unknown_sex');
        const qMale = lt.getMortality(60, 'male');
        expect(qUnknown).toBe(qMale);
    });

    test('all qx values are in [0, 1]', () => {
        for (let age = 0; age < 100; age++) {
            const qm = lt.getMortality(age, 'male');
            const qf = lt.getMortality(age, 'female');
            expect(qm).toBeGreaterThanOrEqual(0);
            expect(qm).toBeLessThanOrEqual(1);
            expect(qf).toBeGreaterThanOrEqual(0);
            expect(qf).toBeLessThanOrEqual(1);
        }
    });
});

// ---------------------------------------------------------------------------
// LifeTable — getMortalityRate
// ---------------------------------------------------------------------------
describe('LifeTable — getMortalityRate', () => {
    let lt;
    beforeEach(() => {
        lt = new LifeTable();
    });

    test('rate is positive for non-zero qx', () => {
        const rate = lt.getMortalityRate(60, 'male');
        expect(rate).toBeGreaterThan(0);
    });

    test('rate conversion: 1 - exp(-rate) approx equals qx', () => {
        const qx = lt.getMortality(60, 'male');
        const rate = lt.getMortalityRate(60, 'male');
        const backConverted = 1 - Math.exp(-rate);
        expect(backConverted).toBeCloseTo(qx, 10);
    });

    test('rate is higher for older ages', () => {
        const rate50 = lt.getMortalityRate(50, 'male');
        const rate80 = lt.getMortalityRate(80, 'male');
        expect(rate80).toBeGreaterThan(rate50);
    });
});

// ---------------------------------------------------------------------------
// LifeTable — getSurvival
// ---------------------------------------------------------------------------
describe('LifeTable — getSurvival', () => {
    let lt;
    beforeEach(() => {
        lt = new LifeTable();
    });

    test('survival from age a to a is 1', () => {
        expect(lt.getSurvival(60, 60, 'male')).toBe(1);
    });

    test('survival from younger to older is < 1', () => {
        const surv = lt.getSurvival(60, 70, 'male');
        expect(surv).toBeGreaterThan(0);
        expect(surv).toBeLessThan(1);
    });

    test('survival from 0 to 98 is very small', () => {
        const surv = lt.getSurvival(0, 98, 'male');
        expect(surv).toBeLessThan(0.1);
    });

    test('survival decreases as age range increases', () => {
        const s1 = lt.getSurvival(60, 65, 'male');
        const s2 = lt.getSurvival(60, 70, 'male');
        expect(s2).toBeLessThan(s1);
    });
});

// ---------------------------------------------------------------------------
// LifeTable — getLifeExpectancy
// ---------------------------------------------------------------------------
describe('LifeTable — getLifeExpectancy', () => {
    let lt;
    beforeEach(() => {
        lt = new LifeTable();
    });

    test('life expectancy at age 0 male is reasonable (70-85 range)', () => {
        const ex = lt.getLifeExpectancy(0, 'male');
        expect(ex).toBeGreaterThan(70);
        expect(ex).toBeLessThan(85);
    });

    test('life expectancy at age 0 female > male', () => {
        const exM = lt.getLifeExpectancy(0, 'male');
        const exF = lt.getLifeExpectancy(0, 'female');
        expect(exF).toBeGreaterThan(exM);
    });

    test('life expectancy at age 60 is reasonable (15-30 range)', () => {
        const ex = lt.getLifeExpectancy(60, 'male');
        expect(ex).toBeGreaterThan(15);
        expect(ex).toBeLessThan(30);
    });

    test('life expectancy decreases with age', () => {
        const ex40 = lt.getLifeExpectancy(40, 'male');
        const ex60 = lt.getLifeExpectancy(60, 'male');
        expect(ex60).toBeLessThan(ex40);
    });

    test('life expectancy at age 98 is very small (<1)', () => {
        const ex = lt.getLifeExpectancy(98, 'male');
        expect(ex).toBeLessThan(1);
    });
});

// ---------------------------------------------------------------------------
// LifeTable — getAdjustedMortality
// ---------------------------------------------------------------------------
describe('LifeTable — getAdjustedMortality', () => {
    let lt;
    beforeEach(() => {
        lt = new LifeTable();
    });

    test('SMR=1 returns same as getMortality', () => {
        const base = lt.getMortality(60, 'male');
        const adj = lt.getAdjustedMortality(60, 'male', 1.0);
        expect(adj).toBeCloseTo(base, 10);
    });

    test('SMR>1 returns higher mortality', () => {
        const base = lt.getMortality(60, 'male');
        const adj = lt.getAdjustedMortality(60, 'male', 2.0);
        expect(adj).toBeGreaterThan(base);
    });

    test('SMR<1 returns lower mortality', () => {
        const base = lt.getMortality(60, 'male');
        const adj = lt.getAdjustedMortality(60, 'male', 0.5);
        expect(adj).toBeLessThan(base);
    });

    test('adjusted mortality stays in [0,1]', () => {
        const adj = lt.getAdjustedMortality(90, 'male', 5.0);
        expect(adj).toBeGreaterThan(0);
        expect(adj).toBeLessThanOrEqual(1);
    });
});

// ---------------------------------------------------------------------------
// LifeTable — getOtherCauseMortality
// ---------------------------------------------------------------------------
describe('LifeTable — getOtherCauseMortality', () => {
    let lt;
    beforeEach(() => {
        lt = new LifeTable();
    });

    test('subtracting small disease rate reduces mortality', () => {
        const allCause = lt.getMortality(60, 'male');
        const otherCause = lt.getOtherCauseMortality(60, 'male', 0.005);
        expect(otherCause).toBeLessThan(allCause);
        expect(otherCause).toBeGreaterThan(0);
    });

    test('large disease rate clamps other-cause to 0', () => {
        const otherCause = lt.getOtherCauseMortality(60, 'male', 10.0);
        expect(otherCause).toBe(0);
    });
});

// ---------------------------------------------------------------------------
// LifeTable — getInterpolatedMortality
// ---------------------------------------------------------------------------
describe('LifeTable — getInterpolatedMortality', () => {
    let lt;
    beforeEach(() => {
        lt = new LifeTable();
    });

    test('integer age returns exact value', () => {
        const exact = lt.getMortality(60, 'male');
        const interp = lt.getInterpolatedMortality(60, 'male');
        expect(interp).toBe(exact);
    });

    test('fractional age returns value between adjacent ages', () => {
        const q60 = lt.getMortality(60, 'male');
        const q61 = lt.getMortality(61, 'male');
        const interp = lt.getInterpolatedMortality(60.5, 'male');
        expect(interp).toBeGreaterThanOrEqual(Math.min(q60, q61));
        expect(interp).toBeLessThanOrEqual(Math.max(q60, q61));
    });
});

// ---------------------------------------------------------------------------
// LifeTable — getCohorMortalitySequence (sic: matches source spelling)
// ---------------------------------------------------------------------------
describe('LifeTable — getCohorMortalitySequence', () => {
    let lt;
    beforeEach(() => {
        lt = new LifeTable();
    });

    test('returns array of correct length', () => {
        const seq = lt.getCohorMortalitySequence(60, 10, 1, 'male');
        expect(seq).toHaveLength(10);
    });

    test('first element matches getMortality for startAge', () => {
        const seq = lt.getCohorMortalitySequence(60, 5, 1, 'male');
        expect(seq[0]).toBe(lt.getMortality(60, 'male'));
    });

    test('values increase over time (mortality increases with age)', () => {
        const seq = lt.getCohorMortalitySequence(60, 10, 1, 'male');
        for (let i = 0; i < seq.length - 1; i++) {
            expect(seq[i + 1]).toBeGreaterThanOrEqual(seq[i]);
        }
    });

    test('non-annual cycle length converts properly', () => {
        const seq = lt.getCohorMortalitySequence(60, 2, 0.5, 'male');
        expect(seq).toHaveLength(2);
        // Half-year probability should be less than annual
        const annualQ = lt.getMortality(60, 'male');
        expect(seq[0]).toBeLessThan(annualQ);
        expect(seq[0]).toBeGreaterThan(0);
    });
});

// ---------------------------------------------------------------------------
// LifeTable — getMixedMortality
// ---------------------------------------------------------------------------
describe('LifeTable — getMixedMortality', () => {
    let lt;
    beforeEach(() => {
        lt = new LifeTable();
    });

    test('proportionMale=1 returns male mortality', () => {
        const mixed = lt.getMixedMortality(60, 1.0);
        const male = lt.getMortality(60, 'male');
        expect(mixed).toBeCloseTo(male, 10);
    });

    test('proportionMale=0 returns female mortality', () => {
        const mixed = lt.getMixedMortality(60, 0.0);
        const female = lt.getMortality(60, 'female');
        expect(mixed).toBeCloseTo(female, 10);
    });

    test('proportionMale=0.5 returns average', () => {
        const male = lt.getMortality(60, 'male');
        const female = lt.getMortality(60, 'female');
        const mixed = lt.getMixedMortality(60, 0.5);
        expect(mixed).toBeCloseTo((male + female) / 2, 10);
    });
});

// ---------------------------------------------------------------------------
// LifeTable — exportTable
// ---------------------------------------------------------------------------
describe('LifeTable — exportTable', () => {
    let lt;
    beforeEach(() => {
        lt = new LifeTable();
    });

    test('returns structured object with metadata', () => {
        const exported = lt.exportTable('male');
        expect(exported.country).toBe('UK');
        expect(exported.year).toBe(2020);
        expect(exported.sex).toBe('male');
        expect(Array.isArray(exported.data)).toBe(true);
    });

    test('data has entries for each age', () => {
        const exported = lt.exportTable('male');
        expect(exported.data.length).toBe(100);
    });

    test('each data entry has age, qx, px, ex', () => {
        const exported = lt.exportTable('female');
        const entry = exported.data[60];
        expect(entry.age).toBe(60);
        expect(typeof entry.qx).toBe('number');
        expect(typeof entry.px).toBe('number');
        expect(typeof entry.ex).toBe('number');
        expect(entry.px).toBeCloseTo(1 - entry.qx, 10);
    });
});

// ---------------------------------------------------------------------------
// MortalityConverter — static methods
// ---------------------------------------------------------------------------
describe('MortalityConverter', () => {
    test('rateToProbability: rate 0 gives probability 0', () => {
        expect(MortalityConverter.rateToProbability(0)).toBe(0);
    });

    test('rateToProbability: positive rate gives probability in (0,1)', () => {
        const prob = MortalityConverter.rateToProbability(0.1);
        expect(prob).toBeGreaterThan(0);
        expect(prob).toBeLessThan(1);
    });

    test('rateToProbability: high rate approaches 1', () => {
        const prob = MortalityConverter.rateToProbability(100);
        expect(prob).toBeCloseTo(1, 5);
    });

    test('probabilityToRate: prob 0 gives rate 0', () => {
        expect(MortalityConverter.probabilityToRate(0)).toBe(0);
    });

    test('probabilityToRate: prob 1 gives Infinity', () => {
        expect(MortalityConverter.probabilityToRate(1)).toBe(Infinity);
    });

    test('probabilityToRate: valid prob gives positive rate', () => {
        const rate = MortalityConverter.probabilityToRate(0.1);
        expect(rate).toBeGreaterThan(0);
    });

    test('round-trip: rate -> prob -> rate', () => {
        const originalRate = 0.05;
        const prob = MortalityConverter.rateToProbability(originalRate);
        const backRate = MortalityConverter.probabilityToRate(prob);
        expect(backRate).toBeCloseTo(originalRate, 10);
    });

    test('convertProbability: annual to half-year', () => {
        const annual = 0.1;
        const halfYear = MortalityConverter.convertProbability(annual, 0.5);
        expect(halfYear).toBeGreaterThan(0);
        expect(halfYear).toBeLessThan(annual);
    });

    test('convertProbability: annual to 2-year', () => {
        const annual = 0.1;
        const twoYear = MortalityConverter.convertProbability(annual, 2);
        expect(twoYear).toBeGreaterThan(annual);
        expect(twoYear).toBeLessThan(1);
    });

    test('convertProbability: cycleLength=1 returns same probability', () => {
        const annual = 0.1;
        const same = MortalityConverter.convertProbability(annual, 1);
        expect(same).toBeCloseTo(annual, 10);
    });

    test('combineProbabilities: two independent risks', () => {
        const combined = MortalityConverter.combineProbabilities(0.1, 0.2);
        // P(A or B) = 1 - (1-0.1)(1-0.2) = 1 - 0.72 = 0.28
        expect(combined).toBeCloseTo(0.28, 10);
    });

    test('combineProbabilities: one risk is 0', () => {
        const combined = MortalityConverter.combineProbabilities(0.1, 0);
        expect(combined).toBeCloseTo(0.1, 10);
    });

    test('combineProbabilities: both risks are 1', () => {
        const combined = MortalityConverter.combineProbabilities(1, 1);
        expect(combined).toBeCloseTo(1, 10);
    });
});
