"use client";

import { useEffect } from "react";

/**
 * Route-level error boundary. If the quote flow crashes mid-way, offer a
 * consultation call-back so the homeowner's intent (and the lead) isn't lost.
 */
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[belpa] route error", error);
  }, [error]);

  return (
    <main className="mx-auto flex min-h-dvh max-w-lg flex-col items-center justify-center px-6 py-16 text-center">
      <h1 className="font-[family-name:var(--font-poppins)] text-2xl font-semibold tracking-tight text-ink">
        Something went wrong
      </h1>
      <p className="mt-3 text-[15px] leading-relaxed text-muted">
        Your details may still be with us. Request a free consultation and your
        roofer will call you back — or try again.
      </p>
      <div className="mt-8 flex w-full flex-col gap-3 sm:flex-row sm:justify-center">
        <a
          href="mailto:hello@getbelpa.io?subject=Roof%20consultation%20request"
          className="inline-flex items-center justify-center rounded-full bg-brand-500 px-5 py-3 text-[15px] font-semibold text-white shadow-[0_8px_18px_-6px_rgba(31,87,240,0.55)] transition-colors hover:brightness-105"
        >
          Request a consultation call
        </a>
        <button
          type="button"
          onClick={reset}
          className="inline-flex items-center justify-center rounded-full border border-line bg-white px-5 py-3 text-[15px] font-semibold text-ink-soft transition-colors hover:border-brand-300 hover:text-brand-600"
        >
          Try again
        </button>
      </div>
    </main>
  );
}
