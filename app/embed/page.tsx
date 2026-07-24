import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { EmbedFrame } from "@/components/embed/EmbedFrame";

export const metadata: Metadata = {
  title: "Quoter",
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
 * Chromeless embed target. Renders only the quote bubble on a transparent
 * background. Host pages iframe this and resize it via the postMessage
 * protocol in EmbedFrame. The `roofer` query param attributes leads; it
 * defaults to the landing-page demo instance.
 */
export default async function EmbedPage({
  searchParams,
}: {
  searchParams: Promise<{ roofer?: string }>;
}) {
  const { roofer } = await searchParams;
  const rooferId = roofer ?? "quoter-landing-demo";
  if (!isValidRooferId(rooferId)) notFound();

  return (
    <div
      style={{
        minHeight: "100dvh",
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "center",
        // Horizontal room so the card's drop shadow isn't clipped at the
        // iframe's left/right edges (the vertical room comes from the iframe
        // height reserving space below the card).
        padding: "0 22px",
        background: "transparent",
      }}
    >
      <EmbedFrame rooferId={rooferId} />
    </div>
  );
}
