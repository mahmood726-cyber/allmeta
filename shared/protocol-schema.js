/**
 * shared/protocol-schema.js — structured schema for systematic-review and
 * meta-analysis protocols, aligned with:
 *   - PRISMA-P 2015 (Moher et al. BMJ 2015;349:g7647) — 17 checklist items
 *   - PROSPERO 2024 registration form — 47 fields
 *
 * Why this schema (and not just freeform text): a structured schema lets
 * us (1) render a consistent layout regardless of how much the author
 * fills in, (2) compute a PRISMA-P completeness gauge, (3) export to
 * PROSPERO-form fields ready for copy-paste, (4) machine-verify against
 * a published protocol later.
 *
 * Public API:
 *   AlmProtocol.SCHEMA               -> ordered sections
 *   AlmProtocol.PRISMA_P_ITEMS       -> 17 checklist items keyed by id
 *   AlmProtocol.score(protocol)      -> { filled, total, byItem, percent }
 *   AlmProtocol.renderHtml(protocol) -> sanitised HTML string
 */
(function (global) {
  'use strict';

  // Schema sections — each carries the PRISMA-P checklist ID it satisfies
  // so the score() function can compute coverage.
  var SCHEMA = [
    {
      id: 'admin',
      title: 'Administrative',
      fields: [
        { key: 'title',        label: 'Title',                                 kind: 'text',     required: true,  prismaP: '1a' },
        { key: 'shortTitle',   label: 'Short title',                           kind: 'text',     prismaP: '1a' },
        { key: 'registration', label: 'Registration ID (PROSPERO, OSF, …)',    kind: 'text',     prismaP: '2'  },
        { key: 'version',      label: 'Protocol version (e.g. 1.0)',           kind: 'text',     prismaP: '1b', placeholder: '1.0' },
        { key: 'date',         label: 'Date of this version',                  kind: 'date',     prismaP: '1b' },
        { key: 'amendments',   label: 'Amendments (if any, vs prior version)', kind: 'textarea', prismaP: '1b' },
      ],
    },
    {
      id: 'team',
      title: 'Team & contact',
      fields: [
        { key: 'authors',      label: 'Authors (Name — Affiliation — ORCID, one per line)', kind: 'textarea', required: true, prismaP: '3a' },
        { key: 'contact',      label: 'Corresponding author + email',          kind: 'text',     required: true, prismaP: '3a' },
        { key: 'contributions',label: 'Contributions',                         kind: 'textarea', prismaP: '3a' },
        { key: 'funding',      label: 'Funding sources',                       kind: 'textarea', prismaP: '5a' },
        { key: 'conflicts',    label: 'Conflicts of interest',                 kind: 'textarea', prismaP: '5b' },
        { key: 'support',      label: 'Sponsor / institutional support',       kind: 'textarea', prismaP: '4'  },
      ],
    },
    {
      id: 'background',
      title: 'Background & objectives',
      fields: [
        { key: 'rationale',    label: 'Rationale (why this review now)',       kind: 'textarea', required: true, prismaP: '6'  },
        { key: 'objectives',   label: 'Review questions / objectives',         kind: 'textarea', required: true, prismaP: '7'  },
        { key: 'pico',         label: 'PICO(S) — Population, Intervention, Comparator, Outcomes, Setting',
                                  kind: 'textarea', required: true, prismaP: '8',  placeholder: 'P:\nI:\nC:\nO:\nS:' },
      ],
    },
    {
      id: 'eligibility',
      title: 'Eligibility criteria',
      fields: [
        { key: 'inclusion',    label: 'Inclusion criteria',                    kind: 'textarea', required: true, prismaP: '8'  },
        { key: 'exclusion',    label: 'Exclusion criteria',                    kind: 'textarea', required: true, prismaP: '8'  },
        { key: 'designs',      label: 'Study designs eligible (RCT, NRSI, …)', kind: 'textarea', prismaP: '8'  },
        { key: 'language',     label: 'Language and year restrictions',        kind: 'text',     prismaP: '8'  },
      ],
    },
    {
      id: 'search',
      title: 'Search strategy',
      fields: [
        { key: 'sources',      label: 'Databases & registries (PubMed, EMBASE, CENTRAL, CT.gov, …)', kind: 'textarea', required: true, prismaP: '9'  },
        { key: 'searchString', label: 'Draft search string (PubMed-syntax)',    kind: 'textarea', required: true, prismaP: '10' },
        { key: 'searchDates',  label: 'Date range of searches',                 kind: 'text',     prismaP: '10' },
        { key: 'greyLit',      label: 'Grey literature sources & forward/backward citation tracking', kind: 'textarea', prismaP: '9' },
      ],
    },
    {
      id: 'selection',
      title: 'Study selection & data extraction',
      fields: [
        { key: 'selection',    label: 'Selection process (dual screeners, conflict resolution)', kind: 'textarea', required: true, prismaP: '11a' },
        { key: 'extraction',   label: 'Data extraction (template, dual extractors, software)',   kind: 'textarea', required: true, prismaP: '11b' },
        { key: 'dataItems',    label: 'Data items (effect estimates, modifiers, covariates)',    kind: 'textarea', prismaP: '11c' },
      ],
    },
    {
      id: 'rob',
      title: 'Risk of bias',
      fields: [
        { key: 'robTool',      label: 'Risk-of-bias tool (Cochrane RoB 2, ROBINS-I, …)', kind: 'text',     required: true, prismaP: '12' },
        { key: 'robProcess',   label: 'Assessment process (dual reviewers, training, …)',  kind: 'textarea', prismaP: '12' },
        { key: 'certainty',    label: 'Certainty / GRADE assessment plan',                 kind: 'textarea', prismaP: '15c' },
      ],
    },
    {
      id: 'analysis',
      title: 'Statistical analysis plan',
      fields: [
        { key: 'effectMeasure',label: 'Primary effect measure (OR, RR, MD, SMD, HR, …)',                 kind: 'text',     required: true, prismaP: '13' },
        { key: 'model',        label: 'Pooling model (REML, PM, FE, Bayesian, …) + HKSJ-or-not',         kind: 'text',     required: true, prismaP: '14' },
        { key: 'heterogeneity',label: 'Heterogeneity assessment (I², τ², prediction interval)',           kind: 'textarea', prismaP: '14' },
        { key: 'subgroups',    label: 'Subgroup analyses (a priori)',                                      kind: 'textarea', prismaP: '14' },
        { key: 'sensitivity',  label: 'Sensitivity analyses (LOO, alternate estimators, low-RoB-only)',  kind: 'textarea', prismaP: '14' },
        { key: 'pubBias',      label: 'Publication-bias assessment (funnel + tests + selection model)',  kind: 'textarea', prismaP: '15a' },
        { key: 'missingData',  label: 'Missing-data handling (study contact, imputation rules)',         kind: 'textarea', prismaP: '15b' },
      ],
    },
    {
      id: 'reporting',
      title: 'Reporting & dissemination',
      fields: [
        { key: 'prisma',       label: 'Reporting standard (PRISMA 2020, PRISMA-NMA, …)', kind: 'text',     prismaP: '16' },
        { key: 'dissemination',label: 'Dissemination plan (target journal, conferences, lay summary)', kind: 'textarea', prismaP: '16' },
        { key: 'data',         label: 'Data-availability statement',                                    kind: 'textarea', prismaP: '17' },
      ],
    },
  ];

  // PRISMA-P 2015 checklist items (17). For score(), an item counts as
  // "covered" if at least one schema field tagged with that prismaP id is
  // non-empty. Items not represented by any field show as "no field"
  // (cannot score) — we list them for completeness.
  var PRISMA_P_ITEMS = {
    '1a':  'Title — identify the report as a systematic-review protocol',
    '1b':  'Title — update (provide an accessible amendment history)',
    '2':   'Registration — name of registry and ID',
    '3a':  'Authors — contact details & contributions',
    '3b':  'Authors — contributorship statement',
    '4':   'Amendments — describe and date any amendments (covered by 1b)',
    '5a':  'Support — sources of financial or other support',
    '5b':  'Support — sponsor & role of sponsor',
    '6':   'Background — rationale',
    '7':   'Background — objectives',
    '8':   'Methods — eligibility criteria (PICO + designs)',
    '9':   'Methods — information sources',
    '10':  'Methods — search strategy (draft full search)',
    '11a': 'Methods — study records — data management',
    '11b': 'Methods — study records — selection process',
    '11c': 'Methods — study records — data collection process',
    '12':  'Methods — risk of bias in individual studies',
    '13':  'Methods — data items (variables, results)',
    '14':  'Methods — outcomes and prioritisation / synthesis',
    '15a': 'Methods — meta-bias(es)',
    '15b': 'Methods — confidence in cumulative evidence',
    '15c': 'Methods — certainty / GRADE',
    '16':  'Reporting — dissemination',
    '17':  'Reporting — data availability',
  };

  function _hasContent(v) {
    if (v == null) return false;
    var s = String(v).trim();
    return s.length > 0;
  }

  /**
   * Compute PRISMA-P 2015 completeness.
   * Returns:
   *   { filled, total, percent, byItem: { '1a': 'filled'|'empty'|'noField' } }
   */
  function score(protocol) {
    protocol = protocol || {};
    var itemHasField = {};
    var itemFilled = {};
    Object.keys(PRISMA_P_ITEMS).forEach(function (id) {
      itemHasField[id] = false;
      itemFilled[id] = false;
    });
    SCHEMA.forEach(function (sec) {
      sec.fields.forEach(function (f) {
        if (!f.prismaP) return;
        itemHasField[f.prismaP] = true;
        var val = (protocol[sec.id] && protocol[sec.id][f.key]);
        if (_hasContent(val)) itemFilled[f.prismaP] = true;
      });
    });
    var byItem = {};
    var filled = 0, total = 0;
    Object.keys(PRISMA_P_ITEMS).forEach(function (id) {
      if (!itemHasField[id]) { byItem[id] = 'noField'; return; }
      total += 1;
      if (itemFilled[id]) { byItem[id] = 'filled'; filled += 1; }
      else byItem[id] = 'empty';
    });
    return { filled: filled, total: total,
             percent: total > 0 ? Math.round((filled / total) * 100) : 0,
             byItem: byItem };
  }

  function _esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function _renderField(label, value) {
    var v = _hasContent(value) ? String(value) : '';
    if (!v) return '';
    // Preserve paragraphs and line breaks.
    var paras = v.split(/\n\s*\n/).map(function (p) {
      return '<p>' + _esc(p).replace(/\n/g, '<br>') + '</p>';
    }).join('');
    return '<div class="protocol-field"><div class="protocol-label">' + _esc(label) + '</div>' + paras + '</div>';
  }

  function renderHtml(protocol) {
    protocol = protocol || {};
    var out = [];
    var titleSection = protocol.admin || {};
    out.push('<header class="protocol-header">');
    out.push('<h1>' + _esc(titleSection.title || 'Untitled protocol') + '</h1>');
    var meta = [];
    if (_hasContent(titleSection.version)) meta.push('Version ' + _esc(titleSection.version));
    if (_hasContent(titleSection.date)) meta.push(_esc(titleSection.date));
    if (_hasContent(titleSection.registration)) meta.push('Registration: ' + _esc(titleSection.registration));
    if (meta.length) out.push('<p class="protocol-meta">' + meta.join(' · ') + '</p>');
    out.push('</header>');

    SCHEMA.forEach(function (sec) {
      var any = false;
      var sectionHtml = sec.fields.map(function (f) {
        var v = (protocol[sec.id] && protocol[sec.id][f.key]);
        if (!_hasContent(v)) return '';
        // Skip admin title — already in header.
        if (sec.id === 'admin' && f.key === 'title') return '';
        any = true;
        return _renderField(f.label, v);
      }).join('');
      if (any) {
        out.push('<section class="protocol-section">');
        out.push('<h2>' + _esc(sec.title) + '</h2>');
        out.push(sectionHtml);
        out.push('</section>');
      }
    });
    return out.join('\n');
  }

  var api = { SCHEMA: SCHEMA, PRISMA_P_ITEMS: PRISMA_P_ITEMS,
              score: score, renderHtml: renderHtml };
  global.AlmProtocol = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
