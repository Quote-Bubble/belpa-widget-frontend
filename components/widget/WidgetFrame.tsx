"use client";

import { useEffect, useRef } from "react";

import { QuoteFlow } from "@/components/quote/QuoteFlow";
import { QUOTE_SIZES } from "@/lib/motion";

/**
 * Inline roofer widget surface. Renders the quote flow ALREADY EXPANDED — it
 * opens at the address step (postcode + first line), with no collapsed search
 * bar in front of it. Reports its single fixed height to the host page so
 * public/widget.js can size the iframe.
 *
 * This is the clean successor to the collapsed EmbedFrame/QuoteBubble, which is
 * now landing-only. One height, no collapse/expand/suggest states.
 *
 * Protocol — { source: "quoter-widget", height } — the host sets the iframe to
 * `height` (px).
 */
export function WidgetFrame({
  rooferId,
  brandName,
}: {
  rooferId: string;
  brandName: string;
}) {
  const hostRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Transparent document so the host page shows through around the card.
    document.documentElement.style.background = "transparent";
    document.body.style.background = "transparent";
    document.body.style.margin = "0";

    let hostOrigin: string | null = null;
    try {
      if (document.referrer) hostOrigin = new URL(document.referrer).origin;
    } catch {
      hostOrigin = null;
    }
    if (!hostOrigin) return;
    const origin = hostOrigin;

    let last = 0;
    const post = () => {
      const height = QUOTE_SIZES.expanded;
      if (height === last) return;
      last = height;
      window.parent?.postMessage({ source: "quoter-widget", height }, origin);
    };
    post();
    // Re-announce once layout (fonts, first paint) settles, in case the first
    // post raced the parent attaching its listener.
    const t1 = window.setTimeout(post, 60);
    const t2 = window.setTimeout(post, 400);
    return () => {
      window.clearTimeout(t1);
      window.clearTimeout(t2);
    };
  }, []);

  return (
    <div ref={hostRef} className="quoter-bubble-host mx-auto w-full text-left">
      <div
        className="q mx-auto"
        data-stage="flow"
        style={{ height: QUOTE_SIZES.expandedPanel, maxWidth: 700 }}
      >
        <QuoteFlow variant="card" rooferId={rooferId} brandName={brandName} />
      </div>
    </div>
  );
}
