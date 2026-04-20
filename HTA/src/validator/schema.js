/**
 * JSON Schema Definitions for HTA Artifact Standard v0.1
 * Reference: RFC-002 Project Schema, RFC-003 Results Schema
 */

const HTASchemas = {
    /**
     * Project.json Schema (RFC-002)
     */
    project: {
        $schema: "https://json-schema.org/draft/2020-12/schema",
        $id: "https://hta-standard.org/schemas/project.schema.json",
        title: "HTA Project Schema",
        description: "Schema for HTA Artifact Standard project.json files",
        type: "object",
        required: ["version", "metadata", "model"],
        properties: {
            version: {
                type: "string",
                pattern: "^\\d+\\.\\d+(\\.\\d+)?$",
                description: "HTA Standard version"
            },
            metadata: {
                type: "object",
                required: ["id", "name"],
                properties: {
                    id: { type: "string", pattern: "^[a-zA-Z][a-zA-Z0-9_-]*$" },
                    name: { type: "string", minLength: 1 },
                    description: { type: "string" },
                    author: { type: "string" },
                    organization: { type: "string" },
                    created: { type: "string", format: "date-time" },
                    modified: { type: "string", format: "date-time" },
                    version: { type: "string" },
                    tags: { type: "array", items: { type: "string" } }
                }
            },
            settings: {
                type: "object",
                properties: {
                    time_horizon: { type: "number", minimum: 0 },
                    cycle_length: { type: "number", minimum: 0 },
                    discount_rate_costs: { type: "number", minimum: 0, maximum: 1 },
                    discount_rate_qalys: { type: "number", minimum: 0, maximum: 1 },
                    half_cycle_correction: {
                        type: "string",
                        enum: ["none", "start", "end", "trapezoidal"]
                    },
                    currency: { type: "string" },
                    perspective: { type: "string" }
                }
            },
            model: {
                type: "object",
                required: ["type"],
                properties: {
                    type: {
                        type: "string",
                        enum: ["markov_cohort", "markov_microsimulation", "partitioned_survival", "decision_tree", "budget_impact"]
                    }
                }
            },
            parameters: {
                type: "object",
                additionalProperties: {
                    type: "object",
                    required: ["value"],
                    properties: {
                        value: {
                            oneOf: [
                                { type: "number" },
                                { type: "string" }  // Expression
                            ]
                        },
                        label: { type: "string" },
                        description: { type: "string" },
                        unit: { type: "string" },
                        category: { type: "string" },
                        distribution: {
                            type: "object",
                            required: ["type"],
                            properties: {
                                type: {
                                    type: "string",
                                    enum: ["fixed", "normal", "lognormal", "beta", "gamma", "uniform", "triangular"]
                                }
                            }
                        },
                        evidence_id: { type: "string" },
                        tags: { type: "array", items: { type: "string" } }
                    }
                }
            },
            states: {
                type: "object",
                additionalProperties: {
                    type: "object",
                    required: ["label"],
                    properties: {
                        label: { type: "string" },
                        description: { type: "string" },
                        type: {
                            type: "string",
                            enum: ["transient", "absorbing", "tunnel"]
                        },
                        initial_probability: { type: "number", minimum: 0, maximum: 1 },
                        cost: {
                            oneOf: [
                                { type: "number" },
                                { type: "string" }
                            ]
                        },
                        utility: {
                            oneOf: [
                                { type: "number" },
                                { type: "string" }
                            ]
                        }
                    }
                }
            },
            transitions: {
                type: "object",
                additionalProperties: {
                    type: "object",
                    required: ["from", "to", "probability"],
                    properties: {
                        from: { type: "string" },
                        to: { type: "string" },
                        probability: {
                            oneOf: [
                                { type: "number", minimum: 0, maximum: 1 },
                                { type: "string" }
                            ]
                        },
                        condition: { type: "string" }
                    }
                }
            },
            strategies: {
                type: "object",
                additionalProperties: {
                    type: "object",
                    required: ["label"],
                    properties: {
                        label: { type: "string" },
                        description: { type: "string" },
                        is_comparator: { type: "boolean" },
                        parameter_overrides: {
                            type: "object",
                            additionalProperties: {}
                        }
                    }
                }
            },
            evidence: {
                type: "object",
                additionalProperties: {
                    type: "object",
                    properties: {
                        source: { type: "string" },
                        citation: { type: "string" },
                        url: { type: "string", format: "uri" },
                        quality: { type: "string" },
                        notes: { type: "string" }
                    }
                }
            },
            scenarios: {
                type: "object",
                additionalProperties: {
                    type: "object",
                    properties: {
                        label: { type: "string" },
                        description: { type: "string" },
                        parameter_overrides: {
                            type: "object",
                            additionalProperties: {}
                        }
                    }
                }
            }
        }
    },

    /**
     * Results.json Schema (RFC-003)
     */
    results: {
        $schema: "https://json-schema.org/draft/2020-12/schema",
        $id: "https://hta-standard.org/schemas/results.schema.json",
        title: "HTA Results Schema",
        description: "Schema for HTA Artifact Standard results.json files",
        type: "object",
        required: ["version", "run_id", "timestamp", "deterministic"],
        properties: {
            version: { type: "string" },
            run_id: { type: "string" },
            model_id: { type: "string" },
            timestamp: { type: "string", format: "date-time" },
            engine_version: { type: "string" },
            computation_time_ms: { type: "integer", minimum: 0 },
            seed: { type: "integer" },
            deterministic: {
                type: "object",
                required: ["strategies"],
                properties: {
                    strategies: {
                        type: "object",
                        additionalProperties: {
                            type: "object",
                            properties: {
                                total_costs: { type: "number" },
                                total_qalys: { type: "number" },
                                life_years: { type: "number" }
                            }
                        }
                    },
                    incremental: {
                        type: "object",
                        properties: {
                            comparator: { type: "string" },
                            comparisons: {
                                type: "array",
                                items: {
                                    type: "object",
                                    properties: {
                                        strategy: { type: "string" },
                                        incremental_costs: { type: "number" },
                                        incremental_qalys: { type: "number" },
                                        icer: { type: ["number", "string", "null"] },
                                        nmb: { type: "number" },
                                        dominance: {
                                            type: "string",
                                            enum: ["none", "dominated", "extended_dominated", "dominant"]
                                        }
                                    }
                                }
                            }
                        }
                    },
                    trace: {
                        type: "object",
                        properties: {
                            cycles: { type: "array", items: { type: "integer" } },
                            states: {
                                type: "object",
                                additionalProperties: {
                                    type: "array",
                                    items: { type: "number" }
                                }
                            }
                        }
                    }
                }
            },
            psa: {
                type: "object",
                properties: {
                    iterations: { type: "integer", minimum: 1 },
                    seed: { type: "integer" },
                    summary: {
                        type: "object",
                        properties: {
                            mean_icer: { type: "number" },
                            median_icer: { type: "number" },
                            sd_icer: { type: "number" },
                            ci_lower: { type: "number" },
                            ci_upper: { type: "number" },
                            prob_ce_20k: { type: "number" },
                            prob_ce_30k: { type: "number" },
                            prob_ce_50k: { type: "number" }
                        }
                    },
                    ceac: {
                        type: "array",
                        items: {
                            type: "object",
                            properties: {
                                wtp: { type: "number" },
                                probability: { type: "number" }
                            }
                        }
                    },
                    scatter: {
                        type: "object",
                        properties: {
                            incremental_costs: { type: "array", items: { type: "number" } },
                            incremental_qalys: { type: "array", items: { type: "number" } }
                        }
                    }
                }
            },
            validation: {
                type: "object",
                properties: {
                    passed: { type: "boolean" },
                    errors: { type: "array" },
                    warnings: { type: "array" }
                }
            },
            signature: {
                type: "object",
                properties: {
                    inputs_hash: { type: "string" },
                    outputs_hash: { type: "string" },
                    engine_hash: { type: "string" }
                }
            }
        }
    },

    /**
     * Manifest.json Schema (RFC-001)
     */
    manifest: {
        $schema: "https://json-schema.org/draft/2020-12/schema",
        $id: "https://hta-standard.org/schemas/manifest.schema.json",
        title: "HTA Manifest Schema",
        type: "object",
        required: ["version", "files"],
        properties: {
            version: { type: "string" },
            created: { type: "string", format: "date-time" },
            files: {
                type: "array",
                items: {
                    type: "object",
                    required: ["path", "sha256"],
                    properties: {
                        path: { type: "string" },
                        sha256: { type: "string", pattern: "^[a-fA-F0-9]{64}$" },
                        size: { type: "integer", minimum: 0 }
                    }
                }
            }
        }
    }
};

