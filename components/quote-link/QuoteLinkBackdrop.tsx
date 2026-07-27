/**
 * Quote Link backdrop — crisp stacked diagonal planes (BL → TR).
 * Inspired by sharp paper/architecture banding. No blur filters.
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
          <linearGradient id="ql-base" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#ffffff" />
            <stop offset="100%" stopColor="#f2f5f9" />
          </linearGradient>
          {/* Cool pale blue for the “shadow” faces between planes */}
          <linearGradient id="ql-face" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#e7eef8" />
            <stop offset="100%" stopColor="#d5e2f3" />
          </linearGradient>
          <linearGradient id="ql-face-soft" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#eef3f9" />
            <stop offset="100%" stopColor="#dde8f5" />
          </linearGradient>
          <linearGradient id="ql-lit" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#ffffff" />
            <stop offset="100%" stopColor="#f7f9fc" />
          </linearGradient>
        </defs>

        <rect width="1600" height="900" fill="url(#ql-base)" />

        {/*
          Stacked diagonal slabs (bottom-left → top-right).
          Alternating lit / shaded faces for a stepped paper depth look.
          Angle ~32° via parallelogram strips.
        */}
        {/* Back shade band */}
        <polygon
          fill="url(#ql-face-soft)"
          points="
            -200,980
            400,980
            2100,-120
            1500,-120
          "
        />
        {/* Lit plane */}
        <polygon
          fill="url(#ql-lit)"
          points="
            280,980
            720,980
            2420,-120
            1980,-120
          "
        />
        {/* Shade plane */}
        <polygon
          fill="url(#ql-face)"
          points="
            620,980
            980,980
            2680,-120
            2320,-120
          "
        />
        {/* Lit plane */}
        <polygon
          fill="url(#ql-lit)"
          points="
            900,980
            1220,980
            2920,-120
            2600,-120
          "
        />
        {/* Deeper shade — denser bottom-right */}
        <polygon
          fill="url(#ql-face)"
          points="
            1140,980
            1600,980
            3300,-120
            2840,-120
          "
        />
        {/* Thin highlight edge strips for crisp layer separation */}
        <g stroke="#ffffff" strokeWidth="3" fill="none" opacity="0.9">
          <line x1="400" y1="980" x2="2100" y2="-120" />
          <line x1="720" y1="980" x2="2420" y2="-120" />
          <line x1="980" y1="980" x2="2680" y2="-120" />
          <line x1="1220" y1="980" x2="2920" y2="-120" />
        </g>
        <g stroke="#c5d4ea" strokeWidth="1.25" fill="none" opacity="0.7">
          <line x1="280" y1="980" x2="1980" y2="-120" />
          <line x1="620" y1="980" x2="2320" y2="-120" />
          <line x1="900" y1="980" x2="2600" y2="-120" />
          <line x1="1140" y1="980" x2="2840" y2="-120" />
        </g>

        {/* Soft open white field toward top-left (card sits here) */}
        <polygon
          fill="#ffffff"
          fillOpacity="0.72"
          points="
            -100,-100
            1100,-100
            200,1000
            -100,1000
          "
        />
      </svg>
    </div>
  );
}
