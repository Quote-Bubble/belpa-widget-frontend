"use client";

import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { AnimatePresence, motion } from "motion/react";
import { PROGRESS_TRANSITION } from "@/lib/motion";

/* Shared UI primitives for the quote flow — heatable-style visual language
   on the quoter-web brand tokens (see app/globals.css). */

export type FlowVariant = "page" | "card";

const FlowVariantContext = createContext<FlowVariant>("page");

export function FlowVariantProvider({
  variant,
  children,
}: {
  variant: FlowVariant;
  children: ReactNode;
}) {
  return (
    <FlowVariantContext.Provider value={variant}>
      {children}
    </FlowVariantContext.Provider>
  );
}

export function useFlowVariant(): FlowVariant {
  return useContext(FlowVariantContext);
}

export function StepShell({
  children,
  className,
  bleed = false,
}: {
  children: ReactNode;
  className?: string;
  /** Card variant only: drop the max-width + padding so the child (a map)
   *  can fill the panel edge-to-edge. */
  bleed?: boolean;
}) {
  const variant = useFlowVariant();
  const shellRef = useRef<HTMLDivElement>(null);
  const [announcement, setAnnouncement] = useState("");
  // Card: a flex child that fills the panel (flex-1) so short steps center
  // their content and bleed steps (maps) stretch to the edges. The pinned
  // BackButton sits over the bottom padding / map, so pb only needs to clear
  // it on normal steps.
  const cardClass = bleed
    ? // A positioned, height-filling box for a map that fills it via absolute
      // inset (geometric fill - doesn't depend on the flex/percentage height
      // chain resolving, which proved unreliable for the Google Map).
      "relative max-w-none flex-1 min-h-0"
    : "max-w-xl flex-1 min-h-0 px-5 pt-9 pb-14";

  useEffect(() => {
    const heading = shellRef.current?.querySelector("h1");
    const text = heading?.textContent?.trim() ?? "";
    if (text) setAnnouncement(text);
  }, [children]);

  return (
    <div
      ref={shellRef}
      data-step-focus
      tabIndex={-1}
      className={`mx-auto flex w-full flex-col items-stretch outline-none ${
        variant === "card" ? cardClass : "max-w-xl px-5 pb-28 pt-10 sm:pt-16"
      } ${className ?? ""}`}
    >
      <span className="sr-only" aria-live="polite">
        {announcement}
      </span>
      {children}
    </div>
  );
}

export function StepHeading({
  children,
  sub,
  info,
  compact = false,
}: {
  children: ReactNode;
  /** Keep to one line — this sits under the heading permanently. */
  sub?: ReactNode;
  /** Longer "why we ask" context, tucked behind a small (i) next to the
   *  heading instead of taking up its own block of vertical space. */
  info?: ReactNode;
  /** Use for summary screens where the content should read as one group. */
  compact?: boolean;
}) {
  const variant = useFlowVariant();
  return (
    <div
      className={`text-center ${
        variant === "card" ? (compact ? "mb-4" : "mb-7") : compact ? "mb-5" : "mb-8"
      }`}
    >
      <h1
        // -1 so the flow can programmatically move focus here on each step
        // change (screen-reader / keyboard users) without adding it to the tab
        // order; outline is suppressed since this focus is programmatic.
        tabIndex={-1}
        className={`text-balance font-[family-name:var(--font-poppins)] font-semibold leading-tight tracking-tight text-ink outline-none ${
          variant === "card"
            ? "text-[1.65rem]"
            : "text-3xl sm:text-4xl"
        }`}
      >
        {children}
        {info ? <InfoTip>{info}</InfoTip> : null}
      </h1>
      {sub ? (
        <p
          className={`mt-2 truncate text-muted ${
            variant === "card" ? "text-[14.5px]" : "text-[16px]"
          }`}
        >
          {sub}
        </p>
      ) : null}
    </div>
  );
}

/** Small (i) trigger next to a heading — replaces a permanent InfoCallout
 *  block with a tap-to-reveal popover, so the explanation only takes space
 *  when someone actually wants it. */
export function InfoTip({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDocPointerDown(event: PointerEvent) {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("pointerdown", onDocPointerDown);
    return () => document.removeEventListener("pointerdown", onDocPointerDown);
  }, [open]);

  return (
    <span ref={rootRef} className="relative inline-block align-middle">
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        aria-expanded={open}
        aria-label="Why we ask"
        className={`ml-1.5 -mt-1 inline-grid size-5 flex-none place-items-center rounded-full transition-colors ${
          open
            ? "bg-brand-500 text-white"
            : "bg-brand-50 text-brand-600 hover:bg-brand-100"
        }`}
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.4"
          className="size-3"
          aria-hidden="true"
        >
          <circle cx="12" cy="12" r="9" />
          <path d="M12 11v5" strokeLinecap="round" />
          <circle cx="12" cy="7.5" r="0.5" fill="currentColor" />
        </svg>
      </button>
      <AnimatePresence>
        {open ? (
          <motion.div
            role="tooltip"
              initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.16, ease: [0.22, 1, 0.36, 1] }}
            className="absolute right-0 top-full z-30 mt-2 w-56 rounded-2xl border border-line bg-white p-3 text-left text-[12.5px] font-normal leading-relaxed text-ink-soft shadow-[0_8px_24px_-8px_rgba(16,24,40,0.3)]"
          >
            {children}
          </motion.div>
        ) : null}
      </AnimatePresence>
    </span>
  );
}

