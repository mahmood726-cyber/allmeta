/**
 * Classify a failed asset response/request. An absent re-check means pending.
 * A first 4xx is always missing, even if a later request could succeed.
 * @param {number|string} first HTTP status or network error text
 * @param {number|string} [recheck] HTTP status or network error text
 * @returns {'missing'|'transient'|'recheck'}
 */
function classifyAssetFailure(first, recheck) {
  if (typeof first === 'number' && first >= 400 && first < 500) return 'missing';
  if (recheck === undefined) return 'recheck';
  return typeof recheck === 'number' && recheck < 400 ? 'transient' : 'missing';
}

exports.classifyAssetFailure = classifyAssetFailure;
