/**
 * Console/network error policy shared by capture and parity.
 *
 * A missing favicon is the only tolerated failure, and only when the failing
 * request is the favicon itself. Everything else — including any other 404 or
 * failed request — is a real error that must fail the run.
 */
'use strict';

const FAVICON = /favicon/i;

function isFavicon(url) {
  return FAVICON.test(String(url || ''));
}

/**
 * Attach the shared listeners to a Playwright page and return a collector that
 * exposes the recorded failures.
 *
 * Console errors are matched by their source URL, not by their text: Chrome
 * reports a failed subresource as "Failed to load resource ... 404 (Not Found)"
 * without naming the URL in the text, so filtering on the text alone would drop
 * every 404 — including real application resources.
 */
function collectPageErrors(page) {
  const errors = [];

  page.on('pageerror', (e) => errors.push('pageerror: ' + String((e && e.message) || e)));

  page.on('console', (m) => {
    if (m.type() !== 'error') return;
    const url = (typeof m.location === 'function' && m.location() && m.location().url) || '';
    if (isFavicon(url)) return;
    errors.push('console: ' + m.text() + (url ? ` @ ${url}` : ''));
  });

  page.on('requestfailed', (req) => {
    if (isFavicon(req.url())) return;
    const failure = req.failure();
    errors.push(`requestfailed: ${req.url()} ${(failure && failure.errorText) || ''}`.trim());
  });

  page.on('response', (res) => {
    if (res.status() < 400) return;
    if (isFavicon(res.url())) return;
    errors.push(`http ${res.status()}: ${res.url()}`);
  });

  return errors;
}

module.exports = { collectPageErrors, isFavicon };
