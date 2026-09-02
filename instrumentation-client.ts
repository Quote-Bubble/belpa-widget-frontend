import * as Sentry from "@sentry/nextjs";

import { DENY_URLS, IGNORE_ERRORS } from "@/lib/sentry-noise";

/**
 * Browser-side error reporting. Covers the embed pages roofers put on their sites.
 *
 * NEXT_PUBLIC_SENTRY_DSN is deliberately separate from the server DSN: this one
 * ships to every visitor's browser, so it wants its own key that can be rotated
 * without touching the server, and its own project quota.
 */
const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN?.trim();

if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env.NEXT_PUBLIC_VERCEL_ENV || "development",
    tracesSampleRate: 0,
    // Session replay is off. It records the DOM, and these pages carry a
    // homeowner's name, phone, email and address.
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: 0,
    sendDefaultPii: false,
    // Other people's browser extensions are not our incidents.
    ignoreErrors: IGNORE_ERRORS,
    denyUrls: DENY_URLS,
  });
}

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
