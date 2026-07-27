"use client";

import { useEffect, useState } from "react";

/**
 * Quote Link backdrop — full-quality photo with an instant CSS stand-in
 * so the page never waits on the image. WebP loads first; PNG is fallback.
 */
export function QuoteLinkBackdrop() {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const img = new Image();
    img.src = "/quote-link-bg.webp";
    if (img.complete) {
      setReady(true);
      return;
    }
    img.onload = () => setReady(true);
    img.onerror = () => {
      // Fall back to PNG if WebP fails
      const png = new Image();
      png.src = "/quote-link-bg.png";
      png.onload = () => setReady(true);
    };
  }, []);

  return (
    <div className="quote-link__sky" aria-hidden>
      {/* Instant geometric stand-in (same vibe, zero network) */}
      <div className="quote-link__standin" />

      {/* Tiny preview while the full asset arrives */}
      <div
        className="quote-link__lqip"
        style={{ backgroundImage: "url(/quote-link-bg-lq.webp)" }}
      />

      <picture
        className={`quote-link__photo${ready ? " is-ready" : ""}`}
      >
        <source srcSet="/quote-link-bg.webp" type="image/webp" />
        <img
          src="/quote-link-bg.png"
          alt=""
          decoding="async"
          fetchPriority="high"
          onLoad={() => setReady(true)}
        />
      </picture>
    </div>
  );
}
