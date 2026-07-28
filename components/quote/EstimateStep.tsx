"use client";

import { useEffect, useState, type ReactNode } from "react";

import { InfoTip, StepShell, useFlowVariant } from "@/components/quote/ui";
import type { CombinedMeasurement } from "@/lib/quote-flow";
import { displayQuoteAmount, quoteBaseSubtotal } from "@/lib/quote";
import type { LatLng, QuoteResult } from "@/lib/types";

function useCountUp(target: number, durationMs = 1100, delayMs = 250) {
  const [value, setValue] = useState(0);
  useEffect(() => {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced) {
      const frame = window.requestAnimationFrame(() => setValue(target));
      return () => window.cancelAnimationFrame(frame);
    }
    let frame = 0;
    let start: number | null = null;
    const tick = (now: number) => {
      if (start === null) start = now;
      const elapsed = now - start - delayMs;
      if (elapsed < 0) {
        frame = requestAnimationFrame(tick);
        return;
      }
      const t = Math.min(1, elapsed / durationMs);
      const eased = 1 - Math.pow(1 - t, 3);
      setValue(Math.round(target * eased));
      if (t < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [target, durationMs, delayMs]);
  return value;
}

/* Small line icons for the estimate feature chips. */
function Icon({ children }: { children: ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.9"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="size-4 flex-none"
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

const ICONS: Record<string, ReactNode> = {
  area: (
    <Icon>
      <rect x="3" y="8" width="18" height="8" rx="1.5" />
      <path d="M7 8v3M11 8v4M15 8v3" />
    </Icon>
  ),
  gutter: (
    <Icon>
      <path d="M3 8v3a3 3 0 0 0 3 3h12a3 3 0 0 0 3-3V8" />
      <path d="M3 8h18" />
    </Icon>
  ),
};

type Chip = { key: string; icon: ReactNode; label: string };

export function EstimateStep({
  quote,
  measurement,
  address,
  contactName,
  onConfirm,
  onContinue,
}: {
  quote: QuoteResult;
  measurement: CombinedMeasurement | null;
  /** Kept for call-site compatibility; the redesign no longer shows a roof image. */
  roofs?: LatLng[][];
  address: string;
  materialLabelText: string;
  jobLabel: string;
  contactName: string;
  brandName?: string;
  mapsEnabled?: boolean;
  /** Primary action: they want the real thing. Promotes the lead to a genuine
   *  request (hot) and moves on. */
  onConfirm?: () => void;
  /** Quiet alternative: they just wanted the ballpark. Moves on WITHOUT
   *  promoting — the lead stays a browser and lands in the follow-up pool. */
  onContinue?: () => void;
}) {
  const variant = useFlowVariant();
  const [showBreakdown, setShowBreakdown] = useState(false);
  const min = useCountUp(quote.min, 600, 80);
  const max = useCountUp(quote.max, 600, 80);
  const area = measurement ? Math.round(measurement.surfaceAreaM2) : null;
  const gutter =
    measurement && measurement.gutterLengthM > 0
      ? Math.round(measurement.gutterLengthM)
      : null;
  const firstName = contactName.trim().split(" ")[0] ?? "";
  const showArea = quote.pricingMode !== "roofline" && area !== null;
  const baseSubtotal = quoteBaseSubtotal(quote);

  const chips: Chip[] = [
    showArea && area !== null
      ? { key: "area", icon: ICONS.area, label: `≈ ${area} m²` }
      : null,
    gutter !== null
      ? { key: "gutter", icon: ICONS.gutter, label: `≈ ${gutter} m gutter` }
      : null,
  ].filter(Boolean) as Chip[];

  return (
    // Terminal step: no pinned Back button, so reclaim its reserved space
    // (!pb-6) and centre the estimate in the fixed panel. Content is kept lean
    // enough to fit as a single page — no overflow, no scrollbar.
    <StepShell className={variant === "card" ? "!pb-6 justify-center" : ""}>
      {/* Heading + address */}
      <div className="shrink-0 text-center">
        <h1
          tabIndex={-1}
          className={`text-balance font-[family-name:var(--font-poppins)] font-semibold leading-tight tracking-tight text-ink outline-none ${
            variant === "card" ? "text-[1.42rem]" : "text-3xl sm:text-4xl"
          }`}
        >
          {firstName ? `${firstName}, here's` : "Here's"} your estimate
          <InfoTip>
            Your roofer will call to confirm the final price after a free survey
            — this range is indicative, not a contract price.
          </InfoTip>
        </h1>
        <p
          className={`flex items-center justify-center gap-1 text-muted ${
            variant === "card" ? "mt-1.5 text-[13px]" : "mt-2 text-[14px]"
          }`}
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            className="size-4 flex-none"
            aria-hidden="true"
          >
            <path d="M12 21s7-5.5 7-11a7 7 0 1 0-14 0c0 5.5 7 11 7 11Z" />
            <circle cx="12" cy="10" r="2.5" />
          </svg>
          <span className="truncate">{address}</span>
        </p>
      </div>

      {/* Estimate card */}
      {/* Card variant is a fixed 544px panel — the vertical rhythm is tightened
          there so the estimate + measurement chips fit as a single page. The
          full-page variant keeps the roomier spacing. */}
      <div
        className={`mx-auto w-full shrink-0 overflow-hidden rounded-3xl border border-line bg-white shadow-[var(--shadow-soft)] ${
          variant === "card" ? "mt-4" : "mt-6"
        }`}
      >
        <div
          className={`text-center ${
            variant === "card" ? "px-5 pb-3 pt-4" : "px-5 pb-4 pt-5"
          }`}
        >
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">
            Estimate
          </p>
          <p
            className={`mt-1.5 font-[family-name:var(--font-poppins)] font-semibold leading-tight tracking-tight text-ink ${
              variant === "card" ? "text-[1.8rem]" : "text-[2rem] sm:text-5xl"
            }`}
          >
            {displayQuoteAmount(min, false)} – {displayQuoteAmount(max, false)}
          </p>
          <p className="mt-1 text-[11px] font-medium text-muted">excl. VAT</p>
        </div>

        {showBreakdown ? (
          <div className="border-t border-line px-5 py-4 text-left">
            <ul className="flex flex-col gap-1.5">
              {quote.lineItems.map((item) => (
                <li
                  key={`${item.label}-${item.rateId ?? ""}`}
                  className="flex items-baseline justify-between gap-4 text-[13px]"
                >
                  <span className="text-ink-soft">{item.label}</span>
                  <span className="flex-none font-semibold text-ink">
                    {displayQuoteAmount(item.min, false)} –{" "}
                    {displayQuoteAmount(item.max, false)}
                  </span>
                </li>
              ))}
            </ul>
            <div className="mt-3 flex items-baseline justify-between gap-4 border-t border-line pt-2.5 text-[13px]">
              <span className="font-medium text-ink-soft">
                Subtotal before our confidence range
              </span>
              <span className="flex-none font-semibold text-ink">
                {displayQuoteAmount(baseSubtotal.min, false)} –{" "}
                {displayQuoteAmount(baseSubtotal.max, false)}
              </span>
            </div>
            <p className="mt-2 text-[11.5px] leading-relaxed text-muted">
              The headline range applies our confidence band to this subtotal
              ({displayQuoteAmount(quote.min, false)} –{" "}
              {displayQuoteAmount(quote.max, false)}).
            </p>
            {quote.modelAssumptions.length > 0 ? (
              <p className="mt-3 border-t border-line pt-2.5 text-[11.5px] leading-relaxed text-muted">
                {quote.modelAssumptions.join(" ")}
              </p>
            ) : null}
            <button
              type="button"
              onClick={() => setShowBreakdown(false)}
              className="mt-3 w-full text-center text-[13px] font-semibold text-brand-600 transition-colors hover:text-brand-700"
            >
              Back to estimate
            </button>
          </div>
        ) : (
          <>
            {chips.length > 0 ? (
              <div className="flex flex-col divide-y divide-[#e9eaee] border-t border-line sm:flex-row sm:divide-x sm:divide-y-0">
                {chips.map((chip) => (
                  <span
                    key={chip.key}
                    className={`flex min-w-0 flex-1 items-center justify-center gap-1.5 px-2 text-center font-medium text-ink-soft ${
                      variant === "card" ? "py-2 text-[12px]" : "py-2.5 text-[12.5px]"
                    }`}
                  >
                    <span className="text-brand-500">{chip.icon}</span>
                    <span className="truncate">{chip.label}</span>
                  </span>
                ))}
              </div>
            ) : null}
            <button
              type="button"
              onClick={() => setShowBreakdown(true)}
              className={`flex w-full items-center gap-3 border-t border-line px-5 text-left font-semibold text-brand-600 transition-colors hover:text-brand-700 ${
                variant === "card" ? "py-2.5 text-[14px]" : "py-3.5 text-[15px]"
              }`}
            >
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.9"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="size-5 flex-none"
                aria-hidden="true"
              >
                <rect x="4" y="3" width="16" height="18" rx="2.5" />
                <path d="M8 8h5M8 12h8M8 16h8" />
              </svg>
              <span className="flex-1">See what&apos;s included</span>
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="size-4 flex-none text-brand-500"
                aria-hidden="true"
              >
                <path d="m9 6 6 6-6 6" />
              </svg>
            </button>
          </>
        )}
      </div>

      {/* The fork. This is where a genuine request separates itself from a
          browser: the prominent button promotes the lead (hot), the quiet link
          just carries on with the ballpark (stays in the follow-up pool). */}
      {onConfirm || onContinue ? (
        <div
          className={`mx-auto flex w-full max-w-[560px] shrink-0 flex-col items-center ${
            variant === "card" ? "mt-4 gap-2" : "mt-6 gap-2.5"
          }`}
        >
          {onConfirm ? (
            <button
              type="button"
              onClick={onConfirm}
              className="relative inline-flex w-full items-center justify-center gap-2 rounded-full bg-gradient-to-b from-brand-500 to-brand-600 px-7 py-3.5 text-[16.5px] font-semibold text-white shadow-[0_1px_0_rgba(255,255,255,0.25)_inset,0_10px_22px_-8px_rgba(31,87,240,0.6)] transition-all duration-200 hover:-translate-y-px hover:brightness-105 active:translate-y-0"
            >
              Get my exact quote
            </button>
          ) : null}
          {onContinue ? (
            <button
              type="button"
              onClick={onContinue}
              className="text-[13.5px] font-medium text-muted underline-offset-2 transition-colors hover:text-ink-soft hover:underline"
            >
              Just send me the estimate for now
            </button>
          ) : null}
        </div>
      ) : null}
    </StepShell>
  );
}
