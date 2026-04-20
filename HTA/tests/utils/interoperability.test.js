/**
 * Tests for interoperability module:
 * TreeAgeImporter, RCodeExporter, ExcelHandler, FHIRAdapter, BibTeXExporter
 */

'use strict';

const {
    TreeAgeImporter,
    RCodeExporter,
    ExcelHandler,
    FHIRAdapter,
    BibTeXExporter
} = require('../../src/utils/interoperability');

// ============================================================================
// SECTION 1: TreeAgeImporter
// ============================================================================

describe('TreeAgeImporter', () => {
    let importer;

    beforeEach(() => {
        importer = new TreeAgeImporter();
    });

    test('supportedVersions includes 2020-2024', () => {
        expect(importer.supportedVersions).toEqual(['2020', '2021', '2022', '2023', '2024']);
    });

    describe('parseXML', () => {
        test('parses valid TreeAge XML into model structure', async () => {
            const xml = `<?xml version="1.0"?>
<TreeAgeModel name="TestModel" author="JDoe">
  <Description>A simple test model</Description>
  <Settings>
    <TimeHorizon>30</TimeHorizon>
    <CycleLength>0.5</CycleLength>
    <DiscountRateCosts>0.03</DiscountRateCosts>
    <DiscountRateOutcomes>0.015</DiscountRateOutcomes>
    <HalfCycleCorrection>true</HalfCycleCorrection>
    <InitialAge>65</InitialAge>
  </Settings>
  <Variable name="pDeath">
    <Value>0.02</Value>
    <Description>Annual probability of death</Description>
    <Distribution type="beta" alpha="2" beta="98"/>
  </Variable>
  <Variable name="cDrug">
    <Value>5000</Value>
    <Distribution type="gamma" shape="100" rate="0.02"/>
  </Variable>
  <State name="Healthy">
    <Label>Healthy state</Label>
    <Cost>100</Cost>
    <Utility>0.85</Utility>
    <InitialProportion>1</InitialProportion>
  </State>
  <State name="Sick">
    <Label>Sick state</Label>
    <Cost>5000</Cost>
    <Utility>0.5</Utility>
    <InitialProportion>0</InitialProportion>
  </State>
  <State name="Dead" tunnel="true">
    <Label>Dead</Label>
    <Cost>0</Cost>
    <Utility>0</Utility>
    <InitialProportion>0</InitialProportion>
    <TunnelLength>3</TunnelLength>
  </State>
  <Transition name="t1" from="Healthy" to="Sick">
    <Probability>0.1</Probability>
  </Transition>
  <Transition name="t2" from="Sick" to="Dead">
    <Probability>0.05</Probability>
    <TimeDependent/>
  </Transition>
  <Strategy name="Treatment">
    <Label>Drug A</Label>
    <Override parameter="pDeath">0.01</Override>
    <Override parameter="cDrug">7000</Override>
  </Strategy>
  <Strategy name="Control">
    <Label>Standard care</Label>
  </Strategy>
</TreeAgeModel>`;

            const model = await importer.parseXML(xml);

            // Top-level structure
            expect(model.version).toBe('0.1');
            expect(model).toHaveProperty('metadata');
            expect(model).toHaveProperty('settings');
            expect(model).toHaveProperty('parameters');
            expect(model).toHaveProperty('states');
            expect(model).toHaveProperty('transitions');
            expect(model).toHaveProperty('strategies');
        });

        test('extracts metadata from root attributes', async () => {
            const xml = `<?xml version="1.0"?>
<TreeAgeModel name="CostModel" author="Smith">
  <Description>Cost-effectiveness of intervention</Description>
</TreeAgeModel>`;

            const model = await importer.parseXML(xml);

            expect(model.metadata.name).toBe('CostModel');
            expect(model.metadata.author).toBe('Smith');
            expect(model.metadata.description).toBe('Cost-effectiveness of intervention');
            expect(model.metadata.source).toBe('TreeAge Pro Import');
            expect(model.metadata.id).toMatch(/^hta_/);
            expect(model.metadata.created).toBeTruthy();
        });

        test('extracts settings with correct numeric values', async () => {
            const xml = `<?xml version="1.0"?>
<TreeAgeModel name="M">
  <Settings>
    <TimeHorizon>30</TimeHorizon>
    <CycleLength>0.5</CycleLength>
    <DiscountRateCosts>0.03</DiscountRateCosts>
    <DiscountRateOutcomes>0.015</DiscountRateOutcomes>
    <HalfCycleCorrection>true</HalfCycleCorrection>
    <InitialAge>65</InitialAge>
  </Settings>
</TreeAgeModel>`;

            const model = await importer.parseXML(xml);

            expect(model.settings.time_horizon).toBe(30);
            expect(model.settings.cycle_length).toBe(0.5);
            expect(model.settings.discount_rate_costs).toBe(0.03);
            expect(model.settings.discount_rate_outcomes).toBe(0.015);
            expect(model.settings.half_cycle_correction).toBe(true);
            expect(model.settings.initial_age).toBe(65);
        });

        test('uses defaults when Settings element is missing', async () => {
            const xml = `<?xml version="1.0"?><TreeAgeModel name="M"/>`;
            const model = await importer.parseXML(xml);

            expect(model.settings.time_horizon).toBe(20);
            expect(model.settings.cycle_length).toBe(1);
            expect(model.settings.discount_rate_costs).toBe(0.035);
            expect(model.settings.discount_rate_outcomes).toBe(0.035);
            expect(model.settings.half_cycle_correction).toBe(false);
            expect(model.settings.initial_age).toBe(40);
        });

        test('extracts parameters with distributions', async () => {
            const xml = `<?xml version="1.0"?>
<TreeAgeModel name="M">
  <Variable name="prob">
    <Value>0.3</Value>
    <Description>Transition probability</Description>
    <Distribution type="beta" alpha="3" beta="7"/>
  </Variable>
  <Variable name="cost">
    <Value>1500</Value>
    <Distribution type="gamma" shape="10" rate="0.0067"/>
  </Variable>
  <Variable name="util">
    <Value>0.8</Value>
  </Variable>
</TreeAgeModel>`;

            const model = await importer.parseXML(xml);

            expect(model.parameters.prob.value).toBe(0.3);
            expect(model.parameters.prob.description).toBe('Transition probability');
            expect(model.parameters.prob.distribution).toEqual({ type: 'beta', alpha: 3, beta: 7 });

            expect(model.parameters.cost.value).toBe(1500);
            expect(model.parameters.cost.distribution).toEqual({ type: 'gamma', shape: 10, rate: 0.0067 });

            expect(model.parameters.util.value).toBe(0.8);
            expect(model.parameters.util.distribution).toBeUndefined();
        });

        test('extracts distribution types: normal, lognormal, uniform, triangular', async () => {
            const xml = `<?xml version="1.0"?>
<TreeAgeModel name="M">
  <Variable name="p1">
    <Value>5</Value>
    <Distribution type="normal" mean="5" sd="1"/>
  </Variable>
  <Variable name="p2">
    <Value>2.7</Value>
    <Distribution type="lognormal" meanlog="1" sdlog="0.5"/>
  </Variable>
  <Variable name="p3">
    <Value>50</Value>
    <Distribution type="uniform" min="10" max="90"/>
  </Variable>
  <Variable name="p4">
    <Value>30</Value>
    <Distribution type="triangular" min="10" mode="30" max="50"/>
  </Variable>
</TreeAgeModel>`;

            const model = await importer.parseXML(xml);

            expect(model.parameters.p1.distribution).toEqual({ type: 'normal', mean: 5, sd: 1 });
            expect(model.parameters.p2.distribution).toEqual({ type: 'lognormal', meanlog: 1, sdlog: 0.5 });
            expect(model.parameters.p3.distribution).toEqual({ type: 'uniform', min: 10, max: 90 });
            expect(model.parameters.p4.distribution).toEqual({ type: 'triangular', min: 10, mode: 30, max: 50 });
        });

        test('handles gaussian alias for normal distribution', async () => {
            const xml = `<?xml version="1.0"?>
<TreeAgeModel name="M">
  <Variable name="x">
    <Value>0</Value>
    <Distribution type="gaussian" mean="0" stdev="2"/>
  </Variable>
</TreeAgeModel>`;

            const model = await importer.parseXML(xml);
            expect(model.parameters.x.distribution.type).toBe('normal');
            expect(model.parameters.x.distribution.sd).toBe(2);
        });

        test('returns null for unknown distribution type', async () => {
            const xml = `<?xml version="1.0"?>
<TreeAgeModel name="M">
  <Variable name="x">
    <Value>1</Value>
    <Distribution type="pareto" alpha="2"/>
  </Variable>
</TreeAgeModel>`;

            const model = await importer.parseXML(xml);
            expect(model.parameters.x.distribution).toBeNull();
        });

        test('extracts health states including tunnel states', async () => {
            const xml = `<?xml version="1.0"?>
<TreeAgeModel name="M">
  <State name="Well">
    <Label>Healthy</Label>
    <Cost>100</Cost>
    <Utility>0.9</Utility>
    <InitialProportion>1</InitialProportion>
  </State>
  <State name="PostSurgery" tunnel="true">
    <Label>Post-surgical recovery</Label>
    <Cost>3000</Cost>
    <Utility>0.5</Utility>
    <InitialProportion>0</InitialProportion>
    <TunnelLength>6</TunnelLength>
  </State>
</TreeAgeModel>`;

            const model = await importer.parseXML(xml);

            expect(model.states.Well.label).toBe('Healthy');
            expect(model.states.Well.cost).toBe('100');
            expect(model.states.Well.utility).toBe('0.9');
            expect(model.states.Well.initial_proportion).toBe(1);

            expect(model.states.PostSurgery.tunnel_length).toBe(6);
        });

        test('extracts transitions including time-dependent flags', async () => {
            const xml = `<?xml version="1.0"?>
<TreeAgeModel name="M">
  <Transition name="t1" from="A" to="B">
    <Probability>0.1</Probability>
  </Transition>
  <Transition name="t2" from="B" to="C">
    <Probability>pDeath</Probability>
    <TimeDependent/>
  </Transition>
</TreeAgeModel>`;

            const model = await importer.parseXML(xml);

            expect(model.transitions.t1.from).toBe('A');
            expect(model.transitions.t1.to).toBe('B');
            expect(model.transitions.t1.probability).toBe('0.1');
            expect(model.transitions.t1.time_dependent).toBeUndefined();

            expect(model.transitions.t2.time_dependent).toBe(true);
        });

        test('extracts strategies with parameter overrides', async () => {
            const xml = `<?xml version="1.0"?>
<TreeAgeModel name="M">
  <Strategy name="Intervention">
    <Label>New drug</Label>
    <Override parameter="cost">10000</Override>
    <Override parameter="efficacy">0.9</Override>
  </Strategy>
  <Strategy name="Placebo">
    <Label>Standard care</Label>
  </Strategy>
</TreeAgeModel>`;

            const model = await importer.parseXML(xml);

            expect(model.strategies.Intervention.label).toBe('New drug');
            expect(model.strategies.Intervention.parameter_overrides.cost).toBe('10000');
            expect(model.strategies.Intervention.parameter_overrides.efficacy).toBe('0.9');

            expect(model.strategies.Placebo.label).toBe('Standard care');
            expect(Object.keys(model.strategies.Placebo.parameter_overrides)).toHaveLength(0);
        });

        test('throws on invalid XML', async () => {
            const badXml = '<broken><unclosed>';
            await expect(importer.parseXML(badXml)).rejects.toThrow('Invalid XML');
        });

        test('handles empty model gracefully', async () => {
            const xml = `<?xml version="1.0"?><TreeAgeModel/>`;
            const model = await importer.parseXML(xml);

            expect(model.metadata.name).toBe('Imported TreeAge Model');
            expect(model.metadata.author).toBe('Unknown');
            expect(Object.keys(model.parameters)).toHaveLength(0);
            expect(Object.keys(model.states)).toHaveLength(0);
            expect(Object.keys(model.transitions)).toHaveLength(0);
            expect(Object.keys(model.strategies)).toHaveLength(0);
        });

        test('auto-assigns param IDs when name attribute is missing', async () => {
            const xml = `<?xml version="1.0"?>
<TreeAgeModel name="M">
  <Variable><Value>42</Value></Variable>
  <Variable><Value>7</Value></Variable>
</TreeAgeModel>`;

            const model = await importer.parseXML(xml);
            expect(model.parameters).toHaveProperty('param_0');
            expect(model.parameters).toHaveProperty('param_1');
            expect(model.parameters.param_0.value).toBe(42);
        });
    });

    describe('_parseNumber', () => {
        test('returns parsed number for valid string', () => {
            expect(importer._parseNumber('3.14')).toBe(3.14);
            expect(importer._parseNumber('-2.5')).toBe(-2.5);
            expect(importer._parseNumber('0')).toBe(0);
        });

        test('returns default for null/undefined/NaN', () => {
            expect(importer._parseNumber(null, 99)).toBe(99);
            expect(importer._parseNumber(undefined, 5)).toBe(5);
            expect(importer._parseNumber('abc', 10)).toBe(10);
        });

        test('returns 0 as default when no defaultVal given', () => {
            expect(importer._parseNumber(null)).toBe(0);
        });
    });
});

