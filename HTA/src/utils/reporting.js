/**
 * HTA Artifact Standard - Reporting & Export Module
 * Version: 0.6.0
 *
 * Comprehensive reporting capabilities for HTA submissions
 * Supports PDF, Word (DOCX), NICE templates, and citation management
 */

'use strict';

// =============================================================================
// PDF REPORTER
// =============================================================================

class PDFReporter {
    constructor(options = {}) {
        this.options = {
            pageSize: 'A4',
            margins: { top: 40, right: 40, bottom: 40, left: 40 },
            fontSize: 11,
            fontFamily: 'Helvetica',
            lineHeight: 1.4,
            ...options
        };

        this.pageWidth = this.options.pageSize === 'A4' ? 595.28 : 612;
        this.pageHeight = this.options.pageSize === 'A4' ? 841.89 : 792;
        this.contentWidth = this.pageWidth - this.options.margins.left - this.options.margins.right;

        this.pages = [];
        this.currentPage = null;
        this.y = 0;
        this.pageNumber = 0;
    }

    /**
     * Initialize new document
     */
    newDocument(metadata = {}) {
        this.pages = [];
        this.metadata = {
            title: 'HTA Report',
            author: 'HTA Artifact Standard',
            subject: 'Health Technology Assessment',
            creator: 'HTA-AS v0.6.0',
            creationDate: new Date(),
            ...metadata
        };
        this.addPage();
        return this;
    }

    /**
     * Add new page
     */
    addPage() {
        this.pageNumber++;
        this.currentPage = {
            number: this.pageNumber,
            content: [],
            images: [],
            tables: []
        };
        this.pages.push(this.currentPage);
        this.y = this.options.margins.top;
        return this;
    }

    /**
     * Add title
     */
    addTitle(text, level = 1) {
        const sizes = { 1: 24, 2: 18, 3: 14, 4: 12 };
        const fontSize = sizes[level] || 12;

        if (this.y + fontSize * 2 > this.pageHeight - this.options.margins.bottom) {
            this.addPage();
        }

        this.currentPage.content.push({
            type: 'text',
            text: text,
            x: this.options.margins.left,
            y: this.y,
            fontSize: fontSize,
            fontWeight: 'bold',
            color: level === 1 ? '#1a365d' : '#2d3748'
        });

        this.y += fontSize * this.options.lineHeight + (level === 1 ? 20 : 10);
        return this;
    }

    /**
     * Add paragraph
     */
    addParagraph(text, options = {}) {
        const fontSize = options.fontSize || this.options.fontSize;
        const maxWidth = options.maxWidth || this.contentWidth;

        // Simple word wrap
        const words = text.split(' ');
        const lines = [];
        let currentLine = '';
        const charWidth = fontSize * 0.5;
        const maxChars = Math.floor(maxWidth / charWidth);

        for (const word of words) {
            if ((currentLine + ' ' + word).length <= maxChars) {
                currentLine += (currentLine ? ' ' : '') + word;
            } else {
                if (currentLine) lines.push(currentLine);
                currentLine = word;
            }
        }
        if (currentLine) lines.push(currentLine);

        for (const line of lines) {
            if (this.y + fontSize > this.pageHeight - this.options.margins.bottom) {
                this.addPage();
            }

            this.currentPage.content.push({
                type: 'text',
                text: line,
                x: this.options.margins.left,
                y: this.y,
                fontSize: fontSize,
                color: options.color || '#1a202c'
            });

            this.y += fontSize * this.options.lineHeight;
        }

        this.y += fontSize * 0.5; // Paragraph spacing
        return this;
    }

    /**
     * Add bullet list
     */
    addBulletList(items) {
        for (const item of items) {
            this.addParagraph(`• ${item}`, { fontSize: this.options.fontSize });
        }
        return this;
    }

    /**
     * Add table
     */
    addTable(headers, rows, options = {}) {
        const cellPadding = options.cellPadding || 5;
        const headerBg = options.headerBg || '#e2e8f0';
        const fontSize = options.fontSize || 10;
        const colCount = headers.length;
        const colWidth = this.contentWidth / colCount;
        const rowHeight = fontSize * 2 + cellPadding * 2;

        // Check if table fits
        const tableHeight = rowHeight * (rows.length + 1);
        if (this.y + tableHeight > this.pageHeight - this.options.margins.bottom) {
            this.addPage();
        }

        const table = {
            type: 'table',
            x: this.options.margins.left,
            y: this.y,
            headers: headers,
            rows: rows,
            colWidth: colWidth,
            rowHeight: rowHeight,
            headerBg: headerBg,
            fontSize: fontSize
        };

        this.currentPage.tables.push(table);
        this.y += tableHeight + 10;
        return this;
    }

