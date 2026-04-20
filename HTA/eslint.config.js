'use strict';

module.exports = [
    {
        files: ['src/**/*.js', 'tests/**/*.js', 'scripts/**/*.js'],
        languageOptions: {
            ecmaVersion: 2022,
            sourceType: 'script',
            globals: {
                // Browser globals
                window: 'readonly',
                globalThis: 'readonly',
                document: 'readonly',
                DOMParser: 'readonly',
                Blob: 'readonly',
                URL: 'readonly',
                Worker: 'readonly',
                crypto: 'readonly',
                fetch: 'readonly',
                performance: 'readonly',
                console: 'readonly',
                setTimeout: 'readonly',
                setInterval: 'readonly',
                clearTimeout: 'readonly',
                clearInterval: 'readonly',
                // CDN libraries
                JSZip: 'readonly',
                Chart: 'readonly',
                d3: 'readonly',
                // Node.js (for dual-env modules)
                module: 'readonly',
                require: 'readonly',
                exports: 'readonly',
                __dirname: 'readonly',
                __filename: 'readonly',
                process: 'readonly',
                Buffer: 'readonly',
                // Test globals
                describe: 'readonly',
                test: 'readonly',
                expect: 'readonly',
                beforeEach: 'readonly',
                afterEach: 'readonly',
                beforeAll: 'readonly',
                afterAll: 'readonly',
                jest: 'readonly',
                it: 'readonly'
            }
        },
        rules: {
            // Security (existing)
            'no-eval': 'error',
            'no-implied-eval': 'error',
            'no-new-func': 'warn',
            // Correctness
            'no-redeclare': 'error',
            'eqeqeq': ['warn', 'smart'],
            'no-self-compare': 'error',
            'no-template-curly-in-string': 'warn',
            // Code quality
            'no-unused-vars': ['warn', { args: 'none', varsIgnorePattern: '^_' }],
            'prefer-const': ['warn', { destructuring: 'all' }],
            'no-var': 'warn',
            // Prevent common bugs
            'no-loss-of-precision': 'error',
            'no-dupe-keys': 'error',
            'no-duplicate-case': 'error',
            'no-unreachable': 'warn',
            'no-constant-condition': ['warn', { checkLoops: false }]
        }
    }
];
