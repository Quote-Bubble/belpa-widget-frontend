import type { Metadata } from "next";
import Link from "next/link";

import { QuoteFlow } from "@/components/quote/QuoteFlow";
import { apiUrl } from "@/lib/api";

/**
 * Hosted Quote Link — a roofer's own branded, standalone quote page at
 * `/l/[roofer]`. Calendly-style: no marketing, the quote card IS the page,
 * open from the first step. A roofer drops this link in their bio / Google
 * profile / a QR code; the person clicking is already a warm lead, so we skip
 * straight into the quote. Leads route to the roofer via the slug.
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

/** First letters of the first two words — the avatar mark (no logo yet). */
function initials(name: string): string {
  const letters = name
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase() ?? "");
  return letters.join("") || "Q";
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ roofer: string }>;
}): Promise<Metadata> {
  const { roofer: slug } = await params;
  const roofer = await getRoofer(slug);
  const name = roofer?.name ?? "Quoter";
  return {
    title: `Free instant roof quote — ${name}`,
    description: `Get a free, instant roof estimate from ${name}. Measured from satellite imagery — no ladders, no waiting.`,
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
      <main className="quote-surface grid min-h-dvh place-items-center bg-[#f4f6fb] px-6 text-center">
        <div>
          <p className="font-[family-name:var(--font-poppins)] text-2xl font-semibold text-ink">
            This quote link isn&apos;t active
          </p>
          <p className="mx-auto mt-3 max-w-sm text-[15px] text-muted">
            The link may be mistyped, or this roofer isn&apos;t set up on Quoter
            yet.
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="quote-surface relative min-h-dvh overflow-hidden bg-[#f4f6fb]">
      {/* Calm on-brand backdrop — soft blurred glows, not a marketing blob. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(58% 42% at 50% 22%, rgba(47,107,255,0.12), transparent 72%)",
        }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(46% 40% at 84% 82%, rgba(122,168,255,0.10), transparent 72%)",
        }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(40% 34% at 12% 78%, rgba(160,140,255,0.06), transparent 72%)",
        }}
      />

      <div className="relative z-10 mx-auto flex min-h-dvh w-full max-w-[720px] flex-col items-center px-5 py-8 sm:py-12">
        {/* Roofer identity — the whole branding (Calendly-style). */}
        <div className="flex flex-col items-center text-center">
          <span className="grid size-14 place-items-center rounded-full bg-gradient-to-b from-brand-500 to-brand-600 text-[17px] font-bold tracking-tight text-white shadow-[0_8px_20px_-6px_rgba(31,87,240,0.5)]">
            {initials(roofer.name)}
          </span>
          <h1 className="mt-3.5 font-[family-name:var(--font-poppins)] text-[22px] font-semibold leading-tight tracking-tight text-ink">
            {roofer.name}
          </h1>
          <p className="mt-1 text-[13.5px] font-medium text-muted">
            Free instant roof quote · measured from satellite
          </p>
        </div>

        {/* The expanded quote card, open at step one. */}
        <div className="mt-7 w-full sm:mt-8">
          <div
            className="q mx-auto"
            data-stage="flow"
            style={{ height: 544, maxWidth: 700 }}
          >
            <QuoteFlow
              variant="card"
              rooferId={roofer.slug}
              brandName={roofer.name}
            />
          </div>
        </div>

        <p className="mt-6 text-[12px] text-muted">
          <Link
            href="https://quoter-web-six.vercel.app"
            className="font-semibold text-brand-600 transition-opacity hover:opacity-80"
          >
            Powered by Quoter
          </Link>{" "}
          · Free · No obligation
        </p>
      </div>
    </main>
  );
}
