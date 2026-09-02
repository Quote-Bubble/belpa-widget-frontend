/**
 * Errors thrown by the visitor's browser extensions, not by us.
 *
 * Sentry's global handler catches everything that reaches window.onerror,
 * including scripts a browser extension injected into the page. MetaMask is
 * the loudest — it throws "Failed to connect to MetaMask" from
 * scripts/inpage.js on pages that have never heard of it — and it paged us at
 * 9am for a wallet extension on a stranger's laptop.
 *
 * Filtering by message alone is not enough, because an extension can throw
 * anything. The URL filter is the real defence: any frame from a
 * chrome-extension:// or moz-extension:// origin is not our code by
 * definition. Sentry rewrites those to `app:///` in the stack, so the raw
 * message patterns cover what the URL filter cannot see.
 *
 * Deliberately narrow. The point is to stop paging on other people's
 * software, not to suppress our own noise — an error we caused should still
 * wake somebody up.
 */

export const IGNORE_ERRORS = [
  // MetaMask and other wallet extensions.
  /Failed to connect to MetaMask/i,
  /MetaMask extension not found/i,
  /ethereum is not defined/i,
  // Extensions and injected scripts more generally.
  /Extension context invalidated/i,
  /chrome-extension:\/\//i,
  /moz-extension:\/\//i,
  // Benign browser noise: a fetch the user navigated away from, and a
  // ResizeObserver notice browsers emit that has no user-visible effect.
  /ResizeObserver loop/i,
  /^Load failed$/,
  /^Failed to fetch$/,
  /AbortError/i,
];

export const DENY_URLS = [
  /^chrome-extension:\/\//i,
  /^moz-extension:\/\//i,
  /^safari-extension:\/\//i,
  /^safari-web-extension:\/\//i,
  // Sentry rewrites extension frames to this prefix once they have no origin.
  /^app:\/\/\/scripts\/inpage\.js/i,
  /extensions\//i,
];