    /**
     * Add image placeholder (base64 or reference)
     */
    addImage(imageData, options = {}) {
        const width = options.width || 400;
        const height = options.height || 300;

        if (this.y + height > this.pageHeight - this.options.margins.bottom) {
            this.addPage();
        }

        this.currentPage.images.push({
            type: 'image',
            data: imageData,
            x: options.x || this.options.margins.left,
            y: this.y,
            width: width,
            height: height,
            caption: options.caption
        });

        this.y += height + (options.caption ? 20 : 10);
        return this;
    }

    /**
     * Add horizontal line
     */
    addLine() {
        this.currentPage.content.push({
            type: 'line',
            x1: this.options.margins.left,
            y1: this.y,
            x2: this.pageWidth - this.options.margins.right,
            y2: this.y,
            color: '#cbd5e0',
            width: 1
        });
        this.y += 10;
        return this;
    }

    /**
     * Add page break
     */
    addPageBreak() {
        this.addPage();
        return this;
    }

    /**
     * Generate PDF-like structure (can be used with jsPDF or similar)
     */
    generate() {
        return {
            metadata: this.metadata,
            pages: this.pages,
            pageSize: { width: this.pageWidth, height: this.pageHeight },
            margins: this.options.margins,
            totalPages: this.pages.length
        };
    }

    /**
     * Generate HTA Executive Summary
     */
    generateExecutiveSummary(results) {
        this.newDocument({ title: 'HTA Executive Summary' });

        this.addTitle('Executive Summary', 1);
        this.addLine();

        this.addTitle('Technology Overview', 2);
        this.addParagraph(results.technologyDescription || 'Technology description not provided.');

        this.addTitle('Clinical Effectiveness', 2);
        if (results.clinicalEffectiveness) {
            this.addParagraph(`Primary outcome: ${results.clinicalEffectiveness.primaryOutcome}`);
            this.addParagraph(`Effect estimate: ${results.clinicalEffectiveness.effectEstimate}`);
        }

        this.addTitle('Cost-Effectiveness Results', 2);
        if (results.costEffectiveness) {
            const ce = results.costEffectiveness;
            this.addTable(
                ['Metric', 'Intervention', 'Comparator', 'Incremental'],
                [
                    ['Total Costs', ce.interventionCost, ce.comparatorCost, ce.incrementalCost],
                    ['Total QALYs', ce.interventionQALYs, ce.comparatorQALYs, ce.incrementalQALYs],
                    ['ICER', '-', '-', ce.icer]
                ]
            );
        }

        this.addTitle('Budget Impact', 2);
        if (results.budgetImpact) {
            this.addParagraph(`Year 1: ${results.budgetImpact.year1}`);
            this.addParagraph(`5-Year Total: ${results.budgetImpact.fiveYearTotal}`);
        }

        this.addTitle('Key Uncertainties', 2);
        if (results.uncertainties && results.uncertainties.length > 0) {
            this.addBulletList(results.uncertainties);
        }

        this.addTitle('Conclusion', 2);
        this.addParagraph(results.conclusion || 'Conclusion not provided.');

        return this.generate();
    }
}


// =============================================================================
// WORD (DOCX) REPORTER
// =============================================================================

class WordReporter {
    constructor(options = {}) {
        this.options = {
            fontSize: 11,
            fontFamily: 'Calibri',
            ...options
        };

        this.content = [];
        this.styles = [];
        this.numbering = [];
    }

    /**
     * Initialize new document
     */
    newDocument(metadata = {}) {
        this.metadata = {
            title: 'HTA Report',
            author: 'HTA Artifact Standard',
            description: 'Health Technology Assessment Report',
            ...metadata
        };
        this.content = [];
        return this;
    }

    /**
     * Add heading
     */
    addHeading(text, level = 1) {
        this.content.push({
            type: 'heading',
            level: level,
            text: text,
            style: `Heading${level}`
        });
        return this;
    }

    /**
     * Add paragraph
     */
    addParagraph(text, options = {}) {
        this.content.push({
            type: 'paragraph',
            text: text,
            alignment: options.alignment || 'left',
            bold: options.bold || false,
            italic: options.italic || false,
            fontSize: options.fontSize || this.options.fontSize
        });
        return this;
    }

    /**
     * Add table
     */
    addTable(headers, rows, options = {}) {
        this.content.push({
            type: 'table',
            headers: headers,
            rows: rows,
            width: options.width || '100%',
            headerStyle: options.headerStyle || { bold: true, bgColor: '#4472C4', color: '#FFFFFF' }
        });
        return this;
    }

