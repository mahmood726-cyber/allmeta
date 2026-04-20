/**
 * Multi-Country HTA Economic Profiles Library
 *
 * Comprehensive library of 20+ countries with HTA-relevant economic parameters,
 * sourced from official national guidelines and published WTP studies.
 *
 * Features:
 * - Country-specific WTP thresholds, discount rates, and perspectives
 * - Severity-adjusted WTP (Netherlands proportional model)
 * - Region-based filtering (Europe, Asia-Pacific, Americas, MENA)
 * - Approximate currency conversion (hardcoded 2025 mid-market rates)
 * - Profile application to model configs
 * - Multi-country comparison tables
 */

'use strict';

// ============ COUNTRY PROFILES ============

const COUNTRY_PROFILES = {
    // --- Europe ---
    uk: {
        name: 'United Kingdom',
        agency: 'NICE',
        currency: 'GBP',
        region: 'europe',
        wtpPerQaly: 30000,
        wtpRange: [20000, 30000],
        wtpEndOfLife: 50000,
        discountRateCosts: 0.035,
        discountRateOutcomes: 0.035,
        perspective: 'NHS and PSS',
        timeHorizon: 'Lifetime preferred',
        halfCycleCorrection: true,
        source: 'NICE Methods Guide 2022 (PMG36)'
    },
    germany: {
        name: 'Germany',
        agency: 'IQWiG/G-BA',
        currency: 'EUR',
        region: 'europe',
        wtpPerQaly: null,
        wtpMethod: 'Efficiency frontier analysis',
        discountRateCosts: 0.03,
        discountRateOutcomes: 0.03,
        perspective: 'Statutory Health Insurance (GKV)',
        timeHorizon: 'Model-dependent',
        halfCycleCorrection: true,
        source: 'IQWiG Methods 6.1 (2022)'
    },
    france: {
        name: 'France',
        agency: 'HAS',
        currency: 'EUR',
        region: 'europe',
        wtpPerQaly: null,
        wtpMethod: 'ASMR clinical added value rating (I-V)',
        discountRateCosts: 0.04,
        discountRateOutcomes: 0.04,
        discountRateAfterYear30: 0.02,
        perspective: 'Collective (healthcare payer)',
        timeHorizon: 'Sufficient for disease course',
        halfCycleCorrection: true,
        source: 'HAS Economic Evaluation Guidelines 2020'
    },
    netherlands: {
        name: 'Netherlands',
        agency: 'ZIN',
        currency: 'EUR',
        region: 'europe',
        wtpPerQaly: 80000,
        wtpBySeverity: { low: 20000, medium: 50000, high: 80000 },
        discountRateCosts: 0.04,
        discountRateOutcomes: 0.015,
        perspective: 'Societal',
        timeHorizon: 'Lifetime preferred',
        halfCycleCorrection: true,
        source: 'ZIN Guideline for Economic Evaluations 2016'
    },
    sweden: {
        name: 'Sweden',
        agency: 'TLV',
        currency: 'SEK',
        region: 'europe',
        wtpPerQaly: 500000,
        discountRateCosts: 0.03,
        discountRateOutcomes: 0.03,
        perspective: 'Societal',
        timeHorizon: 'Lifetime preferred',
        halfCycleCorrection: true,
        source: 'TLV General Guidelines 2017'
    },
    italy: {
        name: 'Italy',
        agency: 'AIFA',
        currency: 'EUR',
        region: 'europe',
        wtpPerQaly: 40000,
        wtpRange: [25000, 60000],
        discountRateCosts: 0.03,
        discountRateOutcomes: 0.03,
        perspective: 'National Health Service (SSN)',
        timeHorizon: 'Lifetime preferred',
        halfCycleCorrection: true,
        source: 'AIFA Guidelines for Economic Evaluations 2021'
    },
    spain: {
        name: 'Spain',
        agency: 'AEMPs',
        currency: 'EUR',
        region: 'europe',
        wtpPerQaly: 25000,
        wtpRange: [20000, 30000],
        discountRateCosts: 0.03,
        discountRateOutcomes: 0.03,
        perspective: 'National Health System',
        timeHorizon: 'Lifetime preferred',
        halfCycleCorrection: true,
        source: 'Lopez-Bastida et al. 2010'
    },
    ireland: {
        name: 'Ireland',
        agency: 'NCPE',
        currency: 'EUR',
        region: 'europe',
        wtpPerQaly: 45000,
        wtpRange: [20000, 45000],
        discountRateCosts: 0.04,
        discountRateOutcomes: 0.04,
        perspective: 'HSE (health service payer)',
        timeHorizon: 'Lifetime preferred',
        halfCycleCorrection: true,
        source: 'NCPE Guidelines 2020'
    },
    poland: {
        name: 'Poland',
        agency: 'AOTMiT',
        currency: 'PLN',
        region: 'europe',
        wtpPerQaly: 150246,
        wtpMethod: '3x GDP per capita',
        discountRateCosts: 0.05,
        discountRateOutcomes: 0.035,
        perspective: 'Public payer (NFZ)',
        timeHorizon: 'Lifetime preferred',
        halfCycleCorrection: true,
        source: 'AOTMiT HTA Guidelines 2016'
    },
    norway: {
        name: 'Norway',
        agency: 'NoMA',
        currency: 'NOK',
        region: 'europe',
        wtpPerQaly: 500000,
        wtpBySeverity: { low: 275000, medium: 500000, high: 825000 },
        discountRateCosts: 0.04,
        discountRateOutcomes: 0.04,
        perspective: 'Healthcare sector',
        timeHorizon: 'Lifetime preferred',
        halfCycleCorrection: true,
        source: 'Norwegian Guidelines for Health Economic Evaluations 2020'
    },

    // --- Asia-Pacific ---
    japan: {
        name: 'Japan',
        agency: 'CIHSR',
        currency: 'JPY',
        region: 'asia',
        wtpPerQaly: 5000000,
        discountRateCosts: 0.02,
        discountRateOutcomes: 0.02,
        perspective: 'Public healthcare payer',
        timeHorizon: 'Lifetime preferred',
        halfCycleCorrection: true,
        source: 'Shiroiwa et al. 2017'
    },
    southkorea: {
        name: 'South Korea',
        agency: 'HIRA',
        currency: 'KRW',
        region: 'asia',
        wtpPerQaly: 30000000,
        discountRateCosts: 0.05,
        discountRateOutcomes: 0.05,
        perspective: 'National Health Insurance',
        timeHorizon: 'Lifetime preferred',
        halfCycleCorrection: true,
        source: 'HIRA Guidelines 2021'
    },
    china: {
        name: 'China',
        agency: 'NHSA',
        currency: 'CNY',
        region: 'asia',
        wtpPerQaly: 212676,
        wtpMethod: '1-3x GDP per capita (WHO-CHOICE)',
        discountRateCosts: 0.05,
        discountRateOutcomes: 0.05,
        perspective: 'Healthcare system',
        timeHorizon: 'Lifetime or disease-appropriate',
        halfCycleCorrection: true,
        source: 'China Guidelines for PharmacoEconomic Evaluation 2020'
    },
    thailand: {
        name: 'Thailand',
        agency: 'HITAP',
        currency: 'THB',
        region: 'asia',
        wtpPerQaly: 160000,
        discountRateCosts: 0.03,
        discountRateOutcomes: 0.03,
        perspective: 'Societal',
        timeHorizon: 'Lifetime preferred',
        halfCycleCorrection: true,
        source: 'HITAP Methods Guide 2014'
    },
    india: {
        name: 'India',
        agency: 'DHR',
        currency: 'INR',
        region: 'asia',
        wtpPerQaly: null,
        wtpMethod: '1-3x GDP per capita (WHO-CHOICE)',
        discountRateCosts: 0.03,
        discountRateOutcomes: 0.03,
        perspective: 'Healthcare system',
        timeHorizon: 'Lifetime or disease-appropriate',
        halfCycleCorrection: true,
        source: 'Indian Reference Case 2019'
    },
    australia: {
        name: 'Australia',
        agency: 'PBAC',
        currency: 'AUD',
        region: 'asia',
        wtpPerQaly: 50000,
        wtpRange: [45000, 75000],
        discountRateCosts: 0.05,
        discountRateOutcomes: 0.05,
        perspective: 'Healthcare system (PBS/MBS)',
        timeHorizon: 'Lifetime or appropriate for condition',
        halfCycleCorrection: true,
        source: 'PBAC Guidelines Section 3A 2016'
    },

    // --- Americas ---
    usa: {
        name: 'United States',
        agency: 'ICER',
        currency: 'USD',
        region: 'americas',
        wtpPerQaly: 150000,
        wtpRange: [100000, 150000],
        discountRateCosts: 0.03,
        discountRateOutcomes: 0.03,
        perspective: 'Healthcare sector',
        timeHorizon: 'Lifetime preferred',
        halfCycleCorrection: true,
        source: 'ICER Value Assessment Framework 2020'
    },
    canada: {
        name: 'Canada',
        agency: 'CADTH',
        currency: 'CAD',
        region: 'americas',
        wtpPerQaly: 50000,
        wtpRange: [50000, 100000],
        discountRateCosts: 0.015,
        discountRateOutcomes: 0.015,
        perspective: 'Publicly funded healthcare payer',
        timeHorizon: 'Lifetime preferred',
        halfCycleCorrection: true,
        source: 'CADTH Guidelines for Economic Evaluation 2017'
    },
    brazil: {
        name: 'Brazil',
        agency: 'CONITEC',
        currency: 'BRL',
        region: 'americas',
        wtpPerQaly: null,
        wtpMethod: '1-3x GDP per capita (WHO-CHOICE)',
        discountRateCosts: 0.05,
        discountRateOutcomes: 0.05,
        perspective: 'Public healthcare system (SUS)',
        timeHorizon: 'Lifetime or condition-appropriate',
        halfCycleCorrection: true,
        source: 'CONITEC Methodological Guidelines 2021'
    },
    colombia: {
        name: 'Colombia',
        agency: 'IETS',
        currency: 'COP',
        region: 'americas',
        wtpPerQaly: null,
        wtpMethod: '1-3x GDP per capita',
        discountRateCosts: 0.05,
        discountRateOutcomes: 0.05,
        perspective: 'Healthcare system',
        timeHorizon: 'Lifetime or condition-appropriate',
        halfCycleCorrection: true,
        source: 'IETS Methods Manual 2014'
    },

    // --- Middle East / Africa ---
    oman: {
        name: 'Oman',
        agency: 'MOH',
        currency: 'OMR',
        region: 'mena',
        wtpPerQaly: 13000,
        discountRateCosts: 0.03,
        discountRateOutcomes: 0.03,
        perspective: 'Healthcare system',
        timeHorizon: 'Lifetime or condition-appropriate',
        halfCycleCorrection: true,
        source: 'Al-Busaidi et al. 2021'
    },
    southafrica: {
        name: 'South Africa',
        agency: 'NDoH',
        currency: 'ZAR',
        region: 'mena',
        wtpPerQaly: null,
        wtpMethod: '1x GDP per capita (WHO-CHOICE)',
        discountRateCosts: 0.05,
        discountRateOutcomes: 0.05,
        perspective: 'Healthcare system',
        timeHorizon: 'Lifetime or condition-appropriate',
        halfCycleCorrection: true,
        source: 'SA HTA Guidelines 2021'
    }
};

