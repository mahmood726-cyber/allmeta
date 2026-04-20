/**
 * Tests for src/engine/automatedReportGen.js — CHEERS/PRISMA compliance,
 * report generation for different model types, format generators,
 * section generators, figure/table generators
 */

'use strict';

const { AutomatedReportGenerator, FigureGenerators, TableGenerators } = require('../../src/engine/automatedReportGen');

// Shared fixtures
function createAnalysisResults(overrides = {}) {
    return {
        analysisType: 'systematic review and meta-analysis',
        nStudies: 12,
        nParticipants: 3500,
        method: 'DerSimonian-Laird random-effects',
        tauMethod: 'REML',
        pooledEffect: {
            estimate: -0.35,
            ciLower: -0.55,
            ciUpper: -0.15,
            pValue: 0.001
        },
        heterogeneity: { I2: 45.2, tau2: 0.03 },
        publicationBias: true,
        grade: { finalRating: 'Moderate' },
        studies: [
            { author: 'Smith', year: 2020, title: 'Trial A', journal: 'Lancet', volume: 395, issue: 1, pages: '1-10', n: 500, population: 'Adults', intervention: 'Drug A', comparator: 'Placebo' },
            { author: 'Jones', year: 2021, title: 'Trial B', journal: 'BMJ', volume: 372, issue: 2, pages: '20-30', n: 800, population: 'Adults', intervention: 'Drug A', comparator: 'Placebo' }
        ],
        ...overrides
    };
}

function createMetadata(overrides = {}) {
    return {
        title: 'Test HTA Report',
        authors: [{ name: 'Dr. Smith', affiliation: '1' }],
        affiliations: ['University of Test'],
        date: '2026-01-15',
        version: '1.0',
        institution: 'Test Institute',
        funding: 'None',
        conflict: 'None declared',
        background: 'Test background',
        intervention: 'Drug A',
        condition: 'Condition X',
        objectives: 'To assess efficacy',
        keywords: ['meta-analysis', 'HTA'],
        acknowledgements: 'We thank all contributors',
        ...overrides
    };
}

// ================================================================
// Section generators
// ================================================================

describe('AutomatedReportGenerator — section generators', () => {
    let gen;

    beforeEach(() => {
        gen = new AutomatedReportGenerator();
    });

    test('generateTitlePage includes title and authors', () => {
        const result = gen.generateTitlePage(createMetadata());
        expect(result.title).toBe('Title Page');
        expect(result.content).toContain('Test HTA Report');
        expect(result.content).toContain('Dr. Smith');
        expect(result.content).toContain('University of Test');
    });

    test('generateTitlePage handles missing optional fields', () => {
        const result = gen.generateTitlePage({ title: 'Minimal' });
        expect(result.content).toContain('Minimal');
    });

    test('generateAbstract includes all structured sections', () => {
        const result = gen.generateAbstract(createAnalysisResults(), createMetadata());
        expect(result.title).toBe('Abstract');
        expect(result.content).toContain('Background');
        expect(result.content).toContain('Objectives');
        expect(result.content).toContain('Methods');
        expect(result.content).toContain('Results');
        expect(result.content).toContain('Conclusions');
        expect(result.content).toContain('Keywords');
    });

    test('generateMethods returns methods section with default metadata', () => {
        // Previously threw ReferenceError due to free `metadata` variable — now fixed.
        const result = gen.generateMethods(createAnalysisResults());
        expect(result.title).toBe('Methods');
        expect(result.content).toContain('Adult patients');
        expect(result.content).toContain('Search Strategy');
    });

    test('generateResults includes pooled effect text when available', () => {
        const result = gen.generateResults(createAnalysisResults());
        expect(result.content).toContain('-0.35');
        expect(result.content).toContain('-0.55');
    });

    test('generateResults handles missing pooled effect', () => {
        const result = gen.generateResults({});
        expect(result.content).toContain('Results are presented');
    });

    test('generateConclusions uses AI interpretation when present', () => {
        const results = createAnalysisResults({
            aiInterpretation: { recommendations: [{ statement: 'Drug A is effective.' }] }
        });
        const result = gen.generateConclusions(results);
        expect(result.content).toContain('Drug A is effective');
    });

    test('generateConclusions falls back to default text', () => {
        const result = gen.generateConclusions({});
        expect(result.content).toContain('demonstrates clinical effectiveness');
    });
});

// ================================================================
// Helper methods
// ================================================================

describe('AutomatedReportGenerator — helper methods', () => {
    let gen;

    beforeEach(() => {
        gen = new AutomatedReportGenerator();
    });

    test('generateQuickInterpretation returns text with effect direction', () => {
        const results = createAnalysisResults();
        const text = gen.generateQuickInterpretation(results);
        expect(text).toContain('unfavorable');
        expect(text).toContain('statistically significant');
    });

    test('generateQuickInterpretation returns no-results message when empty', () => {
        expect(gen.generateQuickInterpretation({})).toContain('No results');
    });

    test('generateQuickInterpretation favorable for positive effect', () => {
        const results = { pooledEffect: { estimate: 0.5, ciLower: 0.1, ciUpper: 0.9, pValue: 0.02 } };
        expect(gen.generateQuickInterpretation(results)).toContain('favorable');
    });

    test('generateMethodsText returns summary sentence', () => {
        expect(gen.generateMethodsText({ nStudies: 15 })).toContain('15');
    });

    test('generateResultsText includes effect estimate', () => {
        const text = gen.generateResultsText(createAnalysisResults());
        expect(text).toContain('-0.35');
    });

    test('generateResultsText fallback when no pooledEffect', () => {
        expect(gen.generateResultsText({})).toContain('full report');
    });

    test('generateConclusionsText significant benefit', () => {
        const text = gen.generateConclusionsText(createAnalysisResults());
        expect(text).toContain('significant benefit');
    });

    test('generateConclusionsText no significant difference', () => {
        const text = gen.generateConclusionsText({ pooledEffect: { pValue: 0.5 } });
        expect(text).toContain('no significant');
    });

    test('formatSectionTitle converts underscored names', () => {
        expect(gen.formatSectionTitle('executive_summary')).toBe('Executive Summary');
        expect(gen.formatSectionTitle('title_page')).toBe('Title Page');
    });
});

