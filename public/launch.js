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
 * ── Why the iframe is warmed ────────────────────────────────────────────────
 * Click used to create a blank iframe whose src then booted the Next app,
 * fetched the roofer, hydrated React, and lazy-loaded the quote chunk. That
 * is hundreds of milliseconds of nothing after a tap. We now start that load
 * on idle and on hover, and the overlay itself paints on the same click so
 * the page never sits still waiting for the embed.
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
 * and why desktop mode is gated at 720px of viewport rather than 640. The
 * parked (off-screen) iframe uses the same 700px width for the same reason.
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
  var parked = { frame: null, key: "", ready: false, roofer: "" };
  var parkedListening = false;
  var spinReady = false;

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

  function hostQuery() {
    return typeof location !== "undefined" && location.origin
      ? "?host=" + encodeURIComponent(location.origin)
      : "";
  }

  function widgetSrc(roofer, desktop) {
    return (
      origin +
      (desktop ? "/w/" : "/l/") +
      encodeURIComponent(roofer) +
      hostQuery()
    );
  }

  function ensureSpinStyle() {
    if (spinReady || !document.head) return;
    spinReady = true;
    var s = document.createElement("style");
    s.id = "belpa-launch-spin";
    s.textContent =
      "@keyframes belpa-spin{to{transform:rotate(360deg)}}";
    document.head.appendChild(s);
  }

  function ensureParkedListener() {
    if (parkedListening) return;
    parkedListening = true;
    global.addEventListener("message", function (e) {
      if (e.origin !== origin) return;
      var d = e.data;
      if (!d || d.source !== "belpa-embed") return;
      if (!parked.frame) return;
      if (d.mode === "expanded" || d.mode === "overlay") parked.ready = true;
    });
  }

  function createFrame(roofer, desktop) {
    var frame = document.createElement("iframe");
    frame.src = widgetSrc(roofer, desktop);
    frame.title = "Get a free roof quote";
    frame.loading = "eager";
    frame.setAttribute(
      "sandbox",
      "allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox",
    );
    return frame;
  }

  function parkStyles(desktop) {
    /* Width must stay at the desktop card size while hidden, otherwise the
       embed measures itself as mobile and we open the wrong layout. */
    return [
      "position:fixed",
      "left:-12000px",
      "top:0",
      "width:" + (desktop ? "700px" : "100vw"),
      "height:" + (desktop ? PANEL_H + "px" : "100vh"),
      "opacity:0",
      "pointer-events:none",
      "border:0",
      "color-scheme:light",
    ].join(";");
  }

  function overlayFrameStyles(desktop, visible) {
    if (desktop) {
      return [
        "color-scheme:light",
        "position:relative",
        "z-index:1",
        "width:100%",
        "max-width:700px",
        "min-width:640px",
        "height:" + PANEL_H + "px",
        "border:0",
        "background:transparent",
        "transition:height 320ms " + EASE + ",opacity 180ms ease",
        "opacity:" + (visible ? "1" : "0"),
      ].join(";");
    }
    return [
      "color-scheme:light",
      "flex:1",
      "width:100%",
      "height:100%",
      "border:0",
      "background:#f4f7fb",
      "opacity:" + (visible ? "1" : "0"),
      "transition:opacity 180ms ease",
    ].join(";");
  }

  function prefetch(roofer) {
    origin = origin || resolveOrigin();
    if (!origin || !roofer || !document.head) return;
    var href = widgetSrc(roofer, isDesktop());
    if (document.querySelector('link[data-belpa-prefetch="' + href + '"]')) {
      return;
    }
    var link = document.createElement("link");
    link.rel = "prefetch";
    link.href = href;
    link.setAttribute("data-belpa-prefetch", href);
    document.head.appendChild(link);
  }

  function warm(roofer) {
    origin = origin || resolveOrigin();
    if (!origin || !roofer || !document.body) return;
    if (document.getElementById(OVERLAY_ID)) return;
    var desktop = isDesktop();
    var key = widgetSrc(roofer, desktop);
    if (parked.frame && parked.key === key) return;
    if (parked.frame) parked.frame.remove();
    parked.ready = false;
    parked.roofer = roofer;
    parked.key = key;
    parked.frame = createFrame(roofer, desktop);
    parked.frame.setAttribute("aria-hidden", "true");
    parked.frame.style.cssText = parkStyles(desktop);
    ensureParkedListener();
    document.body.appendChild(parked.frame);
  }

  function takeParked(roofer, desktop) {
    var key = widgetSrc(roofer, desktop);
    if (parked.frame && parked.key === key) {
      var taken = { frame: parked.frame, ready: parked.ready };
      parked.frame = null;
      parked.key = "";
      parked.ready = false;
      parked.roofer = "";
      taken.frame.removeAttribute("aria-hidden");
      return taken;
    }
    return null;
  }

  function scheduleWarm(roofer) {
    if (!roofer) return;
    prefetch(roofer);
    var start = function () {
      warm(roofer);
    };
    if (typeof global.requestIdleCallback === "function") {
      global.requestIdleCallback(start, { timeout: 800 });
    } else {
      global.setTimeout(start, 400);
    }
  }

  function close(opts) {
    opts = opts || {};
    var overlay = document.getElementById(OVERLAY_ID);
    if (!overlay) return;
    var lastRoofer = overlay.__belpaRoofer;
    document.removeEventListener("keydown", onKeydown, true);
    if (overlay.__belpaOnMessage) {
      global.removeEventListener("message", overlay.__belpaOnMessage);
    }
    if (overlay.__belpaRevealTimer) {
      global.clearTimeout(overlay.__belpaRevealTimer);
    }
    document.documentElement.style.overflow = overlay.__belpaPrevOverflow || "";
    overlay.remove();
    if (!opts.skipWarm && lastRoofer) scheduleWarm(lastRoofer);
  }

  function onKeydown(e) {
    if (e.key === "Escape") {
      e.preventDefault();
      close();
    }
  }

  function reveal(overlay) {
    if (!overlay || overlay.__belpaRevealed) return;
    overlay.__belpaRevealed = true;
    var frame = overlay.__belpaFrame;
    var ph = overlay.__belpaPlaceholder;
    if (frame) {
      frame.style.opacity = "1";
      frame.style.transform = "none";
    }
    if (ph) {
      ph.style.opacity = "0";
      global.setTimeout(function () {
        if (ph.parentNode) ph.remove();
      }, 220);
    }
  }

  function makePlaceholder(desktop) {
    ensureSpinStyle();
    var el = document.createElement("div");
    el.setAttribute("aria-hidden", "true");
    if (desktop) {
      el.style.cssText = [
        "position:absolute",
        "inset:0",
        "display:flex",
        "align-items:center",
        "justify-content:center",
        "background:#fff",
        "border-radius:28px",
        "box-shadow:0 12px 28px -12px rgba(23,60,160,0.22)",
        "pointer-events:none",
        "transition:opacity 180ms ease",
      ].join(";");
    } else {
      el.style.cssText = [
        "position:absolute",
        "inset:0",
        "display:flex",
        "align-items:center",
        "justify-content:center",
        "background:#0b1220",
        "pointer-events:none",
        "transition:opacity 180ms ease",
      ].join(";");
    }
    el.innerHTML =
      '<div style="width:28px;height:28px;border:3px solid #e5eaf3;border-top-color:#2f6bff;border-radius:50%;animation:belpa-spin .7s linear infinite"></div>';
    return el;
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

    close({ skipWarm: true });

    var desktop = isDesktop();
    var blur = supportsBackdropBlur();
    var taken = takeParked(roofer, desktop);
    var frame = taken ? taken.frame : createFrame(roofer, desktop);
    var ready = !!(taken && taken.ready);
    var reduced = prefersReducedMotion();

    var overlay = document.createElement("div");
    overlay.id = OVERLAY_ID;
    overlay.setAttribute("role", "dialog");
    overlay.setAttribute("aria-modal", "true");
    overlay.setAttribute("aria-label", "Get a free roof quote");
    overlay.__belpaRoofer = roofer;
    overlay.__belpaFrame = frame;

    var overlayCss = [
      "position:fixed",
      "inset:0",
      "z-index:2147483646",
      "display:flex",
      "opacity:1",
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
      overlayCss.push(
        "flex-direction:column",
        "background:#0b1220",
        "position:fixed",
      );
    }
    overlay.style.cssText = overlayCss.join(";");

    var stage = overlay;
    if (desktop) {
      stage = document.createElement("div");
      stage.style.cssText = [
        "position:relative",
        "width:100%",
        "max-width:700px",
        "min-width:640px",
        "height:" + PANEL_H + "px",
      ].join(";");
      overlay.appendChild(stage);
    }

    if (!ready) {
      var placeholder = makePlaceholder(desktop);
      overlay.__belpaPlaceholder = placeholder;
      if (desktop) {
        stage.appendChild(placeholder);
      } else {
        overlay.appendChild(placeholder);
      }
    }

    frame.style.cssText = overlayFrameStyles(desktop, ready || reduced);

    overlay.__belpaPrevOverflow = document.documentElement.style.overflow;
    document.documentElement.style.overflow = "hidden";

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

      var sawExpanded = ready;
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
          reveal(overlay);
        } else if (mode === "collapsed" && sawExpanded) {
          // The panel's own X (or a finished flow) — dismiss the overlay too,
          // rather than leaving a collapsed search bar floating in a modal.
          close();
        }
      };
      overlay.__belpaOnMessage = onMessage;
      global.addEventListener("message", onMessage);
      try {
        if (frame.contentWindow) {
          frame.contentWindow.postMessage(
            { source: "belpa-host", action: "sync" },
            origin,
          );
        }
      } catch (err) {
        /* parked document may not be same-origin-ready yet */
      }
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

    if (desktop) stage.appendChild(frame);
    else overlay.appendChild(frame);

    document.body.appendChild(overlay);
    document.addEventListener("keydown", onKeydown, true);

    if (ready) {
      reveal(overlay);
    } else {
      frame.addEventListener("load", function () {
        /* Desktop waits for the expanded postMessage so we don't flash the
           collapsed search bar. Mobile /l/ has no such handshake — load is
           the moment the page is there. */
        if (!desktop) reveal(overlay);
      });
      overlay.__belpaRevealTimer = global.setTimeout(function () {
        reveal(overlay);
      }, 2500);
    }

    if (overlay.__belpaCloseBtn) overlay.__belpaCloseBtn.focus();
  }

  function bindButtons() {
    var nodes = document.querySelectorAll(
      "[data-belpa-launch]:not([data-belpa-launch-bound])",
    );
    var firstRoofer = defaultRoofer();
    for (var i = 0; i < nodes.length; i++) {
      (function (btn) {
        btn.setAttribute("data-belpa-launch-bound", "1");
        var slug = function () {
          return btn.getAttribute("data-roofer") || defaultRoofer();
        };
        btn.addEventListener("click", function (e) {
          e.preventDefault();
          open({ roofer: slug() });
        });
        btn.addEventListener("pointerenter", function () {
          warm(slug());
        });
        btn.addEventListener("focus", function () {
          warm(slug());
        });
        if (!firstRoofer) firstRoofer = slug();
      })(nodes[i]);
    }
    if (firstRoofer) scheduleWarm(firstRoofer);
  }

  var api = { open: open, close: close, bind: bindButtons };
  global.BelpaLaunch = api;

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", bindButtons);
  } else {
    bindButtons();
  }
})(typeof window !== "undefined" ? window : this);