// ============ CURRENCY CONVERSION RATES (approximate 2025 mid-market) ============

const CURRENCY_RATES_TO_USD = {
    USD: 1.0,
    GBP: 1.27,
    EUR: 1.08,
    CAD: 0.74,
    AUD: 0.65,
    SEK: 0.096,
    JPY: 0.0067,
    KRW: 0.00074,
    CNY: 0.14,
    THB: 0.028,
    INR: 0.012,
    BRL: 0.20,
    COP: 0.00024,
    OMR: 2.60,
    ZAR: 0.055,
    PLN: 0.25,
    NOK: 0.094
};

// ============ REGION DEFINITIONS ============

const REGION_MAP = {
    europe: ['uk', 'germany', 'france', 'netherlands', 'sweden', 'italy', 'spain',
             'ireland', 'poland', 'norway'],
    asia:   ['japan', 'southkorea', 'china', 'thailand', 'india', 'australia'],
    americas: ['usa', 'canada', 'brazil', 'colombia'],
    mena:   ['oman', 'southafrica']
};

// ============ REQUIRED FIELDS FOR VALIDATION ============

const REQUIRED_FIELDS = ['name', 'agency', 'currency', 'region',
    'discountRateCosts', 'discountRateOutcomes', 'perspective', 'source'];