export function OptionPill({
  label,
  hint,
  selected,
  onClick,
}: {
  label: string;
  hint?: string;
  selected: boolean;
  onClick: () => void;
}) {
  const variant = useFlowVariant();
  const compact = variant === "card";
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={`group flex w-full items-center text-left transition-colors duration-150 ${
        compact ? "gap-3.5 rounded-2xl px-4 py-3.5" : "gap-4 rounded-full px-4 py-4"
      } ${
        selected
          ? "bg-brand-500 text-white shadow-[0_10px_24px_-8px_rgba(31,87,240,0.55)]"
          : "bg-[#f1f2f5]/90 text-ink hover:bg-[#e9ebef]"
      }`}
    >
      <span
        className={`grid flex-none place-items-center rounded-full transition-colors ${
          compact ? "size-8" : "size-10"
        } ${selected ? "bg-white/95" : "bg-white/70 group-hover:bg-white"}`}
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={`text-brand-600 transition-opacity ${
            compact ? "size-4" : "size-4.5"
          } ${selected ? "opacity-100" : "opacity-0"}`}
          aria-hidden="true"
        >
          <path d="M4 12.5 9.5 18 20 6.5" />
        </svg>
      </span>
      <span className={`min-w-0 ${compact ? "py-0.5" : "py-1"}`}>
        <span
          className={`block font-semibold leading-snug ${
            compact ? "text-[16px]" : "text-[17px]"
          }`}
        >
          {label}
        </span>
        {hint ? (
          <span
            className={`mt-0.5 block leading-snug ${
              compact ? "text-[13.5px]" : "text-[14.5px]"
            } ${selected ? "text-white/80" : "text-muted"}`}
          >
            {hint}
          </span>
        ) : null}
      </span>
    </button>
  );
}

export function InfoCallout({ children }: { children: ReactNode }) {
  const variant = useFlowVariant();
  return (
    <div
      className={`flex items-start gap-3 rounded-2xl bg-brand-50/80 p-4 text-[15.5px] leading-relaxed text-ink-soft backdrop-blur-sm ${
        variant === "card" ? "mt-5 p-4 text-[14.5px]" : "mt-7"
      }`}
    >
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        className="mt-0.5 size-5 flex-none text-brand-600"
        aria-hidden="true"
      >
        <circle cx="12" cy="12" r="9" />
        <path d="M12 11v5" strokeLinecap="round" />
        <circle cx="12" cy="7.5" r="0.5" fill="currentColor" />
      </svg>
      <p>{children}</p>
    </div>
  );
}

export function PrimaryButton({
  children,
  onClick,
  disabled = false,
  type = "button",
  busy = false,
}: {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  type?: "button" | "submit";
  busy?: boolean;
}) {
  const variant = useFlowVariant();
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled || busy}
      className={`relative inline-flex w-full items-center justify-center gap-2 rounded-full bg-gradient-to-b from-brand-500 to-brand-600 px-7 text-[16.5px] font-semibold text-white shadow-[0_1px_0_rgba(255,255,255,0.25)_inset,0_10px_22px_-8px_rgba(31,87,240,0.6)] transition-all duration-200 hover:-translate-y-px hover:brightness-105 active:translate-y-0 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0 ${
        variant === "card" ? "mt-auto py-3.5" : "mt-8 py-4"
      }`}
    >
      {busy ? (
        <span className="size-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
      ) : null}
      {children}
    </button>
  );
}

/** Compact circular confirm — for a single "yes, this is right" gate that
 *  doesn't deserve a full-width pill (and the vertical space, and the
 *  resulting scroll, that comes with one). Meant to float over whatever
 *  it's confirming rather than push it down the page. */
export function TickButton({
  onClick,
  label,
  busy = false,
}: {
  onClick: () => void;
  label: string;
  busy?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy}
      aria-label={label}
      title={label}
      className="grid size-12 flex-none place-items-center rounded-full bg-gradient-to-b from-brand-500 to-brand-600 text-white shadow-[0_1px_0_rgba(255,255,255,0.25)_inset,0_10px_22px_-6px_rgba(31,87,240,0.65)] transition-all duration-200 hover:scale-105 hover:brightness-105 active:scale-95 disabled:cursor-not-allowed disabled:opacity-60"
    >
      {busy ? (
        <span className="size-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
      ) : (
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="size-5"
          aria-hidden="true"
        >
          <path d="M4 12.5 9.5 18 20 6.5" />
        </svg>
      )}
    </button>
  );
}