    /**
     * Add bullet list
     */
    addBulletList(items) {
        this.content.push({
            type: 'bulletList',
            items: items
        });
        return this;
    }

    /**
     * Add numbered list
     */
    addNumberedList(items) {
        this.content.push({
            type: 'numberedList',
            items: items
        });
        return this;
    }

    /**
     * Add image
     */
    addImage(imageData, options = {}) {
        this.content.push({
            type: 'image',
            data: imageData,
            width: options.width || 400,
            height: options.height || 300,
            caption: options.caption
        });
        return this;
    }

    /**
     * Add page break
     */
    addPageBreak() {
        this.content.push({ type: 'pageBreak' });
        return this;
    }

    /**
     * Add table of contents placeholder
     */
    addTableOfContents() {
        this.content.push({
            type: 'toc',
            title: 'Table of Contents'
        });
        return this;
    }

    /**
     * Generate DOCX-compatible structure
     * Can be used with docx.js or similar libraries
     */
    generate() {
        return {
            metadata: this.metadata,
            content: this.content,
            styles: this.generateStyles()
        };
    }

    /**
     * Generate default styles
     */
    generateStyles() {
        return {
            Normal: {
                font: this.options.fontFamily,
                size: this.options.fontSize * 2, // Half-points
                color: '000000'
            },
            Heading1: {
                font: this.options.fontFamily,
                size: 32,
                bold: true,
                color: '1F497D'
            },
            Heading2: {
                font: this.options.fontFamily,
                size: 26,
                bold: true,
                color: '1F497D'
            },
            Heading3: {
                font: this.options.fontFamily,
                size: 24,
                bold: true,
                color: '1F497D'
            },
            TableHeader: {
                font: this.options.fontFamily,
                size: 22,
                bold: true,
                bgColor: '4472C4',
                color: 'FFFFFF'
            }
        };
    }

    /**
     * Generate full HTA submission document
     */
    generateHTASubmission(data) {
        this.newDocument({
            title: data.title || 'HTA Submission',
            author: data.author || 'Sponsor'
        });

        // Title page
        this.addHeading(data.title, 1);
        this.addParagraph(`Submitted to: ${data.agency || 'HTA Agency'}`);
        this.addParagraph(`Date: ${new Date().toLocaleDateString()}`);
        this.addParagraph(`Sponsor: ${data.sponsor || 'Not specified'}`);
        this.addPageBreak();

        // Table of contents
        this.addTableOfContents();
        this.addPageBreak();

        // Executive Summary
        this.addHeading('Executive Summary', 1);
        if (data.executiveSummary) {
            this.addParagraph(data.executiveSummary);
        }
        this.addPageBreak();

        // Background
        this.addHeading('1. Background', 1);
        this.addHeading('1.1 Disease Area', 2);
        this.addParagraph(data.diseaseArea || 'Disease area description.');
        this.addHeading('1.2 Current Treatment Landscape', 2);
        this.addParagraph(data.treatmentLandscape || 'Current treatment options.');

        // Technology Description
        this.addHeading('2. Technology Description', 1);
        this.addHeading('2.1 Mechanism of Action', 2);
        this.addParagraph(data.mechanismOfAction || 'Mechanism description.');
        this.addHeading('2.2 Administration and Dosing', 2);
        this.addParagraph(data.dosing || 'Dosing information.');

        // Clinical Evidence
        this.addHeading('3. Clinical Evidence', 1);
        this.addHeading('3.1 Systematic Review Methods', 2);
        this.addParagraph(data.systematicReviewMethods || 'Methods description.');
        this.addHeading('3.2 Clinical Trial Results', 2);
        if (data.clinicalTrials && data.clinicalTrials.length > 0) {
            const headers = ['Trial', 'Design', 'N', 'Primary Endpoint', 'Result'];
            const rows = data.clinicalTrials.map(t => [
                t.name, t.design, t.n, t.primaryEndpoint, t.result
            ]);
            this.addTable(headers, rows);
        }

        // Economic Model
        this.addHeading('4. Economic Evaluation', 1);
        this.addHeading('4.1 Model Structure', 2);
        this.addParagraph(data.modelStructure || 'Model structure description.');
        this.addHeading('4.2 Model Inputs', 2);
        if (data.modelInputs && data.modelInputs.length > 0) {
            const headers = ['Parameter', 'Base Case', 'Distribution', 'Source'];
            const rows = data.modelInputs.map(i => [
                i.name, i.baseCase, i.distribution, i.source
            ]);
            this.addTable(headers, rows);
        }
        this.addHeading('4.3 Base Case Results', 2);
        if (data.baseCaseResults) {
            this.addParagraph(`ICER: ${data.baseCaseResults.icer}`);
        }

        // Budget Impact
        this.addHeading('5. Budget Impact Analysis', 1);
        this.addParagraph(data.budgetImpact || 'Budget impact analysis.');

        // Discussion
        this.addHeading('6. Discussion', 1);
        this.addHeading('6.1 Strengths and Limitations', 2);
        this.addParagraph(data.strengthsLimitations || 'Strengths and limitations.');
        this.addHeading('6.2 Generalizability', 2);
        this.addParagraph(data.generalizability || 'Generalizability considerations.');

        // Conclusion
        this.addHeading('7. Conclusion', 1);
        this.addParagraph(data.conclusion || 'Conclusion.');

        // References
        this.addPageBreak();
        this.addHeading('References', 1);
        if (data.references && data.references.length > 0) {
            this.addNumberedList(data.references);
        }

        return this.generate();
    }
}