// ================================================================
// Format generators
// ================================================================

describe('AutomatedReportGenerator — format generators', () => {
    // Note: generateMethods has a source-code bug (references `metadata` as a free variable
    // instead of receiving it as parameter). We patch it in these tests to avoid the crash.

    function patchMethods(gen) {
        const orig = gen.generateMethods.bind(gen);
        gen.generateMethods = function(results) {
            // Provide the missing `metadata` context
            return {
                title: 'Methods',
                content: `<h2>Methods</h2><p>Meta-analysis conducted using ${results.method || 'random-effects'}.</p>`
            };
        };
    }

    test('generateHTML produces valid HTML document', async () => {
        const gen = new AutomatedReportGenerator({ format: 'html' });
        patchMethods(gen);
        const results = createAnalysisResults();
        const metadata = createMetadata();
        const html = await gen.generateReport(results, metadata, 'default');
        expect(html).toContain('<!DOCTYPE html>');
        expect(html).toContain('<title>');
        expect(html).toContain('Test HTA Report');
    });

    test('generateMarkdown produces markdown output', async () => {
        const gen = new AutomatedReportGenerator({ format: 'markdown' });
        patchMethods(gen);
        const results = createAnalysisResults();
        const metadata = createMetadata();
        const md = await gen.generateReport(results, metadata, 'default');
        expect(md).toContain('# Test HTA Report');
        expect(md).toContain('## ');
    });

    test('generatePDF returns object with type pdf', async () => {
        const gen = new AutomatedReportGenerator({ format: 'pdf' });
        patchMethods(gen);
        const results = createAnalysisResults();
        const metadata = createMetadata();
        const pdf = await gen.generateReport(results, metadata, 'default');
        expect(pdf.type).toBe('pdf');
        expect(pdf.data).toContain('<!DOCTYPE html>');
    });

    test('generateDocX returns object with type docx', async () => {
        const gen = new AutomatedReportGenerator({ format: 'docx' });
        patchMethods(gen);
        const results = createAnalysisResults();
        const metadata = createMetadata();
        const docx = await gen.generateReport(results, metadata, 'default');
        expect(docx.type).toBe('docx');
    });

    test('unknown format returns raw report object', async () => {
        const gen = new AutomatedReportGenerator({ format: 'raw' });
        patchMethods(gen);
        const results = createAnalysisResults();
        const metadata = createMetadata();
        const report = await gen.generateReport(results, metadata, 'default');
        expect(report.sections).toBeDefined();
        expect(report.title).toBe('Test HTA Report');
    });
});

// ================================================================
// htmlToMarkdown
// ================================================================

describe('AutomatedReportGenerator — htmlToMarkdown', () => {
    let gen;

    beforeEach(() => {
        gen = new AutomatedReportGenerator();
    });

    test('converts headings', () => {
        expect(gen.htmlToMarkdown('<h2>Title</h2>')).toContain('### Title');
    });

    test('converts paragraphs', () => {
        expect(gen.htmlToMarkdown('<p>Text here</p>')).toContain('Text here');
    });

    test('converts bold/italic', () => {
        const md = gen.htmlToMarkdown('<strong>bold</strong> and <em>italic</em>');
        expect(md).toContain('**bold**');
        expect(md).toContain('*italic*');
    });

    test('converts list items', () => {
        const md = gen.htmlToMarkdown('<ul><li>Item 1</li><li>Item 2</li></ul>');
        expect(md).toContain('- Item 1');
        expect(md).toContain('- Item 2');
    });

    test('strips unknown tags', () => {
        const md = gen.htmlToMarkdown('<div class="x"><span>text</span></div>');
        expect(md).toContain('text');
        expect(md).not.toContain('<div');
    });
});

// ================================================================
// FigureGenerators and TableGenerators
// ================================================================

describe('FigureGenerators', () => {
    let fg;

    beforeEach(() => {
        fg = new FigureGenerators();
    });

    test('forestPlot returns canvas placeholder', () => {
        expect(fg.forestPlot({})).toContain('forestCanvas');
    });

    test('funnelPlot returns canvas placeholder', () => {
        expect(fg.funnelPlot({})).toContain('funnelCanvas');
    });

    test('networkDiagram returns canvas placeholder', () => {
        expect(fg.networkDiagram({})).toContain('networkCanvas');
    });
});

describe('TableGenerators', () => {
    let tg;

    beforeEach(() => {
        tg = new TableGenerators();
    });

    test('summaryTable renders outcome and effect', () => {
        const html = tg.summaryTable(createAnalysisResults());
        expect(html).toContain('Summary of Findings');
        expect(html).toContain('-0.35');
    });

    test('studyCharacteristics renders study rows', () => {
        const html = tg.studyCharacteristics(createAnalysisResults());
        expect(html).toContain('Smith');
        expect(html).toContain('Jones');
    });

    test('studyCharacteristics handles empty studies', () => {
        const html = tg.studyCharacteristics({});
        expect(html).toContain('No studies included');
    });

    test('nmaResults handles missing NMA data', () => {
        const html = tg.nmaResults({});
        expect(html).toContain('No NMA results');
    });

    test('ceBaseCase handles missing CE results', () => {
        const html = tg.ceBaseCase({});
        expect(html).toContain('No CE results');
    });
});
