import type { Metadata } from "next";
import Link from "next/link";

import { QuoteBubble } from "@/components/bubble/QuoteBubble";
import { apiUrl } from "@/lib/api";

/**
 * Hosted Quote Link — a roofer's own branded, standalone quote page at
 * `/l/[roofer]`. A roofer drops this link in their Instagram bio, Google
 * profile, email signature or a QR code; homeowners get an instant estimate
 * and the lead routes to that roofer via the slug. No website needed.
 */

type RooferInfo = { slug: string; name: string };

async function getRoofer(slug: string): Promise<RooferInfo | null> {
  try {
    const res = await fetch(
      apiUrl(`/api/roofer?slug=${encodeURIComponent(slug)}`),
      // The name changes rarely, so cache the lookup for an hour rather than
      // hit the backend on every page view.
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
  const name = roofer?.name ?? "Quoter";
  return {
    title: `Free instant roof quote — ${name}`,
    description: `Enter your postcode for a free, instant roof estimate from ${name}. Measured from satellite imagery — no ladders, no waiting.`,
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
      <main className="quote-surface grid min-h-dvh place-items-center bg-white px-6 text-center">
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
    <main className="quote-surface relative min-h-dvh overflow-x-hidden bg-white">
      {/* Soft brand glow behind the hero (gradient-only, no image asset). */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-[-160px] h-[900px] [mask-image:linear-gradient(to_bottom,#000_52%,transparent_86%)] [-webkit-mask-image:linear-gradient(to_bottom,#000_52%,transparent_86%)]"
        style={{
          background:
            "radial-gradient(closest-side, rgba(47,107,255,0.22), rgba(122,168,255,0.11) 55%, transparent 78%)",
          filter: "blur(16px)",
        }}
      />

      {/* The roofer's name is the brand on their own page. */}
      <nav className="relative z-10 mx-auto flex max-w-4xl items-center justify-center px-5 py-6 sm:justify-start sm:px-6">
        <span className="font-[family-name:var(--font-poppins)] text-[20px] font-semibold tracking-tight text-ink">
          {roofer.name}
        </span>
      </nav>

      <section className="relative flex min-h-[calc(100dvh-72px)] flex-col">
        <div className="relative z-10 mx-auto flex w-full max-w-3xl flex-1 flex-col items-center justify-center px-5 pb-[clamp(1.5rem,5svh,3rem)] pt-[clamp(0.5rem,3svh,2rem)] text-center sm:px-6">
          <p className="inline-flex items-center gap-2 rounded-full border border-line bg-white px-4 py-1.5 text-[12px] font-semibold uppercase tracking-[0.12em] text-brand-600 shadow-sm">
            <span className="size-1.5 rounded-full bg-brand-500" />
            Instant roof quotes
          </p>

          <h1 className="mx-auto mt-[clamp(1.1rem,2.6svh,1.6rem)] max-w-2xl text-balance font-[family-name:var(--font-poppins)] text-[clamp(2rem,min(5vw,6svh),3.6rem)] font-light leading-[1.06] tracking-tight text-ink">
            Get a free, instant quote for your roof
          </h1>

          <p className="mx-auto mt-[clamp(0.9rem,2svh,1.35rem)] max-w-lg text-[clamp(15px,1.35vw,17px)] leading-relaxed text-muted">
            Enter your postcode and {roofer.name} will send you a price range in
            minutes — measured from satellite imagery. No ladders, no
            appointments.
          </p>

          <div className="quoter-bubble-host mx-auto mt-[clamp(1.5rem,3.8svh,2.5rem)] w-full text-left">
            <QuoteBubble rooferId={roofer.slug} brandName={roofer.name} />
          </div>

          <p className="mt-[clamp(1.5rem,4svh,2.5rem)] text-[12px] text-muted">
            <Link
              href="https://quoter-web-six.vercel.app"
              className="font-semibold text-brand-600 transition-opacity hover:opacity-80"
            >
              Powered by Quoter
            </Link>{" "}
            · Free · No obligation
          </p>
        </div>
      </section>
    </main>
  );
}
