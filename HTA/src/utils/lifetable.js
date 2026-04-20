/**
 * Life Table Module
 * Provides age/sex-specific background mortality rates
 *
 * Reference: ONS National Life Tables (UK), England 2018-2020
 * https://www.ons.gov.uk/peoplepopulationandcommunity/birthsdeathsandmarriages/lifeexpectancies
 *
 * Features:
 * - UK ONS life tables (male/female)
 * - Age-specific mortality rates (qx)
 * - Survival functions (lx)
 * - Life expectancy calculations
 * - Rate to probability conversions
 */

class LifeTable {
    constructor(country = 'UK', year = 2020) {
        this.country = country;
        this.year = year;
        this.tables = this.loadTables();
    }

    /**
     * Load life tables for the specified country
     * Default: UK ONS 2018-2020
     */
    loadTables() {
        // ONS National Life Tables for England 2018-2020
        // qx = probability of dying between exact age x and x+1
        return {
            male: {
                // Age: qx (probability of dying within year)
                qx: [
                    0.00389, // 0
                    0.00026, // 1
                    0.00016, // 2
                    0.00013, // 3
                    0.00011, // 4
                    0.00010, // 5
                    0.00009, // 6
                    0.00009, // 7
                    0.00008, // 8
                    0.00008, // 9
                    0.00009, // 10
                    0.00009, // 11
                    0.00010, // 12
                    0.00012, // 13
                    0.00015, // 14
                    0.00020, // 15
                    0.00026, // 16
                    0.00033, // 17
                    0.00040, // 18
                    0.00044, // 19
                    0.00047, // 20
                    0.00049, // 21
                    0.00050, // 22
                    0.00050, // 23
                    0.00050, // 24
                    0.00051, // 25
                    0.00052, // 26
                    0.00054, // 27
                    0.00056, // 28
                    0.00058, // 29
                    0.00061, // 30
                    0.00064, // 31
                    0.00068, // 32
                    0.00072, // 33
                    0.00077, // 34
                    0.00082, // 35
                    0.00088, // 36
                    0.00095, // 37
                    0.00103, // 38
                    0.00112, // 39
                    0.00123, // 40
                    0.00135, // 41
                    0.00149, // 42
                    0.00165, // 43
                    0.00183, // 44
                    0.00204, // 45
                    0.00228, // 46
                    0.00254, // 47
                    0.00284, // 48
                    0.00317, // 49
                    0.00354, // 50
                    0.00395, // 51
                    0.00441, // 52
                    0.00492, // 53
                    0.00550, // 54
                    0.00615, // 55
                    0.00687, // 56
                    0.00768, // 57
                    0.00859, // 58
                    0.00961, // 59
                    0.01075, // 60
                    0.01203, // 61
                    0.01347, // 62
                    0.01510, // 63
                    0.01694, // 64
                    0.01902, // 65
                    0.02138, // 66
                    0.02405, // 67
                    0.02708, // 68
                    0.03053, // 69
                    0.03445, // 70
                    0.03891, // 71
                    0.04400, // 72
                    0.04981, // 73
                    0.05644, // 74
                    0.06402, // 75
                    0.07270, // 76
                    0.08264, // 77
                    0.09403, // 78
                    0.10708, // 79
                    0.12202, // 80
                    0.13911, // 81
                    0.15865, // 82
                    0.18094, // 83
                    0.20634, // 84
                    0.23521, // 85
                    0.26795, // 86
                    0.30495, // 87
                    0.34658, // 88
                    0.39316, // 89
                    0.44497, // 90
                    0.50218, // 91
                    0.56487, // 92
                    0.63296, // 93
                    0.70615, // 94
                    0.78393, // 95
                    0.86544, // 96
                    0.94945, // 97
                    1.00000, // 98
                    1.00000  // 99+
                ],
                maxAge: 100
            },
            female: {
                qx: [
                    0.00321, // 0
                    0.00022, // 1
                    0.00012, // 2
                    0.00010, // 3
                    0.00008, // 4
                    0.00007, // 5
                    0.00007, // 6
                    0.00006, // 7
                    0.00006, // 8
                    0.00006, // 9
                    0.00006, // 10
                    0.00007, // 11
                    0.00007, // 12
                    0.00008, // 13
                    0.00010, // 14
                    0.00012, // 15
                    0.00014, // 16
                    0.00016, // 17
                    0.00017, // 18
                    0.00018, // 19
                    0.00019, // 20
                    0.00019, // 21
                    0.00020, // 22
                    0.00020, // 23
                    0.00021, // 24
                    0.00021, // 25
                    0.00022, // 26
                    0.00024, // 27
                    0.00025, // 28
                    0.00027, // 29
                    0.00029, // 30
                    0.00031, // 31
                    0.00034, // 32
                    0.00037, // 33
                    0.00040, // 34
                    0.00044, // 35
                    0.00049, // 36
                    0.00054, // 37
                    0.00060, // 38
                    0.00067, // 39
                    0.00075, // 40
                    0.00084, // 41
                    0.00094, // 42
                    0.00106, // 43
                    0.00120, // 44
                    0.00135, // 45
                    0.00152, // 46
                    0.00172, // 47
                    0.00194, // 48
                    0.00219, // 49
                    0.00247, // 50
                    0.00278, // 51
                    0.00314, // 52
                    0.00354, // 53
                    0.00399, // 54
                    0.00449, // 55
                    0.00506, // 56
                    0.00569, // 57
                    0.00641, // 58
                    0.00722, // 59
                    0.00813, // 60
                    0.00916, // 61
                    0.01032, // 62
                    0.01163, // 63
                    0.01311, // 64
                    0.01479, // 65
                    0.01670, // 66
                    0.01886, // 67
                    0.02133, // 68
                    0.02414, // 69
                    0.02734, // 70
                    0.03100, // 71
                    0.03518, // 72
                    0.03999, // 73
                    0.04553, // 74
                    0.05193, // 75
                    0.05933, // 76
                    0.06790, // 77
                    0.07784, // 78
                    0.08938, // 79
                    0.10279, // 80
                    0.11837, // 81
                    0.13645, // 82
                    0.15740, // 83
                    0.18164, // 84
                    0.20960, // 85
                    0.24176, // 86
                    0.27862, // 87
                    0.32068, // 88
                    0.36839, // 89
                    0.42215, // 90
                    0.48226, // 91
                    0.54886, // 92
                    0.62189, // 93
                    0.70107, // 94
                    0.78576, // 95
                    0.87498, // 96
                    0.96731, // 97
                    1.00000, // 98
                    1.00000  // 99+
                ],
                maxAge: 100
            }
        };
    }