// ============================================================================
// SECTION 2: RCodeExporter
// ============================================================================

describe('RCodeExporter', () => {
    let exporter;

    beforeEach(() => {
        exporter = new RCodeExporter();
    });

    describe('exportMetaAnalysis', () => {
        const mockData = [
            { study: 'Smith 2020', effect: 0.5, variance: 0.04 },
            { study: 'Jones 2021', effect: 0.3, variance: 0.09 },
            { study: 'Lee 2022', effect: 0.7, variance: 0.06 }
        ];

        test('generates metafor code with correct structure', () => {
            const code = exporter.exportMetaAnalysis(mockData);

            expect(code).toContain('library(metafor)');
            expect(code).toContain('study_data <- data.frame(');
            expect(code).toContain('"Smith 2020"');
            expect(code).toContain('rma(yi = yi, vi = vi');
            expect(code).toContain('method = "REML"');
            expect(code).toContain('forest(result)');
            expect(code).toContain('funnel(result)');
        });

        test('generates netmeta code when package is netmeta', () => {
            const code = exporter.exportMetaAnalysis(mockData, { package: 'netmeta' });

            expect(code).toContain('library(netmeta)');
            expect(code).toContain('library(meta)');
            expect(code).toContain('netmeta(');
            expect(code).toContain('netgraph(result)');
        });

        test('respects method option (DL)', () => {
            const code = exporter.exportMetaAnalysis(mockData, { method: 'DL' });
            expect(code).toContain('method = "DL"');
        });

        test('contains header comment with version', () => {
            const code = exporter.exportMetaAnalysis(mockData);
            expect(code).toContain('HTA Artifact Standard - R Export');
            expect(code).toContain('Version: 0.6.0');
        });

        test('includes all study names and numeric values in data frame', () => {
            const code = exporter.exportMetaAnalysis(mockData);
            expect(code).toContain('0.5');
            expect(code).toContain('0.04');
            expect(code).toContain('"Jones 2021"');
        });
    });

    describe('exportMarkovModel', () => {
        const mockModel = {
            parameters: {
                pDeath: { value: 0.02, distribution: { type: 'beta' } },
                cDrug: { value: 5000 }
            },
            states: {
                Healthy: { cost: 100, utility: 0.85 },
                Dead: { cost: 0, utility: 0 }
            },
            transitions: {
                t1: { from: 'Healthy', to: 'Dead', probability: '0.02' }
            },
            settings: { time_horizon: 40 }
        };

        test('generates valid heemod code', () => {
            const code = exporter.exportMarkovModel(mockModel);

            expect(code).toContain('library(heemod)');
            expect(code).toContain('library(dplyr)');
            expect(code).toContain('define_parameters(');
            expect(code).toContain('pDeath = 0.02');
            expect(code).toContain('cDrug = 5000');
            expect(code).toContain('state_Healthy');
            expect(code).toContain('state_Dead');
            expect(code).toContain('define_transition(');
            expect(code).toContain('cycles = 40');
            expect(code).toContain('summary(result)');
            expect(code).toContain('plot(result)');
        });

        test('annotates parameters with distribution type', () => {
            const code = exporter.exportMarkovModel(mockModel);
            expect(code).toContain('pDeath = 0.02  # beta');
        });

        test('builds transition matrix with complement (C)', () => {
            const code = exporter.exportMarkovModel(mockModel);
            // The diagonal should have C for complement
            expect(code).toContain('C');
        });
    });

    describe('exportSurvivalAnalysis', () => {
        const mockData = {
            times: [1, 2, 3, 5, 8],
            events: [1, 0, 1, 1, 0]
        };

        test('generates survival analysis code with required packages', () => {
            const code = exporter.exportSurvivalAnalysis(mockData);

            expect(code).toContain('library(survival)');
            expect(code).toContain('library(flexsurv)');
            expect(code).toContain('library(survminer)');
            expect(code).toContain('Surv(time, status)');
            expect(code).toContain('ggsurvplot(');
        });

        test('includes all 6 parametric distributions', () => {
            const code = exporter.exportSurvivalAnalysis(mockData);

            for (const dist of ['exponential', 'weibull', 'lognormal', 'loglogistic', 'gompertz', 'gamma']) {
                expect(code).toContain(`fit_${dist}`);
                expect(code).toContain(`dist = "${dist}"`);
            }
        });

        test('generates AIC/BIC comparison table', () => {
            const code = exporter.exportSurvivalAnalysis(mockData);
            expect(code).toContain('aic_table');
            expect(code).toContain('AIC');
            expect(code).toContain('BIC');
        });
    });
});