// ============ CountryProfileLibrary CLASS ============

class CountryProfileLibrary {

    constructor() {
        this.profiles = { ...COUNTRY_PROFILES };
        this._validateAllProfiles();
    }

    // ---- Internal validation ----

    /**
     * Validate that all profiles have the minimum required fields.
     * Runs once at construction.
     */
    _validateAllProfiles() {
        const codes = Object.keys(this.profiles);
        for (const code of codes) {
            const p = this.profiles[code];
            for (const field of REQUIRED_FIELDS) {
                if (p[field] === undefined) {
                    throw new Error(
                        `Country profile "${code}" is missing required field "${field}".`
                    );
                }
            }
            // Discount rates must be non-negative numbers
            if (typeof p.discountRateCosts !== 'number' || p.discountRateCosts < 0) {
                throw new Error(
                    `Country "${code}": discountRateCosts must be a non-negative number.`
                );
            }
            if (typeof p.discountRateOutcomes !== 'number' || p.discountRateOutcomes < 0) {
                throw new Error(
                    `Country "${code}": discountRateOutcomes must be a non-negative number.`
                );
            }
        }
    }

    /**
     * Validate a country code, throwing a helpful error if unknown.
     * @param {string} code
     * @returns {string} normalized lowercase code
     */
    _validateCode(code) {
        if (typeof code !== 'string' || code.trim() === '') {
            throw new Error('Country code must be a non-empty string.');
        }
        const normalized = code.trim().toLowerCase();
        if (!this.profiles[normalized]) {
            const validCodes = Object.keys(this.profiles).sort().join(', ');
            throw new Error(
                `Unknown country code "${code}". Valid codes: ${validCodes}`
            );
        }
        return normalized;
    }

