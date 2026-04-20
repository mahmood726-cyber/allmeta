// Oman HTA guidance helpers based on published methodological guidance (2024-2025).
(function initOmanHTAGuidance(root, factory) {
    if (typeof module === 'object' && module.exports) {
        module.exports = factory();
        return;
    }
    root.OmanHTAGuidance = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function createOmanHTAGuidance() {
    const GUIDANCE_VERSION = '2025-methodological-guidelines';

    const defaults = Object.freeze({
        discount_rate_costs: 0.03,
        discount_rate_qalys: 0.03,
        currency: 'OMR',
        perspective: 'healthcare_system',
        bia_horizon_years: 4,
        bia_discount_rate: 0,
        // Oman guidance uses 1x GDP per capita as the base CET, with higher multipliers by priority.
        wtp_multipliers: [1, 2, 3],
        // GDP per capita in OMR - Oman 2024 estimate based on NCSI data
        // USD ~$20,300 = ~7,800 OMR at current exchange rates
        placeholder_gdp_per_capita_omr: 7800,
        gdp_per_capita_year: 2024,
        gdp_per_capita_source: 'National Centre for Statistics and Information (NCSI) Oman',
        gdp_per_capita_confirmed: true,
        dsa_range_percent: 10,
        psa_recommended: true
    });

    function toFiniteNumber(value) {
        const n = typeof value === 'number' ? value : Number(value);
        return Number.isFinite(n) ? n : null;
    }

    function normalizeSettings(settings) {
        const s = settings || {};
        const normalized = {
            discount_rate_costs: s.discount_rate_costs ?? defaults.discount_rate_costs,
            discount_rate_qalys: s.discount_rate_qalys ?? defaults.discount_rate_qalys,
            currency: s.currency || defaults.currency,
            perspective: s.perspective || defaults.perspective,
            bia_horizon_years: toFiniteNumber(s.bia_horizon_years) ?? defaults.bia_horizon_years,
            bia_discount_rate: toFiniteNumber(s.bia_discount_rate) ?? defaults.bia_discount_rate,
            dsa_range_percent: toFiniteNumber(s.dsa_range_percent) ?? defaults.dsa_range_percent,
            psa_recommended: s.psa_recommended ?? defaults.psa_recommended,
            gdp_per_capita_omr: toFiniteNumber(s.gdp_per_capita_omr),
            gdp_per_capita_year: toFiniteNumber(s.gdp_per_capita_year) ?? defaults.gdp_per_capita_year,
            gdp_per_capita_source: s.gdp_per_capita_source || defaults.gdp_per_capita_source,
            gdp_per_capita_confirmed: Boolean(s.gdp_per_capita_confirmed),
            wtp_multipliers: Array.isArray(s.wtp_multipliers) && s.wtp_multipliers.length
                ? s.wtp_multipliers.map((m) => Number(m)).filter((m) => Number.isFinite(m) && m > 0)
                : defaults.wtp_multipliers
        };

        if (!normalized.wtp_multipliers.length) {
            normalized.wtp_multipliers = defaults.wtp_multipliers;
        }

        return normalized;
    }

    function getCurrencySymbol(currency) {
        const code = currency || defaults.currency;
        const symbols = {
            OMR: 'OMR ',
            USD: '$',
            EUR: 'EUR ',
            GBP: 'GBP ',
            SAR: 'SAR ',
            AED: 'AED '
        };
        return symbols[code] || (code ? code + ' ' : '');
    }

    function formatCurrency(value, settings, options) {
        const n = toFiniteNumber(value);
        if (n === null) return String(value);

        const opts = options || {};
        const locale = opts.locale || 'en-US';
        const maximumFractionDigits = opts.maximumFractionDigits ?? 0;
        const minimumFractionDigits = opts.minimumFractionDigits ?? 0;
        const s = normalizeSettings(settings);

        try {
            // currencyDisplay: 'code' keeps the output ASCII-friendly and explicit (e.g., "OMR 1,234").
            const formatted = new Intl.NumberFormat(locale, {
                style: 'currency',
                currency: s.currency,
                currencyDisplay: 'code',
                maximumFractionDigits,
                minimumFractionDigits
            }).format(n);
            return formatted.replace(s.currency, s.currency + ' ');
        } catch (err) {
            return getCurrencySymbol(s.currency) + n.toLocaleString(locale, {
                maximumFractionDigits,
                minimumFractionDigits
            });
        }
    }

    function resolveBaseWtp(settings) {
        const s = normalizeSettings(settings);
        const explicitBase = toFiniteNumber(settings?.wtp_base);
        if (explicitBase && explicitBase > 0) return explicitBase;

        if (s.gdp_per_capita_omr && s.gdp_per_capita_omr > 0) {
            return s.gdp_per_capita_omr;
        }

        const thresholds = Array.isArray(settings?.wtp_thresholds) ? settings.wtp_thresholds : null;
        if (thresholds && thresholds.length) {
            const first = toFiniteNumber(thresholds[0]);
            if (first && first > 0) return first;
        }

        const fallback = toFiniteNumber(defaults.placeholder_gdp_per_capita_omr);
        return fallback && fallback > 0 ? fallback : null;
    }

    function sanitizeThresholds(values) {
        const cleaned = (values || [])
            .map((v) => toFiniteNumber(v))
            .filter((v) => v && v > 0);
        const uniqueSorted = Array.from(new Set(cleaned)).sort((a, b) => a - b);
        return uniqueSorted.length ? uniqueSorted : null;
    }

    function resolveWtpThresholds(settings) {
        const s = normalizeSettings(settings);
        const explicit = sanitizeThresholds(settings?.wtp_thresholds);
        if (explicit) return { thresholds: explicit, source: 'explicit' };

        const base = resolveBaseWtp(settings);
        if (!base || base <= 0) {
            return { thresholds: [], source: 'missing' };
        }

        const derived = sanitizeThresholds(s.wtp_multipliers.map((m) => base * m));
        if (derived) return { thresholds: derived, source: 'gdp-multipliers' };

        // Extremely defensive fallback.
        const fallback = sanitizeThresholds([base, base * 2, base * 3]) || [base];
        return { thresholds: fallback, source: 'fallback' };
    }

    function resolvePrimaryWtp(settings) {
        const { thresholds } = resolveWtpThresholds(settings);
        return thresholds[0] || 0;
    }

    function guidanceNote(settings) {
        const { source, thresholds } = resolveWtpThresholds(settings);
        if (source === 'explicit') return null;
        if (settings?.gdp_per_capita_omr && settings?.gdp_per_capita_confirmed) return null;
        if (source === 'missing' || !thresholds.length) {
            return 'Oman guidance uses 1x GDP per capita (with 2x/3x multipliers for priority/severity). Enter and confirm Oman GDP per capita to compute CET thresholds.';
        }
        return `Using derived GDP-per-capita thresholds (${thresholds.join(', ')} OMR). Confirm or update with the latest Oman GDP per capita.`;
    }

    return {
        GUIDANCE_VERSION,
        defaults,
        normalizeSettings,
        getCurrencySymbol,
        formatCurrency,
        resolveBaseWtp,
        resolveWtpThresholds,
        resolvePrimaryWtp,
        guidanceNote
    };
});