// ============================================================================
// SECTION 3: ExcelHandler
// ============================================================================

describe('ExcelHandler', () => {
    let handler;

    beforeEach(() => {
        handler = new ExcelHandler();
    });

    describe('parseCSV', () => {
        test('parses simple CSV with header', () => {
            const csv = 'study,effect,se\nSmith,0.5,0.1\nJones,0.3,0.15';
            const result = handler.parseCSV(csv);

            // Headers go through _parseValue: 'study', 'effect', 'se' are all strings
            expect(result.headers).toEqual(['study', 'effect', 'se']);
        });

        test('parses header and data rows correctly', () => {
            const csv = 'name,value\nAlpha,10\nBeta,20';
            const result = handler.parseCSV(csv);

            expect(result.headers).toEqual(['name', 'value']);
            expect(result.rows).toHaveLength(2);
            expect(result.rows[0]).toEqual(['Alpha', 10]);
            expect(result.rows[1]).toEqual(['Beta', 20]);
        });

        test('handles quoted fields with embedded delimiters', () => {
            const csv = 'study,effect\n"Smith, 2020",0.5\n"Jones, Jr.",0.3';
            const result = handler.parseCSV(csv);

            expect(result.rows[0][0]).toBe('Smith, 2020');
            expect(result.rows[1][0]).toBe('Jones, Jr.');
        });

        test('parses TSV with custom delimiter', () => {
            const tsv = 'study\teffect\nSmith\t0.5';
            const result = handler.parseCSV(tsv, { delimiter: '\t' });

            expect(result.headers).toEqual(['study', 'effect']);
            expect(result.rows[0]).toEqual(['Smith', 0.5]);
        });

        test('handles hasHeader=false', () => {
            const csv = 'A,1\nB,2';
            const result = handler.parseCSV(csv, { hasHeader: false });

            expect(result.headers).toEqual([]);
            expect(result.rows).toHaveLength(2);
            expect(result.rows[0]).toEqual(['A', 1]);
        });

        test('returns single empty header for empty content', () => {
            const result = handler.parseCSV('');
            // Empty string after trim/split => lines = [''], parsed as header row with 1 element
            expect(result.headers).toEqual(['']);
        });

        test('parses booleans and numbers in values', () => {
            const csv = 'col\ntrue\nfalse\n42\n3.14';
            const result = handler.parseCSV(csv);

            expect(result.rows[0][0]).toBe(true);
            expect(result.rows[1][0]).toBe(false);
            expect(result.rows[2][0]).toBe(42);
            expect(result.rows[3][0]).toBeCloseTo(3.14);
        });
    });

    describe('toCSV', () => {
        test('exports array-of-arrays', () => {
            const data = [[1, 'a'], [2, 'b']];
            const csv = handler.toCSV(data, { headers: ['num', 'letter'] });

            expect(csv).toContain('num,letter');
            expect(csv).toContain('1,a');
            expect(csv).toContain('2,b');
        });

        test('exports array-of-objects with auto-detected headers', () => {
            const data = [
                { study: 'Smith', effect: 0.5 },
                { study: 'Jones', effect: 0.3 }
            ];
            const csv = handler.toCSV(data);

            expect(csv).toContain('study,effect');
            expect(csv).toContain('Smith,0.5');
        });

        test('escapes values containing delimiter', () => {
            const data = [['hello, world', 42]];
            const csv = handler.toCSV(data);

            expect(csv).toContain('"hello, world"');
        });

        test('escapes values containing quotes', () => {
            const data = [['He said "hello"', 1]];
            const csv = handler.toCSV(data);

            expect(csv).toContain('"He said ""hello"""');
        });

        test('handles null and undefined values', () => {
            const data = [[null, undefined, 'ok']];
            const csv = handler.toCSV(data);

            expect(csv).toContain(',,ok');
        });
    });

    describe('importStudyData', () => {
        test('maps standard column names (study, yi, vi)', () => {
            const csv = 'study,yi,vi\nSmith,0.5,0.04\nJones,0.3,0.09';
            const studies = handler.importStudyData(csv);

            expect(studies).toHaveLength(2);
            expect(studies[0].study).toBe('Smith');
            expect(studies[0].effect).toBe(0.5);
            expect(studies[0].variance).toBe(0.04);
        });

        test('maps alternative column names (author, es, stderr)', () => {
            const csv = 'author,es,stderr\nSmith,0.5,0.2\nJones,0.3,0.3';
            const studies = handler.importStudyData(csv);

            expect(studies[0].study).toBe('Smith');
            expect(studies[0].effect).toBe(0.5);
            expect(studies[0].se).toBe(0.2);
        });

        test('calculates variance from SE when variance is missing', () => {
            const csv = 'study,effect,se\nA,0.5,0.2';
            const studies = handler.importStudyData(csv);

            expect(studies[0].se).toBe(0.2);
            expect(studies[0].variance).toBeCloseTo(0.04);
        });

        test('calculates SE from variance when SE is missing', () => {
            const csv = 'study,effect,variance\nA,0.5,0.04';
            const studies = handler.importStudyData(csv);

            expect(studies[0].se).toBeCloseTo(0.2);
        });

        test('calculates SE from CI when SE and variance are missing', () => {
            const csv = 'study,effect,lower,upper\nA,0.5,0.108,0.892';
            const studies = handler.importStudyData(csv);

            // SE = (upper - lower) / (2 * 1.96)
            const expectedSE = (0.892 - 0.108) / (2 * 1.96);
            expect(studies[0].se).toBeCloseTo(expectedSE, 3);
            expect(studies[0].variance).toBeCloseTo(expectedSE * expectedSE, 5);
        });

        test('maps treatment and control columns', () => {
            const csv = 'study,effect,se,treatment,control\nA,0.5,0.1,DrugA,Placebo';
            const studies = handler.importStudyData(csv);

            expect(studies[0].treatment).toBe('DrugA');
            expect(studies[0].control).toBe('Placebo');
        });
    });

    describe('exportResults', () => {
        test('exports meta-analysis results with pooled row', () => {
            const results = {
                studies: [
                    { study: 'A', effect: 0.5, se: 0.1, weight: 50, lower: 0.3, upper: 0.7 }
                ],
                pooled: { effect: 0.5, se: 0.08, lower: 0.34, upper: 0.66 }
            };
            const csv = handler.exportResults(results, 'meta');

            expect(csv).toContain('Study,Effect,SE,Weight,Lower_CI,Upper_CI');
            expect(csv).toContain('Pooled');
        });

        test('exports markov trace', () => {
            const results = {
                states: { Well: {}, Sick: {} },
                trace: { Well: [1, 0.9, 0.8], Sick: [0, 0.1, 0.2] }
            };
            const csv = handler.exportResults(results, 'markov');

            expect(csv).toContain('Cycle,Well,Sick');
            expect(csv).toContain('0,1,0');
            expect(csv).toContain('1,0.9,0.1');
        });

        test('falls back to generic CSV for unknown type', () => {
            const data = [{ a: 1, b: 2 }];
            const csv = handler.exportResults(data, 'unknown');
            expect(csv).toContain('a,b');
            expect(csv).toContain('1,2');
        });
    });

    describe('_escapeCSV', () => {
        test('returns empty string for null/undefined', () => {
            expect(handler._escapeCSV(null, ',')).toBe('');
            expect(handler._escapeCSV(undefined, ',')).toBe('');
        });

        test('wraps values with newlines in quotes', () => {
            expect(handler._escapeCSV('line1\nline2', ',')).toBe('"line1\nline2"');
        });
    });
});

