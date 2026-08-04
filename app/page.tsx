import type { Metadata } from "next";
import Link from "next/link";

import { QuoteBubble } from "@/components/bubble/QuoteBubble";

export const metadata: Metadata = {
  title: "Belpa — instant roof quotes from satellite",
  description:
    "Development host for the Belpa bubble: the embeddable instant-quote widget for roofing websites.",
};

/* Dev-time stand-in for the real landing page (belpa-web). Hosts the bubble
   the same way the production hero will, so the flow is exercised in situ.
   Hero spacing/position mirrors belpa-web's Hero.astro + global.css — kept
   in sync by hand since this repo and belpa-web don't share a package. */
export default function Home() {
  return (
    <main className="quote-surface relative min-h-dvh overflow-x-hidden bg-white">
      {/* Blob wallpaper behind the hero core — same bleed/mask geometry as
          belpa-web's .site-bg, built from gradients only (no image asset)
          so this dev host stays a single lightweight page. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-[-160px] h-[900px] [mask-image:linear-gradient(to_bottom,#000_52%,transparent_86%)] [-webkit-mask-image:linear-gradient(to_bottom,#000_52%,transparent_86%)]"
        style={{
          background:
            "radial-gradient(closest-side, rgba(47,107,255,0.22), rgba(122,168,255,0.11) 55%, transparent 78%)",
          filter: "blur(16px)",
        }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.035] [background-image:radial-gradient(rgba(12,20,55,1)_1px,transparent_1.4px)] [background-size:22px_22px]"
      />

      <nav className="relative z-10 mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-[clamp(0.5rem,2.5svh,1rem)] sm:px-6 sm:py-[clamp(0.5rem,2.5svh,1.25rem)]">
        <span className="font-[family-name:var(--font-poppins)] text-[19px] font-semibold tracking-tight text-ink">
          Belpa
        </span>
        <div className="flex items-center gap-5 text-[13.5px] font-medium text-ink-soft">
          <Link href="/quote" className="transition-colors hover:text-ink">
            Full-page flow
          </Link>
          <Link
            href="/dev"
            className="rounded-full border border-line bg-white px-4 py-2 font-semibold text-ink-soft shadow-sm transition-colors hover:border-brand-300 hover:text-brand-600"
          >
            Dev workbench
          </Link>
        </div>
      </nav>

      {/* One-viewport hero: headline → search stays composed in the first
          screen, spacing/sizing driven by clamp() the same way belpa-web's
          .hero-stage / .hero-title / .hero-sub / .hero-widget are. */}
      <section className="relative flex min-h-[100svh] flex-col">
        <div className="relative z-10 mx-auto flex w-full max-w-6xl flex-1 flex-col items-center justify-center px-5 pb-[clamp(1rem,4svh,2.75rem)] pt-[clamp(1.25rem,7svh,5.75rem)] text-center sm:px-6">
          <p className="inline-flex items-center gap-2 rounded-full border border-line bg-white px-4 py-1.5 text-[12px] font-semibold uppercase tracking-[0.12em] text-brand-600 shadow-sm">
            <span className="size-1.5 rounded-full bg-brand-500" />
            Instant roof quotes
          </p>

          {/* No manual <br> — a forced break plus the first phrase's own
              natural wrap could silently become 3 lines at some widths.
              text-balance picks its own break point and reliably holds to
              2 lines within this max-width. */}
          <h1 className="mx-auto mt-[clamp(1.1rem,2.6svh,1.6rem)] max-w-4xl text-balance font-[family-name:var(--font-poppins)] text-[clamp(2.1rem,min(5.4vw,6.5svh),4.3rem)] font-light leading-[1.05] tracking-tight text-ink">
            Your roof, measured from space. Priced in a minute.
          </h1>

          <p
            data-belpa-expand-top
            className="mx-auto mt-[clamp(1rem,2.2svh,1.5rem)] max-w-xl text-[clamp(15px,1.35vw,17px)] leading-relaxed text-muted"
          >
            Type your address, answer a few questions, trace your roof on
            satellite imagery — and get a{" "}
            <strong className="font-semibold text-brand-600">
              real price range
            </strong>{" "}
            from your local roofer. No ladders, no appointments.
          </p>

          <div className="belpa-bubble-host mx-auto mt-[clamp(1.5rem,3.8svh,2.75rem)] w-full text-left">
            <QuoteBubble />
          </div>
        </div>
      </section>
    </main>
  );
}
