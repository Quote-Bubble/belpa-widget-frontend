"use client";

/**
 * Postcode field for the bubble + address step. The flow's "First line of
 * address" lives in AddressStep (steps.tsx) and reuses the same confirming
 * tick UX via the exports below.
 * No Google Places Autocomplete — geocode stays on /api/geocode (postcodes.io).
 */

import { useEffect, useState } from "react";

import { flowInputClass, flowLabelClass } from "@/components/quote/ui";
import { looksLikeUkPostcode, prettyPostcode } from "@/lib/postcode";

type AddressEntryProps = {
  postcode: string;
  onPostcodeChange: (value: string) => void;
  /** "flow" = wizard step; "bare" = bubble search. Both are postcode-only. */
  variant?: "flow" | "bare";
  autoFocus?: boolean;
  onSubmit?: () => void;
};

export type FieldFeedback = "idle" | "checking" | "valid" | "invalid";

/** Brief spinner before the green tick so validation feels like work. */
export function useConfirmingValid(
  isValid: boolean,
  delayMs = 520,
): "idle" | "checking" | "valid" {
  const [phase, setPhase] = useState<"idle" | "checking" | "valid">("idle");

  useEffect(() => {
    if (!isValid) {
      setPhase("idle");
      return;
    }
    setPhase("checking");
    const timer = window.setTimeout(() => setPhase("valid"), delayMs);
    return () => window.clearTimeout(timer);
  }, [isValid, delayMs]);

  return phase;
}

export function FieldFeedbackIcon({ status }: { status: FieldFeedback }) {
  if (status === "idle") return null;

  if (status === "checking") {
    return (
      <span
        className="pointer-events-none absolute right-3 top-1/2 grid size-6 -translate-y-1/2 place-items-center"
        aria-hidden="true"
      >
        <span className="q-field-spinner" />
      </span>
    );
  }

  const ok = status === "valid";
  return (
    <span
      className={`pointer-events-none absolute right-3 top-1/2 grid size-6 -translate-y-1/2 place-items-center rounded-full ${
        ok ? "bg-emerald-500/12 text-emerald-600" : "bg-red-500/12 text-red-500"
      }`}
      aria-hidden="true"
    >
      {ok ? (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
          <path
            d="M5 12.5 9.5 17 19 7.5"
            stroke="currentColor"
            strokeWidth="2.4"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      ) : (
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
          <path
            d="M6 6l12 12M18 6 6 18"
            stroke="currentColor"
            strokeWidth="2.4"
            strokeLinecap="round"
          />
        </svg>
      )}
    </span>
  );
}

function statusBorderClass(status: FieldFeedback): string {
  if (status === "valid" || status === "checking") {
    return "border-emerald-400/80 focus:border-emerald-400";
  }
  if (status === "invalid") {
    return "border-red-400 focus:border-red-400 focus:ring-red-500/15";
  }
  return "";
}

export function AddressEntry({
  postcode,
  onPostcodeChange,
  variant = "flow",
  autoFocus = false,
  onSubmit,
}: AddressEntryProps) {
  const [postcodeTouched, setPostcodeTouched] = useState(false);
  const postcodeLooksValid = looksLikeUkPostcode(postcode);
  const confirming = useConfirmingValid(postcodeLooksValid);

  const postcodeFeedback: FieldFeedback = postcodeLooksValid
    ? confirming
    : postcode.trim() && postcodeTouched
      ? "invalid"
      : "idle";

  if (variant === "bare") {
    return (
      <div className="q-bare-field">
        <input
          id="quoter-postcode"
          type="text"
          value={postcode}
          onChange={(event) =>
            onPostcodeChange(event.target.value.toUpperCase())
          }
          onBlur={() => {
            if (looksLikeUkPostcode(postcode)) {
              onPostcodeChange(prettyPostcode(postcode));
            }
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              onSubmit?.();
            }
          }}
          placeholder="Enter your postcode"
          autoComplete="postal-code"
          autoFocus={autoFocus}
          spellCheck={false}
          className="q-bare-input"
          aria-label="Enter your postcode"
        />
      </div>
    );
  }

  return (
    <div>
      <label className={flowLabelClass} htmlFor="quote-postcode">
        Postcode
      </label>
      <div className="relative">
        <input
          id="quote-postcode"
          type="text"
          value={postcode}
          onChange={(event) =>
            onPostcodeChange(event.target.value.toUpperCase())
          }
          onBlur={() => {
            setPostcodeTouched(true);
            if (looksLikeUkPostcode(postcode)) {
              onPostcodeChange(prettyPostcode(postcode));
            }
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              setPostcodeTouched(true);
              onSubmit?.();
            }
          }}
          placeholder="e.g. SW1A 2AA"
          autoComplete="postal-code"
          autoFocus={autoFocus}
          spellCheck={false}
          aria-invalid={postcodeFeedback === "invalid"}
          aria-busy={postcodeFeedback === "checking"}
          className={`${flowInputClass} pr-11 ${statusBorderClass(postcodeFeedback)}`}
        />
        <FieldFeedbackIcon status={postcodeFeedback} />
      </div>
    </div>
  );
}

export function addressEntryReady(postcode: string): boolean {
  return looksLikeUkPostcode(postcode);
}
