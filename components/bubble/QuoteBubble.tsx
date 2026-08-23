"use client";

import { ArrowRight, MapPin } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import dynamic from "next/dynamic";
import { AnimatePresence, MotionConfig, motion } from "motion/react";

import { AddressEntry } from "@/components/quote/AddressEntry";

import {
  MOTION_DURATION,
  QUOTE_SIZES,
  SHELL_TRANSITION,
  STEP_TRANSITION,
} from "@/lib/motion";
import { initAnalytics, track } from "@/lib/analytics";
import { flushPendingLead } from "@/lib/pending-lead";
import {
  looksLikeUkPostcode,
  postcodeError,
  prettyPostcode,
} from "@/lib/postcode";
import type { QuoteConfig } from "@/lib/quote-config";

/**
 * The flow loads on demand.
 *
 * Importing it directly put the whole quote journey — QuoteFlow, DrawRoofStep,
 * EstimateStep and the motion library behind them — into the embed's first
 * load, about 210KB on top of React's 435KB, for a widget whose opening state
 * is one text input and a button. Every visitor paid to parse the drawing step
 * whether or not they ever typed a postcode.
 *
 * That is not only the embed's problem. The landing runs this in an iframe in
 * its hero, so the cost lands on the main thread while somebody is scrolling
 * the page it sits on, which is the likeliest source of the heavy scrolling two
 * testers reported.
 *
 * It loads QuoteFlow, not QuoteFlowInner, deliberately. QuoteFlow brings
 * its own APIProvider, which used to be mounted out here around the collapsed
 * bar — meaning every embed impression fetched and executed the Google Maps JS
 * API before anyone had typed a character. That is main-thread work and a
 * billable Maps load for visitors who never open the flow. Inside the lazy
 * chunk it happens when a map is actually about to be shown.
 *
 * ssr:false because the flow is already client-only (maps, window measurement),
 * so there was never server output to lose.
 */
const LazyQuoteFlow = dynamic(
  () => import("@/components/quote/QuoteFlow").then((m) => m.QuoteFlow),
  { ssr: false },
);

/** Warm the chunk before it is needed — see prefetchFlow below. */
function preloadFlow() {
  void import("@/components/quote/QuoteFlow");
}

type QuoteBubbleProps = {
  rooferId?: string;
  brandName?: string;
  quoteConfig?: QuoteConfig | null;
  /**
   * Open straight into the expanded flow on DESKTOP (skip the collapsed search
   * bar) — used by the inline roofer widget (/w). Ignored on mobile, which
   * keeps the compact entry → fullscreen-overlay behaviour.
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
  brandName = "Belpa",
  quoteConfig = null,
  startExpanded = false,
}: QuoteBubbleProps) {
  // /w opens already expanded, so kick the flow chunk now — waiting for the
  // startExpanded effect to mount LazyQuoteFlow serialises hydration and the
  // 210KB download, which is the pause after a launch.js click.
  if (startExpanded) preloadFlow();

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

  useEffect(() => {
    if (startExpanded && isDesktop && !flow) {
      openFlow("", null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startExpanded, isDesktop]);

  useEffect(() => {
    let previewTimer: number | null = null;
    try {
      if (
        new URLSearchParams(window.location.search).get("preview") ===
        "estimate"
      ) {
        previewTimer = window.setTimeout(
          () => openFlow("GL5 4HA", "65 Gannicox Rd, Stroud GL5 4HA, UK"),
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

  /*
   * Lock the page behind the mobile overlay.
   *
   * The overlay is `fixed inset-0`, so whatever is behind it must not scroll.
   * Until now that was left to the host — widget.js pins body, launch.js and
   * the landing set overflow: hidden — which works when we're in an iframe
   * because the host owns the scrolling document.
   *
   * The hosted Quote Link has no host: this component IS the page. Without
   * this, the branded shell scrolled around underneath the fullscreen flow.
   * Locking the document the overlay actually lives in is correct in both
   * cases; inside an iframe it just locks a document that is already
   * fullscreen, which costs nothing.
   */
  useEffect(() => {
    if (isDesktop || !flow) return;
    const el = document.documentElement;
    const prevOverflow = el.style.overflow;
    const prevOverscroll = el.style.overscrollBehavior;
    el.style.overflow = "hidden";
    el.style.overscrollBehavior = "none";
    return () => {
      el.style.overflow = prevOverflow;
      el.style.overscrollBehavior = prevOverscroll;
    };
  }, [isDesktop, flow]);

  // A host can ask us to dismiss the flow (EmbedFrame relays `action: "close"`
  // as this event). Used by the landing, whose desktop modal draws its own
  // close control outside this document and so can't reach closeFlow directly.
  useEffect(() => {
    const onHostClose = () => {
      setFlow(null);
      track("widget_closed");
    };
    window.addEventListener("belpa:close-flow", onHostClose);
    return () => window.removeEventListener("belpa:close-flow", onHostClose);
  }, []);

  const flowContent = flow ? (
    <LazyQuoteFlow
      key={flow.key}
      rooferId={rooferId}
      brandName={brandName}
      quoteConfig={quoteConfig}
      variant={isDesktop ? "card" : "page"}
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
        id="belpa-widget"
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
              {/* Warm the flow chunk at the first sign of intent, so the saving
                  lands on what an idle visitor downloads rather than on how long
                  an interested one waits. By the time a postcode has been typed
                  the fetch has had seconds to finish. */}
              <div
                className="q-search relative"
                onPointerEnter={preloadFlow}
                onFocusCapture={preloadFlow}
              >
                <MapPin
                  size={16}
                  strokeWidth={2}
                  className="q-search-icon"
                  aria-hidden="true"
                />
                <AddressEntry
                  variant="bare"
                  postcode={postcode}
                  onPostcodeChange={(value) => {
                    setPostcode(value);
                    if (showAddressHint) setShowAddressHint(false);
                  }}
                  onSubmit={submitPostcode}
                />
                <button type="button" className="q-go" onClick={submitPostcode}>
                  Get quote
                  <ArrowRight size={16} strokeWidth={2} aria-hidden="true" />
                </button>
              </div>
              {showAddressHint && (
                <p className="q-hint" role="alert">
                  {postcodeError(postcode) ?? "Enter your postcode"}
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
                  className="quote-surface fixed inset-0 z-[2147483000] overflow-hidden overscroll-none"
                  style={{
                    // Solid white — glass lets the host landing page bleed
                    // through the transparent iframe on real iOS Safari.
                    background: "#ffffff",
                    // Fill the visual viewport including notches once the
                    // host iframe is fullscreen.
                    paddingTop: "env(safe-area-inset-top, 0px)",
                    paddingBottom: "env(safe-area-inset-bottom, 0px)",
                  }}
                  initial={{ opacity: 0, scale: 0.985 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.985 }}
                  transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
                >
                  {flowContent}
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
  // No APIProvider here on purpose — see the note on LazyQuoteFlow above. The
  // flow mounts its own once it loads, so the collapsed bar costs no Maps.
  return <QuoteBubbleShell {...props} />;
}