// =============================================================================
// NICE TEMPLATE GENERATOR
// =============================================================================

class NICETemplateGenerator {
    constructor() {
        this.sections = [];
    }

    /**
     * Generate NICE Single Technology Appraisal (STA) template structure
     */
    generateSTATemplate(data = {}) {
        return {
            documentType: 'NICE_STA',
            version: '2024.1',
            sections: [
                this.generateSection('A', 'Executive Summary', [
                    { id: 'A.1', title: 'Overview of the technology', content: data.technologyOverview },
                    { id: 'A.2', title: 'Treatment pathway', content: data.treatmentPathway },
                    { id: 'A.3', title: 'Key findings', content: data.keyFindings },
                    { id: 'A.4', title: 'Cost-effectiveness results', content: data.costEffectivenessResults },
                    { id: 'A.5', title: 'Decision problem', content: data.decisionProblem }
                ]),
                this.generateSection('B', 'The Technology', [
                    { id: 'B.1', title: 'Description of the technology', content: data.technologyDescription },
                    { id: 'B.2', title: 'Marketing authorisation/CE mark status', content: data.regulatoryStatus },
                    { id: 'B.3', title: 'Administration and costs of the technology', content: data.administrationCosts }
                ]),
                this.generateSection('C', 'Clinical Evidence', [
                    { id: 'C.1', title: 'Identification and selection of relevant studies', content: data.studySelection },
                    { id: 'C.2', title: 'List of relevant clinical effectiveness studies', content: data.studyList },
                    { id: 'C.3', title: 'Summary of methodology of relevant studies', content: data.methodologySummary },
                    { id: 'C.4', title: 'Results of the relevant clinical effectiveness studies', content: data.effectivenessResults },
                    { id: 'C.5', title: 'Meta-analysis', content: data.metaAnalysis },
                    { id: 'C.6', title: 'Indirect and mixed treatment comparisons', content: data.indirectComparisons },
                    { id: 'C.7', title: 'Safety', content: data.safety }
                ]),
                this.generateSection('D', 'Economic Evidence', [
                    { id: 'D.1', title: 'Published cost-effectiveness studies', content: data.publishedStudies },
                    { id: 'D.2', title: 'De novo cost-effectiveness analysis', content: data.deNovoAnalysis },
                    { id: 'D.3', title: 'Clinical parameters and variables', content: data.clinicalParameters },
                    { id: 'D.4', title: 'Resource use and costs', content: data.resourceCosts },
                    { id: 'D.5', title: 'Base-case results', content: data.baseCaseResults },
                    { id: 'D.6', title: 'Sensitivity analyses', content: data.sensitivityAnalyses },
                    { id: 'D.7', title: 'Subgroup analysis', content: data.subgroupAnalysis },
                    { id: 'D.8', title: 'Validation', content: data.validation },
                    { id: 'D.9', title: 'Interpretation of economic evidence', content: data.interpretation }
                ]),
                this.generateSection('E', 'Budget Impact', [
                    { id: 'E.1', title: 'Budget impact analysis', content: data.budgetImpactAnalysis },
                    { id: 'E.2', title: 'Number of patients expected to be treated', content: data.patientNumbers },
                    { id: 'E.3', title: 'Net budget impact', content: data.netBudgetImpact }
                ])
            ],
            appendices: this.generateAppendices(data),
            metadata: {
                generatedDate: new Date().toISOString(),
                generator: 'HTA Artifact Standard v0.6.0',
                submissionType: 'Single Technology Appraisal'
            }
        };
    }

