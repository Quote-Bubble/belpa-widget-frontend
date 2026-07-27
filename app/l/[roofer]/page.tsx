import type { Metadata } from "next";

import { QuoteLinkShell } from "@/components/quote-link/QuoteLinkShell";
import { QuoteFlow } from "@/components/quote/QuoteFlow";
import { apiUrl } from "@/lib/api";

/**
 * Hosted Quote Link — a roofer's own branded, standalone quote page at
 * `/l/[roofer]`. Calendly-style: the quote card is the page, open from the
 * first step. Shell chrome (sky, identity, footer) is separate from the widget.
 */

type RooferInfo = { slug: string; name: string };

async function getRoofer(slug: string): Promise<RooferInfo | null> {
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

export async function generateMetadata({
  params,
}: {
  params: Promise<{ roofer: string }>;
}): Promise<Metadata> {
  const { roofer: slug } = await params;
  const roofer = await getRoofer(slug);
  const name =
    roofer?.slug === "quoter-landing-demo"
      ? "Ridgeway Roofing"
      : (roofer?.name ?? "Quoter");
  return {
    title: `Free roof quote — ${name}`,
    description: `Get a free roof quote from ${name}. Takes a couple of minutes.`,
    robots: { index: false, follow: false },
  };
}

export default async function RooferQuotePage({
  params,
}: {
  params: Promise<{ roofer: string }>;
}) {
  const { roofer: slug } = await params;
  const roofer = await getRoofer(slug);

  if (!roofer) {
    return (
      <QuoteLinkShell
        title="This link isn’t active"
        subtitle="It may be mistyped, or this roofer isn’t set up on Quoter yet."
        footer={false}
      >
        <div className="quote-link__empty" />
      </QuoteLinkShell>
    );
  }

  const displayName =
    roofer.slug === "quoter-landing-demo" ? "Ridgeway Roofing" : roofer.name;

  return (
    <QuoteLinkShell title={displayName}>
      {/* Expanded quote card, open at step one — widget chrome unchanged. */}
      <div
        className="q mx-auto"
        data-stage="flow"
        style={{ height: 544, maxWidth: 700 }}
      >
        <QuoteFlow
          variant="card"
          rooferId={roofer.slug}
          brandName={displayName}
        />
      </div>
    </QuoteLinkShell>
  );
}
