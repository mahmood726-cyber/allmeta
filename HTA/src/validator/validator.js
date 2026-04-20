/**
 * HTA Artifact Validator
 * Complete validation for .hta.zip packages and project.json files
 *
 * Reference: RFC-001 Package Format, RFC-006 Validation Requirements
 */

class HTAValidator {
    constructor() {
        this.schemaValidator = new SchemaValidator();
        this.semanticValidator = new SemanticValidator();
        this.results = null;
    }

    /**
     * Validate an .hta.zip file
     * @param {File|Blob|ArrayBuffer} zipData - The ZIP file data
     * @returns {Promise<Object>} Validation results
     */
    async validateZip(zipData) {
        const startTime = performance.now();

        this.results = {
            valid: true,
            errors: [],
            warnings: [],
            infos: [],
            files: [],
            manifest: null,
            project: null,
            validationTime: 0
        };

        try {
            // Load ZIP
            const zip = await JSZip.loadAsync(zipData);

            // Check required files
            await this.validateZipStructure(zip);

            // Validate manifest
            if (zip.file('manifest.json')) {
                await this.validateManifest(zip);
            }

            // Validate project.json
            if (zip.file('project.json')) {
                await this.validateProject(zip);
            }

            // Validate results.json if present
            if (zip.file('results.json')) {
                await this.validateResults(zip);
            }

            // Check file checksums
            if (this.results.manifest) {
                await this.verifyChecksums(zip);
            }

        } catch (e) {
            this.addError('ZIP_READ_ERROR', '', `Failed to read ZIP file: ${e.message}`);
        }

        this.results.validationTime = Math.round(performance.now() - startTime);
        this.results.valid = this.results.errors.length === 0;

        return this.results;
    }

    /**
     * Validate a project.json object directly
     * @param {Object} project - Parsed project JSON
     * @returns {Object} Validation results
     */
    validateProject(projectOrZip) {
        if (projectOrZip instanceof JSZip || (projectOrZip && projectOrZip.file)) {
            // It's a ZIP, extract project.json
            return this._validateProjectFromZip(projectOrZip);
        }

        // It's a direct project object
        return this._validateProjectObject(projectOrZip);
    }

    async _validateProjectFromZip(zip) {
        try {
            const projectFile = zip.file('project.json');
            if (!projectFile) {
                this.addError('MISSING_FILE', 'project.json', 'Required file project.json not found');
                return;
            }

            const content = await projectFile.async('string');
            let project;

            try {
                project = JSON.parse(content);
            } catch (e) {
                this.addError('JSON_PARSE_ERROR', 'project.json', `Invalid JSON: ${e.message}`);
                return;
            }

            this.results.project = project;
            this._validateProjectObject(project);

        } catch (e) {
            this.addError('FILE_READ_ERROR', 'project.json', `Failed to read project.json: ${e.message}`);
        }
    }

    _validateProjectObject(project) {
        const startTime = performance.now();

        const results = {
            valid: true,
            errors: [],
            warnings: [],
            infos: [],
            project: project,
            validationTime: 0
        };

        // Schema validation
        const schemaValid = this.schemaValidator.validate(project, HTASchemas.project);
        if (!schemaValid) {
            for (const err of this.schemaValidator.getErrors()) {
                results.errors.push({
                    code: err.code,
                    path: err.path,
                    message: err.message,
                    severity: 'ERROR'
                });
            }
        }

        // Semantic validation
        const semanticResult = this.semanticValidator.validate(project);
        for (const issue of semanticResult.issues) {
            const target = issue.severity === 'ERROR' ? results.errors :
                          issue.severity === 'WARNING' ? results.warnings : results.infos;
            target.push({
                code: issue.code,
                path: issue.path,
                message: issue.message,
                recommendation: issue.recommendation,
                severity: issue.severity
            });
        }

        results.valid = results.errors.length === 0;
        results.validationTime = Math.round(performance.now() - startTime);

        // If called via validateZip, update main results
        if (this.results) {
            for (const err of results.errors) this.results.errors.push(err);
            for (const warn of results.warnings) this.results.warnings.push(warn);
            for (const info of results.infos) this.results.infos.push(info);
        }

        return results;
    }

    /**
     * Validate ZIP structure - check required files
     */
    async validateZipStructure(zip) {
        const requiredFiles = ['project.json'];
        const recommendedFiles = ['manifest.json', 'metadata.json'];

        // List all files
        const files = [];
        zip.forEach((relativePath, file) => {
            if (!file.dir) {
                files.push(relativePath);
            }
        });
        this.results.files = files;

        // Check required files
        for (const required of requiredFiles) {
            if (!zip.file(required)) {
                this.addError('MISSING_REQUIRED_FILE', required, `Required file '${required}' not found in package`);
            }
        }

        // Check recommended files
        for (const recommended of recommendedFiles) {
            if (!zip.file(recommended)) {
                this.addInfo('MISSING_RECOMMENDED_FILE', recommended, `Recommended file '${recommended}' not found`);
            }
        }

        // Check for forbidden files
        const forbiddenExtensions = ['.exe', '.dll', '.so', '.dylib', '.bat', '.sh', '.cmd'];
        for (const file of files) {
            const ext = file.substring(file.lastIndexOf('.')).toLowerCase();
            if (forbiddenExtensions.includes(ext)) {
                this.addError('FORBIDDEN_FILE', file, `Executable files are not allowed in HTA packages`);
            }
        }
    }

