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
 * The iframe must stay on the same parent node for its whole life. Moving it
 * (body → overlay) makes browsers reload the document. The reloaded widget
 * boots on the collapsed search bar and posts `collapsed`; if we still thought
 * it was expanded from the previous load, that message looked like the user
 * hitting X and the overlay vanished.
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
 * parked (off-screen) wrapper uses the same 700px width for the same reason.
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
  var park = {
    wrap: null,
    stage: null,
    frame: null,
    key: "",
    roofer: "",
    desktop: false,
    ready: false,
    open: false,
    sawExpanded: false,
  };
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
    s.textContent = "@keyframes belpa-spin{to{transform:rotate(360deg)}}";
    document.head.appendChild(s);
  }

  function postToFrame(action) {
    try {
      if (!park.frame || !park.frame.contentWindow || !origin) return;
      park.frame.contentWindow.postMessage(
        { source: "belpa-host", action: action },
        origin,
      );
    } catch (err) {
      /* document may not be ready yet */
    }
  }

  function frameStyles(desktop) {
    if (desktop) {
      return [
        "color-scheme:light",
        "position:relative",
        "z-index:1",
        "width:100%",
        "height:100%",
        "border:0",
        "background:transparent",
      ].join(";");
    }
    return [
      "color-scheme:light",
      "flex:1",
      "width:100%",
      "height:100%",
      "border:0",
      "background:#f4f7fb",
    ].join(";");
  }

  function applyParkedWrap() {
    var wrap = park.wrap;
    if (!wrap) return;
    wrap.removeAttribute("id");
    wrap.setAttribute("aria-hidden", "true");
    wrap.style.cssText = [
      "position:fixed",
      "left:-12000px",
      "top:0",
      "width:" + (park.desktop ? "700px" : "100vw"),
      "height:" + (park.desktop ? PANEL_H + "px" : "100vh"),
      "opacity:0",
      "pointer-events:none",
      "display:flex",
      "flex-direction:" + (park.desktop ? "row" : "column"),
      "z-index:-1",
    ].join(";");
  }

  function applyOpenWrap() {
    var wrap = park.wrap;
    var blur = supportsBackdropBlur();
    wrap.id = OVERLAY_ID;
    wrap.removeAttribute("aria-hidden");
    var css = [
      "position:fixed",
      "inset:0",
      "z-index:2147483646",
      "display:flex",
      "opacity:1",
      "pointer-events:auto",
    ];
    if (park.desktop) {
      css.push(
        "align-items:center",
        "justify-content:center",
        "padding:1rem",
        "box-sizing:border-box",
        "background:rgba(9,18,40," + (blur ? "0.42" : "0.62") + ")",
      );
      if (blur) {
        css.push(
          "backdrop-filter:blur(10px) saturate(1.1)",
          "-webkit-backdrop-filter:blur(10px) saturate(1.1)",
        );
      }
    } else {
      css.push("flex-direction:column", "background:#0b1220");
    }
    wrap.style.cssText = css.join(";");
  }

  function makePlaceholder() {
    ensureSpinStyle();
    var el = document.createElement("div");
    el.setAttribute("aria-hidden", "true");
    if (park.desktop) {
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
        "z-index:2",
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
        "z-index:2",
      ].join(";");
    }
    el.innerHTML =
      '<div style="width:28px;height:28px;border:3px solid #e5eaf3;border-top-color:#2f6bff;border-radius:50%;animation:belpa-spin .7s linear infinite"></div>';
    return el;
  }

  function showPlaceholder() {
    hidePlaceholder();
    var host = park.desktop ? park.stage : park.wrap;
    if (!host) return;
    var ph = makePlaceholder();
    park.placeholder = ph;
    host.appendChild(ph);
    if (park.frame) park.frame.style.opacity = "0";
  }

  function hidePlaceholder() {
    var ph = park.placeholder;
    park.placeholder = null;
    if (!ph) return;
    ph.style.opacity = "0";
    global.setTimeout(function () {
      if (ph.parentNode) ph.remove();
    }, 180);
    if (park.frame) park.frame.style.opacity = "1";
  }

  function reveal() {
    hidePlaceholder();
  }

  function destroyPark() {
    if (park.wrap && park.wrap.parentNode) park.wrap.remove();
    document.removeEventListener("keydown", onKeydown, true);
    park.wrap = null;
    park.stage = null;
    park.frame = null;
    park.placeholder = null;
    park.key = "";
    park.roofer = "";
    park.ready = false;
    park.open = false;
    park.sawExpanded = false;
  }

  function onFrameMessage(e) {
    if (e.origin !== origin) return;
    var d = e.data;
    if (!d || d.source !== "belpa-embed") return;
    if (typeof d.sizes === "object" && d.sizes && d.sizes.expanded > 0) {
      PANEL_H = d.sizes.expanded;
    }
    var mode = typeof d.mode === "string" ? d.mode : "collapsed";
    if (mode === "expanded" || mode === "overlay" || mode === "suggesting") {
      park.ready = true;
      if (mode !== "suggesting") park.sawExpanded = true;
      if (park.open) {
        var h = typeof d.height === "number" && d.height > 0 ? d.height : 0;
        if (h && park.desktop && park.stage) {
          park.stage.style.height = h + "px";
        }
        reveal();
      }
    } else if (mode === "collapsed") {
      park.ready = false;
      /* Only the panel X (or a finished flow) should dismiss the overlay, and
         only after THIS opening actually reached the expanded card. A boot
         `collapsed` from a fresh document must not look like a close. */
      if (park.open && park.sawExpanded) close();
    }
  }

  function ensureShell(roofer, desktop) {
    origin = origin || resolveOrigin();
    if (!origin || !roofer || !document.body) return false;
    var key = widgetSrc(roofer, desktop);
    if (park.wrap && park.key === key) return true;
    destroyPark();

    var wrap = document.createElement("div");
    wrap.setAttribute("role", "dialog");
    wrap.setAttribute("aria-modal", "true");
    wrap.setAttribute("aria-label", "Get a free roof quote");
    wrap.__belpaRoofer = roofer;

    var stage = wrap;
    if (desktop) {
      stage = document.createElement("div");
      stage.style.cssText = [
        "position:relative",
        "width:100%",
        "max-width:700px",
        "min-width:640px",
        "height:" + PANEL_H + "px",
      ].join(";");
      wrap.appendChild(stage);
    } else {
      wrap.style.position = "relative";
      var closeBtn = document.createElement("button");
      closeBtn.type = "button";
      closeBtn.setAttribute("aria-label", "Close quote");
      closeBtn.textContent = "✕";
      closeBtn.style.cssText = [
        "position:absolute",
        "top:max(12px, env(safe-area-inset-top))",
        "right:max(12px, env(safe-area-inset-right))",
        "z-index:3",
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
      closeBtn.addEventListener("click", function () {
        close();
      });
      wrap.appendChild(closeBtn);
    }

    var frame = document.createElement("iframe");
    frame.src = key;
    frame.title = "Get a free roof quote";
    frame.loading = "eager";
    frame.setAttribute(
      "sandbox",
      "allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox",
    );
    frame.style.cssText = frameStyles(desktop);
    frame.style.opacity = "0";
    frame.addEventListener("load", function () {
      /* /l/ has no expanded handshake — the page being there is the reveal. */
      if (!park.desktop) {
        park.ready = true;
        if (park.open) reveal();
      }
    });
    stage.appendChild(frame);

    wrap.addEventListener("click", function (e) {
      if (e.target === wrap) close();
    });

    park.wrap = wrap;
    park.stage = desktop ? stage : wrap;
    park.frame = frame;
    park.key = key;
    park.roofer = roofer;
    park.desktop = desktop;
    park.ready = false;
    park.open = false;
    park.sawExpanded = false;

    applyParkedWrap();
    document.body.appendChild(wrap);
    return true;
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
    if (!roofer) return;
    if (park.open) return;
    ensureShell(roofer, isDesktop());
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

  function close() {
    if (!park.wrap || !park.open) return;
    park.open = false;
    park.sawExpanded = false;
    document.removeEventListener("keydown", onKeydown, true);
    document.documentElement.style.overflow = park.prevOverflow || "";
    hidePlaceholder();
    applyParkedWrap();
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

    var desktop = isDesktop();
    if (!ensureShell(roofer, desktop)) return;

    if (park.open) return;

    park.open = true;
    park.sawExpanded = park.ready;
    park.prevOverflow = document.documentElement.style.overflow;
    document.documentElement.style.overflow = "hidden";
    applyOpenWrap();
    document.addEventListener("keydown", onKeydown, true);

    if (park.ready) {
      reveal();
      postToFrame("sync");
    } else {
      showPlaceholder();
      /* Warmed /w/ may already have collapsed after the user hit X. Ask it
         to expand again rather than reloading the iframe. */
      if (desktop) postToFrame("open");
    }

    if (prefersReducedMotion() && park.ready) reveal();
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

  global.addEventListener("message", onFrameMessage);

  var api = { open: open, close: close, bind: bindButtons };
  global.BelpaLaunch = api;

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", bindButtons);
  } else {
    bindButtons();
  }
})(typeof window !== "undefined" ? window : this);
