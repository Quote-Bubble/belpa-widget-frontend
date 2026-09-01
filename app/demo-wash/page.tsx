import type { Metadata } from "next";
import Script from "next/script";

import styles from "./page.module.css";

export const metadata: Metadata = {
  title: "Clearview Roof Care — Belpa demo",
  description:
    "Demo site: a roof cleaning company running the Belpa widget, configured for washing and gutter work.",
  robots: { index: false, follow: false },
};

/**
 * Fake roof-cleaning company, running the real widget. Live at /demo-wash.
 *
 * The sibling of /demo-button, for the other half of the trade. That one is a
 * launch-button test on a roofing firm; this is a full page for a CLEANING
 * firm, because the two sell different work and the widget has to prove it can
 * be both. The slug belpa-wash-demo has soft wash, biocide and gutter clearing
 * enabled and nothing else, so the flow that opens here offers cleaning jobs
 * only — no replacements, no repairs.
 *
 * Everything about Clearview is invented. The page says so at the top and is
 * noindexed: it exists to demonstrate the product, and it should never be
 * mistakable for a business someone could ring up.
 */

const ROOFER_SLUG = "belpa-wash-demo";

export default function DemoWashPage() {
  return (
    <div className={styles.page}>
      <p className={styles.demoBar}>
        <strong>Belpa demo.</strong> Clearview Roof Care is not a real company —
        this page exists to show the quote widget on a cleaning firm&apos;s site.
      </p>

      <header className={styles.header}>
        <div className={`${styles.wrap} ${styles.headerInner}`}>
          <a className={styles.brand} href="#top">
            <span className={styles.brandMark} aria-hidden>
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none">
                <path
                  d="M12 3.5 4 9.5v10h16v-10L12 3.5Z"
                  stroke="currentColor"
                  strokeWidth="1.9"
                  strokeLinejoin="round"
                />
                <path
                  d="M8.5 13.5c1.2 1 2.3 1 3.5 0s2.3-1 3.5 0"
                  stroke="currentColor"
                  strokeWidth="1.9"
                  strokeLinecap="round"
                />
              </svg>
            </span>
            Clearview Roof Care
          </a>

          <nav className={styles.headerNav} aria-label="Main">
            <a href="#services">What we do</a>
            <a href="#how">How it works</a>
            <a href="#quote">Get a price</a>
          </nav>

          <a className={styles.headerPhone} href="#quote">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden>
              <path
                d="M5 4h3l2 5-2.5 1.5a12 12 0 0 0 6 6L15 14l5 2v3a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2Z"
                stroke="currentColor"
                strokeWidth="1.9"
                strokeLinejoin="round"
              />
            </svg>
            Get a price
          </a>
        </div>
      </header>

      <main id="top">
        {/* —— Hero: the pitch on the left, the widget on the right —— */}
        <section className={styles.hero}>
          <div className={`${styles.wrap} ${styles.heroGrid}`}>
            <div>
              <span className={styles.eyebrow}>Roof cleaning · Buckinghamshire</span>
              <h1 className={styles.title}>
                Moss off your roof, without anyone climbing on it.
              </h1>
              <p className={styles.lede}>
                Soft washing and biocide treatment that clears moss, lichen and
                algae at low pressure — so your tiles stay where the roofer put
                them. Most homes are done in a day.
              </p>
              <ul className={styles.points}>
                {[
                  "No jet washing — low pressure only, so nothing gets driven under the tiles",
                  "Gutters cleared and checked while we are up there",
                  "Fully insured, and we take the mess with us",
                ].map((point) => (
                  <li key={point}>
                    <svg
                      className={styles.tick}
                      width="17"
                      height="17"
                      viewBox="0 0 24 24"
                      fill="none"
                      aria-hidden
                    >
                      <path
                        d="m5 12.5 4.5 4.5L19 7"
                        stroke="currentColor"
                        strokeWidth="2.4"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                    {point}
                  </li>
                ))}
              </ul>
            </div>

            {/* The widget mounts into #quote-slot via widget.js below. */}
            <div className={styles.quoteCard} id="quote">
              <div className={styles.quoteHead}>
                <h2>Price your roof clean</h2>
                <span>Takes about a minute</span>
              </div>
              <div className={styles.quoteSlot} id="quote-slot" />
            </div>
          </div>
        </section>

        {/* —— Services: exactly the three the slug has enabled —— */}
        <section className={styles.section} id="services">
          <div className={styles.wrap}>
            <div className={styles.sectionHead}>
              <h2>What we clean</h2>
              <p>
                Three jobs, priced off the roof we measure from the satellite
                rather than a guess over the phone.
              </p>
            </div>

            <div className={styles.cards}>
              {[
                {
                  title: "Roof soft wash",
                  body: "Low-pressure clean that lifts moss, lichen and algae off tiles and slate without disturbing the bedding.",
                  price: "from £150",
                  note: "priced per m² of roof",
                  icon: (
                    <path
                      d="M7 4v6m5-6v6m5-6v6M4 12h16v3a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5v-3Z"
                      stroke="currentColor"
                      strokeWidth="1.9"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  ),
                },
                {
                  title: "Biocide treatment",
                  body: "Applied after a wash, or on its own. Kills off what is left at the root so the roof stays clear for longer.",
                  price: "from £100",
                  note: "priced per m² of roof",
                  icon: (
                    <path
                      d="M12 3s5 5.5 5 9a5 5 0 0 1-10 0c0-3.5 5-9 5-9Z"
                      stroke="currentColor"
                      strokeWidth="1.9"
                      strokeLinejoin="round"
                    />
                  ),
                },
                {
                  title: "Gutter clearing",
                  body: "Downpipes flushed, hoppers cleared, and a look at the joints while the ladder is already against the wall.",
                  price: "£120",
                  note: "flat rate, most homes",
                  icon: (
                    <path
                      d="M3 7h18l-2 4H5L3 7Zm4 4v6a2 2 0 0 0 2 2M17 11v3"
                      stroke="currentColor"
                      strokeWidth="1.9"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  ),
                },
              ].map((service) => (
                <article className={styles.card} key={service.title}>
                  <span className={styles.cardIcon} aria-hidden>
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                      {service.icon}
                    </svg>
                  </span>
                  <h3>{service.title}</h3>
                  <p>{service.body}</p>
                  <p className={styles.cardPrice}>
                    <strong>{service.price}</strong> · {service.note}
                  </p>
                </article>
              ))}
            </div>
          </div>
        </section>

        {/* —— How it works —— */}
        <section className={`${styles.section} ${styles.sectionAlt}`} id="how">
          <div className={styles.wrap}>
            <div className={styles.sectionHead}>
              <h2>Three steps, no site visit to get a price</h2>
              <p>
                We measure the roof from above before we ever come out, so the
                number you see is the number we work to.
              </p>
            </div>

            <div className={styles.steps}>
              <div className={styles.step}>
                <h3>Tell us the address</h3>
                <p>
                  Drop the pin on your house and mark out the roof. Takes about
                  a minute on a phone.
                </p>
              </div>
              <div className={styles.step}>
                <h3>See the price</h3>
                <p>
                  Priced off the measured area, not a guess. No waiting for
                  someone to call you back with a figure.
                </p>
              </div>
              <div className={styles.step}>
                <h3>Pick a day</h3>
                <p>
                  We confirm by text, turn up, and clear up. Most roofs are done
                  between breakfast and tea.
                </p>
              </div>
            </div>
          </div>
        </section>

        <section className={styles.section}>
          <div className={styles.wrap}>
            <div className={styles.stats}>
              {[
                ["600+", "roofs cleaned"],
                ["12 yrs", "on the tools"],
                ["£5m", "public liability"],
                ["4.9", "average rating"],
              ].map(([value, label]) => (
                <div className={styles.stat} key={label}>
                  <strong>{value}</strong>
                  <span>{label}</span>
                </div>
              ))}
            </div>
          </div>
        </section>
      </main>

      <footer className={styles.footer}>
        <div className={styles.wrap}>
          <div className={styles.footerInner}>
            <p style={{ margin: 0 }}>
              <strong>Clearview Roof Care</strong> · High Wycombe, Bucks
            </p>
            <p style={{ margin: 0 }}>Mon–Sat, 8am–6pm</p>
          </div>
          <p className={styles.footerNote}>
            This is a Belpa demonstration page. Clearview Roof Care does not
            exist — the company, the figures and the reviews on this page are
            invented to show how the quote widget sits on a cleaning
            company&apos;s website.
          </p>
        </div>
      </footer>

      {/* The real widget, mounted into the hero card. Same one-line embed a
          roofer would paste onto their own site — the only thing that differs
          between this page and /demo-button is the slug, and the slug is what
          decides that this one offers cleaning jobs rather than replacements. */}
      <Script
        src="/widget.js"
        data-roofer={ROOFER_SLUG}
        data-target="#quote-slot"
        strategy="afterInteractive"
      />
    </div>
  );
}
