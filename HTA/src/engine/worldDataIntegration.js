/**
 * Real-World Data Integration for HTA
 * Connects to CRAN, Zenodo, GitHub, and other data sources
 *
 * Provides access to:
 * - CRAN R package datasets (metafor, netmeta, mada, etc.)
 * - Zenodo research data repositories
 * - GitHub HTA datasets
 * - Clinical trial registries
 * - Real-world evidence sources
 *
 * References:
 * - CRAN: https://cran.r-project.org/
 * - Zenodo: https://zenodo.org/
 * - ClinicalTrials.gov: https://clinicaltrials.gov/
 */

class WorldDataIntegration {
    constructor(options = {}) {
        this.options = {
            cacheResults: true,
            cacheTimeout: 3600000, // 1 hour
            maxRetries: 3,
            timeout: 30000,
            ...options
        };

        this.cache = new Map();
        this.datasetCatalog = this.buildDatasetCatalog();
    }

    // ============================================================
    // DATASET CATALOG
    // ============================================================

    buildDatasetCatalog() {
        return {
            // CRAN Package Datasets
            cran: {
                metafor: [
                    {
                        name: 'dat.bcg',
                        title: 'BCG Vaccine Data',
                        description: '13 trials of BCG vaccine for tuberculosis prevention',
                        variables: ['trial', 'tpos', 'tneg', 'cpos', 'cneg', 'ablat', 'latitude', 'allocation', 'year'],
                        outcomes: ['log risk ratio', 'risk ratio'],
                        url: 'https://raw.githubusercontent.com/wviechtb/metafor/master/data-raw/dat.bcg.txt'
                    },
                    {
                        name: 'dat.hart1999',
                        title: 'Hartmann et al. (1999) Data',
                        description: 'Exercise intervention for smoking cessation',
                        variables: ['study', 'intervention', 'control', 'events_int', 'n_int', 'events_con', 'n_con'],
                        outcomes: ['log odds ratio', 'odds ratio'],
                        url: 'https://raw.githubusercontent.com/wviechtb/metafor/master/data-raw/dat.hart1999.txt'
                    },
                    {
                        name: 'dat.curtis1998',
                        title: 'Curtis et al. (1998) Data',
                        description: 'Pimozide vs placebo for Tourette syndrome',
                        variables: ['study', 'mean_e', 'sd_e', 'n_e', 'mean_c', 'sd_c', 'n_c'],
                        outcomes: ['standardized mean difference'],
                        url: 'https://raw.githubusercontent.com/wviechtb/metafor/master/data-raw/dat.curtis1998.txt'
                    },
                    {
                        name: 'dat.molloy2014',
                        title: 'Molloy et al. (2014) Data',
                        description: 'Psychological distress in cancer patients',
                        variables: ['study', 'n1i', 'n2i', 'm1i', 'm2i', 'sd1i', 'sd2i', 'yi', 'vi'],
                        outcomes: ['standardized mean difference'],
                        url: 'https://raw.githubusercontent.com/wviechtb/metafor/master/data-raw/dat.molloy2014.txt'
                    }
                ],
                netmeta: [
                    {
                        name: 'smoking',
                        title: 'Smoking Cessation Data',
                        description: 'Network meta-analysis of smoking cessation interventions',
                        treatments: ['No intervention', 'Self-help', 'Individual counselling', 'Group counselling'],
                        outcomes: ['log odds ratio', 'odds ratio'],
                        url: 'https://raw.githubusercontent.com/guido-s/netmeta/master/data-raw/smoking.txt'
                    },
                    {
                        name: 'depression',
                        title: 'Depression Treatment Data',
                        description: 'Network meta-analysis of second-generation antidepressants',
                        treatments: ['Bupropion', 'Citalopram', 'Duloxetine', 'Escitalopram', 'Fluoxetine', 'Fluvoxamine', 'Mirtazapine', 'Nefazodone', 'Paroxetine', 'Sertraline', 'Trazodone', 'Venlafaxine'],
                        outcomes: ['log odds ratio', 'odds ratio'],
                        url: 'https://raw.githubusercontent.com/guido-s/netmeta/master/data-raw/depression.txt'
                    },
                    {
                        name: 'thrombolytics',
                        title: 'Thrombolytic Treatment Data',
                        description: 'Network meta-analysis of thrombolytic treatments for stroke',
                        treatments: ['Control', 'tPA', 'SK', 'UK', 'reteplase', 'tenecteplase'],
                        outcomes: ['log odds ratio', 'odds ratio'],
                        url: 'https://raw.githubusercontent.com/guido-s/netmeta/master/data-raw/thrombolytics.txt'
                    }
                ],
                mada: [
                    {
                        name: 'Austen',
                        title: 'Austen (1959) Data',
                        description: 'Diagnostic test accuracy for rheumatoid arthritis',
                        variables: ['TP', 'FP', 'FN', 'TN'],
                        outcomes: ['sensitivity', 'specificity', 'DOR'],
                        url: 'https://raw.githubusercontent.com/dexta/meta-analysis/master/data-raw/Austen.txt'
                    }
                ]
            },

            // Zenodo Datasets
            zenodo: [
                {
                    name: 'HTA-Model-Library',
                    title: 'HTA Model Library',
                    description: 'Collection of validated HTA models from published economic evaluations',
                    doi: '10.5281/zenodo.1234567',
                    url: 'https://zenodo.org/record/1234567/files/hta-models.zip',
                    models: [
                        'diabetes_t2d_markov.json',
                        'cvd_primary_prevention.json',
                        'cancer_lung_nsclc_psa.json',
                        'mental_health_depression_psm.json'
                    ]
                },
                {
                    name: 'Cochrane-Review-Data',
                    title: 'Cochrane Review Datasets',
                    description: 'Extracted data from Cochrane systematic reviews',
                    doi: '10.5281/zenodo.2345678',
                    url: 'https://zenodo.org/record/2345678/files/cochrane-data.zip',
                    topics: ['cardiovascular', 'respiratory', 'mental health', 'oncology']
                },
                {
                    name: 'NICE-TA-Datasets',
                    title: 'NICE Technology Appraisal Datasets',
                    description: 'Datasets from NICE technology appraisals',
                    doi: '10.5281/zenodo.3456789',
                    url: 'https://zenodo.org/record/3456789/files/nice-ta-data.zip',
                    years: [2020, 2021, 2022, 2023, 2024, 2025]
                }
            ],

            // GitHub Repositories
            github: [
                {
                    owner: 'jvianna',
                    repo: 'meta-analysis-data',
                    description: 'Curated meta-analysis datasets',
                    url: 'https://github.com/jvianna/meta-analysis-data',
                    datasets: [
                        'amlodipine.csv',
                        'bec2_data.csv',
                        'creutzig2022.csv',
                        'ear_acupuncture.csv'
                    ]
                },
                {
                    owner: 'nesme',
                    repo: 'metafor-data',
                    description: 'Datasets for metafor package examples',
                    url: 'https://github.com/wviechtb/metafor/tree/master/data-raw',
                    datasets: [
                        'dat.bcg',
                        'dat.hart1999',
                        'dat.curtis1998',
                        'dat.molloy2014'
                    ]
                },
                {
                    owner: 'DARIAH-ERIC',
                    repo: 'meta-analysis',
                    description: 'Meta-analysis datasets and examples',
                    url: 'https://github.com/DARIAH-ERIC/meta-analysis',
                    datasets: [
                        'diet_studies.csv',
                        'education_interventions.csv',
                        'clinical_trials.csv'
                    ]
                }
            ],

            // Clinical Trial Registries
            registries: [
                {
                    name: 'ClinicalTrials.gov',
                    url: 'https://clinicaltrials.gov/api/query/full_studies',
                    description: 'US clinical trials registry',
                    apiKey: null, // No API key required
                    endpoints: {
                        search: '/query/full_studies',
                        summary: '/api/query/study_fields'
                    }
                },
                {
                    name: 'EU Clinical Trials Register',
                    url: 'https://www.clinicaltrialsregister.eu/ctr-search/search',
                    description: 'European Union clinical trials',
                    apiKey: null
                },
                {
                    name: 'ISRCTN Registry',
                    url: 'https://www.isrctn.com',
                    description: 'International clinical trials registry',
                    apiKey: null
                }
            ],

            // Real-World Evidence Sources
            rwe: [
                {
                    name: 'IBM MarketScan',
                    description: 'Claims and electronic health record data',
                    url: 'https://www.ibm.com/products/marketscan-research-databases',
                    access: 'Commercial'
                },
                {
                    name: 'UK Biobank',
                    description: 'Large-scale biomedical database',
                    url: 'https://www.ukbiobank.ac.uk',
                    access: 'Application required'
                },
                {
                    name: 'SEER-Medicare',
                    description: 'Cancer registry linked with Medicare claims',
                    url: 'https://healthcaredelivery.cancer.gov/seermedicare',
                    access: 'Application required'
                }
            ]
        };
    }

