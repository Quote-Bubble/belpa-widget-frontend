import { apiUrl } from "@/lib/api";

/**
 * Fire-and-forget funnel analytics for the embedded widget.
 *
 * There is no third-party tracker — events go to our own backend (/api/event)
 * so nothing leaves the Belpa stack. Every call is best-effort and MUST NEVER
 * throw or block the UI: analytics failing should be invisible to the user.
 *
 * A session id is minted per page load so a single homeowner's journey (bar ->
 * address -> job type -> ... -> estimate/lead) can be stitched back together
 * to see where people drop off.
 */

let sessionId: string | null = null;
let rooferId = "unknown";

function getSessionId(): string {
  if (sessionId) return sessionId;
  sessionId =
    typeof crypto !== "undefined" && crypto.randomUUID
      ? crypto.randomUUID()
      : `s_${Date.now()}_${Math.random().toString(16).slice(2)}`;
  return sessionId;
}

/** Call once when the widget mounts so events carry the roofer's id. */
export function initAnalytics(id: string): void {
  if (id) rooferId = id;
}

export type QuoteEvent =
  | "widget_opened"
  | "widget_closed"
  | "step_viewed"
  | "quote_shown"
  | "lead_submitted"
  | "lead_failed"
  | "lead_quote_requested"
  | "lead_promote_failed";

/**
 * The page the widget is running ON, not the widget's own URL.
 *
 * Inside the embed iframe `location.href` is always the widget's own address,
 * so it can never tell us which roofer's site a session came from — which is
 * exactly what we want it for (spotting that an install has gone live, seeing
 * which pages convert). For a framed document the referrer is the parent page,
 * so prefer that and fall back when it's unavailable.
 */
function pageUrl(): string {
  try {
    if (window.self !== window.top && document.referrer) {
      return document.referrer;
    }
  } catch {
    // Cross-origin access can throw in odd embeddings; fall through.
  }
  return window.location.href;
}

export function track(
  event: QuoteEvent,
  props: Record<string, unknown> = {},
): void {
  if (typeof window === "undefined") return;
  try {
    const body = JSON.stringify({
      event,
      rooferId,
      sessionId: getSessionId(),
      ts: new Date().toISOString(),
      url: pageUrl(),
      props,
    });
    const url = apiUrl("/api/event");
    // Prefer sendBeacon: it survives the page/iframe being torn down (e.g. the
    // user closing the flow) and, sent as text/plain, is a "simple" request so
    // it skips the CORS preflight. The server JSON-parses the text body.
    if (navigator.sendBeacon) {
      const ok = navigator.sendBeacon(
        url,
        new Blob([body], { type: "text/plain" }),
      );
      if (ok) return;
    }
    void fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
      keepalive: true,
    }).catch(() => {});
  } catch {
    // Analytics must never surface to the user.
  }
}
