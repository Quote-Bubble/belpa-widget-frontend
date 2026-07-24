import type { NextConfig } from "next";

/**
 * CSP frame-ancestors for /embed. The embed is a PUBLICLY embeddable widget —
 * it's dropped onto arbitrary roofer websites (unknown domains) via embed.js,
 * and onto our own landing page (a different origin). So it must be frameable
 * by any parent by default; `frame-ancestors 'self'` or DENY breaks the entire
 * product. Set EMBED_FRAME_ANCESTORS (space/comma-separated origins) to lock
 * it down to a specific allowlist later (per-roofer domain restriction).
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
  async headers() {
    return [
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
        // Everything EXCEPT /embed gets the anti-clickjacking lockdown. The
        // negative lookahead is essential: without it this catch-all also
        // matches /embed and re-applies DENY, blocking the embed we just
        // allowed above.
        source: "/((?!embed).*)",
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