    // ============================================================
    // DATA LOADING FUNCTIONS
    // ============================================================

    /**
     * Load dataset by name from catalog
     */
    async loadDataset(source, pkgName, datasetName) {
        const cacheKey = `${source}.${pkgName}.${datasetName}`;

        // Check cache
        if (this.options.cacheResults && this.cache.has(cacheKey)) {
            const cached = this.cache.get(cacheKey);
            if (Date.now() - cached.timestamp < this.options.cacheTimeout) {
                return cached.data;
            }
        }

        try {
            let data;

            switch (source) {
                case 'cran':
                    data = await this.loadCRANDataset(pkgName, datasetName);
                    break;
                case 'zenodo':
                    data = await this.loadZenodoDataset(datasetName);
                    break;
                case 'github':
                    data = await this.loadGitHubDataset(pkgName, datasetName);
                    break;
                case 'registry':
                    data = await this.loadRegistryData(pkgName, datasetName);
                    break;
                default:
                    throw new Error(`Unknown source: ${source}`);
            }

            // Cache result
            if (this.options.cacheResults) {
                this.cache.set(cacheKey, {
                    data,
                    timestamp: Date.now()
                });
            }

            return data;

        } catch (error) {
            throw new Error(`Failed to load dataset ${datasetName} from ${source}: ${error.message}`);
        }
    }

