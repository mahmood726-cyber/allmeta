/**
 * Classify a failed asset response/request. Only allowlisted transient failures
 * may be re-checked. Browser-policy failures and other 4xx stay missing.
 * @param {number|string} first HTTP status or network error text
 * @param {number|string} [recheck] HTTP status or network error text
 * @returns {'missing'|'transient'|'recheck'}
 */
function classifyAssetFailure(first, recheck) {
  const retryable = typeof first === 'number'
    ? (first >= 500 && first < 600) || first === 408 || first === 429
    : /ERR_(CONNECTION_(RESET|CLOSED|REFUSED|TIMED_OUT)|TIMED_OUT|NETWORK_CHANGED|EMPTY_RESPONSE|HTTP2_PROTOCOL_ERROR|INTERNET_DISCONNECTED)|timeout/i.test(first);
  if (!retryable) return 'missing';
  if (recheck === undefined) return 'recheck';
  return typeof recheck === 'number' && recheck < 400 ? 'transient' : 'missing';
}

exports.classifyAssetFailure = classifyAssetFailure;