    /**
     * Generate NICE Multiple Technology Appraisal (MTA) template
     */
    generateMTATemplate(data = {}) {
        return {
            documentType: 'NICE_MTA',
            version: '2024.1',
            sections: [
                this.generateSection('1', 'Background', [
                    { id: '1.1', title: 'Disease area overview', content: data.diseaseOverview },
                    { id: '1.2', title: 'Technologies under assessment', content: data.technologiesAssessed },
                    { id: '1.3', title: 'Scope of the assessment', content: data.scope }
                ]),
                this.generateSection('2', 'Clinical Effectiveness', [
                    { id: '2.1', title: 'Systematic review methods', content: data.reviewMethods },
                    { id: '2.2', title: 'Clinical effectiveness results', content: data.clinicalResults },
                    { id: '2.3', title: 'Network meta-analysis', content: data.nmaResults }
                ]),
                this.generateSection('3', 'Economic Analysis', [
                    { id: '3.1', title: 'Economic model', content: data.economicModel },
                    { id: '3.2', title: 'Cost-effectiveness results', content: data.ceResults },
                    { id: '3.3', title: 'Uncertainty analysis', content: data.uncertaintyAnalysis }
                ]),
                this.generateSection('4', 'Discussion and Conclusions', [
                    { id: '4.1', title: 'Key findings', content: data.keyFindings },
                    { id: '4.2', title: 'Limitations', content: data.limitations },
                    { id: '4.3', title: 'Conclusions', content: data.conclusions }
                ])
            ],
            metadata: {
                generatedDate: new Date().toISOString(),
                generator: 'HTA Artifact Standard v0.6.0',
                submissionType: 'Multiple Technology Appraisal'
            }
        };
    }

    /**
     * Generate section structure
     */
    generateSection(id, title, subsections) {
        return {
            id: id,
            title: title,
            subsections: subsections.map(sub => ({
                id: sub.id,
                title: sub.title,
                content: sub.content || '',
                tables: sub.tables || [],
                figures: sub.figures || [],
                wordLimit: sub.wordLimit
            }))
        };
    }

    /**
     * Generate standard appendices
     */
    generateAppendices(data = {}) {
        return [
            {
                id: 'Appendix A',
                title: 'Literature search strategies',
                content: data.searchStrategies || ''
            },
            {
                id: 'Appendix B',
                title: 'Quality assessment of included studies',
                content: data.qualityAssessment || ''
            },
            {
                id: 'Appendix C',
                title: 'Detailed clinical results',
                content: data.detailedClinicalResults || ''
            },
            {
                id: 'Appendix D',
                title: 'Economic model technical documentation',
                content: data.technicalDocumentation || ''
            },
            {
                id: 'Appendix E',
                title: 'Model validation report',
                content: data.validationReport || ''
            },
            {
                id: 'Appendix F',
                title: 'Additional sensitivity analyses',
                content: data.additionalSensitivity || ''
            }
        ];
    }

    /**
     * Generate NICE Evidence Submission template checklist
     */
    generateSubmissionChecklist() {
        return {
            requiredDocuments: [
                { item: 'Company evidence submission', required: true, section: 'Main document' },
                { item: 'Economic model (Excel)', required: true, section: 'Electronic model' },
                { item: 'Model technical documentation', required: true, section: 'Appendix' },
                { item: 'Literature search strategies', required: true, section: 'Appendix' },
                { item: 'PRISMA flow diagrams', required: true, section: 'Main document' },
                { item: 'Quality assessment tables', required: true, section: 'Appendix' },
                { item: 'Clinical study reports', required: false, section: 'Reference pack' },
                { item: 'Patient access scheme details', required: false, section: 'Confidential appendix' }
            ],
            qualityChecks: [
                { check: 'All sections completed', status: 'pending' },
                { check: 'Word limits adhered to', status: 'pending' },
                { check: 'All tables numbered and referenced', status: 'pending' },
                { check: 'All figures numbered and referenced', status: 'pending' },
                { check: 'References complete and formatted', status: 'pending' },
                { check: 'Confidential information marked', status: 'pending' },
                { check: 'Model executable without errors', status: 'pending' },
                { check: 'Model results match submission', status: 'pending' }
            ]
        };
    }
}


// =============================================================================
// CITATION MANAGER
// =============================================================================

class CitationManager {
    constructor() {
        this.citations = new Map();
        this.citationOrder = [];
    }

    /**
     * Add citation
     */
    addCitation(id, citation) {
        if (!this.citations.has(id)) {
            this.citationOrder.push(id);
        }
        this.citations.set(id, {
            ...citation,
            id: id,
            addedDate: new Date()
        });
        return this;
    }

    /**
     * Get citation by ID
     */
    getCitation(id) {
        return this.citations.get(id);
    }

