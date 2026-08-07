"use client";

import { QuoteBubble } from "@/components/bubble/QuoteBubble";
import type { QuoteConfig } from "@/lib/quote-config";

/**
 * The Quote Link's flow — the same QuoteBubble the other two install variants
 * use, rather than a QuoteFlow wired up by hand.
 *
 * Why that matters on a phone: QuoteBubble portals its mobile flow to
 * document.body as `fixed inset-0`, so tapping the postcode field takes over
 * the whole screen. The iframe resizing that widget.js and launch.js do isn't
 * what creates that — it only stops the iframe clipping it. Here there is no
 * iframe, so the same component goes fullscreen on its own.
 *
 * That makes all three installs behave identically on mobile: a compact field,
 * tap, fullscreen. It also deletes the special case this file used to be — it
 * rendered QuoteFlow directly at a hard-coded 544px, which is the bug that made
 * this page unusable on the device it's scanned from.
 *
 * startExpanded is desktop-only inside QuoteBubble, which is exactly the split
 * wanted: the card opens straight into the flow on a big screen, phones get the
 * field first so the fullscreen step is a deliberate tap.
 */
export function QuoteLinkFlow({
  rooferId,
  brandName,
  quoteConfig,
}: {
  rooferId: string;
  brandName: string;
  quoteConfig: QuoteConfig | null;
}) {
  return (
    <div className="mx-auto w-full" style={{ maxWidth: 700 }}>
      <QuoteBubble
        rooferId={rooferId}
        brandName={brandName}
        quoteConfig={quoteConfig}
        startExpanded
      />
    </div>
  );
}