    /**
     * Validate manifest.json
     */
    async validateManifest(zip) {
        try {
            const manifestFile = zip.file('manifest.json');
            if (!manifestFile) return;

            const content = await manifestFile.async('string');
            let manifest;

            try {
                manifest = JSON.parse(content);
            } catch (e) {
                this.addError('JSON_PARSE_ERROR', 'manifest.json', `Invalid JSON: ${e.message}`);
                return;
            }

            this.results.manifest = manifest;

            // Schema validation
            const schemaValid = this.schemaValidator.validate(manifest, HTASchemas.manifest);
            if (!schemaValid) {
                for (const err of this.schemaValidator.getErrors()) {
                    this.addError(err.code, `manifest.json/${err.path}`, err.message);
                }
            }

        } catch (e) {
            this.addError('FILE_READ_ERROR', 'manifest.json', `Failed to read manifest.json: ${e.message}`);
        }
    }

    /**
     * Validate results.json
     */
    async validateResults(zip) {
        try {
            const resultsFile = zip.file('results.json');
            if (!resultsFile) return;

            const content = await resultsFile.async('string');
            let results;

            try {
                results = JSON.parse(content);
            } catch (e) {
                this.addError('JSON_PARSE_ERROR', 'results.json', `Invalid JSON: ${e.message}`);
                return;
            }

            // Schema validation
            const schemaValid = this.schemaValidator.validate(results, HTASchemas.results);
            if (!schemaValid) {
                for (const err of this.schemaValidator.getErrors()) {
                    this.addError(err.code, `results.json/${err.path}`, err.message);
                }
            }

        } catch (e) {
            this.addError('FILE_READ_ERROR', 'results.json', `Failed to read results.json: ${e.message}`);
        }
    }

    /**
     * Verify file checksums against manifest
     */
    async verifyChecksums(zip) {
        const manifest = this.results.manifest;
        if (!manifest || !manifest.files) return;

        for (const fileEntry of manifest.files) {
            const file = zip.file(fileEntry.path);
            if (!file) {
                this.addWarning('CHECKSUM_FILE_MISSING', fileEntry.path, `File listed in manifest not found: ${fileEntry.path}`);
                continue;
            }

            try {
                const content = await file.async('arraybuffer');
                const hash = await this.computeSHA256(content);

                if (hash !== fileEntry.sha256.toLowerCase()) {
                    this.addError(
                        'CHECKSUM_MISMATCH',
                        fileEntry.path,
                        `Checksum mismatch for ${fileEntry.path}. Expected: ${fileEntry.sha256}, Got: ${hash}`
                    );
                }
            } catch (e) {
                this.addWarning('CHECKSUM_COMPUTE_ERROR', fileEntry.path, `Could not verify checksum: ${e.message}`);
            }
        }
    }

    /**
     * Compute SHA-256 hash of data
     */
    async computeSHA256(data) {
        const hashBuffer = await crypto.subtle.digest('SHA-256', data);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    }

    addError(code, path, message, recommendation = null) {
        this.results.errors.push({ code, path, message, recommendation, severity: 'ERROR' });
    }

    addWarning(code, path, message, recommendation = null) {
        this.results.warnings.push({ code, path, message, recommendation, severity: 'WARNING' });
    }

    addInfo(code, path, message, recommendation = null) {
        this.results.infos.push({ code, path, message, recommendation, severity: 'INFO' });
    }

    /**
     * Generate human-readable validation report
     */
    generateReport(results = null) {
        const r = results || this.results;
        if (!r) return 'No validation results available';

        let report = '';

        // Header
        if (r.valid) {
            report += '✅ VALIDATION PASSED';
            if (r.warnings.length > 0) {
                report += ` (with ${r.warnings.length} warning${r.warnings.length > 1 ? 's' : ''})`;
            }
        } else {
            report += '❌ VALIDATION FAILED';
        }
        report += '\n\n';

        // Summary
        report += 'Summary:\n';
        report += `  ✅ Errors: ${r.errors.length}\n`;
        report += `  ⚠️  Warnings: ${r.warnings.length}\n`;
        report += `  ℹ️  Info: ${r.infos.length}\n`;
        report += `  ⏱  Time: ${r.validationTime}ms\n\n`;

        // Errors
        if (r.errors.length > 0) {
            report += 'Errors:\n';
            for (const err of r.errors) {
                report += `  ❌ ${err.code} at ${err.path}\n`;
                report += `     ${err.message}\n`;
                if (err.recommendation) {
                    report += `     → ${err.recommendation}\n`;
                }
                report += '\n';
            }
        }

        // Warnings
        if (r.warnings.length > 0) {
            report += 'Warnings:\n';
            for (const warn of r.warnings) {
                report += `  ⚠️  ${warn.code} at ${warn.path}\n`;
                report += `     ${warn.message}\n`;
                if (warn.recommendation) {
                    report += `     → ${warn.recommendation}\n`;
                }
                report += '\n';
            }
        }

        // Info (show first 5)
        if (r.infos.length > 0) {
            report += `Info (showing ${Math.min(5, r.infos.length)} of ${r.infos.length}):\n`;
            for (const info of r.infos.slice(0, 5)) {
                report += `  ℹ️  ${info.code} at ${info.path}\n`;
                report += `     ${info.message}\n`;
            }
        }

        return report;
    }

    /**
     * Generate JSON validation report
     */
    generateJSONReport(results = null) {
        const r = results || this.results;
        return {
            valid: r.valid,
            summary: {
                errors: r.errors.length,
                warnings: r.warnings.length,
                infos: r.infos.length,
                validationTime: r.validationTime
            },
            errors: r.errors,
            warnings: r.warnings,
            infos: r.infos,
            files: r.files || []
        };
    }
}

// Export
if (typeof window !== 'undefined') {
    window.HTAValidator = HTAValidator;
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { HTAValidator };
}
