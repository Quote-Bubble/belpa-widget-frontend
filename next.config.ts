import type { NextConfig } from "next";

/**
 * CSP frame-ancestors allowlist for /embed. Comma- or space-separated origins
 * from EMBED_FRAME_ANCESTORS (e.g. "https://example.com https://www.example.com").
 * When unset, defaults to 'self' so local/dev framing still works.
 */
function embedFrameAncestors(): string {
  const raw = (process.env.EMBED_FRAME_ANCESTORS ?? "").trim();
  const origins = raw
    .split(/[\s,]+/)
    .map((part) => part.trim())
    .filter(Boolean);
  if (origins.length === 0) return "'self'";
  return `{'self'} ${origins.join(" ")}`.replace("{'self'}", "'self'");
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
        source: "/:path*",
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
