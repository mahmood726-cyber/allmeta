// The P16 DOM runner needs the exact test-only linkedom version.
// Resolve from the checked-out shared-tests npm tree, never a session-local
// /tmp review installation that vanishes on a clean GitHub Actions runner.
const version = require('linkedom/package.json').version;
if (version !== '0.18.12') {
  throw Error('P16 DOM tests require linkedom 0.18.12; found ' + version);
}
