/**
 * Tests for src/engine/countryProfiles.js — Multi-Country HTA Economic Profiles Library
 */

'use strict';

const { CountryProfileLibrary, COUNTRY_PROFILES, CURRENCY_RATES_TO_USD, REGION_MAP } =
    require('../../src/engine/countryProfiles');

// ============ HELPERS ============

function makeLib() {
    return new CountryProfileLibrary();
}

// ============ TESTS ============

describe('CountryProfileLibrary', () => {
    let lib;

    beforeEach(() => {
        lib = makeLib();
    });

    // ------------------------------------------------------------------
    // 1. Basic construction and library size
    // ------------------------------------------------------------------
    test('1. Library contains 22 country profiles', () => {
        expect(lib.countryCount).toBe(22);
    });

    // ------------------------------------------------------------------
    // 2. getProfile returns valid structure for each country
    // ------------------------------------------------------------------
    test('2. getProfile returns valid structure for all 22 countries', () => {
        const codes = lib.getValidCodes();
        expect(codes.length).toBe(22);
        const requiredFields = ['name', 'agency', 'currency', 'region',
            'discountRateCosts', 'discountRateOutcomes', 'perspective', 'source'];

        for (const code of codes) {
            const p = lib.getProfile(code);
            for (const field of requiredFields) {
                expect(p[field]).toBeDefined();
            }
            expect(typeof p.name).toBe('string');
            expect(typeof p.agency).toBe('string');
            expect(typeof p.discountRateCosts).toBe('number');
            expect(typeof p.discountRateOutcomes).toBe('number');
        }
    });

    // ------------------------------------------------------------------
    // 3. UK: WTP = 30000, discount = 0.035
    // ------------------------------------------------------------------
    test('3. UK: WTP = 30000, discount rates = 0.035', () => {
        const p = lib.getProfile('uk');
        expect(p.wtpPerQaly).toBe(30000);
        expect(p.discountRateCosts).toBe(0.035);
        expect(p.discountRateOutcomes).toBe(0.035);
        expect(p.agency).toBe('NICE');
        expect(p.currency).toBe('GBP');
    });

    // ------------------------------------------------------------------
    // 4. Canada: WTP = 50000, discount = 0.015
    // ------------------------------------------------------------------
    test('4. Canada: WTP = 50000, discount rates = 0.015', () => {
        const p = lib.getProfile('canada');
        expect(p.wtpPerQaly).toBe(50000);
        expect(p.discountRateCosts).toBe(0.015);
        expect(p.discountRateOutcomes).toBe(0.015);
        expect(p.agency).toBe('CADTH');
        expect(p.currency).toBe('CAD');
    });

    // ------------------------------------------------------------------
    // 5. Germany: WTP is null (efficiency frontier)
    // ------------------------------------------------------------------
    test('5. Germany: WTP is null — uses efficiency frontier', () => {
        const p = lib.getProfile('germany');
        expect(p.wtpPerQaly).toBeNull();
        expect(p.wtpMethod).toBe('Efficiency frontier analysis');
    });

    // ------------------------------------------------------------------
    // 6. Netherlands: severity-adjusted WTP works
    // ------------------------------------------------------------------
    test('6. Netherlands: severity-adjusted WTP returns correct values', () => {
        const low = lib.getSeverityAdjustedWTP('netherlands', 'low');
        expect(low.wtp).toBe(20000);
        expect(low.severity).toBe('low');
        expect(low.method).toContain('Severity-weighted');

        const med = lib.getSeverityAdjustedWTP('netherlands', 'medium');
        expect(med.wtp).toBe(50000);

        const high = lib.getSeverityAdjustedWTP('netherlands', 'high');
        expect(high.wtp).toBe(80000);
    });

    // ------------------------------------------------------------------
    // 7. listCountries returns 22+ entries
    // ------------------------------------------------------------------
    test('7. listCountries returns 22 entries sorted by name', () => {
        const list = lib.listCountries();
        expect(list.length).toBe(22);
        // Verify sorted
        for (let i = 1; i < list.length; i++) {
            expect(list[i].name.localeCompare(list[i - 1].name)).toBeGreaterThanOrEqual(0);
        }
        // Each entry has code, name, agency, currency, region
        for (const item of list) {
            expect(item.code).toBeDefined();
            expect(item.name).toBeDefined();
            expect(item.agency).toBeDefined();
            expect(item.currency).toBeDefined();
            expect(item.region).toBeDefined();
        }
    });

    // ------------------------------------------------------------------
    // 8. getRegion('europe') returns correct subset
    // ------------------------------------------------------------------
    test('8. getRegion("europe") returns 10 European countries', () => {
        const europe = lib.getRegion('europe');
        expect(europe.length).toBe(10);
        const names = europe.map(c => c.name);
        expect(names).toContain('United Kingdom');
        expect(names).toContain('Germany');
        expect(names).toContain('France');
        expect(names).toContain('Netherlands');
        expect(names).toContain('Sweden');
        expect(names).toContain('Poland');
        expect(names).toContain('Norway');
    });

    // ------------------------------------------------------------------
    // 9. getRegion('asia') returns Asia-Pacific countries
    // ------------------------------------------------------------------
    test('9. getRegion("asia") returns 6 Asia-Pacific countries', () => {
        const asia = lib.getRegion('asia');
        expect(asia.length).toBe(6);
        const names = asia.map(c => c.name);
        expect(names).toContain('Japan');
        expect(names).toContain('Australia');
        expect(names).toContain('Thailand');
    });

    // ------------------------------------------------------------------
    // 10. getRegion('americas') returns Americas countries
    // ------------------------------------------------------------------
    test('10. getRegion("americas") returns 4 Americas countries', () => {
        const americas = lib.getRegion('americas');
        expect(americas.length).toBe(4);
        const names = americas.map(c => c.name);
        expect(names).toContain('United States');
        expect(names).toContain('Canada');
        expect(names).toContain('Brazil');
        expect(names).toContain('Colombia');
    });

    // ------------------------------------------------------------------
    // 11. applyProfile overwrites discount rates in config
    // ------------------------------------------------------------------
    test('11. applyProfile overwrites discount rates in model config', () => {
        const config = {
            discountRateCosts: 0.05,
            discountRateOutcomes: 0.05,
            cycles: 40,
            states: ['Healthy', 'Sick', 'Dead']
        };
        const result = lib.applyProfile('uk', config);
        expect(result.discountRateCosts).toBe(0.035);
        expect(result.discountRateOutcomes).toBe(0.035);
        expect(result.currency).toBe('GBP');
        expect(result.countryCode).toBe('uk');
        expect(result.countryName).toBe('United Kingdom');
    });

    // ------------------------------------------------------------------
    // 12. applyProfile preserves non-country fields
    // ------------------------------------------------------------------
    test('12. applyProfile preserves non-country fields', () => {
        const config = {
            cycles: 40,
            states: ['Healthy', 'Sick', 'Dead'],
            myCustomField: 'keepMe'
        };
        const result = lib.applyProfile('canada', config);
        expect(result.cycles).toBe(40);
        expect(result.states).toEqual(['Healthy', 'Sick', 'Dead']);
        expect(result.myCustomField).toBe('keepMe');
        expect(result.discountRateCosts).toBe(0.015);
    });

    // ------------------------------------------------------------------
    // 13. compareCountries produces a valid comparison table
    // ------------------------------------------------------------------
    test('13. compareCountries produces table for UK, USA, Japan', () => {
        const table = lib.compareCountries(['uk', 'usa', 'japan'], 'all');
        expect(table).toHaveLength(3);
        expect(table[0].code).toBe('uk');
        expect(table[0].wtpPerQaly).toBe(30000);
        expect(table[1].code).toBe('usa');
        expect(table[1].wtpPerQaly).toBe(150000);
        expect(table[2].code).toBe('japan');
        expect(table[2].wtpPerQaly).toBe(5000000);
    });

    // ------------------------------------------------------------------
    // 14. compareCountries with 'wtp' metric
    // ------------------------------------------------------------------
    test('14. compareCountries with wtp metric includes WTP but not discountRates', () => {
        const table = lib.compareCountries(['uk', 'germany'], 'wtp');
        expect(table[0].wtpPerQaly).toBe(30000);
        expect(table[1].wtpPerQaly).toBeNull();
        expect(table[1].wtpMethod).toBe('Efficiency frontier analysis');
        // Should not include discount rates for wtp-only metric
        expect(table[0].discountRateCosts).toBeUndefined();
    });

    // ------------------------------------------------------------------
    // 15. getCurrencyConversion approximate rates
    // ------------------------------------------------------------------
    test('15. getCurrencyConversion GBP to USD returns reasonable result', () => {
        const result = lib.getCurrencyConversion('GBP', 'USD', 1000);
        expect(result.converted).toBeGreaterThan(1100);
        expect(result.converted).toBeLessThan(1500);
        expect(result.from).toBe('GBP');
        expect(result.to).toBe('USD');
        expect(typeof result.rate).toBe('number');
        expect(result.warning).toContain('Approximate');
    });

    // ------------------------------------------------------------------
    // 16. getCurrencyConversion same currency returns same amount
    // ------------------------------------------------------------------
    test('16. getCurrencyConversion same currency returns same amount', () => {
        const result = lib.getCurrencyConversion('EUR', 'EUR', 5000);
        expect(result.converted).toBe(5000);
        expect(result.rate).toBe(1);
    });

    // ------------------------------------------------------------------
    // 17. Unknown country throws helpful error
    // ------------------------------------------------------------------
    test('17. Unknown country code throws with valid codes listed', () => {
        expect(() => lib.getProfile('narnia')).toThrow('Unknown country code "narnia"');
        expect(() => lib.getProfile('narnia')).toThrow('Valid codes:');
    });

    // ------------------------------------------------------------------
    // 18. Empty country code throws
    // ------------------------------------------------------------------
    test('18. Empty string country code throws', () => {
        expect(() => lib.getProfile('')).toThrow('non-empty string');
    });

    // ------------------------------------------------------------------
    // 19. All countries have required fields
    // ------------------------------------------------------------------
    test('19. All countries have required fields (name, agency, currency, discountRates)', () => {
        const codes = lib.getValidCodes();
        for (const code of codes) {
            const p = lib.getProfile(code);
            expect(p.name).toBeTruthy();
            expect(p.agency).toBeTruthy();
            expect(p.currency).toBeTruthy();
            expect(p.discountRateCosts).toBeGreaterThanOrEqual(0);
            expect(p.discountRateOutcomes).toBeGreaterThanOrEqual(0);
            expect(p.perspective).toBeTruthy();
            expect(p.source).toBeTruthy();
        }
    });

    // ------------------------------------------------------------------
    // 20. France declining discount rate after year 30
    // ------------------------------------------------------------------
    test('20. France has declining discount rate after year 30', () => {
        const p = lib.getProfile('france');
        expect(p.discountRateCosts).toBe(0.04);
        expect(p.discountRateOutcomes).toBe(0.04);
        expect(p.discountRateAfterYear30).toBe(0.02);

        const rates = lib.getDiscountRates('france');
        expect(rates.costs).toBe(0.04);
        expect(rates.outcomes).toBe(0.04);
        expect(rates.afterYear30).toBe(0.02);
    });

    // ------------------------------------------------------------------
    // 21. UK end-of-life WTP = 50000
    // ------------------------------------------------------------------
    test('21. UK end-of-life WTP = 50000', () => {
        const wtp = lib.getWTP('uk');
        expect(wtp.endOfLife).toBe(50000);
        expect(wtp.value).toBe(30000);
        expect(wtp.range).toEqual([20000, 30000]);
    });

    // ------------------------------------------------------------------
    // 22. getWTP returns warning for countries without fixed WTP
    // ------------------------------------------------------------------
    test('22. getWTP returns warning for Germany (no fixed WTP)', () => {
        const wtp = lib.getWTP('germany');
        expect(wtp.value).toBeNull();
        expect(wtp.hasFixedThreshold).toBe(false);
        expect(wtp.warning).toContain('does not use a fixed WTP');
        expect(wtp.method).toBe('Efficiency frontier analysis');
    });

    // ------------------------------------------------------------------
    // 23. getWTP returns warning for India (no fixed WTP)
    // ------------------------------------------------------------------
    test('23. getWTP returns warning for India (GDP-based approach)', () => {
        const wtp = lib.getWTP('india');
        expect(wtp.value).toBeNull();
        expect(wtp.hasFixedThreshold).toBe(false);
        expect(wtp.warning).toContain('India');
        expect(wtp.method).toContain('GDP per capita');
    });

    // ------------------------------------------------------------------
    // 24. getProfile returns deep copy (mutation safety)
    // ------------------------------------------------------------------
    test('24. getProfile returns deep copy — mutation does not affect library', () => {
        const p1 = lib.getProfile('uk');
        p1.wtpPerQaly = 999999;
        p1.name = 'MUTATED';

        const p2 = lib.getProfile('uk');
        expect(p2.wtpPerQaly).toBe(30000);
        expect(p2.name).toBe('United Kingdom');
    });

    // ------------------------------------------------------------------
    // 25. USA specific values
    // ------------------------------------------------------------------
    test('25. USA: ICER, WTP 150000, USD, 3% discount', () => {
        const p = lib.getProfile('usa');
        expect(p.agency).toBe('ICER');
        expect(p.wtpPerQaly).toBe(150000);
        expect(p.wtpRange).toEqual([100000, 150000]);
        expect(p.currency).toBe('USD');
        expect(p.discountRateCosts).toBe(0.03);
        expect(p.discountRateOutcomes).toBe(0.03);
    });

    // ------------------------------------------------------------------
    // 26. Australia specific values
    // ------------------------------------------------------------------
    test('26. Australia: PBAC, WTP 50000, AUD, 5% discount', () => {
        const p = lib.getProfile('australia');
        expect(p.agency).toBe('PBAC');
        expect(p.wtpPerQaly).toBe(50000);
        expect(p.wtpRange).toEqual([45000, 75000]);
        expect(p.discountRateCosts).toBe(0.05);
        expect(p.discountRateOutcomes).toBe(0.05);
    });

    // ------------------------------------------------------------------
    // 27. Japan specific values
    // ------------------------------------------------------------------
    test('27. Japan: CIHSR, WTP 5000000 JPY, 2% discount', () => {
        const p = lib.getProfile('japan');
        expect(p.agency).toBe('CIHSR');
        expect(p.wtpPerQaly).toBe(5000000);
        expect(p.currency).toBe('JPY');
        expect(p.discountRateCosts).toBe(0.02);
    });

    // ------------------------------------------------------------------
    // 28. Netherlands differential discounting (costs 4%, outcomes 1.5%)
    // ------------------------------------------------------------------
    test('28. Netherlands: differential discounting (costs 4%, outcomes 1.5%)', () => {
        const rates = lib.getDiscountRates('netherlands');
        expect(rates.costs).toBe(0.04);
        expect(rates.outcomes).toBe(0.015);
    });

    // ------------------------------------------------------------------
    // 29. Oman profile
    // ------------------------------------------------------------------
    test('29. Oman: MOH, WTP 13000 OMR, 3% discount', () => {
        const p = lib.getProfile('oman');
        expect(p.agency).toBe('MOH');
        expect(p.wtpPerQaly).toBe(13000);
        expect(p.currency).toBe('OMR');
        expect(p.discountRateCosts).toBe(0.03);
    });

    // ------------------------------------------------------------------
    // 30. getRegion invalid region throws
    // ------------------------------------------------------------------
    test('30. getRegion with invalid region throws', () => {
        expect(() => lib.getRegion('antarctica')).toThrow('Unknown region');
        expect(() => lib.getRegion('antarctica')).toThrow('Valid regions:');
    });

    // ------------------------------------------------------------------
    // 31. compareCountries with empty array throws
    // ------------------------------------------------------------------
    test('31. compareCountries with empty array throws', () => {
        expect(() => lib.compareCountries([])).toThrow('non-empty array');
    });

    // ------------------------------------------------------------------
    // 32. compareCountries with invalid metric throws
    // ------------------------------------------------------------------
    test('32. compareCountries with invalid metric throws', () => {
        expect(() => lib.compareCountries(['uk'], 'invalid')).toThrow('Unknown metric');
    });

    // ------------------------------------------------------------------
    // 33. getCurrencyConversion with invalid currency throws
    // ------------------------------------------------------------------
    test('33. getCurrencyConversion with unsupported currency throws', () => {
        expect(() => lib.getCurrencyConversion('XYZ', 'USD', 100)).toThrow('Unsupported currency');
    });

    // ------------------------------------------------------------------
    // 34. getCurrencyConversion with non-numeric amount throws
    // ------------------------------------------------------------------
    test('34. getCurrencyConversion with NaN amount throws', () => {
        expect(() => lib.getCurrencyConversion('GBP', 'USD', NaN)).toThrow('finite number');
    });

    // ------------------------------------------------------------------
    // 35. getSeverityAdjustedWTP with invalid severity throws
    // ------------------------------------------------------------------
    test('35. getSeverityAdjustedWTP with invalid severity throws', () => {
        expect(() => lib.getSeverityAdjustedWTP('uk', 'extreme')).toThrow('Unknown severity');
    });

    // ------------------------------------------------------------------
    // 36. getSeverityAdjustedWTP for non-severity country returns standard WTP
    // ------------------------------------------------------------------
    test('36. getSeverityAdjustedWTP for UK returns fixed WTP regardless of severity', () => {
        const low = lib.getSeverityAdjustedWTP('uk', 'low');
        const high = lib.getSeverityAdjustedWTP('uk', 'high');
        expect(low.wtp).toBe(30000);
        expect(high.wtp).toBe(30000);
        expect(low.method).toContain('Fixed threshold');
    });

    // ------------------------------------------------------------------
    // 37. Norway severity-adjusted WTP
    // ------------------------------------------------------------------
    test('37. Norway: severity-adjusted WTP works', () => {
        const low = lib.getSeverityAdjustedWTP('norway', 'low');
        expect(low.wtp).toBe(275000);

        const high = lib.getSeverityAdjustedWTP('norway', 'high');
        expect(high.wtp).toBe(825000);
    });

    // ------------------------------------------------------------------
    // 38. applyProfile to null/empty config creates valid result
    // ------------------------------------------------------------------
    test('38. applyProfile with null config creates valid result', () => {
        const result = lib.applyProfile('usa', null);
        expect(result.countryCode).toBe('usa');
        expect(result.discountRateCosts).toBe(0.03);
        expect(result.currency).toBe('USD');
        expect(result.wtpPerQaly).toBe(150000);
    });

    // ------------------------------------------------------------------
    // 39. All currency codes in profiles are in conversion table
    // ------------------------------------------------------------------
    test('39. All currencies used in profiles exist in conversion rate table', () => {
        const codes = lib.getValidCodes();
        for (const code of codes) {
            const p = lib.getProfile(code);
            expect(CURRENCY_RATES_TO_USD[p.currency]).toBeDefined();
            expect(typeof CURRENCY_RATES_TO_USD[p.currency]).toBe('number');
        }
    });

    // ------------------------------------------------------------------
    // 40. Region map covers all profiles
    // ------------------------------------------------------------------
    test('40. Every profile code appears in exactly one region', () => {
        const allRegionCodes = [];
        for (const region of Object.values(REGION_MAP)) {
            allRegionCodes.push(...region);
        }
        const codes = lib.getValidCodes();
        for (const code of codes) {
            const count = allRegionCodes.filter(c => c === code).length;
            expect(count).toBe(1);
        }
        expect(allRegionCodes.length).toBe(codes.length);
    });

    // ------------------------------------------------------------------
    // 41. Case-insensitive country code lookup
    // ------------------------------------------------------------------
    test('41. Country code lookup is case-insensitive', () => {
        const p1 = lib.getProfile('UK');
        const p2 = lib.getProfile('uk');
        const p3 = lib.getProfile('Uk');
        expect(p1.name).toBe('United Kingdom');
        expect(p2.name).toBe('United Kingdom');
        expect(p3.name).toBe('United Kingdom');
    });

    // ------------------------------------------------------------------
    // 42. South Korea specific values
    // ------------------------------------------------------------------
    test('42. South Korea: HIRA, WTP 30000000 KRW, 5% discount', () => {
        const p = lib.getProfile('southkorea');
        expect(p.agency).toBe('HIRA');
        expect(p.wtpPerQaly).toBe(30000000);
        expect(p.currency).toBe('KRW');
        expect(p.discountRateCosts).toBe(0.05);
    });

    // ------------------------------------------------------------------
    // 43. getDiscountRates for countries without special rates
    // ------------------------------------------------------------------
    test('43. getDiscountRates for USA returns 3%/3% with no afterYear30', () => {
        const rates = lib.getDiscountRates('usa');
        expect(rates.costs).toBe(0.03);
        expect(rates.outcomes).toBe(0.03);
        expect(rates.afterYear30).toBeUndefined();
    });

    // ------------------------------------------------------------------
    // 44. applyProfile applies end-of-life WTP for UK
    // ------------------------------------------------------------------
    test('44. applyProfile for UK includes wtpEndOfLife', () => {
        const result = lib.applyProfile('uk', {});
        expect(result.wtpEndOfLife).toBe(50000);
        expect(result.wtpPerQaly).toBe(30000);
        expect(result.halfCycleCorrection).toBe(true);
    });

    // ------------------------------------------------------------------
    // 45. applyProfile for France includes discountRateAfterYear30
    // ------------------------------------------------------------------
    test('45. applyProfile for France includes discountRateAfterYear30', () => {
        const result = lib.applyProfile('france', { cycles: 50 });
        expect(result.discountRateAfterYear30).toBe(0.02);
        expect(result.discountRateCosts).toBe(0.04);
        expect(result.cycles).toBe(50);
    });
});
