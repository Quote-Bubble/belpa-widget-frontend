"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { APIProvider } from "@vis.gl/react-google-maps";
import { AnimatePresence, MotionConfig, motion } from "motion/react";

import { AddressEntry } from "@/components/quote/AddressEntry";
import { QuoteFlowInner } from "@/components/quote/QuoteFlow";
import {
  MOTION_DURATION,
  QUOTE_SIZES,
  SHELL_TRANSITION,
  STEP_TRANSITION,
} from "@/lib/motion";
import { initAnalytics, track } from "@/lib/analytics";
import { flushPendingLead } from "@/lib/pending-lead";
import { looksLikeUkPostcode, prettyPostcode } from "@/lib/postcode";

type QuoteBubbleProps = {
  rooferId?: string;
  brandName?: string;
  /**
   * Open straight into the expanded flow on DESKTOP (skip the collapsed search
   * bar) — used by the inline roofer widget (/w). Ignored on mobile, which
   * keeps the compact entry → fullscreen-overlay behaviour so it never hijacks
   * the host page on load. The landing hero leaves this off.
   */
  startExpanded?: boolean;
};

type OpenFlow = {
  key: number;
  postcode: string;
  formatted: string | null;
};

function useIsDesktop(breakpoint = 640) {
  const [desktop, setDesktop] = useState(() => {
    if (typeof window === "undefined") return false;
    return window.matchMedia(`(min-width: ${breakpoint}px)`).matches;
  });
  useEffect(() => {
    const mq = window.matchMedia(`(min-width: ${breakpoint}px)`);
    const update = () => setDesktop(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, [breakpoint]);
  return desktop;
}

function QuoteBubbleShell({
  rooferId = "demo-roofer",
  brandName = "Quoter",
  startExpanded = false,
  mapsEnabled,
}: QuoteBubbleProps & { mapsEnabled: boolean }) {
  const [postcode, setPostcode] = useState("");
  const [flow, setFlow] = useState<OpenFlow | null>(null);
  // The step content mounts immediately so the panel is never empty glass, but
  // for the length of the height tween it is taller than the box it sits in.
  // Until the shell reaches its full 544px, the step scroller stays clipped so
  // that transient overflow can't flash a scrollbar. See the CSS rule keyed on
  // [data-settled] in app/globals.css.
  const [shellSettled, setShellSettled] = useState(false);
  const [flowKey, setFlowKey] = useState(0);
  const [showAddressHint, setShowAddressHint] = useState(false);
  const hintTimerRef = useRef<number | null>(null);
  const isDesktop = useIsDesktop();

  const expanded = Boolean(flow && isDesktop);

  function openFlow(nextPostcode: string, formatted: string | null) {
    const key = flowKey + 1;
    setFlowKey(key);
    setFlow({ key, postcode: nextPostcode, formatted });
    track("widget_opened");
  }

  useEffect(() => {
    initAnalytics(rooferId);
    flushPendingLead();
  }, [rooferId]);

  // Inline widget on desktop: open the flow immediately so it renders already
  // expanded at the address step (no collapsed search bar). Mobile is left
  // collapsed — its entry opens the fullscreen overlay on tap instead, so the
  // widget never takes over the host page on load. Re-checks on breakpoint
  // change; the `!flow` guard stops it re-opening.
  useEffect(() => {
    if (startExpanded && isDesktop && !flow) {
      openFlow("", null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startExpanded, isDesktop]);

  useEffect(() => {
    let previewTimer: number | null = null;
    try {
      if (new URLSearchParams(window.location.search).get("preview") === "estimate") {
        previewTimer = window.setTimeout(
          () =>
            openFlow(
              "GL5 4HA",
              "65 Gannicox Rd, Stroud GL5 4HA, UK",
            ),
          0,
        );
      }
    } catch {
      /* ignore */
    }
    return () => {
      if (previewTimer !== null) window.clearTimeout(previewTimer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!expanded) {
      setShellSettled(false);
      return;
    }
    setShellSettled(false);
    const timer = window.setTimeout(
      () => setShellSettled(true),
      Math.round(MOTION_DURATION.shell * 1000),
    );
    return () => window.clearTimeout(timer);
  }, [expanded, flow?.key]);

  useEffect(() => {
    return () => {
      if (hintTimerRef.current) window.clearTimeout(hintTimerRef.current);
    };
  }, []);

  function submitPostcode() {
    const tidy = looksLikeUkPostcode(postcode)
      ? prettyPostcode(postcode)
      : postcode.trim();
    if (looksLikeUkPostcode(tidy)) {
      if (tidy !== postcode) setPostcode(tidy);
      openFlow(tidy, null);
      return;
    }
    setShowAddressHint(true);
    if (hintTimerRef.current) window.clearTimeout(hintTimerRef.current);
    hintTimerRef.current = window.setTimeout(
      () => setShowAddressHint(false),
      2400,
    );
  }

  function closeFlow() {
    setFlow(null);
    track("widget_closed");
  }

  const flowContent = flow ? (
    <QuoteFlowInner
      key={flow.key}
      rooferId={rooferId}
      brandName={brandName}
      mapsEnabled={mapsEnabled}
      // Mobile uses the SAME fixed-viewport "card" layout as the desktop panel
      // (pinned header, pinned back + Continue, phone-sized type, own body
      // scroller) — just rendered full-screen. The old "page" (standalone web
      // page) layout was the source of the mobile flow's problems: oversized
      // type, Continue lost below the fold, back button adrift, ugly reflow off
      // the keyboard.
      variant="card"
      initialAddress={{
        postcode: flow.postcode,
        formatted: flow.formatted,
      }}
      onClose={closeFlow}
    />
  ) : null;

  return (
    <MotionConfig reducedMotion="user">
      <motion.div
        className="q"
        id="quoter-widget"
        data-stage={flow ? "flow" : "input"}
        data-settled={shellSettled ? "true" : "false"}
        data-suggesting="false"
        initial={false}
        animate={{
          height: expanded
            ? QUOTE_SIZES.expandedPanel
            : isDesktop
              ? QUOTE_SIZES.collapsedBar
              : QUOTE_SIZES.collapsedBarMobile,
        }}
        transition={SHELL_TRANSITION}
      >
        <AnimatePresence mode="sync" initial={false}>
          {expanded ? (
            <motion.div
              key={`flow-${flow!.key}`}
              className="q-flow-frame h-full overflow-hidden"
              initial={false}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={STEP_TRANSITION}
            >
              {flowContent}
            </motion.div>
          ) : (
            <motion.div
              key="search"
              className="q-panel"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={STEP_TRANSITION}
            >
              <div className="q-search relative">
                <svg
                  className="q-search-icon"
                  width="19"
                  height="19"
                  viewBox="0 0 24 24"
                  fill="none"
                  aria-hidden="true"
                >
                  <path
                    d="M12 21s7-5.5 7-11a7 7 0 1 0-14 0c0 5.5 7 11 7 11Z"
                    stroke="#6b7280"
                    strokeWidth="2"
                    strokeLinejoin="round"
                  />
                  <circle
                    cx="12"
                    cy="10"
                    r="2.5"
                    stroke="#6b7280"
                    strokeWidth="2"
                  />
                </svg>
                <AddressEntry
                  variant="bare"
                  postcode={postcode}
                  onPostcodeChange={(value) => {
                    setPostcode(value);
                    if (showAddressHint) setShowAddressHint(false);
                  }}
                  onSubmit={submitPostcode}
                />
                <button
                  type="button"
                  className="q-go"
                  onClick={submitPostcode}
                >
                  Get quote
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    aria-hidden="true"
                  >
                    <path
                      d="M5 12h14M13 6l6 6-6 6"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </button>
              </div>
              {showAddressHint && (
                <p className="q-hint" role="alert">
                  Enter a valid UK postcode to get a quote
                </p>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>

      {!isDesktop && typeof document !== "undefined"
        ? createPortal(
            <AnimatePresence>
              {flow ? (
                <motion.div
                  key={flow.key}
                  className="quote-surface fixed inset-0 z-[2147483000] flex flex-col overflow-hidden"
                  style={{
                    // Solid white — glass lets the host landing page bleed
                    // through the transparent iframe on real iOS Safari.
                    background: "#ffffff",
                    // The card layout owns its own scrolling (a pinned header +
                    // pinned footer around a flex-1 body scroller), so the sheet
                    // itself must NOT scroll — that keeps the header, back button
                    // and Continue fixed while only the body moves.
                    // Fill the visual viewport including notches once the host
                    // iframe is fullscreen.
                    paddingTop: "env(safe-area-inset-top, 0px)",
                    paddingBottom: "env(safe-area-inset-bottom, 0px)",
                  }}
                  // Pure fade, no scale-pop. The host needs a frame or two to
                  // resize the iframe to fullscreen; a fade keeps the overlay
                  // near-invisible during that window so the brief clip to the
                  // collapsed slot never shows, whereas a scaling box would.
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.26, ease: [0.16, 1, 0.3, 1] }}
                >
                  {/* Fills the padded sheet; the card shell inside is height:100%. */}
                  <div className="relative min-h-0 flex-1">{flowContent}</div>
                </motion.div>
              ) : null}
            </AnimatePresence>,
            document.body,
          )
        : null}
    </MotionConfig>
  );
}

export function QuoteBubble(props: QuoteBubbleProps) {
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? "";
  if (!apiKey) return <QuoteBubbleShell {...props} mapsEnabled={false} />;
  return (
    <APIProvider
      apiKey={apiKey}
      region="GB"
      language="en-GB"
      solutionChannel="quoter-bubble"
    >
      <QuoteBubbleShell {...props} mapsEnabled />
    </APIProvider>
  );
}