    /**
     * Get mortality probability for age and sex
     * @param {number} age - Age in years
     * @param {string} sex - 'male' or 'female'
     * @returns {number} qx - Probability of dying within year
     */
    getMortality(age, sex = 'male') {
        const table = this.tables[sex.toLowerCase()] || this.tables.male;
        const idx = Math.min(Math.floor(age), table.qx.length - 1);
        return table.qx[Math.max(0, idx)];
    }

    /**
     * Get mortality rate (hazard rate) for age and sex
     * @param {number} age - Age in years
     * @param {string} sex - 'male' or 'female'
     * @returns {number} Annual mortality rate (mu)
     */
    getMortalityRate(age, sex = 'male') {
        const qx = this.getMortality(age, sex);
        // Convert probability to rate: mu = -ln(1 - qx)
        return -Math.log(1 - qx);
    }

    /**
     * Get survival probability from age a to age b
     * @param {number} fromAge - Starting age
     * @param {number} toAge - Ending age
     * @param {string} sex - 'male' or 'female'
     * @returns {number} Probability of surviving from age a to b
     */
    getSurvival(fromAge, toAge, sex = 'male') {
        if (toAge <= fromAge) return 1;

        let survival = 1;
        for (let age = fromAge; age < toAge; age++) {
            const qx = this.getMortality(age, sex);
            survival *= (1 - qx);
        }
        return survival;
    }

    /**
     * Calculate life expectancy at age
     * @param {number} age - Age in years
     * @param {string} sex - 'male' or 'female'
     * @returns {number} Remaining life expectancy in years
     */
    getLifeExpectancy(age, sex = 'male') {
        const table = this.tables[sex.toLowerCase()] || this.tables.male;
        let ex = 0;
        let lx = 1;

        for (let a = age; a < table.qx.length; a++) {
            const qx = table.qx[a];
            // Person-years in this age interval
            ex += lx * (1 - qx / 2);  // Half of deaths occur mid-year
            lx *= (1 - qx);
        }

        return ex;
    }

    /**
     * Get adjusted mortality rate (for disease-specific models)
     * @param {number} age - Age in years
     * @param {string} sex - 'male' or 'female'
     * @param {number} smr - Standardized Mortality Ratio (>1 = excess mortality)
     * @returns {number} Adjusted mortality probability
     */
    getAdjustedMortality(age, sex, smr = 1.0) {
        const baseRate = this.getMortalityRate(age, sex);
        const adjustedRate = baseRate * smr;
        // Convert rate back to probability
        return 1 - Math.exp(-adjustedRate);
    }

