import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { EmbedFrame } from "@/components/embed/EmbedFrame";
import { fetchRooferConfig } from "@/lib/roofer-config";

export const metadata: Metadata = {
  title: "Belpa",
  // The embed is meant to be framed, never indexed on its own.
  robots: { index: false, follow: false },
};

/** Roofer slug: 1–64 chars of lowercase letters, digits, hyphens. */
const ROOFER_SLUG = /^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/;

function isValidRooferId(value: string | undefined): value is string {
  if (!value) return false;
  if (value.length > 64) return false;
  return ROOFER_SLUG.test(value);
}

/**
 * LANDING-ONLY. Chromeless embed for the collapsed search-bar bubble. Loads
 * the roofer's quote config by slug so each bubble is unique (services + rates).
 * Roofer sites use /w/[slug] (inline) or /l/[slug] (fullscreen) instead.
 */
export default async function EmbedPage({
  searchParams,
}: {
  searchParams: Promise<{ roofer?: string }>;
}) {
  const { roofer } = await searchParams;
  const rooferId = roofer ?? "quoter-landing-demo";
  if (!isValidRooferId(rooferId)) notFound();

  const loaded = await fetchRooferConfig(rooferId);

  return (
    <div className="quoter-embed-page">
      <EmbedFrame
        rooferId={loaded?.slug ?? rooferId}
        brandName={loaded?.name}
        quoteConfig={loaded?.config ?? null}
      />
    </div>
  );
}
