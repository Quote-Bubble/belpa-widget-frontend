import { NextResponse, type NextRequest } from "next/server";

/**
 * Per-roofer embed lock. (Next 16 renamed the `middleware` convention to
 * `proxy`; same request hook, new filename and export.)
 *
 * The framable routes previously served `frame-ancestors *` for everyone, so
 * any site could iframe any roofer's widget. `?host=` was the only signal, and
 * it is a query parameter the caller supplies — trivially omitted, and the
 * check passed when absent. It guarded against accidents, not against anyone
 * trying.
 *
 * `frame-ancestors` is different in kind: the BROWSER refuses to render the
 * frame, and the embedding page cannot talk it out of that. It is the only
 * mechanism here that a determined third party can't route around.
 *
 * Scope, stated plainly so nobody over-trusts this:
 *   /w/<slug>  framed by widget.js and by launch.js on desktop — LOCKED
 *   /l/<slug>  framed by launch.js on mobile — locked as a FRAME, but it is
 *              also opened top-level from the QR code and link, and no CSP
 *              applies to a top-level navigation. Anyone with the URL can open
 *              it. That is what a QR code is for; it is not a hole to close.
 *   /embed     the landing's own bubble, not a roofer surface — left alone.
 *
 * Empty allowlist keeps `*`, so installing works before configuring. A roofer
 * locks down when ready rather than being unable to install until they have.
 */

/** Same slug shape the routes validate with. */
const SLUG = /^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/;

const API_BASE = (
  process.env.NEXT_PUBLIC_BELPA_API_URL ?? "https://api.belpa.co.uk"
).replace(/\/+$/, "");

/**
 * Our own surfaces always keep access, so locking a roofer down can never
 * break something we serve:
 *   'self'  — demo-button.html / demo-widget.html live on this origin and
 *             frame these routes. They're what the dashboard's "Preview ↗"
 *             opens, so without this an operator previewing a locked roofer
 *             gets a blank box.
 *   belpa.co.uk — the landing frames the demo roofer.
 */
const FIRST_PARTY = ["'self'", "https://belpa.co.uk", "https://www.belpa.co.uk"];

function cspValue(origins: string[]): string {
  if (origins.length === 0) return "frame-ancestors *";
  // Dedupe, and always include our own origins so locking a roofer down can't
  // accidentally break the demo or a preview we serve.
  const all = Array.from(new Set([...origins, ...FIRST_PARTY]));
  return `frame-ancestors ${all.join(" ")}`;
}

async function allowedOriginsFor(slug: string): Promise<string[]> {
  try {
    const res = await fetch(
      `${API_BASE}/api/roofer?slug=${encodeURIComponent(slug)}`,
      // Cached so this doesn't add a round-trip to every embed load. The
      // window matches the API's own cache-control (20s), so a domain change
      // in the dashboard takes effect within about a minute.
      { next: { revalidate: 30 } },
    );
    if (!res.ok) return [];
    const body = (await res.json()) as { allowedOrigins?: unknown };
    if (!Array.isArray(body.allowedOrigins)) return [];
    return body.allowedOrigins.filter(
      (o): o is string => typeof o === "string" && o.length > 0,
    );
  } catch {
    // FAIL OPEN, deliberately. A backend blip must not stop every roofer's
    // widget rendering on their site — this is a lead-capture form, not a
    // vault, and the downside of a brief unlock is far smaller than the
    // downside of every embed going blank at once.
    return [];
  }
}

export async function proxy(request: NextRequest) {
  const slug = request.nextUrl.pathname.split("/")[2] ?? "";
  const response = NextResponse.next();
  if (!SLUG.test(slug)) return response;

  const origins = await allowedOriginsFor(slug);
  response.headers.set("Content-Security-Policy", cspValue(origins));
  // Same list, as a hint for anyone debugging why their iframe is blank —
  // a blocked frame is otherwise a silent console-only failure.
  response.headers.set(
    "X-Belpa-Embed-Lock",
    origins.length ? "allowlist" : "open",
  );
  return response;
}

export const config = {
  matcher: ["/w/:slug*", "/l/:slug*"],
};
