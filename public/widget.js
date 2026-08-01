/*!
 * Quoter widget — drop the instant-roof-quote flow, ALREADY EXPANDED, onto any
 * site. The flow opens at the address step (postcode + first line); there is no
 * collapsed search bar in front of it.
 *
 *   <script src="https://quoter-widget-frontend.vercel.app/widget.js"
 *           data-roofer="your-slug" async></script>
 *
 * Builds one iframe at a fixed height (the expanded quote panel) pointed at
 * /w/<slug>. The widget reports its height over postMessage, so the host never
 * has to track content changes. No collapse/expand/suggest — that lived in the
 * old embed.js, which is now landing-only.
 *
 * Optional attributes:
 *   data-roofer     (required) the roofer's Quoter slug — routes leads to them.
 *   data-target     CSS selector to mount into; defaults to where the script sits.
 *   data-max-width  px cap on the widget width; default 700.
 */
(function () {
  "use strict";

  // Keep in sync with QUOTE_SIZES.expanded in lib/motion.ts.
  var EXPANDED_H = 574;

  function initOne(script) {
    if (script.__quoterWidgetInit) return;
    script.__quoterWidgetInit = true;

    var roofer = script.getAttribute("data-roofer");
    if (!roofer) {
      console.error("[Quoter] widget.js is missing data-roofer.");
      return;
    }

    // The widget lives on the same origin this script was served from.
    var origin;
    try {
      origin = new URL(script.src).origin;
    } catch (e) {
      console.error("[Quoter] could not resolve the widget origin.");
      return;
    }

    var maxWidth = parseInt(script.getAttribute("data-max-width"), 10) || 700;

    var holder = document.createElement("div");
    holder.setAttribute("data-quoter-widget", roofer);
    holder.style.position = "relative";
    holder.style.width = "100%";
    holder.style.maxWidth = maxWidth + "px";
    holder.style.margin = "0 auto";

    var frame = document.createElement("iframe");
    frame.src = origin + "/w/" + encodeURIComponent(roofer);
    frame.title = "Get an instant, free roof quote";
    frame.loading = "eager";
    frame.setAttribute("scrolling", "no");
    frame.setAttribute(
      "sandbox",
      "allow-scripts allow-same-origin allow-forms allow-popups",
    );
    frame.style.display = "block";
    frame.style.width = "100%";
    frame.style.height = EXPANDED_H + "px";
    frame.style.border = "0";
    frame.style.background = "transparent";
    frame.style.colorScheme = "normal"; // don't inherit the host's dark mode
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

    window.addEventListener("message", function (event) {
      // Only trust messages from the widget's own origin.
      if (event.origin !== origin) return;
      var d = event.data;
      if (!d || d.source !== "quoter-widget") return;
      var h =
        typeof d.height === "number" && d.height > 0 ? d.height : EXPANDED_H;
      frame.style.height = h + "px";
    });
  }

  // Initialise every widget.js embed on the page. Scoped by src so it never
  // grabs the quoter-launch.js script (which may also carry a data-roofer).
  function initAll() {
    var scripts = document.querySelectorAll(
      'script[src*="widget.js"][data-roofer]',
    );
    for (var i = 0; i < scripts.length; i++) initOne(scripts[i]);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initAll);
  } else {
    initAll();
  }
})();