    /**
     * Get all citations in order
     */
    getAllCitations() {
        return this.citationOrder.map(id => this.citations.get(id));
    }

    /**
     * Parse BibTeX entry
     */
    parseBibTeX(bibtex) {
        const citations = [];
        const entryRegex = /@(\w+)\s*\{\s*([^,]+)\s*,([^}]+)\}/g;
        const fieldRegex = /(\w+)\s*=\s*\{([^}]*)\}/g;

        let match;
        while ((match = entryRegex.exec(bibtex)) !== null) {
            const type = match[1].toLowerCase();
            const id = match[2].trim();
            const fieldsStr = match[3];

            const fields = {};
            let fieldMatch;
            while ((fieldMatch = fieldRegex.exec(fieldsStr)) !== null) {
                fields[fieldMatch[1].toLowerCase()] = fieldMatch[2].trim();
            }

            citations.push({
                id: id,
                type: type,
                ...fields
            });
        }

        return citations;
    }

    /**
     * Export to BibTeX format
     */
    exportBibTeX() {
        const lines = [];

        for (const citation of this.getAllCitations()) {
            const type = citation.type || 'article';
            lines.push(`@${type}{${citation.id},`);

            const fields = ['author', 'title', 'journal', 'year', 'volume', 'number',
                           'pages', 'doi', 'publisher', 'booktitle', 'editor', 'url'];

            for (const field of fields) {
                if (citation[field]) {
                    lines.push(`  ${field} = {${citation[field]}},`);
                }
            }

            lines.push('}');
            lines.push('');
        }

        return lines.join('\n');
    }

    /**
     * Export to RIS format
     */
    exportRIS() {
        const lines = [];

        const typeMap = {
            article: 'JOUR',
            book: 'BOOK',
            inproceedings: 'CONF',
            conference: 'CONF',
            phdthesis: 'THES',
            mastersthesis: 'THES',
            techreport: 'RPRT',
            misc: 'GEN'
        };

        for (const citation of this.getAllCitations()) {
            lines.push(`TY  - ${typeMap[citation.type] || 'JOUR'}`);

            if (citation.author) {
                const authors = citation.author.split(' and ');
                for (const author of authors) {
                    lines.push(`AU  - ${author.trim()}`);
                }
            }

            if (citation.title) lines.push(`TI  - ${citation.title}`);
            if (citation.journal) lines.push(`JO  - ${citation.journal}`);
            if (citation.year) lines.push(`PY  - ${citation.year}`);
            if (citation.volume) lines.push(`VL  - ${citation.volume}`);
            if (citation.number) lines.push(`IS  - ${citation.number}`);
            if (citation.pages) {
                const [sp, ep] = citation.pages.split('-');
                if (sp) lines.push(`SP  - ${sp.trim()}`);
                if (ep) lines.push(`EP  - ${ep.trim()}`);
            }
            if (citation.doi) lines.push(`DO  - ${citation.doi}`);
            if (citation.url) lines.push(`UR  - ${citation.url}`);
            if (citation.abstract) lines.push(`AB  - ${citation.abstract}`);

            lines.push('ER  - ');
            lines.push('');
        }

        return lines.join('\n');
    }

    /**
     * Export to EndNote XML format
     */
    exportEndNoteXML() {
        let xml = '<?xml version="1.0" encoding="UTF-8"?>\n';
        xml += '<xml><records>\n';

        const typeMap = {
            article: '17',
            book: '6',
            inproceedings: '10',
            conference: '10',
            report: '27',
            thesis: '32'
        };

        for (const citation of this.getAllCitations()) {
            xml += '<record>\n';
            xml += `  <ref-type name="${citation.type}">${typeMap[citation.type] || '17'}</ref-type>\n`;

            if (citation.author) {
                xml += '  <contributors><authors>\n';
                const authors = citation.author.split(' and ');
                for (const author of authors) {
                    xml += `    <author><style face="normal">${this.escapeXML(author.trim())}</style></author>\n`;
                }
                xml += '  </authors></contributors>\n';
            }

            if (citation.title) {
                xml += `  <titles><title><style face="normal">${this.escapeXML(citation.title)}</style></title></titles>\n`;
            }

            if (citation.journal) {
                xml += `  <periodical><full-title>${this.escapeXML(citation.journal)}</full-title></periodical>\n`;
            }

            if (citation.year) {
                xml += `  <dates><year>${citation.year}</year></dates>\n`;
            }

            if (citation.volume) {
                xml += `  <volume>${citation.volume}</volume>\n`;
            }

            if (citation.pages) {
                xml += `  <pages>${citation.pages}</pages>\n`;
            }

            if (citation.doi) {
                xml += `  <electronic-resource-num>${this.escapeXML(citation.doi)}</electronic-resource-num>\n`;
            }

            xml += '</record>\n';
        }

        xml += '</records></xml>';
        return xml;
    }

    /**
     * Format citation for in-text use (Vancouver style)
     */
    formatInText(id, style = 'vancouver') {
        const idx = this.citationOrder.indexOf(id);
        if (idx === -1) return '[?]';

        if (style === 'vancouver') {
            return `[${idx + 1}]`;
        } else if (style === 'harvard') {
            const citation = this.citations.get(id);
            const author = citation.author ? citation.author.split(',')[0] : 'Unknown';
            return `(${author}, ${citation.year || 'n.d.'})`;
        }

        return `[${idx + 1}]`;
    }

    /**
     * Format reference list entry (Vancouver style)
     */
    formatReference(citation, number, style = 'vancouver') {
        if (style === 'vancouver') {
            let ref = `${number}. `;

            if (citation.author) {
                const authors = citation.author.split(' and ');
                if (authors.length > 6) {
                    ref += authors.slice(0, 6).join(', ') + ', et al. ';
                } else {
                    ref += authors.join(', ') + '. ';
                }
            }

            if (citation.title) ref += citation.title + '. ';
            if (citation.journal) ref += citation.journal + '. ';
            if (citation.year) ref += citation.year;
            if (citation.volume) ref += `;${citation.volume}`;
            if (citation.number) ref += `(${citation.number})`;
            if (citation.pages) ref += `:${citation.pages}`;
            ref += '.';

            if (citation.doi) ref += ` doi: ${citation.doi}`;

            return ref;
        }

        return citation.title;
    }

    /**
     * Generate formatted reference list
     */
    generateReferenceList(style = 'vancouver') {
        const references = [];

        this.citationOrder.forEach((id, idx) => {
            const citation = this.citations.get(id);
            references.push(this.formatReference(citation, idx + 1, style));
        });

        return references;
    }

    /**
     * Import from PubMed format
     */
    importPubMed(pubmedText) {
        const citations = [];
        const entries = pubmedText.split('\n\n');

        for (const entry of entries) {
            if (!entry.trim()) continue;

            const citation = {};
            const lines = entry.split('\n');
            let currentTag = '';
            let currentValue = '';

            for (const line of lines) {
                const tagMatch = line.match(/^([A-Z]{2,4})\s*-\s*(.*)$/);

                if (tagMatch) {
                    // Save previous tag
                    if (currentTag) {
                        this.setPubMedField(citation, currentTag, currentValue.trim());
                    }
                    currentTag = tagMatch[1];
                    currentValue = tagMatch[2];
                } else if (currentTag) {
                    currentValue += ' ' + line.trim();
                }
            }

            // Save last tag
            if (currentTag) {
                this.setPubMedField(citation, currentTag, currentValue.trim());
            }

            if (citation.title || citation.author) {
                citation.id = this.generateCitationId(citation);
                citation.type = 'article';
                citations.push(citation);
            }
        }

        return citations;
    }

    /**
     * Set field from PubMed tag
     */
    setPubMedField(citation, tag, value) {
        const tagMap = {
            'TI': 'title',
            'AU': 'author',
            'TA': 'journal',
            'DP': 'year',
            'VI': 'volume',
            'IP': 'number',
            'PG': 'pages',
            'AID': 'doi',
            'AB': 'abstract',
            'PMID': 'pmid'
        };

        const field = tagMap[tag];
        if (field) {
            if (field === 'author') {
                citation.author = citation.author
                    ? citation.author + ' and ' + value
                    : value;
            } else if (field === 'year') {
                citation.year = value.substring(0, 4);
            } else if (field === 'doi' && value.includes('[doi]')) {
                citation.doi = value.replace(' [doi]', '');
            } else {
                citation[field] = value;
            }
        }
    }

    /**
     * Generate citation ID from citation data
     */
    generateCitationId(citation) {
        const author = citation.author ? citation.author.split(',')[0].split(' ')[0] : 'Unknown';
        const year = citation.year || 'nd';
        const titleWord = citation.title ? citation.title.split(' ')[0] : 'untitled';
        return `${author}${year}${titleWord}`.replace(/[^a-zA-Z0-9]/g, '');
    }

    /**
     * Escape XML special characters
     */
    escapeXML(str) {
        if (!str) return '';
        return str
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&apos;');
    }
}