    // ---- Public API ----

    /**
     * Get the full profile object for a country.
     * @param {string} countryCode
     * @returns {object} deep copy of the profile
     */
    getProfile(countryCode) {
        const code = this._validateCode(countryCode);
        return JSON.parse(JSON.stringify(this.profiles[code]));
    }

    /**
     * Get WTP per QALY for a country.
     * Returns { value, range, endOfLife, method, hasFixedThreshold }.
     * @param {string} countryCode
     * @returns {object}
     */
    getWTP(countryCode) {
        const code = this._validateCode(countryCode);
        const p = this.profiles[code];
        const result = {
            value: p.wtpPerQaly,
            hasFixedThreshold: p.wtpPerQaly !== null && p.wtpPerQaly !== undefined,
            currency: p.currency
        };
        if (p.wtpRange) result.range = [...p.wtpRange];
        if (p.wtpEndOfLife !== undefined) result.endOfLife = p.wtpEndOfLife;
        if (p.wtpMethod) result.method = p.wtpMethod;
        if (p.wtpBySeverity) result.wtpBySeverity = { ...p.wtpBySeverity };

        if (!result.hasFixedThreshold) {
            result.warning = `${p.name} does not use a fixed WTP threshold. ` +
                `Method: ${p.wtpMethod ?? 'Not specified'}.`;
        }
        return result;
    }

    /**
     * Get discount rates for a country.
     * @param {string} countryCode
     * @returns {object} { costs, outcomes, afterYear30? }
     */
    getDiscountRates(countryCode) {
        const code = this._validateCode(countryCode);
        const p = this.profiles[code];
        const result = {
            costs: p.discountRateCosts,
            outcomes: p.discountRateOutcomes
        };
        if (p.discountRateAfterYear30 !== undefined) {
            result.afterYear30 = p.discountRateAfterYear30;
        }
        return result;
    }

