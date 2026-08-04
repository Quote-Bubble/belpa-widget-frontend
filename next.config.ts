import type { NextConfig } from "next";

/**
 * CSP frame-ancestors for the framable routes (/embed, /l, /w). These are
 * PUBLICLY embeddable — dropped onto arbitrary roofer websites (unknown
 * domains) via widget.js / launch.js, and onto our own landing page (a
 * different origin). So they must be frameable by any parent by default;
 * `frame-ancestors 'self'` or DENY breaks the entire product. Set
 * EMBED_FRAME_ANCESTORS (space/comma-separated origins) to lock it down to a
 * specific allowlist later (per-roofer domain restriction).
 */
function embedFrameAncestors(): string {
  const raw = (process.env.EMBED_FRAME_ANCESTORS ?? "").trim();
  const origins = raw
    .split(/[\s,]+/)
    .map((part) => part.trim())
    .filter(Boolean);
  if (origins.length === 0) return "*";
  return origins.join(" ");
}

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=()",
  },
  { key: "X-DNS-Prefetch-Control", value: "on" },
];

const nextConfig: NextConfig = {
  async redirects() {
    return [
      // Back-compat: the fullscreen loader was renamed belpa-launch.js →
      // launch.js. Keep the old path working for any snippet already deployed.
      {
        source: "/belpa-launch.js",
        destination: "/launch.js",
        permanent: true,
      },
      // Versioned loader aliases — bump to /v2 when the postMessage protocol
      // or iframe contract breaks. Snippets can pin to /v1/* for stability.
      {
        source: "/v1/widget.js",
        destination: "/widget.js",
        permanent: false,
      },
      {
        source: "/v1/launch.js",
        destination: "/launch.js",
        permanent: false,
      },
    ];
  },
  async headers() {
    return [
      {
        source: "/widget.js",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=300, s-maxage=3600, stale-while-revalidate=86400",
          },
        ],
      },
      {
        source: "/launch.js",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=300, s-maxage=3600, stale-while-revalidate=86400",
          },
        ],
      },
      {
        source: "/v1/:path*",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=300, s-maxage=3600, stale-while-revalidate=86400",
          },
        ],
      },
      {
        source: "/embed",
        headers: [
          ...securityHeaders,
          {
            key: "Content-Security-Policy",
            value: `frame-ancestors ${embedFrameAncestors()}`,
          },
        ],
      },
      {
        source: "/embed/:path*",
        headers: [
          ...securityHeaders,
          {
            key: "Content-Security-Policy",
            value: `frame-ancestors ${embedFrameAncestors()}`,
          },
        ],
      },
      {
        // Quote Link — framable so host-site “Get a quote” buttons can open
        // it in a fullscreen modal iframe (see public/launch.js).
        source: "/l",
        headers: [
          ...securityHeaders,
          {
            key: "Content-Security-Policy",
            value: `frame-ancestors ${embedFrameAncestors()}`,
          },
        ],
      },
      {
        source: "/l/:path*",
        headers: [
          ...securityHeaders,
          {
            key: "Content-Security-Policy",
            value: `frame-ancestors ${embedFrameAncestors()}`,
          },
        ],
      },
      {
        // Inline widget — framable so roofer sites can embed the already-
        // expanded flow (see public/widget.js).
        source: "/w/:path*",
        headers: [
          ...securityHeaders,
          {
            key: "Content-Security-Policy",
            value: `frame-ancestors ${embedFrameAncestors()}`,
          },
        ],
      },
      {
        // Everything EXCEPT the framable routes (/embed, /l, /w) gets anti-
        // clickjacking lockdown. Negative lookahead is essential: without it
        // this catch-all also matches those routes and re-applies DENY.
        source: "/((?!embed(?:/|$)|l(?:/|$)|w(?:/|$)).*)",
        headers: [
          ...securityHeaders,
          {
            key: "Content-Security-Policy",
            value: "frame-ancestors 'none'",
          },
          { key: "X-Frame-Options", value: "DENY" },
        ],
      },
    ];
  },
};

export default nextConfig;