// =============================================================================
// REPORT GENERATOR (ORCHESTRATOR)
// =============================================================================

class ReportGenerator {
    constructor() {
        this.pdfReporter = new PDFReporter();
        this.wordReporter = new WordReporter();
        this.niceGenerator = new NICETemplateGenerator();
        this.citationManager = new CitationManager();
    }

    /**
     * Generate complete HTA report package
     */
    generateReportPackage(data, format = 'all') {
        const package_ = {
            generatedDate: new Date().toISOString(),
            generator: 'HTA Artifact Standard v0.6.0',
            documents: {}
        };

        if (format === 'all' || format === 'pdf') {
            package_.documents.executiveSummaryPDF = this.pdfReporter.generateExecutiveSummary(data);
        }

        if (format === 'all' || format === 'word') {
            package_.documents.fullSubmissionWord = this.wordReporter.generateHTASubmission(data);
        }

        if (format === 'all' || format === 'nice') {
            package_.documents.niceSTATemplate = this.niceGenerator.generateSTATemplate(data);
            package_.documents.submissionChecklist = this.niceGenerator.generateSubmissionChecklist();
        }

        // Add citations if available
        if (data.citations && data.citations.length > 0) {
            for (const citation of data.citations) {
                this.citationManager.addCitation(citation.id, citation);
            }
            package_.documents.referencesBibTeX = this.citationManager.exportBibTeX();
            package_.documents.referencesRIS = this.citationManager.exportRIS();
            package_.documents.formattedReferences = this.citationManager.generateReferenceList('vancouver');
        }

        return package_;
    }

