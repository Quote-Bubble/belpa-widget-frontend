import Link from "next/link";
import type { ReactNode } from "react";

import { QuoteLinkBackdrop } from "@/components/quote-link/QuoteLinkBackdrop";

/**
 * Visual shell around the Quote Link page — atmosphere, roofer seal,
 * footer. Does not touch the quote widget / QuoteFlow itself.
 */

export function QuoteLinkShell({
  title,
  subtitle,
  children,
  footer = true,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  footer?: boolean;
}) {
  return (
    <main className="quote-link">
      <QuoteLinkBackdrop />

      <header className="quote-link__seal">
        <h1 className="quote-link__name">{title}</h1>
      </header>

      <div className="quote-link__frame">
        <div className="quote-link__content">
          {subtitle ? (
            <p className="quote-link__sub">{subtitle}</p>
          ) : null}

          <div className="quote-link__widget">{children}</div>
        </div>

        {footer ? (
          <footer className="quote-link__footer">
            <Link
              href="https://quoter-web-six.vercel.app"
              className="quote-link__powered"
            >
              Powered by Quoter
            </Link>
          </footer>
        ) : null}
      </div>
    </main>
  );
}