/**
 * Schema Validator - validates JSON against HTA schemas
 */
class SchemaValidator {
    constructor() {
        this.errors = [];
        this.warnings = [];
    }

    /**
     * Validate a value against a schema
     * @param {any} data - Data to validate
     * @param {Object} schema - JSON Schema
     * @param {string} path - Current JSON path
     * @returns {boolean} Valid or not
     */
    validate(data, schema, path = '') {
        this.errors = [];
        this.warnings = [];
        return this._validate(data, schema, path);
    }

    _validate(data, schema, path) {
        if (!schema) return true;

        // Handle $ref (simple implementation)
        if (schema.$ref) {
            // For now, skip refs
            return true;
        }

        // Type validation
        if (schema.type) {
            if (!this._validateType(data, schema.type, path)) {
                return false;
            }
        }

        // oneOf validation
        if (schema.oneOf) {
            let valid = false;
            for (const subSchema of schema.oneOf) {
                const subValidator = new SchemaValidator();
                if (subValidator._validate(data, subSchema, path)) {
                    valid = true;
                    break;
                }
            }
            if (!valid) {
                this.errors.push({
                    code: 'SCHEMA_ONEOF',
                    path,
                    message: 'Value does not match any of the allowed schemas'
                });
                return false;
            }
        }

        // Enum validation
        if (schema.enum) {
            if (!schema.enum.includes(data)) {
                this.errors.push({
                    code: 'SCHEMA_ENUM',
                    path,
                    message: `Value must be one of: ${schema.enum.join(', ')}`,
                    actual: data
                });
                return false;
            }
        }

        // String validation
        if (schema.type === 'string' && typeof data === 'string') {
            if (schema.minLength !== undefined && data.length < schema.minLength) {
                this.errors.push({
                    code: 'SCHEMA_MIN_LENGTH',
                    path,
                    message: `String must be at least ${schema.minLength} characters`
                });
                return false;
            }
            if (schema.maxLength !== undefined && data.length > schema.maxLength) {
                this.errors.push({
                    code: 'SCHEMA_MAX_LENGTH',
                    path,
                    message: `String must be at most ${schema.maxLength} characters`
                });
                return false;
            }
            if (schema.pattern) {
                const regex = new RegExp(schema.pattern);
                if (!regex.test(data)) {
                    this.errors.push({
                        code: 'SCHEMA_PATTERN',
                        path,
                        message: `String must match pattern: ${schema.pattern}`,
                        actual: data
                    });
                    return false;
                }
            }
        }

        // Number validation
        if ((schema.type === 'number' || schema.type === 'integer') && typeof data === 'number') {
            if (schema.minimum !== undefined && data < schema.minimum) {
                this.errors.push({
                    code: 'SCHEMA_MINIMUM',
                    path,
                    message: `Value must be >= ${schema.minimum}`,
                    actual: data
                });
                return false;
            }
            if (schema.maximum !== undefined && data > schema.maximum) {
                this.errors.push({
                    code: 'SCHEMA_MAXIMUM',
                    path,
                    message: `Value must be <= ${schema.maximum}`,
                    actual: data
                });
                return false;
            }
            if (schema.type === 'integer' && !Number.isInteger(data)) {
                this.errors.push({
                    code: 'SCHEMA_INTEGER',
                    path,
                    message: 'Value must be an integer',
                    actual: data
                });
                return false;
            }
        }

        // Array validation
        if (schema.type === 'array' && Array.isArray(data)) {
            if (schema.items) {
                for (let i = 0; i < data.length; i++) {
                    if (!this._validate(data[i], schema.items, `${path}[${i}]`)) {
                        return false;
                    }
                }
            }
            if (schema.minItems !== undefined && data.length < schema.minItems) {
                this.errors.push({
                    code: 'SCHEMA_MIN_ITEMS',
                    path,
                    message: `Array must have at least ${schema.minItems} items`
                });
                return false;
            }
            if (schema.maxItems !== undefined && data.length > schema.maxItems) {
                this.errors.push({
                    code: 'SCHEMA_MAX_ITEMS',
                    path,
                    message: `Array must have at most ${schema.maxItems} items`
                });
                return false;
            }
        }

        // Object validation
        if (schema.type === 'object' && typeof data === 'object' && data !== null && !Array.isArray(data)) {
            // Required properties
            if (schema.required) {
                for (const prop of schema.required) {
                    if (!(prop in data)) {
                        this.errors.push({
                            code: 'SCHEMA_REQUIRED',
                            path: path ? `${path}.${prop}` : prop,
                            message: `Missing required property: ${prop}`
                        });
                        return false;
                    }
                }
            }

            // Property validation
            if (schema.properties) {
                for (const [prop, propSchema] of Object.entries(schema.properties)) {
                    if (prop in data) {
                        const propPath = path ? `${path}.${prop}` : prop;
                        if (!this._validate(data[prop], propSchema, propPath)) {
                            return false;
                        }
                    }
                }
            }

            // Additional properties
            if (schema.additionalProperties !== undefined) {
                const definedProps = new Set(Object.keys(schema.properties || {}));
                for (const prop of Object.keys(data)) {
                    if (!definedProps.has(prop)) {
                        if (schema.additionalProperties === false) {
                            this.errors.push({
                                code: 'SCHEMA_ADDITIONAL_PROP',
                                path: path ? `${path}.${prop}` : prop,
                                message: `Additional property not allowed: ${prop}`
                            });
                            return false;
                        } else if (typeof schema.additionalProperties === 'object') {
                            const propPath = path ? `${path}.${prop}` : prop;
                            if (!this._validate(data[prop], schema.additionalProperties, propPath)) {
                                return false;
                            }
                        }
                    }
                }
            }
        }

        return true;
    }

    _validateType(data, type, path) {
        const types = Array.isArray(type) ? type : [type];

        for (const t of types) {
            if (t === 'null' && data === null) return true;
            if (t === 'boolean' && typeof data === 'boolean') return true;
            if (t === 'integer' && typeof data === 'number' && Number.isInteger(data)) return true;
            if (t === 'number' && typeof data === 'number') return true;
            if (t === 'string' && typeof data === 'string') return true;
            if (t === 'array' && Array.isArray(data)) return true;
            if (t === 'object' && typeof data === 'object' && data !== null && !Array.isArray(data)) return true;
        }

        this.errors.push({
            code: 'SCHEMA_TYPE',
            path,
            message: `Expected type ${types.join(' or ')}, got ${typeof data}`,
            actual: typeof data
        });
        return false;
    }

    /**
     * Get validation errors
     * @returns {Array} Errors
     */
    getErrors() {
        return this.errors;
    }

    /**
     * Get validation warnings
     * @returns {Array} Warnings
     */
    getWarnings() {
        return this.warnings;
    }
}

// Export
if (typeof window !== 'undefined') {
    window.HTASchemas = HTASchemas;
    window.SchemaValidator = SchemaValidator;
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { HTASchemas, SchemaValidator };
}
