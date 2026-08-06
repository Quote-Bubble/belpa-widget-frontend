/*!
 * Belpa launch — open the quote flow from any button on the roofer's site.
 *
 * Drop-in:
 *   <button data-belpa-launch data-roofer="your-slug">Get a free quote</button>
 *   <script src="https://widget.belpa.co.uk/v1/launch.js" async></script>
 *
 * Or call from your own JS:
 *   BelpaLaunch.open({ roofer: "your-slug" })
 *   BelpaLaunch.close()
 *
 * Optional on the script tag:
 *   data-roofer   default slug for buttons that omit their own
 *
 * ── Two presentations ───────────────────────────────────────────────────────
 * DESKTOP: a centred card over a blurred page, loading /w/<slug>. That route
 *   already opens straight into the flow at the address step with no collapsed
 *   bar, and it's transparent, so it drops into a card cleanly. Keeping the
 *   roofer's own page visible behind the card is the point — it reads as part
 *   of their site rather than a place the visitor was sent to.
 * MOBILE: unchanged — fullscreen, loading /l/<slug>. That route is a standalone
 *   page with its own seal and prompt, which is right when it fills the screen
 *   and wrong squeezed into a 700px card next to branding the visitor can
 *   already see.
 *
 * ── Notes for anyone editing this ───────────────────────────────────────────
 * This runs on OTHER PEOPLE'S SITES, with unknown CSS and unknown stacking
 * contexts. Everything here is deliberately self-contained: appended to
 * <body>, position:fixed, inline styles only, no dependency on the host's
 * layout, and no assumption that any z-index of ours wins by default.
 *
 * The desktop card must stay WIDER THAN 640px. The embed picks its layout from
 * its own width, so a narrower card makes it ask for the mobile fullscreen
 * treatment inside a desktop card. That's why the width clamp has a 640 floor
 * and why desktop mode is gated at 720px of viewport rather than 640.
 */
