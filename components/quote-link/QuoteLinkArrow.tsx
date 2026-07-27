/**
 * Hand-drawn curly arrow pointing down toward the quote card.
 */
export function QuoteLinkArrow() {
  return (
    <svg
      className="quote-link__arrow"
      viewBox="0 0 120 88"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
    >
      <path
        className="quote-link__arrow-path"
        d="M58 6
           C 42 22, 34 34, 38 48
           C 42 62, 58 68, 72 58
           C 82 50, 78 38, 66 42
           C 52 48, 54 68, 62 80"
        stroke="currentColor"
        strokeWidth="2.25"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        className="quote-link__arrow-head"
        d="M52 72 L62 82 L74 68"
        stroke="currentColor"
        strokeWidth="2.25"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
