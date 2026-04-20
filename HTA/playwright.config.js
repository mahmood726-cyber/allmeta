const { defineConfig } = require('@playwright/test');

module.exports = defineConfig({
    testDir: './tests/browser',
    timeout: 30000,
    expect: {
        timeout: 10000
    },
    use: {
        headless: true,
        viewport: { width: 1280, height: 720 }
    },
    projects: [
        { name: 'chromium', use: { browserName: 'chromium' } }
    ]
});
