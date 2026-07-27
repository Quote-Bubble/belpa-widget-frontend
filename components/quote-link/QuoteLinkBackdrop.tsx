/**
 * Soft blue-wave Quote Link backdrop — ribbons across the full bottom edge,
 * light edge soften only (readable curves, not a left-corner blob).
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
            <stop offset="55%" stopColor="#f7f9fb" />
            <stop offset="100%" stopColor="#eef2f7" />
          </linearGradient>

          {/* Left → right fade so energy spans the width, not one corner */}
          <linearGradient id="ql-r1" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#4f8bff" stopOpacity="0.55" />
            <stop offset="50%" stopColor="#7aa8ff" stopOpacity="0.42" />
            <stop offset="100%" stopColor="#9bbcf5" stopOpacity="0.28" />
          </linearGradient>
          <linearGradient id="ql-r2" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#6ea0f0" stopOpacity="0.4" />
            <stop offset="55%" stopColor="#8eb4f2" stopOpacity="0.34" />
            <stop offset="100%" stopColor="#b6cef8" stopOpacity="0.22" />
          </linearGradient>
          <linearGradient id="ql-r3" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#8eb4f2" stopOpacity="0.28" />
            <stop offset="50%" stopColor="#a8c4f0" stopOpacity="0.24" />
            <stop offset="100%" stopColor="#c5d6f5" stopOpacity="0.16" />
          </linearGradient>

          <filter id="ql-edge" x="-4%" y="-4%" width="108%" height="108%">
            <feGaussianBlur stdDeviation="2.5" />
          </filter>
        </defs>

        <rect width="1600" height="900" fill="url(#ql-base)" />

        <g filter="url(#ql-edge)">
          {/* Top ribbon — spans full width, gentle undulation */}
          <path
            fill="url(#ql-r3)"
            d="M -40 640
               C 200 580, 400 700, 640 650
               C 900 590, 1100 700, 1360 640
               C 1500 600, 1580 620, 1640 600
               L 1640 700
               C 1580 720, 1500 700, 1360 740
               C 1100 800, 900 700, 640 750
               C 400 800, 200 700, -40 740
               Z"
          />
          {/* Mid ribbon */}
          <path
            fill="url(#ql-r2)"
            d="M -40 720
               C 220 660, 420 780, 680 720
               C 940 660, 1140 780, 1400 720
               C 1520 690, 1580 710, 1640 690
               L 1640 800
               C 1580 820, 1520 800, 1400 830
               C 1140 880, 940 780, 680 830
               C 420 880, 220 790, -40 820
               Z"
          />
          {/* Front ribbon — lowest band, full width */}
          <path
            fill="url(#ql-r1)"
            d="M -40 800
               C 240 740, 460 860, 720 800
               C 980 740, 1180 860, 1440 800
               C 1540 770, 1590 790, 1640 780
               L 1640 980 L -40 980
               Z"
          />
        </g>
      </svg>

      <div className="quote-link__grain" />
    </div>
  );
}
