import type { Metadata } from "next";

import { QuoteLinkShell } from "@/components/quote-link/QuoteLinkShell";
import { QuoteFlow } from "@/components/quote/QuoteFlow";
import { fetchRooferConfig } from "@/lib/roofer-config";

/**
 * Hosted Quote Link — a roofer's own branded, standalone quote page at
 * `/l/[roofer]`. Loads per-roofer quote config for unique pricing.
 */

export async function generateMetadata({
  params,
  searchParams,
}: {
  params: Promise<{ roofer: string }>;
  searchParams: Promise<{ host?: string }>;
}): Promise<Metadata> {
  const { roofer: slug } = await params;
  const { host } = await searchParams;
  const roofer = await fetchRooferConfig(slug, undefined, host);
  const name =
    roofer?.slug === "quoter-landing-demo"
      ? "Ridgeway Roofing"
      : (roofer?.name ?? "Belpa");
  return {
    title: `Free roof quote — ${name}`,
    description: `Get a free roof quote from ${name}. Takes a couple of minutes.`,
    robots: { index: false, follow: false },
  };
}

export default async function RooferQuotePage({
  params,
  searchParams,
}: {
  params: Promise<{ roofer: string }>;
  searchParams: Promise<{ host?: string }>;
}) {
  const { roofer: slug } = await params;
  const { host } = await searchParams;
  const roofer = await fetchRooferConfig(slug, undefined, host);

  if (!roofer) {
    return (
      <QuoteLinkShell
        title="This link isn’t active"
        subtitle="It may be mistyped, or this roofer isn’t set up on Belpa yet."
        footer={false}
      >
        <div className="quote-link__empty" />
      </QuoteLinkShell>
    );
  }

  const displayName =
    roofer.slug === "quoter-landing-demo" ? "Ridgeway Roofing" : roofer.name;

  return (
    <QuoteLinkShell
      title={displayName}
      prompt="Answer the questions below for an estimate"
    >
      <div
        className="q mx-auto"
        data-stage="flow"
        style={{ height: 544, maxWidth: 700 }}
      >
        <QuoteFlow
          variant="card"
          rooferId={roofer.slug}
          brandName={displayName}
          quoteConfig={roofer.config}
        />
      </div>
    </QuoteLinkShell>
  );
}
