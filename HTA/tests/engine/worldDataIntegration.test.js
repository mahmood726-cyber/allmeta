/**
 * Tests for src/engine/worldDataIntegration.js
 */

'use strict';

const WorldDataIntegration = require('../../src/engine/worldDataIntegration');

describe('WorldDataIntegration', () => {
    let wdi;

    beforeEach(() => {
        wdi = new WorldDataIntegration();
    });

    // ============================================================
    // Constructor & Options
    // ============================================================

    test('applies default options when none provided', () => {
        expect(wdi.options.cacheResults).toBe(true);
        expect(wdi.options.cacheTimeout).toBe(3600000);
        expect(wdi.options.maxRetries).toBe(3);
        expect(wdi.options.timeout).toBe(30000);
    });

    test('merges custom options with defaults', () => {
        const custom = new WorldDataIntegration({ maxRetries: 5, timeout: 60000 });
        expect(custom.options.maxRetries).toBe(5);
        expect(custom.options.timeout).toBe(60000);
        expect(custom.options.cacheResults).toBe(true); // default preserved
    });

    // ============================================================
    // Dataset Catalog
    // ============================================================

    test('catalog contains CRAN datasets with metafor, netmeta, mada packages', () => {
        const cran = wdi.datasetCatalog.cran;
        expect(cran.metafor).toBeDefined();
        expect(cran.netmeta).toBeDefined();
        expect(cran.mada).toBeDefined();
        expect(cran.metafor.length).toBeGreaterThanOrEqual(4);
    });

    test('catalog contains Zenodo datasets', () => {
        const zenodo = wdi.datasetCatalog.zenodo;
        expect(Array.isArray(zenodo)).toBe(true);
        expect(zenodo.length).toBeGreaterThanOrEqual(3);
        expect(zenodo[0].doi).toBeTruthy();
    });

    test('catalog contains GitHub repositories', () => {
        const github = wdi.datasetCatalog.github;
        expect(Array.isArray(github)).toBe(true);
        expect(github.length).toBeGreaterThanOrEqual(3);
        expect(github[0].owner).toBeTruthy();
        expect(github[0].repo).toBeTruthy();
    });

    test('catalog contains clinical trial registries', () => {
        const registries = wdi.datasetCatalog.registries;
        expect(registries.length).toBeGreaterThanOrEqual(3);
        expect(registries[0].name).toBe('ClinicalTrials.gov');
    });

    test('catalog contains RWE data sources', () => {
        const rwe = wdi.datasetCatalog.rwe;
        expect(rwe.length).toBeGreaterThanOrEqual(3);
        expect(rwe.some(r => r.name === 'UK Biobank')).toBe(true);
    });

    test('each CRAN dataset has required metadata fields', () => {
        for (const [pkg, datasets] of Object.entries(wdi.datasetCatalog.cran)) {
            for (const ds of datasets) {
                expect(ds.name).toBeTruthy();
                expect(ds.title).toBeTruthy();
                expect(ds.description).toBeTruthy();
                expect(ds.url).toBeTruthy();
            }
        }
    });

    // ============================================================
    // getAvailableDatasets
    // ============================================================

    test('getAvailableDatasets returns flat array from all sources', () => {
        const all = wdi.getAvailableDatasets();
        expect(Array.isArray(all)).toBe(true);

        const sources = new Set(all.map(d => d.source));
        expect(sources.has('cran')).toBe(true);
        expect(sources.has('zenodo')).toBe(true);
        expect(sources.has('github')).toBe(true);

        // CRAN datasets should have package field
        const cranItems = all.filter(d => d.source === 'cran');
        for (const item of cranItems) {
            expect(item.package).toBeTruthy();
        }
    });

    // ============================================================
    // searchDatasets
    // ============================================================

    test('searchDatasets finds BCG dataset by keyword', () => {
        const results = wdi.searchDatasets({ keyword: 'BCG' });
        expect(results.cran.length).toBeGreaterThanOrEqual(1);
        expect(results.total).toBeGreaterThan(0);
        expect(results.cran[0].name).toBe('dat.bcg');
    });

    test('searchDatasets is case-insensitive', () => {
        const upper = wdi.searchDatasets({ keyword: 'SMOKING' });
        const lower = wdi.searchDatasets({ keyword: 'smoking' });
        expect(upper.total).toBe(lower.total);
        expect(upper.total).toBeGreaterThanOrEqual(1);
    });

    test('searchDatasets filters by outcome', () => {
        const results = wdi.searchDatasets({ outcome: 'sensitivity' });
        expect(results.cran.length).toBeGreaterThanOrEqual(1);
        // mada Austen dataset has sensitivity as outcome
        expect(results.cran.some(d => d.name === 'Austen')).toBe(true);
    });

    test('searchDatasets returns empty results for non-matching keyword', () => {
        const results = wdi.searchDatasets({ keyword: 'xyznonexistent98765' });
        expect(results.total).toBe(0);
        expect(results.cran).toHaveLength(0);
        expect(results.zenodo).toHaveLength(0);
        expect(results.github).toHaveLength(0);
    });

    test('searchDatasets with keyword+outcome combined filter', () => {
        const results = wdi.searchDatasets({
            keyword: 'BCG',
            outcome: 'risk ratio'
        });
        expect(results.cran.length).toBeGreaterThanOrEqual(1);
    });

    // ============================================================
    // matchesCriteria
    // ============================================================

    test('matchesCriteria returns true when keyword matches name/title/description', () => {
        const item = { name: 'test-dataset', title: 'Test Dataset', description: 'A vaccine trial' };
        expect(wdi.matchesCriteria(item, { keyword: 'vaccine' })).toBe(true);
        expect(wdi.matchesCriteria(item, { keyword: 'test' })).toBe(true);
    });

    test('matchesCriteria returns false when outcome filter does not match', () => {
        const item = { name: 'test', title: 'Test', description: 'desc', outcomes: ['sensitivity'] };
        expect(wdi.matchesCriteria(item, { outcome: 'odds ratio' })).toBe(false);
    });

    test('matchesCriteria returns false when item has no outcomes and outcome is requested', () => {
        const item = { name: 'test', title: 'Test', description: 'desc' };
        expect(wdi.matchesCriteria(item, { outcome: 'sensitivity' })).toBe(false);
    });

    // ============================================================
    // Data Parsing Utilities
    // ============================================================

    test('parseCSV correctly parses header and numeric/string data', () => {
        const csv = 'name,age,score\nAlice,30,85.5\nBob,25,92.1';
        const data = wdi.parseCSV(csv);
        expect(data).toHaveLength(2);
        expect(data[0].name).toBe('Alice');
        expect(data[0].age).toBe(30);
        expect(data[0].score).toBe(85.5);
        expect(data[1].name).toBe('Bob');
    });

    test('parseCSV handles quoted values', () => {
        const csv = '"study","n","effect"\n"Trial A",100,0.5\n"Trial B",200,0.3';
        const data = wdi.parseCSV(csv);
        expect(data).toHaveLength(2);
        expect(data[0].study).toBe('Trial A');
        expect(data[0].n).toBe(100);
    });

    test('parseFixedWidth parses whitespace-delimited data with variable names', () => {
        const text = '1 10 0.5\n2 20 0.3\n3 30 0.7';
        const vars = ['id', 'n', 'effect'];
        const data = wdi.parseFixedWidth(text, vars);
        expect(data).toHaveLength(3);
        expect(data[0].id).toBe(1);
        expect(data[0].n).toBe(10);
        expect(data[2].effect).toBe(0.7);
    });

    test('parseFixedWidth skips empty lines and comment lines', () => {
        const text = '# header comment\n1 10\n\n2 20\n';
        const vars = ['id', 'n'];
        const data = wdi.parseFixedWidth(text, vars);
        expect(data).toHaveLength(2);
    });

    // ============================================================
    // Cache Management
    // ============================================================

    test('clearCache empties the cache', () => {
        wdi.cache.set('key1', { data: 'test', timestamp: Date.now() });
        wdi.cache.set('key2', { data: 'test2', timestamp: Date.now() });
        expect(wdi.cache.size).toBe(2);

        wdi.clearCache();
        expect(wdi.cache.size).toBe(0);
    });

    test('getCacheStats returns correct size and keys', () => {
        wdi.cache.set('a.b.c', { data: 1, timestamp: Date.now() });
        wdi.cache.set('x.y.z', { data: 2, timestamp: Date.now() });

        const stats = wdi.getCacheStats();
        expect(stats.size).toBe(2);
        expect(stats.keys).toContain('a.b.c');
        expect(stats.keys).toContain('x.y.z');
    });

    // ============================================================
    // loadDataset (with mocked fetch)
    // ============================================================

    test('loadDataset throws for unknown source', async () => {
        await expect(wdi.loadDataset('unknown', 'pkg', 'ds'))
            .rejects
            .toThrow('Failed to load dataset ds from unknown');
    });

    test('loadCRANDataset throws for non-existent package', async () => {
        await expect(wdi.loadCRANDataset('nonexistent', 'ds'))
            .rejects
            .toThrow('Package not found');
    });

    test('loadCRANDataset throws for non-existent dataset in valid package', async () => {
        await expect(wdi.loadCRANDataset('metafor', 'nonexistent_ds'))
            .rejects
            .toThrow('Dataset not found');
    });

    test('loadDataset uses cache on second call within timeout', async () => {
        // Manually prime the cache
        const cacheKey = 'cran.metafor.dat.bcg';
        const cachedData = { metadata: { name: 'cached' }, data: [{ x: 1 }] };
        wdi.cache.set(cacheKey, { data: cachedData, timestamp: Date.now() });

        const result = await wdi.loadDataset('cran', 'metafor', 'dat.bcg');
        expect(result).toEqual(cachedData);
    });

    test('loadDataset skips expired cache entries', async () => {
        const cacheKey = 'cran.metafor.dat.bcg';
        wdi.cache.set(cacheKey, {
            data: { old: true },
            timestamp: Date.now() - 4000000 // expired
        });

        // Will try to actually fetch, which will fail in test env — that's expected
        await expect(wdi.loadDataset('cran', 'metafor', 'dat.bcg'))
            .rejects.toThrow();
    });

    // ============================================================
    // fetchWithRetry (mock fetch)
    // ============================================================

    test('fetchWithRetry retries on failure and eventually throws', async () => {
        const originalFetch = global.fetch;
        let attempts = 0;
        global.fetch = jest.fn(async () => {
            attempts++;
            throw new Error('Network error');
        });

        const fastWdi = new WorldDataIntegration({ maxRetries: 2, timeout: 1000 });

        await expect(fastWdi.fetchWithRetry('http://test.com'))
            .rejects.toThrow('Network error');
        expect(attempts).toBe(2);

        global.fetch = originalFetch;
    });

    test('fetchWithRetry throws immediately on 404', async () => {
        const originalFetch = global.fetch;
        global.fetch = jest.fn(async () => ({
            ok: false,
            status: 404,
            statusText: 'Not Found'
        }));

        await expect(wdi.fetchWithRetry('http://test.com/missing'))
            .rejects.toThrow('Resource not found');

        global.fetch = originalFetch;
    });

    test('fetchWithRetry returns text on successful fetch', async () => {
        const originalFetch = global.fetch;
        global.fetch = jest.fn(async () => ({
            ok: true,
            text: async () => 'response data'
        }));

        const result = await wdi.fetchWithRetry('http://test.com/data');
        expect(result).toBe('response data');

        global.fetch = originalFetch;
    });
});