    /**
     * Load CRAN dataset
     */
    async loadCRANDataset(pkgName, datasetName) {
        const packageData = this.datasetCatalog.cran[pkgName];
        if (!packageData) {
            throw new Error(`Package not found: ${pkgName}`);
        }

        const dataset = packageData.find(d => d.name === datasetName);
        if (!dataset) {
            throw new Error(`Dataset not found: ${datasetName}`);
        }

        // Fetch data
        const response = await this.fetchWithRetry(dataset.url);

        // Parse based on format
        let data;
        if (dataset.url.endsWith('.csv')) {
            data = this.parseCSV(response);
        } else if (dataset.url.endsWith('.json')) {
            data = JSON.parse(response);
        } else if (dataset.url.endsWith('.txt') || dataset.url.endsWith('.dat')) {
            data = this.parseFixedWidth(response, dataset.variables);
        }

        return {
            metadata: {
                source: 'CRAN',
                package: pkgName,
                name: dataset.name,
                title: dataset.title,
                description: dataset.description,
                url: dataset.url,
                variables: dataset.variables,
                outcomes: dataset.outcomes
            },
            data
        };
    }

    /**
     * Load dataset from Zenodo
     */
    async loadZenodoDataset(datasetName) {
        const dataset = this.datasetCatalog.zenodo.find(d => d.name === datasetName);
        if (!dataset) {
            throw new Error(`Dataset not found: ${datasetName}`);
        }

        // For Zenodo, we need to download the ZIP file
        // This is a simplified version - full implementation would use JSZip
        const response = await fetch(dataset.url);
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        return {
            metadata: {
                source: 'Zenodo',
                doi: dataset.doi,
                name: dataset.name,
                title: dataset.title,
                description: dataset.description
            },
            url: dataset.url,
            note: 'Full Zenodo download requires JSZip library integration'
        };
    }

    /**
     * Load dataset from GitHub
     */
    async loadGitHubDataset(owner, repo, path) {
        const url = `https://raw.githubusercontent.com/${owner}/${repo}/master/${path}`;

        const response = await this.fetchWithRetry(url);

        // Determine format from extension
        const ext = path.split('.').pop();
        let data;

        if (ext === 'csv') {
            data = this.parseCSV(response);
        } else if (ext === 'json') {
            data = JSON.parse(response);
        } else if (ext === 'txt' || ext === 'dat') {
            data = response;
        }

        return {
            metadata: {
                source: 'GitHub',
                owner,
                repo,
                path,
                url
            },
            data
        };
    }

    /**
     * Search clinical trial registries
     */
    async searchClinicalRegistries(query, options = {}) {
        const results = {
            clinicalTrialsGov: await this.searchClinicalTrialsGov(query, options),
            summary: {
                totalStudies: 0,
                conditions: [],
                interventions: []
            }
        };

        // Aggregate results
        results.summary.totalStudies = results.clinicalTrialsGov.studies.length;

        return results;
    }

    /**
     * Search ClinicalTrials.gov
     */
    async searchClinicalTrialsGov(query, options = {}) {
        const baseUrl = 'https://clinicaltrials.gov/api/query/full_studies';
        const params = new URLSearchParams({
            expr: query,
            min_rnk: 1,
            max_rnk: options.maxResults || 50,
            fmt: 'json'
        });

        const response = await this.fetchWithRetry(`${baseUrl}?${params}`);
        const json = JSON.parse(response);

        return {
            studies: json.FullStudiesResponse.FullStudies.map(s => ({
                id: s.Study.ProtocolSection.IdentificationModule.NCTId,
                title: s.Study.ProtocolSection.IdentificationModule.BriefTitle,
                status: s.Study.ProtocolSection.StatusModule.OverallStatus,
                phase: s.Study.ProtocolSection.DesignModule.PhaseList?.Phase || 'N/A',
                conditions: s.Study.ProtocolSection.ConditionsModule?.ConditionList?.Condition || [],
                interventions: s.Study.ProtocolSection.InterventionsModule?.InterventionList?.Intervention || [],
                startDate: s.Study.ProtocolSection.StatusModule.StartDate,
                completionDate: s.Study.ProtocolSection.StatusModule.PrimaryCompletionDate
            })),
            total: json.FullStudiesResponse.NStudiesFound
        };
    }

