import type { Metadata } from "next";

import { EmbedFrame } from "@/components/embed/EmbedFrame";
import { apiUrl } from "@/lib/api";

export const metadata: Metadata = {
  title: "Quoter",
  // Embedded on host pages; never indexed on its own.
  robots: { index: false, follow: false },
};

/** Roofer slug: 1–64 chars of lowercase letters, digits, hyphens. */
const ROOFER_SLUG = /^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/;

type RooferInfo = { slug: string; name: string };

async function getRoofer(slug: string): Promise<RooferInfo | null> {
  if (!ROOFER_SLUG.test(slug)) return null;
  try {
    const res = await fetch(
      apiUrl(`/api/roofer?slug=${encodeURIComponent(slug)}`),
      { next: { revalidate: 3600 } },
    );
    if (!res.ok) return null;
    const body = (await res.json()) as { roofer?: RooferInfo };
    return body.roofer ?? null;
  } catch {
    return null;
  }
}

/**
 * Inline roofer widget — one of the two roofer flows (the other is the
 * fullscreen /l/[slug]). Dropped onto a roofer's site by public/widget.js.
 *
 * Reuses the shared EmbedFrame with startExpanded, so DESKTOP opens already
 * expanded at the address step (no collapsed search bar), while MOBILE keeps
 * the landing's optimised behaviour: a compact entry that opens the flow
 * fullscreen and never hijacks the host page on load. Transparent so it blends
 * into the host page.
 */
export default async function WidgetPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const roofer = await getRoofer(slug);

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
      <EmbedFrame rooferId={roofer.slug} brandName={displayName} startExpanded />
    </div>
  );
}
