/*!
 * Belpa launch — open the Quote Link in a fullscreen modal from any button.
 *
 * Drop-in:
 *   <button data-belpa-launch data-roofer="your-slug">Get a free quote</button>
 *   <script src="https://belpa-widget-frontend.vercel.app/v1/launch.js" async></script>
 *
 * Or call from your own JS:
 *   BelpaLaunch.open({ roofer: "your-slug" })
 *   BelpaLaunch.close()
 *
 * Optional on the script tag:
 *   data-roofer   default slug for buttons that omit their own
 */
(function (global) {
  "use strict";

  var OVERLAY_ID = "belpa-launch-overlay";
  var EASE = "cubic-bezier(0.22, 1, 0.36, 1)";
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

  function prefersReducedMotion() {
    return (
      global.matchMedia &&
      global.matchMedia("(prefers-reduced-motion: reduce)").matches
    );
  }

  function close() {
    var overlay = document.getElementById(OVERLAY_ID);
    if (!overlay) return;
    document.removeEventListener("keydown", onKeydown, true);
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

    var overlay = document.createElement("div");
    overlay.id = OVERLAY_ID;
    overlay.setAttribute("role", "dialog");
    overlay.setAttribute("aria-modal", "true");
    overlay.setAttribute("aria-label", "Get a free roof quote");
    overlay.style.cssText = [
      "position:fixed",
      "inset:0",
      "z-index:2147483646",
      "display:flex",
      "flex-direction:column",
      "background:#0b1220",
      "opacity:0",
      "transition:opacity 220ms " + EASE,
    ].join(";");

    var frame = document.createElement("iframe");
    var hostQs =
      typeof location !== "undefined" && location.origin
        ? "?host=" + encodeURIComponent(location.origin)
        : "";
    frame.src = origin + "/l/" + encodeURIComponent(roofer) + hostQs;
    frame.title = "Get a free roof quote";
    frame.setAttribute(
      "sandbox",
      "allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox",
    );
    frame.style.cssText = [
      "flex:1",
      "width:100%",
      "height:100%",
      "border:0",
      "background:#f4f7fb",
    ].join(";");

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

    overlay.__belpaPrevOverflow = document.documentElement.style.overflow;
    document.documentElement.style.overflow = "hidden";
    overlay.appendChild(frame);
    overlay.appendChild(closeBtn);
    document.body.appendChild(overlay);
    document.addEventListener("keydown", onKeydown, true);

    if (prefersReducedMotion()) {
      overlay.style.opacity = "1";
    } else {
      requestAnimationFrame(function () {
        overlay.style.opacity = "1";
      });
    }

    closeBtn.focus();
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