// ============================================================================
// SECTION 4: FHIRAdapter
// ============================================================================

describe('FHIRAdapter', () => {
    let adapter;

    beforeEach(() => {
        adapter = new FHIRAdapter();
    });

    test('fhirVersion is R4', () => {
        expect(adapter.fhirVersion).toBe('R4');
    });

    describe('toEvidenceVariable', () => {
        test('creates valid FHIR EvidenceVariable resource', () => {
            const model = {
                metadata: {
                    id: 'test-123',
                    name: 'Test Model',
                    description: 'A test HTA model'
                },
                states: {
                    Healthy: { label: 'Healthy' },
                    Sick: { label: 'Sick' }
                }
            };

            const fhir = adapter.toEvidenceVariable(model);

            expect(fhir.resourceType).toBe('EvidenceVariable');
            expect(fhir.id).toBe('test-123');
            expect(fhir.status).toBe('active');
            expect(fhir.name).toBe('Test Model');
            expect(fhir.title).toBe('Test Model');
            expect(fhir.description).toBe('A test HTA model');
            expect(fhir.meta.versionId).toBe('1');
        });

        test('includes state characteristics', () => {
            const model = {
                metadata: { name: 'M' },
                states: {
                    Healthy: { label: 'Well' },
                    Dead: { label: 'Death' }
                }
            };

            const fhir = adapter.toEvidenceVariable(model);
            const stateChars = fhir.characteristic.filter(c =>
                c.definitionCodeableConcept?.coding?.[0]?.system === 'urn:hta:state'
            );

            expect(stateChars).toHaveLength(2);
            expect(stateChars[0].definitionCodeableConcept.coding[0].code).toBe('Healthy');
            expect(stateChars[1].definitionCodeableConcept.coding[0].code).toBe('Dead');
        });

        test('includes population characteristic when present', () => {
            const model = {
                metadata: { name: 'M', population: 'Adults aged 50+' },
                states: {}
            };

            const fhir = adapter.toEvidenceVariable(model);
            const popChar = fhir.characteristic.find(c =>
                c.definitionCodeableConcept?.coding?.[0]?.code === 'Patient'
            );

            expect(popChar).toBeDefined();
            expect(popChar.description).toBe('Adults aged 50+');
        });

        test('generates UUID-format id when metadata has no id', () => {
            const model = { metadata: {}, states: {} };
            const fhir = adapter.toEvidenceVariable(model);
            expect(fhir.id).toMatch(/^[0-9a-f]{8}-/);
        });
    });

    describe('toEvidence', () => {
        test('creates FHIR Evidence resource with statistics', () => {
            const results = { icer: 35000, costs: 50000, qalys: 8.5 };
            const model = { metadata: { name: 'Drug A Analysis' } };

            const fhir = adapter.toEvidence(results, model);

            expect(fhir.resourceType).toBe('Evidence');
            expect(fhir.status).toBe('active');
            expect(fhir.title).toContain('Drug A Analysis');

            const icerStat = fhir.statistic.find(s =>
                s.statisticType.coding[0].code === 'ICER'
            );
            expect(icerStat.quantity.value).toBe(35000);
            expect(icerStat.quantity.unit).toBe('$/QALY');

            const costStat = fhir.statistic.find(s =>
                s.statisticType.coding[0].code === 'cost'
            );
            expect(costStat.quantity.value).toBe(50000);

            const qalyStat = fhir.statistic.find(s =>
                s.statisticType.coding[0].code === 'QALY'
            );
            expect(qalyStat.quantity.value).toBe(8.5);
        });

        test('handles missing results gracefully', () => {
            const results = {};
            const model = { metadata: {} };
            const fhir = adapter.toEvidence(results, model);

            expect(fhir.statistic).toEqual([]);
        });
    });

    describe('toBundle', () => {
        test('creates FHIR Bundle with EvidenceVariable and Evidence', () => {
            const model = { metadata: { name: 'M' }, states: {} };
            const results = { icer: 20000 };

            const bundle = adapter.toBundle(model, results);

            expect(bundle.resourceType).toBe('Bundle');
            expect(bundle.type).toBe('collection');
            expect(bundle.entry).toHaveLength(2);
            expect(bundle.entry[0].resource.resourceType).toBe('EvidenceVariable');
            expect(bundle.entry[1].resource.resourceType).toBe('Evidence');
            expect(bundle.entry[0].fullUrl).toMatch(/^urn:uuid:/);
        });

        test('creates Bundle with only EvidenceVariable when no results', () => {
            const model = { metadata: { name: 'M' }, states: {} };

            const bundle = adapter.toBundle(model, null);

            expect(bundle.entry).toHaveLength(1);
            expect(bundle.entry[0].resource.resourceType).toBe('EvidenceVariable');
        });
    });

    describe('fromFHIR', () => {
        test('parses EvidenceVariable back to HTA model', () => {
            const resource = {
                resourceType: 'EvidenceVariable',
                id: 'ev-1',
                title: 'My Model',
                description: 'Test desc',
                characteristic: [
                    {
                        description: 'Healthy',
                        definitionCodeableConcept: {
                            coding: [{ system: 'urn:hta:state', code: 'healthy', display: 'Healthy' }]
                        }
                    }
                ]
            };

            const model = adapter.fromFHIR(resource);

            expect(model.metadata.id).toBe('ev-1');
            expect(model.metadata.name).toBe('My Model');
            expect(model.metadata.description).toBe('Test desc');
            expect(model.states.healthy.label).toBe('Healthy');
        });

        test('parses Evidence back to results', () => {
            const resource = {
                resourceType: 'Evidence',
                statistic: [
                    {
                        statisticType: { coding: [{ code: 'ICER' }] },
                        quantity: { value: 45000 }
                    },
                    {
                        statisticType: { coding: [{ code: 'QALY' }] },
                        quantity: { value: 7.2 }
                    }
                ]
            };

            const results = adapter.fromFHIR(resource);

            expect(results.icer).toBe(45000);
            expect(results.qaly).toBe(7.2);
        });

        test('parses Bundle into models and results arrays', () => {
            const bundle = {
                resourceType: 'Bundle',
                entry: [
                    {
                        resource: {
                            resourceType: 'EvidenceVariable',
                            id: 'ev-1',
                            title: 'M1',
                            characteristic: []
                        }
                    },
                    {
                        resource: {
                            resourceType: 'Evidence',
                            statistic: [
                                { statisticType: { coding: [{ code: 'cost' }] }, quantity: { value: 1000 } }
                            ]
                        }
                    }
                ]
            };

            const result = adapter.fromFHIR(bundle);

            expect(result.models).toHaveLength(1);
            expect(result.results).toHaveLength(1);
            expect(result.results[0].cost).toBe(1000);
        });

        test('throws on unsupported resource type', () => {
            expect(() => adapter.fromFHIR({ resourceType: 'Patient' }))
                .toThrow('Unsupported FHIR resource type: Patient');
        });
    });

    describe('round-trip EvidenceVariable', () => {
        test('model -> FHIR -> model preserves key fields', () => {
            const original = {
                metadata: { id: 'rt-1', name: 'RoundTrip', description: 'Test' },
                states: {
                    Well: { label: 'Feeling well' },
                    Ill: { label: 'Feeling ill' }
                }
            };

            const fhir = adapter.toEvidenceVariable(original);
            const restored = adapter.fromFHIR(fhir);

            expect(restored.metadata.name).toBe('RoundTrip');
            expect(restored.metadata.description).toBe('Test');
            expect(Object.keys(restored.states)).toHaveLength(2);
            expect(restored.states.Well.label).toBe('Feeling well');
        });
    });
});

