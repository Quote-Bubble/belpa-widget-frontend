"use client";

import { useEffect, useRef } from "react";

import { QuoteBubble } from "@/components/bubble/QuoteBubble";
import { QUOTE_SIZES } from "@/lib/motion";
import type { QuoteConfig } from "@/lib/quote-config";

/**
 * The embeddable surface: renders only the QuoteBubble and reports its
 * discrete state to the parent frame over postMessage. The widget has just
 * two on-screen sizes (a fixed collapsed bar and a fixed expanded panel), so
 * the host never has to track per-pixel content changes - it snaps the iframe
 * to one of two known heights, and the transient suggestions dropdown floats
 * as an overlay. Nothing the widget does moves the host page's layout.
 *
 * Protocol — messages are { source: "quoter-embed", ... }:
 *   - mode:   "collapsed" | "suggesting" | "expanded" | "overlay"
 *   - height: the iframe height (px) for this mode
 *   - stage:  "input" | "flow" (mirrored for host-side selectors)
 *   - sizes:  { collapsed, expanded } posted on init so hosts need not
 *             copy QUOTE_SIZES constants
 *
 * Modes and how the host treats them:
 *   collapsed  — fixed bar height, laid out in flow (the reserved slot).
 *   suggesting — bar height for layout, but the iframe grows to fit the
 *                dropdown and floats OVER the page (no layout shift).
 *   expanded   — fixed panel height, floated as an overlay downward from the
 *                reserved slot (again, nothing around it moves).
 *   overlay    — mobile: the flow takes the whole viewport.
 *
 * This is the same mechanism a roofer's site will use to embed Belpa, so it
 * is the first real piece of the production embed, not landing-only glue.
 */
type EmbedMode = "collapsed" | "suggesting" | "expanded" | "overlay";

function resolveHostOrigin(): string | null {
  try {
    if (document.referrer) return new URL(document.referrer).origin;
  } catch {
    /* ignore */
  }
  return null;
}

