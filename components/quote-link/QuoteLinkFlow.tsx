"use client";

import { useEffect, useState } from "react";

import { QuoteFlow } from "@/components/quote/QuoteFlow";
import { QUOTE_SIZES } from "@/lib/motion";
import type { QuoteConfig } from "@/lib/quote-config";

/**
 * Picks the flow's presentation from the viewport, which the page can't do —
 * it's a server component.
 *
 * This page is the QR-code and shared-link surface, so a phone is the common
 * case, not the edge one. It used to render `variant="card"` at a hard-coded
 * height of 544px on every device. On an SE-class phone that's taller than
 * what's left after the seal, prompt, sub-line and footer, and the page
 * container clips overflow — so the bottom of the flow, including its buttons,
 * was simply unreachable.
 *
 * Same rule QuoteBubble uses (components/bubble/QuoteBubble.tsx): card on
 * desktop, page on mobile. `page` is the variant built to own a whole screen
 * and scroll its own step body.
 */
function useIsDesktop(breakpoint = 640) {
  // Start false so the first paint on a phone is already the right shape;
  // desktop corrects itself in the effect before anything is interactive.
  const [desktop, setDesktop] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia(`(min-width: ${breakpoint}px)`);
    const update = () => setDesktop(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, [breakpoint]);
  return desktop;
}

export function QuoteLinkFlow({
  rooferId,
  brandName,
  quoteConfig,
}: {
  rooferId: string;
  brandName: string;
  quoteConfig: QuoteConfig | null;
}) {
  const desktop = useIsDesktop();

  return (
    <div
      className="q mx-auto w-full"
      data-stage="flow"
      style={
        desktop
          ? { height: QUOTE_SIZES.expandedPanel, maxWidth: 700 }
          : // Take the height that's actually left rather than asserting one.
            // min-height keeps short steps from collapsing; the flow's own
            // scroller handles anything taller.
            { minHeight: "26rem" }
      }
    >
      <QuoteFlow
        variant={desktop ? "card" : "page"}
        rooferId={rooferId}
        brandName={brandName}
        quoteConfig={quoteConfig}
      />
    </div>
  );
}
