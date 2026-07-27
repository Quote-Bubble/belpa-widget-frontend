import Link from "next/link";
import type { ReactNode } from "react";

import { QuoteLinkBackdrop } from "@/components/quote-link/QuoteLinkBackdrop";

/**
 * Visual shell around the Quote Link page — atmosphere, roofer identity,
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

      <div className="quote-link__frame">
        <header className="quote-link__identity">
          <h1 className="quote-link__name">{title}</h1>
          {subtitle ? (
            <p className="quote-link__sub">{subtitle}</p>
          ) : null}
        </header>

        <div className="quote-link__widget">{children}</div>

        {footer ? (
          <p className="quote-link__footer">
            <Link
              href="https://quoter-web-six.vercel.app"
              className="quote-link__powered"
            >
              Powered by Quoter
            </Link>
          </p>
        ) : null}
      </div>
    </main>
  );
}
