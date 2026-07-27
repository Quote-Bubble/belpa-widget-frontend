/**
 * Vector recreation of the soft blue-wave Quote Link backdrop.
 * Distinct sweeping ribbons (light blur only) — not a single soft blob.
 */
export function QuoteLinkBackdrop() {
  return (
    <div className="quote-link__sky" aria-hidden>
      <svg
        className="quote-link__art"
        viewBox="0 0 1600 900"
        preserveAspectRatio="xMidYMid slice"
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          <linearGradient id="ql-base" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#fcfcfd" />
            <stop offset="50%" stopColor="#f6f8fb" />
            <stop offset="100%" stopColor="#eef2f7" />
          </linearGradient>

          <linearGradient id="ql-ribbon-1" x1="0" y1="0" x2="1" y2="0.15">
            <stop offset="0%" stopColor="#4f8bff" stopOpacity="0.72" />
            <stop offset="35%" stopColor="#7aa8ff" stopOpacity="0.45" />
            <stop offset="70%" stopColor="#b6cef8" stopOpacity="0.22" />
            <stop offset="100%" stopColor="#e8eef8" stopOpacity="0.06" />
          </linearGradient>
          <linearGradient id="ql-ribbon-2" x1="0" y1="0.1" x2="1" y2="0">
            <stop offset="0%" stopColor="#6ea0f0" stopOpacity="0.55" />
            <stop offset="40%" stopColor="#9bbcf5" stopOpacity="0.32" />
            <stop offset="100%" stopColor="#ffffff" stopOpacity="0.04" />
          </linearGradient>
          <linearGradient id="ql-ribbon-3" x1="0" y1="0" x2="1" y2="0.2">
            <stop offset="0%" stopColor="#8eb4f2" stopOpacity="0.4" />
            <stop offset="55%" stopColor="#c5d6f5" stopOpacity="0.2" />
            <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
          </linearGradient>
          <linearGradient id="ql-bloom" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#5b92f5" stopOpacity="0.5" />
            <stop offset="100%" stopColor="#a8c4f0" stopOpacity="0.08" />
          </linearGradient>

          {/* Light edge soften only — keep ribbon shape readable */}
          <filter
            id="ql-edge"
            x="-8%"
            y="-8%"
            width="116%"
            height="116%"
          >
            <feGaussianBlur stdDeviation="6" />
          </filter>
          <filter
            id="ql-edge-soft"
            x="-12%"
            y="-12%"
            width="124%"
            height="124%"
          >
            <feGaussianBlur stdDeviation="10" />
          </filter>
        </defs>

        <rect width="1600" height="900" fill="url(#ql-base)" />

        {/* Corner bloom — still soft, anchors the composition */}
        <ellipse
          cx="40"
          cy="900"
          rx="520"
          ry="300"
          fill="url(#ql-bloom)"
          filter="url(#ql-edge-soft)"
        />

        {/* Distinct sweeping ribbons (bottom → right) */}
        <g filter="url(#ql-edge)">
          {/* Back ribbon — highest / thinnest arc */}
          <path
            fill="url(#ql-ribbon-3)"
            d="M -100 720
               C 120 560, 320 600, 520 640
               C 780 700, 980 560, 1220 600
               C 1420 640, 1540 620, 1700 560
               L 1700 700
               C 1540 740, 1420 760, 1220 720
               C 980 680, 780 820, 520 760
               C 320 720, 120 700, -100 820
               Z"
          />
          {/* Mid ribbon */}
          <path
            fill="url(#ql-ribbon-2)"
            d="M -100 780
               C 160 620, 360 680, 560 720
               C 820 780, 1020 640, 1260 680
               C 1460 720, 1560 700, 1700 650
               L 1700 800
               C 1560 830, 1460 850, 1260 810
               C 1020 770, 820 900, 560 850
               C 360 810, 160 780, -100 880
               Z"
          />
          {/* Front ribbon — strongest, lowest */}
          <path
            fill="url(#ql-ribbon-1)"
            d="M -100 840
               C 200 700, 400 760, 620 800
               C 900 860, 1100 740, 1340 780
               C 1520 820, 1600 800, 1700 760
               L 1700 980 L -100 980
               Z"
          />
        </g>

        {/* Keep the upper/center airy for the card */}
        <ellipse
          cx="820"
          cy="80"
          rx="980"
          ry="300"
          fill="#ffffff"
          opacity="0.65"
          filter="url(#ql-edge-soft)"
        />
      </svg>

      <div className="quote-link__grain" />
    </div>
  );
}
