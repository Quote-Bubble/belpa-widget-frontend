import Link from "next/link";
import type { ReactNode } from "react";

import { QuoteLinkBackdrop } from "@/components/quote-link/QuoteLinkBackdrop";

/**
 * Visual shell around the Quote Link page — atmosphere, roofer seal,
 * footer. Does not touch the quote widget / QuoteFlow itself.
 */

function sealInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "Q";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0] ?? ""}${parts[parts.length - 1][0] ?? ""}`.toUpperCase();
}

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
        <span className="quote-link__mark" aria-hidden>
          {sealInitials(title)}
        </span>
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
