/**
 * Quote Link backdrop — soft diagonal light-blue streaks
 * (top-right → bottom-left), matching the pale streak design.
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
          <linearGradient id="ql-base" x1="0" y1="0" x2="0.3" y2="1">
            <stop offset="0%" stopColor="#fbfcfd" />
            <stop offset="100%" stopColor="#f3f5f8" />
          </linearGradient>
          <linearGradient id="ql-streak" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#ffffff" stopOpacity="0" />
            <stop offset="35%" stopColor="#9ec0ff" stopOpacity="0.45" />
            <stop offset="65%" stopColor="#c5d8ff" stopOpacity="0.28" />
            <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
          </linearGradient>
          <linearGradient id="ql-streak-soft" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#ffffff" stopOpacity="0" />
            <stop offset="40%" stopColor="#b8d0ff" stopOpacity="0.32" />
            <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
          </linearGradient>
          <filter
            id="ql-blur"
            x="-30%"
            y="-30%"
            width="160%"
            height="160%"
          >
            <feGaussianBlur stdDeviation="48" />
          </filter>
        </defs>

        <rect width="1600" height="900" fill="url(#ql-base)" />

        {/* Broad diagonal streaks: top-right → bottom-left */}
        <g filter="url(#ql-blur)">
          <ellipse
            cx="1180"
            cy="180"
            rx="780"
            ry="160"
            fill="url(#ql-streak)"
            transform="rotate(-38 1180 180)"
          />
          <ellipse
            cx="980"
            cy="320"
            rx="860"
            ry="140"
            fill="url(#ql-streak-soft)"
            transform="rotate(-38 980 320)"
          />
          <ellipse
            cx="720"
            cy="480"
            rx="920"
            ry="150"
            fill="url(#ql-streak)"
            transform="rotate(-38 720 480)"
            opacity="0.85"
          />
          <ellipse
            cx="460"
            cy="640"
            rx="880"
            ry="130"
            fill="url(#ql-streak-soft)"
            transform="rotate(-38 460 640)"
          />
          <ellipse
            cx="220"
            cy="800"
            rx="760"
            ry="120"
            fill="url(#ql-streak)"
            transform="rotate(-38 220 800)"
            opacity="0.7"
          />
          {/* Soft white wash so the card area stays airy */}
          <ellipse
            cx="800"
            cy="360"
            rx="520"
            ry="380"
            fill="#ffffff"
            opacity="0.55"
          />
        </g>
      </svg>
    </div>
  );
}
