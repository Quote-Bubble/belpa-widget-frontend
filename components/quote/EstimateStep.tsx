"use client";

import { useEffect, useState, type ReactNode } from "react";
import { motion } from "motion/react";

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

/* "What happens next" tracker steps. First is already complete (the lead was
   sent at the contact step); the second is the next thing to happen. */
type NextStep = {
  key: string;
  title: string;
  subtitle: string;
  icon: ReactNode;
  done?: boolean;
  next?: boolean;
};

const NEXT_STEPS: NextStep[] = [
  {
    key: "sent",
    title: "Details sent",
    subtitle: "With your roofer",
    done: true,
    icon: (
      <Icon>
        <path d="M4 12.5 9.5 18 20 6.5" />
      </Icon>
    ),
  },
  {
    key: "call",
    title: "Roofer calls",
    subtitle: "Within a day",
    next: true,
    icon: (
      <Icon>
        <path d="M5 4h3l1.4 5-2 1.2a11 11 0 0 0 5 5l1.2-2 5 1.4V19a2 2 0 0 1-2.2 2A16 16 0 0 1 3 6.2 2 2 0 0 1 5 4Z" />
      </Icon>
    ),
  },
  {
    key: "survey",
    title: "Free survey",
    subtitle: "Exact price",
    icon: (
      <Icon>
        <path d="M3 11 12 4l9 7" />
        <path d="M5 10v9h14v-9" />
      </Icon>
    ),
  },
  {
    key: "quote",
    title: "Fixed quote",
    subtitle: "No obligation",
    icon: (
      <Icon>
        <rect x="5" y="3" width="14" height="18" rx="2" />
        <path d="M9 8h6M9 12h6M9 16h4" />
      </Icon>
    ),
  },
];

type Chip = { key: string; icon: ReactNode; label: string };

export function EstimateStep({
  quote,
  measurement,
  address,
  contactName,
}: {
  quote: QuoteResult;
  measurement: CombinedMeasurement | null;
  /** Kept for call-site compatibility; the redesign no longer shows a roof image. */
  roofs?: LatLng[][];
  address: string;
  materialLabelText: string;
  jobLabel: string;
  contactName: string;
  mapsEnabled?: boolean;
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
    // StepShell reserves pb-14 in the card to clear the pinned Back button,
    // but this step is terminal and never shows one — reclaim it so the
    // estimate, chips and tracker fit the fixed panel without scrolling.
    <StepShell className={`overflow-y-auto ${variant === "card" ? "!pb-6" : ""}`}>
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
          there so the estimate + measurement chips + tracker all fit without a
          scrollbar. The full-page variant keeps the roomier spacing. */}
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

      {/* What happens next — sleek horizontal tracker */}
      <div
        className={`mx-auto w-full max-w-[560px] shrink-0 ${
          variant === "card" ? "mt-4" : "mt-6"
        }`}
      >
        <p
          className={`text-center text-[12px] font-semibold uppercase tracking-[0.12em] text-muted ${
            variant === "card" ? "mb-2.5" : "mb-4"
          }`}
        >
          What happens next
        </p>
        <div className="flex items-start">
          {NEXT_STEPS.map((step, i) => {
            const leftBrand = i > 0 && Boolean(NEXT_STEPS[i - 1].done);
            const rightBrand = Boolean(step.done);
            return (
              <motion.div
                key={step.key}
                className="flex flex-1 flex-col items-center px-1 text-center"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{
                  delay: 0.15 + i * 0.08,
                  duration: 0.32,
                  ease: [0.16, 1, 0.3, 1],
                }}
              >
                {/* Node + connectors. Line is solid brand out of the done step,
                    light grey after. */}
                <div className="relative flex h-7 w-full items-center justify-center">
                  {i > 0 ? (
                    <span
                      className={`absolute left-0 right-1/2 top-1/2 h-0.5 -translate-y-1/2 ${
                        leftBrand ? "bg-brand-500" : "bg-line"
                      }`}
                    />
                  ) : null}
                  {i < NEXT_STEPS.length - 1 ? (
                    <span
                      className={`absolute left-1/2 right-0 top-1/2 h-0.5 -translate-y-1/2 ${
                        rightBrand ? "bg-brand-500" : "bg-line"
                      }`}
                    />
                  ) : null}
                  <span className="relative">
                    {step.next ? (
                      <span className="absolute -inset-1 animate-pulse rounded-full bg-brand-500/20" />
                    ) : null}
                    <span
                      className={`relative grid size-7 place-items-center rounded-full ${
                        step.done
                          ? "bg-brand-500 text-white"
                          : step.next
                            ? "border-2 border-brand-500 bg-white text-brand-600"
                            : "border border-line bg-white text-muted"
                      }`}
                    >
                      {step.icon}
                    </span>
                  </span>
                </div>
                <p className="mt-2 text-[12.5px] font-semibold leading-tight text-ink">
                  {step.title}
                </p>
                <p className="mt-0.5 text-[11px] leading-tight text-muted">
                  {step.subtitle}
                </p>
              </motion.div>
            );
          })}
        </div>
      </div>
    </StepShell>
  );
}
