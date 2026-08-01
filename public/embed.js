/*!
 * ⚠️ LEGACY / LANDING-ONLY. The collapsed search-bar → expand model. Roofer
 * sites should use the two supported flows instead: widget.js (inline, already
 * expanded → /w/<slug>) or quoter-launch.js (fullscreen button → /l/<slug>).
 * This loader and its /embed target are kept only for the marketing landing
 * page's hero (which frames /embed directly). Do not use for new embeds.
 *
 * Quoter embed loader — drop the instant-roof-quote widget onto any site.
 *
 *   <script src="https://quoter-widget-frontend.vercel.app/embed.js"
 *           data-roofer="your-slug" async></script>
 *
 * It builds an <iframe> to the widget and resizes it between two fixed heights
 * (a collapsed search bar and an expanded quote panel) as the user progresses.
 * On desktop the panel expands in-flow like an accordion (content below slides
 * down); on mobile the flow takes the whole screen. No dependencies, no build.
 *
 * Optional attributes:
 *   data-roofer   (required) the roofer's Quoter slug — routes leads to them.
 *   data-target   CSS selector to mount into; defaults to where the script sits.
 *   data-max-width  px cap on the widget width; default 700.
 */
(function () {
  "use strict";

  // Two fixed sizes — keep in sync with QUOTE_SIZES in the widget (lib/motion).
  // Prefer the `sizes` field from the embed's init postMessage when present.
  var COLLAPSED_H = 120;
  var EXPANDED_H = 574;
  var EASE = "cubic-bezier(0.22, 1, 0.36, 1)";

  function initOne(script) {
    if (script.__quoterInit) return;
    script.__quoterInit = true;

    var roofer = script.getAttribute("data-roofer");
    if (!roofer) {
      console.error("[Quoter] embed script is missing data-roofer.");
      return;
    }

    // The widget lives on the same origin this script was served from, so we
    // don't hardcode a URL and origin-check messages against it below.
    var origin;
    try {
      origin = new URL(script.src).origin;
    } catch (e) {
      console.error("[Quoter] could not resolve the widget origin.");
      return;
    }

    var maxWidth = parseInt(script.getAttribute("data-max-width"), 10) || 700;

    // Container: centered, full-width up to the cap.
    var holder = document.createElement("div");
    holder.setAttribute("data-quoter-widget", roofer);
    holder.style.position = "relative";
    holder.style.width = "100%";
    holder.style.maxWidth = maxWidth + "px";
    holder.style.margin = "0 auto";

    var frame = document.createElement("iframe");
    frame.src =
      origin + "/embed?roofer=" + encodeURIComponent(roofer);
    frame.title = "Get an instant, free roof quote";
    frame.loading = "eager";
    frame.setAttribute("scrolling", "no");
    frame.setAttribute(
      "sandbox",
      "allow-scripts allow-same-origin allow-forms allow-popups",
    );
    frame.style.display = "block";
    frame.style.width = "100%";
    frame.style.height = COLLAPSED_H + "px";
    frame.style.border = "0";
    frame.style.background = "transparent";
    frame.style.colorScheme = "normal"; // don't inherit the host's dark mode
    frame.style.transition = "height 320ms " + EASE;
    holder.appendChild(frame);

    // Mount at data-target if given, else right where the script tag sits.
    var target = script.getAttribute("data-target");
    var mount = target ? document.querySelector(target) : null;
    if (mount) {
      mount.appendChild(holder);
    } else if (script.parentNode) {
      script.parentNode.insertBefore(holder, script);
    } else {
      document.body.appendChild(holder);
    }

    var overlaid = false;
    var lockedY = 0;
    // Holds the iframe fullscreen while the widget's close fade plays before
    // shrinking back to the collapsed slot (must match the widget overlay's
    // exit transition, ~0.26s).
    var overlayCloseTimer = 0;
    var OVERLAY_EXIT_MS = 300;
    function lockHostScroll() {
      lockedY = window.scrollY || window.pageYOffset || 0;
      document.documentElement.style.overflow = "hidden";
      document.body.style.position = "fixed";
      document.body.style.top = "-" + lockedY + "px";
      document.body.style.left = "0";
      document.body.style.right = "0";
      document.body.style.width = "100%";
      document.body.style.overflow = "hidden";
    }
    function unlockHostScroll() {
      document.documentElement.style.overflow = "";
      document.body.style.position = "";
      document.body.style.top = "";
      document.body.style.left = "";
      document.body.style.right = "";
      document.body.style.width = "";
      document.body.style.overflow = "";
      window.scrollTo(0, lockedY);
    }
    function setOverlay(on) {
      if (on === overlaid) return;
      overlaid = on;
      if (on) {
        // Mobile: pin the iframe to the whole viewport for the flow.
        // Opaque white so the host page can't ghost through on real iOS
        // Safari (transparent iframe + glass UI = classic DevTools-only pass).
        frame.style.transition = "none";
        frame.style.position = "fixed";
        frame.style.top = "0";
        frame.style.left = "0";
        frame.style.width = "100vw";
        frame.style.height = "100vh"; // fallback first...
        frame.style.height = "100dvh"; // ...then dvh where supported
        frame.style.zIndex = "2147483000";
        frame.style.background = "#ffffff";
        lockHostScroll();
      } else {
        frame.style.position = "";
        frame.style.top = "";
        frame.style.left = "";
        frame.style.width = "100%";
        frame.style.zIndex = "";
        frame.style.background = "transparent";
        frame.style.transition = "height 320ms " + EASE;
        unlockHostScroll();
      }
    }

    window.addEventListener("message", function (event) {
      // Only trust messages from the widget's own origin.
      if (event.origin !== origin) return;
      var d = event.data;
      if (!d || d.source !== "quoter-embed") return;

      // Prefer live sizes from the widget so hosts don't copy constants.
      if (d.sizes && typeof d.sizes === "object") {
        if (typeof d.sizes.collapsed === "number" && d.sizes.collapsed > 0) {
          COLLAPSED_H = d.sizes.collapsed;
        }
        if (typeof d.sizes.expanded === "number" && d.sizes.expanded > 0) {
          EXPANDED_H = d.sizes.expanded;
        }
      }

      var mode = typeof d.mode === "string" ? d.mode : "collapsed";
      var h = typeof d.height === "number" && d.height > 0 ? d.height : 0;

      if (mode === "overlay") {
        if (overlayCloseTimer) {
          window.clearTimeout(overlayCloseTimer);
          overlayCloseTimer = 0;
        }
        setOverlay(true);
        return;
      }

      // collapsed / expanded (and the now-unused "suggesting") all just set the
      // iframe to the reported height, falling back to the known fixed sizes.
      var targetH =
        mode === "expanded" ? (h || EXPANDED_H) : (h || COLLAPSED_H);

      // Closing FROM the mobile overlay: keep the iframe fullscreen + host
      // locked while the widget's overlay fades out, then shrink + unlock in
      // one step so the closing flow is never clipped back to the slot.
      if (overlaid) {
        if (overlayCloseTimer) window.clearTimeout(overlayCloseTimer);
        overlayCloseTimer = window.setTimeout(function () {
          overlayCloseTimer = 0;
          setOverlay(false);
          frame.style.height = targetH + "px";
        }, OVERLAY_EXIT_MS);
        return;
      }

      setOverlay(false);
      frame.style.height = targetH + "px";
    });
  }

  // Initialise every Quoter embed script on the page. Works with `async`
  // (where document.currentScript is null) and with more than one embed.
  function initAll() {
    var scripts = document.querySelectorAll("script[data-roofer]");
    for (var i = 0; i < scripts.length; i++) initOne(scripts[i]);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initAll);
  } else {
    initAll();
  }
})();
