/**
 * Hand-drawn curly arrow pointing down toward the quote card.
 * Tall enough to bridge the raised prompt → widget gap.
 */
export function QuoteLinkArrow() {
  return (
    <svg
      className="quote-link__arrow"
      viewBox="0 0 80 120"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
    >
      <path
        className="quote-link__arrow-path"
        pathLength={1}
        d="M40 6
           C 28 22, 22 36, 26 52
           C 30 68, 44 74, 54 64
           C 62 56, 58 46, 48 50
           C 36 56, 38 78, 40 108"
        stroke="currentColor"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        className="quote-link__arrow-head"
        pathLength={1}
        d="M30 96 L40 112 L52 94"
        stroke="currentColor"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