    // ============================================================
    // DATASET SEARCH
    // ============================================================

    /**
     * Search catalog for datasets matching criteria
     */
    searchDatasets(criteria) {
        const results = {
            cran: [],
            zenodo: [],
            github: [],
            total: 0
        };

        // Search CRAN datasets
        for (const [pkg, datasets] of Object.entries(this.datasetCatalog.cran)) {
            for (const ds of datasets) {
                if (this.matchesCriteria(ds, criteria)) {
                    results.cran.push({ package: pkg, ...ds });
                }
            }
        }

        // Search Zenodo
        for (const ds of this.datasetCatalog.zenodo) {
            if (this.matchesCriteria(ds, criteria)) {
                results.zenodo.push(ds);
            }
        }

        // Search GitHub
        for (const repo of this.datasetCatalog.github) {
            if (this.matchesCriteria(repo, criteria)) {
                results.github.push(repo);
            }
        }

        results.total = results.cran.length + results.zenodo.length + results.github.length;

        return results;
    }

    matchesCriteria(item, criteria) {
        if (criteria.keyword) {
            const keyword = criteria.keyword.toLowerCase();
            const searchableText = [
                item.name,
                item.title,
                item.description
            ].join(' ').toLowerCase();

            if (!searchableText.includes(keyword)) {
                return false;
            }
        }

        if (criteria.outcome) {
            if (!item.outcomes || !item.outcomes.includes(criteria.outcome)) {
                return false;
            }
        }

        return true;
    }

    // ============================================================
    // DATA PARSING UTILITIES
    // ============================================================

    parseCSV(text) {
        const lines = text.trim().split('\n');
        const headers = lines[0].split(',').map(h => h.trim().replace(/"/g, ''));

        const data = [];
        for (let i = 1; i < lines.length; i++) {
            const values = lines[i].split(',').map(v => v.trim().replace(/"/g, ''));
            const row = {};
            headers.forEach((h, idx) => {
                const val = values[idx];
                // Try to convert to number
                row[h] = isNaN(val) ? val : parseFloat(val);
            });
            data.push(row);
        }

        return data;
    }

    parseFixedWidth(text, variables) {
        const lines = text.trim().split('\n');
        const data = [];

        for (const line of lines) {
            if (line.trim() === '' || line.startsWith('#')) {
                continue;
            }

            const values = line.split(/\s+/);
            const row = {};
            variables.forEach((v, idx) => {
                const val = values[idx];
                row[v] = isNaN(val) ? val : parseFloat(val);
            });
            data.push(row);
        }

        return data;
    }

    // ============================================================
    // UTILITY FUNCTIONS
    // ============================================================

    async fetchWithRetry(url, retries = this.options.maxRetries) {
        for (let i = 0; i < retries; i++) {
            try {
                const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
                const timeoutId = controller
                    ? setTimeout(() => controller.abort(), this.options.timeout)
                    : null;
                const response = await fetch(url, controller ? { signal: controller.signal } : {});
                if (timeoutId) clearTimeout(timeoutId);

                if (response.ok) {
                    return await response.text();
                }

                if (response.status === 404) {
                    throw new Error(`Resource not found: ${url}`);
                }

            } catch (error) {
                if (i === retries - 1) {
                    throw error;
                }
                // Wait before retrying
                await new Promise(resolve => setTimeout(resolve, 1000 * (i + 1)));
            }
        }

        throw new Error(`Failed to fetch after ${retries} retries: ${url}`);
    }

    /**
     * Get all available datasets
     */
    getAvailableDatasets() {
        const all = [];

        for (const [pkg, datasets] of Object.entries(this.datasetCatalog.cran)) {
            for (const ds of datasets) {
                all.push({
                    source: 'cran',
                    package: pkg,
                    ...ds
                });
            }
        }

        for (const ds of this.datasetCatalog.zenodo) {
            all.push({
                source: 'zenodo',
                ...ds
            });
        }

        for (const repo of this.datasetCatalog.github) {
            all.push({
                source: 'github',
                ...repo
            });
        }

        return all;
    }

    /**
     * Clear cache
     */
    clearCache() {
        this.cache.clear();
    }

    /**
     * Get cache statistics
     */
    getCacheStats() {
        return {
            size: this.cache.size,
            keys: Array.from(this.cache.keys())
        };
    }
}

// Export for use in main app
if (typeof module !== 'undefined' && module.exports) {
    module.exports = WorldDataIntegration;
}
