// Navigate and wait until the page is ready, separating a TRANSPORT failure of the local test server from a
// page defect.
//
// Why: in Plus plot pixels run 43716561250 (attempt 1, dta-sroc-pixels, test "DTA pixels 7") the page's
// request for dta-sroc/plus-ui.js never reached the python http.server handler (no access-log line and no
// traceback, while the 27 other requests of that load, and every request of the 12 other loads, were logged).
// plus-ui.js therefore never ran, #alm-plus stayed empty, plus-adapter.js threw before its corpus fetch (no
// corpus GET either), and the test spent 15 s waiting for 28 <option>s that could not appear. Nothing in the
// page was wrong; one file was not delivered.
//
// What this does: a navigation is accepted only when no request failed (a 'requestfailed' event with no HTTP
// response at all). If one did, the URLs and network errors are printed and the page is loaded
// again, at most `attempts` times; after that the test fails naming them. When nothing failed, `ready` is then
// asserted exactly as before, with its own timeout: an HTTP error status, a script error or a wrong count is
// never retried, and no assertion, threshold or pixel tolerance changes.
import {expect} from '@playwright/test';

export async function loadComplete(page, url, ready, {attempts = 3, timeout = 15000} = {}) {
  for (let attempt = 1; ; attempt++) {
    const failed = [];
    // Chromium also reports 'requestfailed' (net::ERR_ABORTED) for a script it rejects after an HTTP error
    // response; that file WAS delivered, so it is not counted (it fails the ready assertion instead).
    const pending = [];
    const onFailed = r => pending.push(r.response().then(res => { if (!res) failed.push(`${r.url()} (${r.failure()?.errorText ?? 'no response'})`); }));
    page.on('requestfailed', onFailed);
    try {
      await page.goto(url, {waitUntil: 'load'});
      // Settle on whichever comes first: the ready condition, or a delivery failure (which can still happen
      // after 'load', e.g. a fetch the page starts from a script).
      await expect.poll(async () => { await Promise.all(pending); return failed.length > 0 || await ready(); }, {timeout}).toBe(true).catch(() => {});
    } finally {
      page.off('requestfailed', onFailed);
    }
    await Promise.all(pending);
    if (!failed.length) break;
    const msg = `local server did not deliver ${failed.length} request(s) (attempt ${attempt}/${attempts}): ${failed.join('; ')}`;
    if (attempt >= attempts) throw new Error(msg);
    console.log('TRANSPORT RETRY ' + msg);
  }
}