    /**
     * Generate quick summary report
     */
    generateQuickSummary(results) {
        return this.pdfReporter.generateExecutiveSummary(results);
    }

    /**
     * Generate sensitivity analysis report
     */
    generateSensitivityReport(sensitivityResults) {
        this.pdfReporter.newDocument({ title: 'Sensitivity Analysis Report' });

        this.pdfReporter.addTitle('Sensitivity Analysis Report', 1);
        this.pdfReporter.addLine();

        // One-way sensitivity
        if (sensitivityResults.oneWay) {
            this.pdfReporter.addTitle('One-Way Sensitivity Analysis', 2);

            const headers = ['Parameter', 'Base Case', 'Low Value', 'High Value', 'ICER Range'];
            const rows = sensitivityResults.oneWay.map(r => [
                r.parameter,
                r.baseCase.toFixed(2),
                r.lowValue.toFixed(2),
                r.highValue.toFixed(2),
                `${r.icerLow.toFixed(0)} - ${r.icerHigh.toFixed(0)}`
            ]);

            this.pdfReporter.addTable(headers, rows);
        }

        // PSA results
        if (sensitivityResults.psa) {
            this.pdfReporter.addTitle('Probabilistic Sensitivity Analysis', 2);
            this.pdfReporter.addParagraph(
                `Based on ${sensitivityResults.psa.iterations} Monte Carlo simulations:`
            );
            this.pdfReporter.addParagraph(
                `Mean ICER: ${sensitivityResults.psa.meanICER.toFixed(0)} ` +
                `(95% CI: ${sensitivityResults.psa.icerCI[0].toFixed(0)} - ${sensitivityResults.psa.icerCI[1].toFixed(0)})`
            );
            this.pdfReporter.addParagraph(
                `Probability cost-effective at £20,000/QALY: ${(sensitivityResults.psa.probCE20k * 100).toFixed(1)}%`
            );
            this.pdfReporter.addParagraph(
                `Probability cost-effective at £30,000/QALY: ${(sensitivityResults.psa.probCE30k * 100).toFixed(1)}%`
            );
        }

        // Scenario analysis
        if (sensitivityResults.scenarios) {
            this.pdfReporter.addTitle('Scenario Analysis', 2);

            const headers = ['Scenario', 'Description', 'ICER', 'Change from Base'];
            const rows = sensitivityResults.scenarios.map(s => [
                s.name,
                s.description,
                s.icer.toFixed(0),
                `${s.changePercent >= 0 ? '+' : ''}${s.changePercent.toFixed(1)}%`
            ]);

            this.pdfReporter.addTable(headers, rows);
        }

        return this.pdfReporter.generate();
    }
}


// =============================================================================
// EXPORTS
// =============================================================================

// Browser environment
if (typeof window !== 'undefined') {
    window.HTA = window.HTA || {};
    window.HTA.PDFReporter = PDFReporter;
    window.HTA.WordReporter = WordReporter;
    window.HTA.NICETemplateGenerator = NICETemplateGenerator;
    window.HTA.CitationManager = CitationManager;
    window.HTA.ReportGenerator = ReportGenerator;
}

// Node.js environment
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        PDFReporter,
        WordReporter,
        NICETemplateGenerator,
        CitationManager,
        ReportGenerator
    };
}
