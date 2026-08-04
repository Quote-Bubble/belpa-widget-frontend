import type { Metadata } from "next";
import Script from "next/script";

export const metadata: Metadata = {
  title: "Button launch demo — Belpa",
  description: "Test page: open the Quote Link fullscreen from a host-site button.",
  robots: { index: false, follow: false },
};

/**
 * Fake roofer homepage for testing launch.js.
 * Live at /demo-button
 */
export default function DemoButtonPage() {
  return (
    <main className="demo-launch">
      <div className="demo-launch__wrap">
        <p className="demo-launch__badge">
          <i aria-hidden /> Belpa launch demo
        </p>
        <h1 className="demo-launch__title">Ridgeway Roofing</h1>
        <p className="demo-launch__lede">
          Fake roofer homepage. The button opens the Quote Link fullscreen over
          this page — same pattern roofers can drop on their own sites.
        </p>

        <div className="demo-launch__actions">
          <button
            className="demo-launch__btn demo-launch__btn--primary"
            type="button"
            data-belpa-launch
            data-roofer="belpa-landing-demo"
          >
            Get a free quote
          </button>
          <button
            className="demo-launch__btn demo-launch__btn--ghost"
            type="button"
            id="demo-launch-api"
          >
            Open via BelpaLaunch.open()
          </button>
        </div>

        <section className="demo-launch__card">
          <h2>Snippet for any site</h2>
          <p>
            Put a button with <code>data-belpa-launch</code> and load the script
            once.
          </p>
          <pre className="demo-launch__code">{`<button data-belpa-launch data-roofer="your-slug">
  Get a free quote
</button>
<script
  src="https://belpa-widget-frontend.vercel.app/launch.js"
  async></script>`}</pre>
        </section>
      </div>

      <Script src="/launch.js" strategy="afterInteractive" />
      <Script id="demo-launch-bind" strategy="afterInteractive">
        {`
          document.getElementById("demo-launch-api")?.addEventListener("click", function () {
            if (!window.BelpaLaunch) return;
            window.BelpaLaunch.open({ roofer: "belpa-landing-demo" });
          });
        `}
      </Script>
    </main>
  );
}
