"use client";

import { type ReactNode } from "react";
import { motion } from "motion/react";

import { StepShell, useFlowVariant } from "@/components/quote/ui";

function Icon({ children }: { children: ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="size-4"
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

type TimelineStep = {
  key: string;
  title: string;
  subtitle: string;
  icon: ReactNode;
  done?: boolean;
  next?: boolean;
};

function timelineSteps(requested: boolean): TimelineStep[] {
  return [
    {
      key: "ready",
      title: requested ? "Request sent" : "Estimate ready",
      subtitle: requested ? "With your roofer" : "Your ballpark price",
      done: true,
      icon: (
        <Icon>
          <path d="M4 12.5 9.5 18 20 6.5" />
        </Icon>
      ),
    },
    {
      key: "visit",
      title: "Free visit",
      subtitle: "Usually within a day",
      next: true,
      icon: (
        <Icon>
          <path d="M3 11 12 4l9 7" />
          <path d="M5 10v9h14v-9" />
        </Icon>
      ),
    },
    {
      key: "quote",
      title: "Exact quote",
      subtitle: "No obligation",
      icon: (
        <Icon>
          <rect x="5" y="3" width="14" height="18" rx="2" />
          <path d="M9 8h6M9 12h6M9 16h4" />
        </Icon>
      ),
    },
  ];
}

/**
 * Post-estimate step: roomy timeline + the real intent CTA.
 * "Request a free visit" promotes a priced-only lead to hot.
 */
export function QuoteNextStep({
  contactName,
  brandName = "your local roofer",
  requested = false,
  onRequest,
}: {
  contactName: string;
  brandName?: string;
  requested?: boolean;
  onRequest: () => void;
}) {
  const variant = useFlowVariant();
  const firstName = contactName.trim().split(" ")[0] ?? "";
  const steps = timelineSteps(requested);
  const card = variant === "card";

  return (
    <StepShell className={card ? "!pb-6 justify-center gap-0" : ""}>
      <div className="shrink-0 text-center">
        <h1
          tabIndex={-1}
          className={`text-balance font-[family-name:var(--font-poppins)] font-semibold leading-tight tracking-tight text-ink outline-none ${
            card ? "text-[1.42rem]" : "text-3xl sm:text-4xl"
          }`}
        >
          {requested
            ? firstName
              ? `${firstName}, you're all set`
              : "You're all set"
            : firstName
              ? `${firstName}, here's what happens next`
              : "Here's what happens next"}
        </h1>
        <p
          className={`mx-auto max-w-[36ch] leading-relaxed text-muted ${
            card ? "mt-2.5 text-[15px]" : "mt-3 text-[16px]"
          }`}
        >
          {requested
            ? `${brandName} will be in touch to arrange your visit.`
            : "Request a free visit and your roofer will follow up with an exact quote."}
        </p>
      </div>

      {/* Horizontal timeline — 3 clear steps, bigger type, more air */}
      <div
        className={`mx-auto w-full max-w-[560px] shrink-0 ${
          card ? "mt-8" : "mt-10"
        }`}
      >
        <div className="flex items-start">
          {steps.map((step, i) => {
            const leftBrand = i > 0 && Boolean(steps[i - 1]?.done);
            const rightBrand = Boolean(step.done);
            return (
              <motion.div
                key={step.key}
                className="flex flex-1 flex-col items-center px-2 text-center"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{
                  delay: 0.1 + i * 0.08,
                  duration: 0.32,
                  ease: [0.16, 1, 0.3, 1],
                }}
              >
                <div className="relative flex h-10 w-full items-center justify-center">
                  {i > 0 ? (
                    <span
                      className={`absolute left-0 right-1/2 top-1/2 h-[3px] -translate-y-1/2 ${
                        leftBrand ? "bg-brand-500" : "bg-line"
                      }`}
                    />
                  ) : null}
                  {i < steps.length - 1 ? (
                    <span
                      className={`absolute left-1/2 right-0 top-1/2 h-[3px] -translate-y-1/2 ${
                        rightBrand ? "bg-brand-500" : "bg-line"
                      }`}
                    />
                  ) : null}
                  <span className="relative z-[1]">
                    {step.next ? (
                      <span className="absolute -inset-1.5 animate-pulse rounded-full bg-brand-500/20" />
                    ) : null}
                    <span
                      className={`relative grid size-10 place-items-center rounded-full ${
                        step.done
                          ? "bg-brand-500 text-white"
                          : step.next
                            ? "border-[2.5px] border-brand-500 bg-white text-brand-600"
                            : "border border-line bg-white text-muted"
                      }`}
                    >
                      {step.icon}
                    </span>
                  </span>
                </div>
                <p
                  className={`mt-3.5 font-semibold leading-snug text-ink ${
                    card ? "text-[15px]" : "text-[16px]"
                  }`}
                >
                  {step.title}
                </p>
                <p
                  className={`mt-1 max-w-[12ch] leading-snug text-muted ${
                    card ? "text-[13px]" : "text-[14px]"
                  }`}
                >
                  {step.subtitle}
                </p>
              </motion.div>
            );
          })}
        </div>
      </div>

      <div
        className={`mx-auto w-full max-w-[560px] shrink-0 ${
          card ? "mt-8" : "mt-10"
        }`}
      >
        {requested ? (
          <div
            className={`flex items-center justify-center gap-2 rounded-full bg-emerald-500/10 px-5 text-center font-semibold text-emerald-700 ${
              card ? "py-3.5 text-[15px]" : "py-4 text-[16px]"
            }`}
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              aria-hidden="true"
            >
              <path
                d="M5 12.5 9.5 17 19 7.5"
                stroke="currentColor"
                strokeWidth="2.4"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            Visit requested — we&apos;ll take it from here.
          </div>
        ) : (
          <button
            type="button"
            onClick={onRequest}
            className="relative inline-flex w-full items-center justify-center gap-2 rounded-full bg-gradient-to-b from-brand-500 to-brand-600 px-7 py-3.5 text-[16.5px] font-semibold text-white shadow-[0_1px_0_rgba(255,255,255,0.25)_inset,0_10px_22px_-8px_rgba(31,87,240,0.6)] transition-all duration-200 hover:-translate-y-px hover:brightness-105 active:translate-y-0"
          >
            Request a free visit
          </button>
        )}
      </div>
    </StepShell>
  );
}