export function EmbedFrame({
  rooferId,
  quoteConfig = null,
  brandName,
  startExpanded = false,
}: {
  rooferId: string;
  quoteConfig?: QuoteConfig | null;
  brandName?: string;
  startExpanded?: boolean;
}) {
  const hostRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Make the embed document itself transparent so the host page's
    // background (the blue blob) shows through around the card.
    document.documentElement.style.background = "transparent";
    document.body.style.background = "transparent";
    document.body.style.margin = "0";

    const hostOrigin = resolveHostOrigin();
    const desktopQuery = window.matchMedia("(min-width: 640px)");
    let lastKey = "";
    let postedSizes = false;
    let rafId = 0;
    const postSoonTimers = new Set<number>();

    // Only used by the "suggesting" overlay: the dropdown overflows below the
    // bar and, being in an iframe, would be clipped — report a height that
    // includes it so the host grows (and floats) the iframe to fit.
    const suggestionsBottom = () => {
      let bottom = hostRef.current?.getBoundingClientRect().bottom ?? 0;
      document
        .querySelectorAll<HTMLElement>(".q-suggestions, [role='listbox']")
        .forEach((el) => {
          const r = el.getBoundingClientRect();
          if (r.height > 0) bottom = Math.max(bottom, r.bottom);
        });
      return Math.ceil(bottom);
    };

    const suggestionsOpen = () => {
      const el = document.querySelector<HTMLElement>(
        ".q-suggestions, [role='listbox']",
      );
      return !!el && el.getBoundingClientRect().height > 0;
    };

    const post = () => {
      if (!hostOrigin) return;
      const widget = document.getElementById("quoter-widget");
      const stage = widget?.getAttribute("data-stage") ?? "input";

      let mode: EmbedMode;
      let height: number;
      if (stage === "flow") {
        if (desktopQuery.matches) {
          mode = "expanded";
          height = QUOTE_SIZES.expanded;
        } else {
          mode = "overlay";
          height = Math.ceil(window.innerHeight);
        }
      } else if (suggestionsOpen()) {
        mode = "suggesting";
        height = suggestionsBottom();
      } else {
        mode = "collapsed";
        height = desktopQuery.matches
          ? QUOTE_SIZES.collapsed
          : QUOTE_SIZES.collapsedMobile;
      }

      // De-dupe identical frames so we don't spam the parent.
      const key = `${mode}|${height}|${stage}|${postedSizes}`;
      if (key === lastKey) return;
      lastKey = key;

      const payload: Record<string, unknown> = {
        source: "quoter-embed",
        mode,
        height,
        stage,
      };
      if (!postedSizes) {
        postedSizes = true;
        payload.sizes = {
          collapsed: desktopQuery.matches
            ? QUOTE_SIZES.collapsed
            : QUOTE_SIZES.collapsedMobile,
          expanded: QUOTE_SIZES.expanded,
        };
      }

      window.parent?.postMessage(payload, hostOrigin);
    };

    const schedulePost = () => {
      if (rafId) return;
      rafId = window.requestAnimationFrame(() => {
        rafId = 0;
        post();
      });
    };

    const clearPostSoonTimers = () => {
      for (const id of postSoonTimers) window.clearTimeout(id);
      postSoonTimers.clear();
    };

    // data-stage flips (collapsed <-> expanded / overlay).
    const widget = document.getElementById("quoter-widget");
    const stageMo = new MutationObserver(schedulePost);
    if (widget) {
      stageMo.observe(widget, {
        attributes: true,
        attributeFilter: ["data-stage"],
      });
    }

    // Host asks us to focus the search input (its own [data-try] buttons
    // can't reach across the frame boundary).
    const onHostMessage = (e: MessageEvent) => {
      if (!hostOrigin || e.origin !== hostOrigin) return;
      const d = e.data;
      if (!d || d.source !== "quoter-host") return;
      if (typeof d.action !== "string") return;
      if (d.action === "focus") {
        const input = document
          .getElementById("quoter-widget")
          ?.querySelector<HTMLInputElement>("input");
        input?.focus();
      }
    };
    window.addEventListener("message", onHostMessage);

    // The suggestions dropdown mounts/animates outside the widget subtree, so
    // re-check on typing and focus changes, then once more after the
    // dropdown's enter/exit animation settles.
    const postSoon = () => {
      schedulePost();
      const t1 = window.setTimeout(schedulePost, 60);
      const t2 = window.setTimeout(schedulePost, 240);
      postSoonTimers.add(t1);
      postSoonTimers.add(t2);
      window.setTimeout(() => {
        postSoonTimers.delete(t1);
        postSoonTimers.delete(t2);
      }, 250);
    };
    const onFocusOut = () => {
      const id = window.setTimeout(schedulePost, 120);
      postSoonTimers.add(id);
      window.setTimeout(() => postSoonTimers.delete(id), 130);
    };

    const resizeObserver =
      typeof ResizeObserver !== "undefined"
        ? new ResizeObserver(schedulePost)
        : null;
    if (widget && resizeObserver) resizeObserver.observe(widget);
    // Also watch the host root — suggestions may extend past the widget.
    if (hostRef.current && resizeObserver) {
      resizeObserver.observe(hostRef.current);
    }

    document.addEventListener("input", postSoon, true);
    document.addEventListener("focusin", postSoon, true);
    document.addEventListener("focusout", onFocusOut, true);

    const onBreakpointChange = () => {
      // Re-announce sizes when crossing the mobile breakpoint.
      postedSizes = false;
      lastKey = "";
      schedulePost();
    };
    desktopQuery.addEventListener("change", onBreakpointChange);
    // A couple of delayed posts catch late layout (fonts, first paint).
    const t1 = window.setTimeout(schedulePost, 60);
    const t2 = window.setTimeout(schedulePost, 400);
    postSoonTimers.add(t1);
    postSoonTimers.add(t2);
    schedulePost();

    return () => {
      stageMo.disconnect();
      resizeObserver?.disconnect();
      document.removeEventListener("input", postSoon, true);
      document.removeEventListener("focusin", postSoon, true);
      document.removeEventListener("focusout", onFocusOut, true);
      window.removeEventListener("message", onHostMessage);
      desktopQuery.removeEventListener("change", onBreakpointChange);
      if (rafId) window.cancelAnimationFrame(rafId);
      clearPostSoonTimers();
    };
  }, []);

  return (
    <div ref={hostRef} className="quoter-bubble-host mx-auto w-full text-left">
      <QuoteBubble
        rooferId={rooferId}
        brandName={brandName}
        quoteConfig={quoteConfig}
        startExpanded={startExpanded}
      />
    </div>
  );
}