export function ContinueBubble({
  onClick,
  label = "Continue",
  disabled = false,
  ariaLabel,
}: {
  onClick: () => void;
  label?: string;
  disabled?: boolean;
  ariaLabel?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={ariaLabel}
      className="inline-flex h-9 items-center gap-1.5 rounded-full bg-brand-500 px-3.5 text-[12px] font-semibold text-white shadow-[0_8px_18px_-8px_rgba(31,87,240,0.6)] transition-all duration-150 hover:brightness-105 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
    >
      {label}
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="size-3.5"
        aria-hidden="true"
      >
        <path d="M5 12h14m-6-6 6 6-6 6" />
      </svg>
    </button>
  );
}

export function ProgressHeader({
  percent,
  brandName,
  onClose,
}: {
  percent: number;
  /** Unused for display — Quoter's own brand is the permanent header
   * treatment on every embed (the growth mechanic for a widely-embedded,
   * free widget). Kept in the signature in case a caller still passes it. */
  brandName?: string;
  onClose?: () => void;
}) {
  const variant = useFlowVariant();
  void brandName;
  return (
    <div
      className={`z-20 backdrop-blur-md ${
        variant === "card"
          ? "flex-none rounded-t-[28px] bg-white/35"
          : "sticky top-0 bg-white/85"
      }`}
    >
      <div
        className={`flex items-center justify-between px-5 ${
          variant === "card" ? "sm:px-5" : "sm:px-8"
        } ${variant === "card" ? "py-2.5" : "py-3"}`}
      >
        <a
          href="https://quoter-landing.vercel.app"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-baseline gap-1.5"
        >
          <span className="text-[12px] font-semibold text-brand-600">
            Powered by
          </span>
          <span className="font-[family-name:var(--font-poppins)] text-xl font-bold tracking-tight text-ink">
            Quoter
          </span>
        </a>
        <span className="flex items-center gap-2.5">
          {onClose ? (
            <button
              type="button"
              onClick={onClose}
              aria-label="Close quote"
              className="grid size-8 place-items-center rounded-full bg-[#f1f2f5] text-ink-soft transition-colors hover:bg-[#e6e8ed]"
            >
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.2"
                strokeLinecap="round"
                className="size-4"
                aria-hidden="true"
              >
                <path d="m6 6 12 12M18 6 6 18" />
              </svg>
            </button>
          ) : null}
        </span>
      </div>
      <div className="h-1 w-full bg-brand-100/45">
        <motion.div
          className="h-full rounded-full bg-gradient-to-r from-brand-500 to-brand-600"
          initial={false}
          animate={{ width: `${Math.max(percent, 3)}%` }}
          transition={PROGRESS_TRANSITION}
        />
      </div>
    </div>
  );
}

export function BackButton({ onClick }: { onClick: () => void }) {
  const variant = useFlowVariant();
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Go back"
      className={`z-30 grid size-11 place-items-center rounded-full bg-[#f1f2f5] text-ink shadow-sm transition-all duration-200 hover:bg-[#e6e8ed] hover:scale-[1.03] active:scale-95 ${
        variant === "card"
          ? "absolute bottom-4 left-4 size-9"
          : "fixed bottom-6 left-5 sm:absolute sm:bottom-8 sm:left-8"
      }`}
    >
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="size-5"
        aria-hidden="true"
      >
        <path d="M19 12H5m6-7-7 7 7 7" />
      </svg>
    </button>
  );
}

export function useMapHeightClass() {
  const variant = useFlowVariant();
  // Card (iframe embed) maps MUST have a concrete height. The card auto-sizes
  // to its content, so a `flex-1` map has no free space to fill and collapses
  // to a zero-height strip (that was the "blank map" bug). A fixed height
  // breaks that circularity: the map defines its own size, the card grows to
  // fit it, and the iframe grows to fit the card.
  return variant === "card" ? "h-[320px]" : "h-[380px] sm:h-[440px]";
}

// 16px minimum: below it iOS Safari zooms the page on focus, which inside the
// fixed, scroll-locked mobile overlay misaligns the whole flow.
export const flowInputClass =
  "w-full rounded-2xl border border-line bg-white px-4 py-3 text-[16px] text-ink outline-none transition-shadow placeholder:text-muted/70 focus:border-brand-400 focus:ring-4 focus:ring-brand-500/15";

export const flowLabelClass =
  "mb-1.5 block text-[14px] font-semibold text-ink-soft";