    /**
     * List all countries with summary info.
     * @returns {Array<{code, name, agency, currency, region}>}
     */
    listCountries() {
        return Object.entries(this.profiles).map(([code, p]) => ({
            code,
            name: p.name,
            agency: p.agency,
            currency: p.currency,
            region: p.region
        })).sort((a, b) => a.name.localeCompare(b.name));
    }

    /**
     * Get countries by region.
     * @param {string} region  one of 'europe', 'asia', 'americas', 'mena'
     * @returns {Array<{code, name, agency, currency, region}>}
     */
    getRegion(region) {
        const normalized = (region ?? '').trim().toLowerCase();
        const validRegions = Object.keys(REGION_MAP);
        if (!validRegions.includes(normalized)) {
            throw new Error(
                `Unknown region "${region}". Valid regions: ${validRegions.join(', ')}`
            );
        }
        const codes = REGION_MAP[normalized];
        return codes
            .filter(c => this.profiles[c])
            .map(c => ({
                code: c,
                name: this.profiles[c].name,
                agency: this.profiles[c].agency,
                currency: this.profiles[c].currency,
                region: this.profiles[c].region
            }));
    }

    /**
     * Apply a country profile to a model configuration object.
     * Overwrites discount rates, perspective, currency, WTP; preserves other fields.
     * @param {string} countryCode
     * @param {object} modelConfig
     * @returns {object} new config with country defaults applied
     */
    applyProfile(countryCode, modelConfig) {
        const code = this._validateCode(countryCode);
        const p = this.profiles[code];
        const result = { ...(modelConfig ?? {}) };

        result.countryCode = code;
        result.countryName = p.name;
        result.agency = p.agency;
        result.currency = p.currency;
        result.discountRateCosts = p.discountRateCosts;
        result.discountRateOutcomes = p.discountRateOutcomes;
        result.perspective = p.perspective;

        if (p.wtpPerQaly !== null && p.wtpPerQaly !== undefined) {
            result.wtpPerQaly = p.wtpPerQaly;
        }
        if (p.wtpEndOfLife !== undefined) {
            result.wtpEndOfLife = p.wtpEndOfLife;
        }
        if (p.halfCycleCorrection !== undefined) {
            result.halfCycleCorrection = p.halfCycleCorrection;
        }
        if (p.discountRateAfterYear30 !== undefined) {
            result.discountRateAfterYear30 = p.discountRateAfterYear30;
        }

        return result;
    }

    /**
     * Compare multiple countries on a given metric.
     * @param {string[]} codes  array of country codes
     * @param {string} metric   one of 'wtp', 'discountRates', 'perspective', 'all'
     * @returns {Array<object>} comparison table rows
     */
    compareCountries(codes, metric = 'all') {
        if (!Array.isArray(codes) || codes.length === 0) {
            throw new Error('compareCountries requires a non-empty array of country codes.');
        }

        const validMetrics = ['wtp', 'discountRates', 'perspective', 'all'];
        const normalizedMetric = (metric ?? 'all').trim().toLowerCase();
        if (!validMetrics.includes(normalizedMetric)) {
            throw new Error(
                `Unknown metric "${metric}". Valid metrics: ${validMetrics.join(', ')}`
            );
        }

        return codes.map(code => {
            const c = this._validateCode(code);
            const p = this.profiles[c];
            const row = { code: c, name: p.name, agency: p.agency, currency: p.currency };

            if (normalizedMetric === 'wtp' || normalizedMetric === 'all') {
                row.wtpPerQaly = p.wtpPerQaly;
                row.wtpMethod = p.wtpMethod ?? null;
                if (p.wtpRange) row.wtpRange = [...p.wtpRange];
            }
            if (normalizedMetric === 'discountrates' || normalizedMetric === 'all') {
                row.discountRateCosts = p.discountRateCosts;
                row.discountRateOutcomes = p.discountRateOutcomes;
            }
            if (normalizedMetric === 'perspective' || normalizedMetric === 'all') {
                row.perspective = p.perspective;
            }

            return row;
        });
    }