(function (global) {
  "use strict";

  var OVERLAY_ID = "belpa-launch-overlay";
  var EASE = "cubic-bezier(0.22, 1, 0.36, 1)";
  /* Above 640 + the card's 2rem of breathing room, so the card is never forced
     under the embed's own desktop breakpoint. */
  var DESKTOP_MQ = "(min-width: 720px)";
  /* Keep in sync with QUOTE_SIZES.expanded in lib/motion.ts. Only a starting
     height — the embed reports its real one and we follow. */
  var PANEL_H = 574;
  var origin = "";

  function scriptEl() {
    return (
      document.currentScript ||
      document.querySelector('script[src*="launch.js"]')
    );
  }

  function resolveOrigin() {
    var script = scriptEl();
    if (!script || !script.src) return "";
    try {
      return new URL(script.src).origin;
    } catch (e) {
      return "";
    }
  }

  function defaultRoofer() {
    var script = scriptEl();
    return (script && script.getAttribute("data-roofer")) || "";
  }

  function mq(query) {
    return !!(global.matchMedia && global.matchMedia(query).matches);
  }

  function prefersReducedMotion() {
    return mq("(prefers-reduced-motion: reduce)");
  }

  function isDesktop() {
    return mq(DESKTOP_MQ);
  }

  /* Safari shipped backdrop-filter prefixed for years and some engines still
     don't have it. Without the check the "blur" silently becomes a flat tint,
     so dim harder in that case to keep the card separated from the page. */
  function supportsBackdropBlur() {
    if (!global.CSS || !global.CSS.supports) return false;
    return (
      CSS.supports("backdrop-filter", "blur(4px)") ||
      CSS.supports("-webkit-backdrop-filter", "blur(4px)")
    );
  }

  function close() {
    var overlay = document.getElementById(OVERLAY_ID);
    if (!overlay) return;
    document.removeEventListener("keydown", onKeydown, true);
    if (overlay.__belpaOnMessage) {
      global.removeEventListener("message", overlay.__belpaOnMessage);
    }
    document.documentElement.style.overflow = overlay.__belpaPrevOverflow || "";
    overlay.remove();
  }

  function onKeydown(e) {
    if (e.key === "Escape") {
      e.preventDefault();
      close();
    }
  }

  function open(opts) {
    opts = opts || {};
    var roofer = opts.roofer || defaultRoofer();
    if (!roofer) {
      console.error("[Belpa] launch needs a data-roofer / opts.roofer.");
      return;
    }

    origin = origin || resolveOrigin();
    if (!origin) {
      console.error("[Belpa] could not resolve the widget origin.");
      return;
    }

    close();

    var desktop = isDesktop();
    var blur = supportsBackdropBlur();

    var overlay = document.createElement("div");
    overlay.id = OVERLAY_ID;
    overlay.setAttribute("role", "dialog");
    overlay.setAttribute("aria-modal", "true");
    overlay.setAttribute("aria-label", "Get a free roof quote");

    var overlayCss = [
      "position:fixed",
      "inset:0",
      "z-index:2147483646",
      "display:flex",
      "opacity:0",
      "transition:opacity 220ms " + EASE,
    ];
    if (desktop) {
      overlayCss.push(
        "align-items:center",
        "justify-content:center",
        "padding:1rem",
        "box-sizing:border-box",
        // Heavier tint when we can't blur, so the card still separates.
        "background:rgba(9,18,40," + (blur ? "0.42" : "0.62") + ")",
      );
      if (blur) {
        overlayCss.push(
          "backdrop-filter:blur(10px) saturate(1.1)",
          "-webkit-backdrop-filter:blur(10px) saturate(1.1)",
        );
      }
    } else {
      overlayCss.push("flex-direction:column", "background:#0b1220");
    }
    overlay.style.cssText = overlayCss.join(";");

    var frame = document.createElement("iframe");
    var hostQs =
      typeof location !== "undefined" && location.origin
        ? "?host=" + encodeURIComponent(location.origin)
        : "";
    frame.src =
      origin +
      (desktop ? "/w/" : "/l/") +
      encodeURIComponent(roofer) +
      hostQs;
    frame.title = "Get a free roof quote";
    frame.setAttribute(
      "sandbox",
      "allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox",
    );

    if (desktop) {
      frame.style.cssText = [
        "width:100%",
        // 640 floor: below it the embed flips to its mobile layout.
        "max-width:700px",
        "min-width:640px",
        "height:" + PANEL_H + "px",
        "border:0",
        "background:transparent",
        "transition:height 320ms " + EASE + ",transform 340ms " + EASE +
          ",opacity 220ms ease",
        "transform:scale(0.96)",
        "opacity:0",
      ].join(";");
    } else {
      frame.style.cssText = [
        "flex:1",
        "width:100%",
        "height:100%",
        "border:0",
        "background:#f4f7fb",
      ].join(";");
    }

    overlay.__belpaPrevOverflow = document.documentElement.style.overflow;
    document.documentElement.style.overflow = "hidden";
    overlay.appendChild(frame);

    /* The close control differs by presentation, and this is the part that is
       easy to get wrong: on desktop the panel inside /w/ already draws its own
       X, so adding one here puts two crosses in the same corner. Instead we
       watch for the embed dropping back to `collapsed` — which is what its own
       X does — and take that as "close the whole thing". Backdrop and Escape
       stay as the host-owned ways out. On mobile /l/ has no close of its own,
       so we still supply one. */
    if (desktop) {
      overlay.addEventListener("click", function (e) {
        if (e.target === overlay) close();
      });

      var sawExpanded = false;
      var onMessage = function (e) {
        if (e.origin !== origin) return;
        var d = e.data;
        if (!d || d.source !== "belpa-embed") return;
        if (typeof d.sizes === "object" && d.sizes && d.sizes.expanded > 0) {
          PANEL_H = d.sizes.expanded;
        }
        var mode = typeof d.mode === "string" ? d.mode : "collapsed";
        if (mode === "expanded" || mode === "suggesting") {
          sawExpanded = true;
          var h = typeof d.height === "number" && d.height > 0 ? d.height : 0;
          if (h) frame.style.height = h + "px";
        } else if (mode === "collapsed" && sawExpanded) {
          // The panel's own X (or a finished flow) — dismiss the overlay too,
          // rather than leaving a collapsed search bar floating in a modal.
          close();
        }
      };
      overlay.__belpaOnMessage = onMessage;
      global.addEventListener("message", onMessage);
    } else {
      var closeBtn = document.createElement("button");
      closeBtn.type = "button";
      closeBtn.setAttribute("aria-label", "Close quote");
      closeBtn.textContent = "✕";
      closeBtn.style.cssText = [
        "position:absolute",
        "top:max(12px, env(safe-area-inset-top))",
        "right:max(12px, env(safe-area-inset-right))",
        "z-index:2",
        "width:40px",
        "height:40px",
        "border:0",
        "border-radius:999px",
        "background:rgba(15,23,42,0.55)",
        "color:#fff",
        "font:600 18px/1 system-ui,sans-serif",
        "cursor:pointer",
        "backdrop-filter:blur(8px)",
        "-webkit-backdrop-filter:blur(8px)",
      ].join(";");
      closeBtn.addEventListener("click", close);
      overlay.appendChild(closeBtn);
      overlay.__belpaCloseBtn = closeBtn;
    }

    document.body.appendChild(overlay);
    document.addEventListener("keydown", onKeydown, true);

    if (prefersReducedMotion()) {
      overlay.style.opacity = "1";
      frame.style.transform = "none";
      frame.style.opacity = "1";
    } else {
      requestAnimationFrame(function () {
        overlay.style.opacity = "1";
        if (desktop) {
          frame.style.transform = "scale(1)";
          frame.style.opacity = "1";
        }
      });
    }

    if (overlay.__belpaCloseBtn) overlay.__belpaCloseBtn.focus();
  }

  function bindButtons() {
    var nodes = document.querySelectorAll(
      "[data-belpa-launch]:not([data-belpa-launch-bound])",
    );
    for (var i = 0; i < nodes.length; i++) {
      (function (btn) {
        btn.setAttribute("data-belpa-launch-bound", "1");
        btn.addEventListener("click", function (e) {
          e.preventDefault();
          open({
            roofer: btn.getAttribute("data-roofer") || defaultRoofer(),
          });
        });
      })(nodes[i]);
    }
  }

  var api = { open: open, close: close, bind: bindButtons };
  global.BelpaLaunch = api;

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", bindButtons);
  } else {
    bindButtons();
  }
})(typeof window !== "undefined" ? window : this);
