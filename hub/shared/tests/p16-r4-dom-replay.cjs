// Explicit wrapper entrypoint; dependency/cache files stay outside the tree.
// This is Node DOM execution, not browser/layout evidence.
require('./p16-r4-dom-runtime.cjs');
require('./nma-inconsistency-review.node.cjs');
require('./nma-inconsistency-plus.node.cjs');
require('./validate-nma-inconsistency.node.cjs');
require('./p16-r4-dom-refusal.cjs');