    /**
     * Approximate currency conversion using hardcoded 2025 mid-market rates.
     * Both currencies must be in the supported list.
     * @param {string} from  source currency code (e.g., 'GBP')
     * @param {string} to    target currency code (e.g., 'USD')
     * @param {number} amount
     * @returns {{ converted: number, from: string, to: string, rate: number, warning: string }}
     */
    getCurrencyConversion(from, to, amount) {
        if (typeof amount !== 'number' || !isFinite(amount)) {
            throw new Error('Amount must be a finite number.');
        }
        const fromUpper = (from ?? '').trim().toUpperCase();
        const toUpper = (to ?? '').trim().toUpperCase();

        const supportedCurrencies = Object.keys(CURRENCY_RATES_TO_USD);

        if (!CURRENCY_RATES_TO_USD[fromUpper]) {
            throw new Error(
                `Unsupported currency "${from}". Supported: ${supportedCurrencies.join(', ')}`
            );
        }
        if (!CURRENCY_RATES_TO_USD[toUpper]) {
            throw new Error(
                `Unsupported currency "${to}". Supported: ${supportedCurrencies.join(', ')}`
            );
        }

        const fromToUSD = CURRENCY_RATES_TO_USD[fromUpper];
        const toToUSD = CURRENCY_RATES_TO_USD[toUpper];
        const rate = fromToUSD / toToUSD;
        const converted = amount * rate;

        return {
            converted: Math.round(converted * 100) / 100,
            from: fromUpper,
            to: toUpper,
            rate: Math.round(rate * 1e6) / 1e6,
            warning: 'Approximate conversion using hardcoded 2025 mid-market rates. ' +
                     'Use official exchange rates for submissions.'
        };
    }

    /**
     * Get severity-adjusted WTP for a country.
     * If the country defines wtpBySeverity (e.g., Netherlands, Norway), uses that mapping.
     * Otherwise returns the standard WTP regardless of severity.
     * @param {string} countryCode
     * @param {string} severity  one of 'low', 'medium', 'high'
     * @returns {{ wtp: number|null, severity: string, method: string, currency: string }}
     */
    getSeverityAdjustedWTP(countryCode, severity) {
        const code = this._validateCode(countryCode);
        const p = this.profiles[code];
        const normalizedSeverity = (severity ?? 'high').trim().toLowerCase();

        const validSeverities = ['low', 'medium', 'high'];
        if (!validSeverities.includes(normalizedSeverity)) {
            throw new Error(
                `Unknown severity "${severity}". Valid values: ${validSeverities.join(', ')}`
            );
        }

        if (p.wtpBySeverity) {
            return {
                wtp: p.wtpBySeverity[normalizedSeverity],
                severity: normalizedSeverity,
                method: 'Severity-weighted threshold (proportional shortfall)',
                currency: p.currency
            };
        }

        return {
            wtp: p.wtpPerQaly,
            severity: normalizedSeverity,
            method: p.wtpPerQaly !== null
                ? 'Fixed threshold (no severity adjustment)'
                : (p.wtpMethod ?? 'No fixed threshold'),
            currency: p.currency
        };
    }

    /**
     * Get the number of country profiles in the library.
     * @returns {number}
     */
    get countryCount() {
        return Object.keys(this.profiles).length;
    }

    /**
     * Get all valid country codes.
     * @returns {string[]}
     */
    getValidCodes() {
        return Object.keys(this.profiles).sort();
    }

    /**
     * Get all supported currency codes.
     * @returns {string[]}
     */
    getSupportedCurrencies() {
        return Object.keys(CURRENCY_RATES_TO_USD).sort();
    }
}

// ============ EXPORT ============
if (typeof window !== 'undefined') {
    window.CountryProfileLibrary = CountryProfileLibrary;
    window.COUNTRY_PROFILES = COUNTRY_PROFILES;
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { CountryProfileLibrary, COUNTRY_PROFILES, CURRENCY_RATES_TO_USD, REGION_MAP };
}