    /**
     * Get mortality with cause-deleted adjustment
     * Removes disease-specific mortality from general population mortality
     * @param {number} age - Age in years
     * @param {string} sex - 'male' or 'female'
     * @param {number} diseaseDeathRate - Annual disease-specific death rate
     * @returns {number} Other-cause mortality probability
     */
    getOtherCauseMortality(age, sex, diseaseDeathRate) {
        const allCauseRate = this.getMortalityRate(age, sex);
        const otherCauseRate = Math.max(0, allCauseRate - diseaseDeathRate);
        return 1 - Math.exp(-otherCauseRate);
    }

    /**
     * Interpolate mortality between ages (for fractional ages)
     * @param {number} age - Age (can be fractional)
     * @param {string} sex - 'male' or 'female'
     * @returns {number} Interpolated mortality probability
     */
    getInterpolatedMortality(age, sex = 'male') {
        const lowerAge = Math.floor(age);
        const upperAge = Math.ceil(age);
        const fraction = age - lowerAge;

        if (fraction === 0) {
            return this.getMortality(lowerAge, sex);
        }

        const lowerQ = this.getMortality(lowerAge, sex);
        const upperQ = this.getMortality(upperAge, sex);

        // Linear interpolation on log scale (exponential interpolation)
        const lowerLog = Math.log(lowerQ + 1e-10);
        const upperLog = Math.log(upperQ + 1e-10);
        return Math.exp(lowerLog + fraction * (upperLog - lowerLog));
    }

    /**
     * Generate mortality probabilities for a cohort over time
     * @param {number} startAge - Starting age
     * @param {number} cycles - Number of cycles
     * @param {number} cycleLength - Length of each cycle in years
     * @param {string} sex - 'male' or 'female'
     * @returns {Array} Array of mortality probabilities per cycle
     */
    getCohorMortalitySequence(startAge, cycles, cycleLength = 1, sex = 'male') {
        const mortalities = [];
        for (let c = 0; c < cycles; c++) {
            const age = startAge + c * cycleLength;
            if (cycleLength === 1) {
                mortalities.push(this.getMortality(age, sex));
            } else {
                // For non-annual cycles, convert rate
                const annualRate = this.getMortalityRate(age, sex);
                const cycleRate = annualRate * cycleLength;
                mortalities.push(1 - Math.exp(-cycleRate));
            }
        }
        return mortalities;
    }

    /**
     * Get sex-weighted average mortality (for mixed cohorts)
     * @param {number} age - Age in years
     * @param {number} proportionMale - Proportion male (0-1)
     * @returns {number} Weighted average mortality probability
     */
    getMixedMortality(age, proportionMale = 0.5) {
        const maleMort = this.getMortality(age, 'male');
        const femaleMort = this.getMortality(age, 'female');
        return proportionMale * maleMort + (1 - proportionMale) * femaleMort;
    }

    /**
     * Export life table data as object
     * @param {string} sex - 'male' or 'female'
     * @returns {Object} Life table data
     */
    exportTable(sex = 'male') {
        const table = this.tables[sex];
        const data = [];

        for (let age = 0; age < table.qx.length; age++) {
            data.push({
                age: age,
                qx: table.qx[age],
                px: 1 - table.qx[age],
                ex: this.getLifeExpectancy(age, sex)
            });
        }

        return {
            country: this.country,
            year: this.year,
            sex: sex,
            data: data
        };
    }
}

/**
 * Utility: Convert between rates and probabilities
 */
class MortalityConverter {
    /**
     * Convert annual rate to probability
     * @param {number} rate - Annual hazard rate
     * @returns {number} Probability of event within year
     */
    static rateToProbability(rate) {
        return 1 - Math.exp(-rate);
    }

    /**
     * Convert probability to annual rate
     * @param {number} prob - Probability of event within year
     * @returns {number} Hazard rate
     */
    static probabilityToRate(prob) {
        if (prob >= 1) return Infinity;
        if (prob <= 0) return 0;
        return -Math.log(1 - prob);
    }

    /**
     * Convert annual probability to different cycle length
     * @param {number} annualProb - Annual probability
     * @param {number} cycleLength - Cycle length in years
     * @returns {number} Probability for the cycle length
     */
    static convertProbability(annualProb, cycleLength) {
        const rate = MortalityConverter.probabilityToRate(annualProb);
        const cycleRate = rate * cycleLength;
        return MortalityConverter.rateToProbability(cycleRate);
    }

    /**
     * Combine two independent death probabilities (competing risks)
     * @param {number} prob1 - First probability
     * @param {number} prob2 - Second probability
     * @returns {number} Combined probability
     */
    static combineProbabilities(prob1, prob2) {
        // For independent risks: P(A or B) = 1 - (1-P(A))(1-P(B))
        return 1 - (1 - prob1) * (1 - prob2);
    }
}

// Export
if (typeof window !== 'undefined') {
    window.LifeTable = LifeTable;
    window.MortalityConverter = MortalityConverter;
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { LifeTable, MortalityConverter };
}