// ============================================================================
// SECTION 5: BibTeXExporter
// ============================================================================

describe('BibTeXExporter', () => {
    let bib;

    beforeEach(() => {
        bib = new BibTeXExporter();
    });

    describe('export', () => {
        test('formats single citation correctly', () => {
            const citations = [{
                type: 'article',
                key: 'smith2020',
                author: 'Smith, John',
                title: 'A Great Study',
                journal: 'BMJ',
                year: 2020,
                volume: '370',
                doi: '10.1234/example'
            }];

            const result = bib.export(citations);

            expect(result).toContain('@article{smith2020,');
            expect(result).toContain('author = {Smith, John}');
            expect(result).toContain('title = {A Great Study}');
            expect(result).toContain('journal = {BMJ}');
            expect(result).toContain('year = {2020}');
            expect(result).toContain('doi = {10.1234/example}');
        });

        test('formats multiple citations separated by blank lines', () => {
            const citations = [
                { type: 'article', key: 'a1', author: 'A', title: 'T1', year: 2020 },
                { type: 'book', key: 'b1', author: 'B', title: 'T2', year: 2021 }
            ];

            const result = bib.export(citations);

            expect(result).toContain('@article{a1,');
            expect(result).toContain('@book{b1,');
            // Two entries separated by blank line
            const entries = result.split('\n\n');
            expect(entries.length).toBeGreaterThanOrEqual(2);
        });

        test('defaults to misc when type is missing', () => {
            const citations = [{ key: 'unknown', title: 'Something' }];
            const result = bib.export(citations);
            expect(result).toContain('@misc{');
        });

        test('auto-generates key from author and year', () => {
            const citations = [{ author: 'Doe, Jane', year: 2023, title: 'Test' }];
            const result = bib.export(citations);
            expect(result).toContain('doe2023');
        });

        test('escapes special characters in values', () => {
            const citations = [{
                key: 'test',
                title: 'Analysis of {BRCA1} mutations',
                author: "O'Brien, Sean"
            }];
            const result = bib.export(citations);
            expect(result).toContain('\\{BRCA1\\}');
        });
    });

    describe('generateModelCitation', () => {
        test('creates techreport citation for HTA model', () => {
            const model = {
                metadata: { id: 'mod1', name: 'Drug X CEA', author: 'Smith' }
            };
            const results = { icer: 25000 };

            const citation = bib.generateModelCitation(model, results);

            expect(citation.type).toBe('techreport');
            expect(citation.title).toBe('Drug X CEA');
            expect(citation.author).toBe('Smith');
            expect(citation.institution).toBe('HTA Artifact Standard');
            expect(citation.note).toContain('25000');
            expect(citation.note).toContain('QALY');
        });

        test('uses defaults when metadata is sparse', () => {
            const citation = bib.generateModelCitation({ metadata: {} }, null);

            expect(citation.author).toBe('HTA Artifact Standard');
            expect(citation.title).toBe('Health Technology Assessment Model');
            expect(citation.note).toContain('N/A');
        });

        test('citation can be formatted via export()', () => {
            const citation = bib.generateModelCitation(
                { metadata: { name: 'Test' } }, { icer: 50000 }
            );
            const formatted = bib.export([citation]);

            expect(formatted).toContain('@techreport{');
            expect(formatted).toContain('institution = {HTA Artifact Standard}');
        });
    });
});
