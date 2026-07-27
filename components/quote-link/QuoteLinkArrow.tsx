/**
 * Hand-drawn curly arrow pointing down toward the quote card.
 * Tall enough to bridge the gap from the raised prompt to the widget.
 */
export function QuoteLinkArrow() {
  return (
    <svg
      className="quote-link__arrow"
      viewBox="0 0 120 140"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
    >
      <path
        className="quote-link__arrow-path"
        d="M58 8
           C 40 28, 30 46, 36 68
           C 42 90, 62 98, 78 84
           C 92 72, 86 54, 70 60
           C 52 68, 54 96, 62 128"
        stroke="currentColor"
        strokeWidth="2.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        className="quote-link__arrow-head"
        d="M50 118 L62 132 L78 112"
        stroke="currentColor"
        strokeWidth="2.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
