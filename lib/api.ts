/**
 * Base URL for the belpa-api backend.
 *
 * The frontend and backend live in separate repositories and deployments, so
 * every request to /api/... goes through this helper. Locally, run
 * belpa-api on port 3001 and set NEXT_PUBLIC_BELPA_API_URL accordingly
 * (see .env.example).
 *
 * NEXT_PUBLIC_* is baked at build time on Vercel. A missing/invalid value
 * makes fetch("/api/geocode") hit the widget host (404/SSO) and LocateStep
 * shows a fake "check your connection" error.
 */
const configured = (process.env.NEXT_PUBLIC_BELPA_API_URL ?? "")
  .trim()
  .replace(/\/+$/, "");

/** Known production API — used when the build env is missing or not a URL. */
const PRODUCTION_API = "https://api.belpa.co.uk";

function resolveApiBase(): string {
  if (/^https?:\/\//i.test(configured)) return configured;
  // Preview builds have shipped with a broken/non-URL env value; never fall
  // back to same-origin in production builds — the widget has no /api/*.
  if (process.env.NODE_ENV === "production") return PRODUCTION_API;
  return configured;
}

const base = resolveApiBase();

if (
  typeof process !== "undefined" &&
  process.env.NODE_ENV === "production" &&
  !/^https?:\/\//i.test(configured)
) {
  console.warn(
    "[belpa] NEXT_PUBLIC_BELPA_API_URL missing or invalid in this build; using",
    PRODUCTION_API,
  );
}

export function apiUrl(path: string): string {
  if (!path.startsWith("/")) {
    throw new Error(`apiUrl path must start with "/": ${path}`);
  }
  return `${base}${path}`;
}

/** True when this build knows where the backend lives. */
export function hasApiBaseUrl(): boolean {
  return Boolean(base);
}
