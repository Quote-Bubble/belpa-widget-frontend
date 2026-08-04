import type { Metadata } from "next";

import { EmbedFrame } from "@/components/embed/EmbedFrame";
import { fetchRooferConfig } from "@/lib/roofer-config";

export const metadata: Metadata = {
  title: "Belpa",
  // Embedded on host pages; never indexed on its own.
  robots: { index: false, follow: false },
};

/** Roofer slug: 1–64 chars of lowercase letters, digits, hyphens. */
const ROOFER_SLUG = /^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/;

/**
 * Inline roofer widget — one of the two roofer flows (the other is the
 * fullscreen /l/[slug]). Dropped onto a roofer's site by public/widget.js.
 *
 * Reuses the shared EmbedFrame with startExpanded, so DESKTOP opens already
 * expanded at the address step (no collapsed search bar), while MOBILE keeps
 * the landing's optimised behaviour: a compact entry that opens the flow
 * fullscreen and never hijacks the host page on load. Transparent so it blends
 * into the host page. Loads per-roofer quote config for unique pricing.
 */
export default async function WidgetPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ host?: string }>;
}) {
  const { slug } = await params;
  const { host } = await searchParams;
  if (!ROOFER_SLUG.test(slug)) {
    return (
      <div
        className="quoter-embed-page"
        style={{ alignItems: "center", color: "#5a6678", fontSize: 14 }}
      >
        This quote widget isn’t active yet.
      </div>
    );
  }

  const roofer = await fetchRooferConfig(slug, undefined, host);

  if (!roofer) {
    return (
      <div
        className="quoter-embed-page"
        style={{ alignItems: "center", color: "#5a6678", fontSize: 14 }}
      >
        This quote widget isn’t active yet.
      </div>
    );
  }

  const displayName =
    roofer.slug === "quoter-landing-demo" ? "Ridgeway Roofing" : roofer.name;

  return (
    <div className="quoter-embed-page">
      <EmbedFrame
        rooferId={roofer.slug}
        brandName={displayName}
        quoteConfig={roofer.config}
        startExpanded
      />
    </div>
  );
}
