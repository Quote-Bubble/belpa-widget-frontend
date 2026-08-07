import * as Sentry from "@sentry/nextjs";

/**
 * Server-side error reporting. Covers the embed pages roofers put on their sites.
 *
 * No SENTRY_DSN → init is skipped and every Sentry.* call becomes a no-op, so
 * local dev and tests stay silent without branching at the call sites.
 */
export function register(): void {
  const dsn = process.env.SENTRY_DSN?.trim();
  if (!dsn) return;

  Sentry.init({
    dsn,
    environment: process.env.VERCEL_ENV || "development",
    release: process.env.VERCEL_GIT_COMMIT_SHA,
    tracesSampleRate: 0.05,
    sendDefaultPii: false,
    beforeSend(event) {
      if (event.request) {
        delete event.request.data;
        delete event.request.cookies;
        delete event.request.headers;
      }
      return event;
    },
  });
}

export const onRequestError = Sentry.captureRequestError;
