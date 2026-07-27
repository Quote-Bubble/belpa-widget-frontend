/**
 * Quote Link backdrop — crisp architectural horizon bands + contour strokes.
 * No blur filters. Built to contrast the white widget without wrapping it.
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
            <stop offset="0%" stopColor="#f8fafc" />
            <stop offset="100%" stopColor="#e8eef5" />
          </linearGradient>
          <linearGradient id="ql-band" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#2f6bff" stopOpacity="0.14" />
            <stop offset="50%" stopColor="#2f6bff" stopOpacity="0.1" />
            <stop offset="100%" stopColor="#2f6bff" stopOpacity="0.16" />
          </linearGradient>
          <linearGradient id="ql-band-deep" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#1f57f0" stopOpacity="0.2" />
            <stop offset="100%" stopColor="#4f8bff" stopOpacity="0.14" />
          </linearGradient>
          <filter
            id="ql-blur"
            x="-20%"
            y="-20%"
            width="140%"
            height="140%"
          >
            <feGaussianBlur stdDeviation="36" />
          </filter>
          <filter
            id="ql-blur-lines"
            x="-15%"
            y="-15%"
            width="130%"
            height="130%"
          >
            <feGaussianBlur stdDeviation="18" />
          </filter>
        </defs>

        <rect width="1600" height="900" fill="url(#ql-base)" />

        {/* Quiet measurement grid — upper field stays calm for the card */}
        <g stroke="#2f6bff" strokeOpacity="0.045" strokeWidth="1" fill="none">
          {Array.from({ length: 16 }, (_, i) => (
            <line
              key={`v-${i}`}
              x1={100 + i * 100}
              y1="0"
              x2={100 + i * 100}
              y2="900"
            />
          ))}
          {Array.from({ length: 9 }, (_, i) => (
            <line
              key={`h-${i}`}
              x1="0"
              y1={100 + i * 100}
              x2="1600"
              y2={100 + i * 100}
            />
          ))}
        </g>

        {/* Solid horizon bands — heavy soft blur */}
        <g filter="url(#ql-blur)">
          <path
            fill="url(#ql-band)"
            d="M0 620
               C 260 560, 520 680, 800 620
               C 1080 560, 1340 680, 1600 620
               L 1600 900 L 0 900 Z"
          />
          <path
            fill="url(#ql-band)"
            d="M0 700
               C 280 650, 540 760, 820 700
               C 1100 640, 1360 760, 1600 700
               L 1600 900 L 0 900 Z"
          />
          <path
            fill="url(#ql-band-deep)"
            d="M0 790
               C 300 740, 560 850, 840 790
               C 1120 730, 1380 850, 1600 790
               L 1600 900 L 0 900 Z"
          />
        </g>

        {/* Contour strokes — softened */}
        <g
          filter="url(#ql-blur-lines)"
          fill="none"
          stroke="#1f57f0"
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path
            strokeOpacity="0.45"
            d="M0 618 C 260 558, 520 678, 800 618 C 1080 558, 1340 678, 1600 618"
          />
          <path
            strokeOpacity="0.35"
            d="M0 698 C 280 648, 540 758, 820 698 C 1100 638, 1360 758, 1600 698"
          />
          <path
            strokeOpacity="0.5"
            d="M0 788 C 300 738, 560 848, 840 788 C 1120 728, 1380 848, 1600 788"
          />
          <path
            strokeOpacity="0.25"
            strokeWidth="2"
            d="M0 560 C 240 510, 500 600, 780 550 C 1060 500, 1320 600, 1600 540"
          />
        </g>
      </svg>
    </div>
  );
}
