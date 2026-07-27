/**
 * Vector recreation of the soft blue-wave Quote Link backdrop.
 * Infinite resolution, ~2KB — no bitmap download.
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
            <stop offset="0%" stopColor="#fbfcfd" />
            <stop offset="55%" stopColor="#f5f7fa" />
            <stop offset="100%" stopColor="#eef2f7" />
          </linearGradient>
          <linearGradient id="ql-wave-a" x1="0" y1="0" x2="1" y2="0.3">
            <stop offset="0%" stopColor="#6ea0f0" stopOpacity="0.55" />
            <stop offset="45%" stopColor="#9bbcf5" stopOpacity="0.28" />
            <stop offset="100%" stopColor="#d7e4f8" stopOpacity="0.05" />
          </linearGradient>
          <linearGradient id="ql-wave-b" x1="0" y1="0.2" x2="1" y2="0">
            <stop offset="0%" stopColor="#8eb4f2" stopOpacity="0.42" />
            <stop offset="55%" stopColor="#c5d6f5" stopOpacity="0.18" />
            <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
          </linearGradient>
          <linearGradient id="ql-wave-c" x1="0.1" y1="0" x2="0.9" y2="0.4">
            <stop offset="0%" stopColor="#a8c4f0" stopOpacity="0.22" />
            <stop offset="100%" stopColor="#e8eef8" stopOpacity="0.04" />
          </linearGradient>
          <filter
            id="ql-soft"
            x="-20%"
            y="-20%"
            width="140%"
            height="140%"
          >
            <feGaussianBlur stdDeviation="28" />
          </filter>
          <filter
            id="ql-softer"
            x="-25%"
            y="-25%"
            width="150%"
            height="150%"
          >
            <feGaussianBlur stdDeviation="42" />
          </filter>
        </defs>

        <rect width="1600" height="900" fill="url(#ql-base)" />

        {/* Soft corner bloom — strongest blue, bottom-left */}
        <ellipse
          cx="80"
          cy="920"
          rx="720"
          ry="380"
          fill="#7aa8ff"
          opacity="0.38"
          filter="url(#ql-softer)"
        />

        {/* Sweeping translucent ribbons */}
        <g filter="url(#ql-soft)">
          <path
            fill="url(#ql-wave-a)"
            d="M-80 780
               C 180 620, 380 700, 560 740
               C 820 800, 980 620, 1180 680
               C 1380 740, 1520 700, 1680 640
               L 1680 980 L -80 980 Z"
          />
          <path
            fill="url(#ql-wave-b)"
            d="M-60 820
               C 220 680, 420 760, 640 790
               C 900 830, 1080 680, 1320 730
               C 1500 770, 1620 740, 1700 700
               L 1700 980 L -60 980 Z"
          />
          <path
            fill="url(#ql-wave-c)"
            d="M 200 860
               C 480 720, 700 800, 920 820
               C 1180 850, 1360 740, 1600 780
               L 1600 980 L 200 980 Z"
          />
        </g>

        {/* Upper air — keeps the center/top clean for the card */}
        <ellipse
          cx="800"
          cy="120"
          rx="900"
          ry="320"
          fill="#ffffff"
          opacity="0.55"
          filter="url(#ql-softer)"
        />
      </svg>

      {/* Fine grain — CSS, no image */}
      <div className="quote-link__grain" />
    </div>
  );
}
