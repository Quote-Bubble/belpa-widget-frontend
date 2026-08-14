"use client";

import { ChevronRight, FileText, MapPin } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";

import { InfoTip, StepShell, useFlowVariant } from "@/components/quote/ui";
import type { CombinedMeasurement } from "@/lib/quote-flow";
import { displayQuoteAmount, quoteBandedLineItems } from "@/lib/quote";
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
   *  promoting, the lead stays a browser and lands in the follow-up pool. */
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
  const bandedLineItems = quoteBandedLineItems(quote);

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
    // enough to fit as a single page, no overflow, no scrollbar.
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
           , this range is indicative, not a contract price.
          </InfoTip>
        </h1>
        <p
          className={`flex items-center justify-center gap-1 text-muted ${
            variant === "card" ? "mt-1.5 text-[13px]" : "mt-2 text-[14px]"
          }`}
        >
          <MapPin strokeWidth={2} className="size-4 flex-none" aria-hidden="true" />
          <span className="truncate">{address}</span>
        </p>
      </div>

      {/* Estimate, a split of the headline price (left) and the measurement
          (right), divided by a hairline rather than boxed separately, then a
          soft "see what's included" row. Follows the approved redesign; kept
          lean so it still fits the fixed panel as a single page. */}
      <div
        className={`mx-auto w-full shrink-0 overflow-hidden rounded-3xl border border-line bg-white shadow-[var(--shadow-soft)] ${
          variant === "card" ? "mt-5" : "mt-8"
        }`}
      >
        <div className="flex items-stretch">
          <div
            className={`flex min-w-0 flex-1 flex-col justify-center text-left ${
              variant === "card" ? "px-5 py-5" : "px-8 py-7"
            }`}
          >
            <p
              className={`font-[family-name:var(--font-poppins)] font-semibold leading-none tracking-tight text-ink ${
                variant === "card" ? "text-[1.6rem]" : "text-[2.1rem]"
              }`}
            >
              {displayQuoteAmount(min, false)} – {displayQuoteAmount(max, false)}
            </p>
            <p className="mt-2 text-[11px] font-medium text-muted">excl. VAT</p>
          </div>
          {chips.length > 0 ? (
            <div
              className={`flex flex-none flex-col items-center justify-center gap-2.5 border-l border-line ${
                variant === "card" ? "px-4 py-5" : "px-8 py-7"
              }`}
            >
              {chips.map((chip) => (
                <div
                  key={chip.key}
                  className="flex flex-col items-center gap-1.5 text-center"
                >
                  <span className="grid size-11 place-items-center rounded-2xl bg-brand-50 text-brand-600 [&>svg]:size-5">
                    {chip.icon}
                  </span>
                  <span className="whitespace-nowrap text-[12.5px] font-semibold text-ink">
                    {chip.label}
                  </span>
                </div>
              ))}
            </div>
          ) : null}
        </div>

        {showBreakdown ? (
          <div className="border-t border-line px-5 py-4 text-left">
            <ul className="flex flex-col gap-1.5">
              {bandedLineItems.map((item) => (
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
            {/* The total, not a subtotal. Every line now carries the same
                uncertainty, so they add up to the headline — printing the
                unbanded sum here would contradict the rows directly above it. */}
            <div className="mt-3 flex items-baseline justify-between gap-4 border-t border-line pt-2.5 text-[13px]">
              <span className="font-medium text-ink-soft">Total</span>
              <span className="flex-none font-semibold text-ink">
                {displayQuoteAmount(quote.min, false)} –{" "}
                {displayQuoteAmount(quote.max, false)}
              </span>
            </div>
            <p className="mt-2 text-[11.5px] leading-relaxed text-muted">
              Each line is a range because this is measured from satellite
              imagery, not a survey — the exact price is confirmed on the visit.
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
          <button
            type="button"
            onClick={() => setShowBreakdown(true)}
            className={`flex w-full items-center gap-3 border-t border-line px-5 text-left font-semibold text-brand-600 transition-colors hover:bg-brand-50/50 hover:text-brand-700 ${
              variant === "card" ? "py-3 text-[14px]" : "py-4 text-[15px]"
            }`}
          >
              <FileText strokeWidth={2} className="size-5 flex-none" aria-hidden="true" />
              <span className="flex-1">See what&apos;s included</span>
              <ChevronRight strokeWidth={2} className="size-4 flex-none text-brand-500" aria-hidden="true" />
            </button>
        )}
      </div>

      {/* The fork. This is where a genuine request separates itself from a
          browser: the prominent button promotes the lead (hot), the quiet link
          just carries on with the ballpark (stays in the follow-up pool). */}
      {onConfirm || onContinue ? (
        <div
          className={`mx-auto flex w-full max-w-[560px] shrink-0 flex-col items-center ${
            variant === "card" ? "mt-5 gap-2.5" : "mt-8 gap-3"
          }`}
        >
          {onConfirm ? (
            <button
              type="button"
              onClick={onConfirm}
              className="relative inline-flex w-full items-center justify-center rounded-full bg-gradient-to-b from-brand-500 to-brand-600 px-7 py-3.5 text-[16.5px] font-semibold text-white shadow-[0_1px_0_rgba(255,255,255,0.25)_inset,0_10px_22px_-8px_rgba(31,87,240,0.6)] transition-all duration-200 hover:-translate-y-px hover:brightness-105 active:translate-y-0"
            >
              Get my exact quote
            </button>
          ) : null}
          {onContinue ? (
            <button
              type="button"
              onClick={onContinue}
              className="inline-flex w-full items-center justify-center rounded-full border border-line bg-white px-7 py-3 text-[15px] font-semibold text-ink-soft transition-colors hover:border-brand-300 hover:text-brand-600"
            >
              Just send me the estimate for now
            </button>
          ) : null}
        </div>
      ) : null}
    </StepShell>
  );
}
