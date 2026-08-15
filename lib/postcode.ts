/** Compact UK postcode for APIs: "SW19 4EH" -> "SW194EH". */
export function normalisePostcode(value: string): string {
  return value.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

/**
 * Pull a UK postcode out of whatever the visitor typed.
 *
 * The field asks for a postcode, so people paste an address — a tester entered
 * "HP13 5BP, 8 MAITLAND DRIVE" and was told to "Enter a valid UK postcode".
 * normalisePostcode strips punctuation from the WHOLE string, so that became
 * "HP135BP8MAITLANDDRIVE" and failed the shape test. The postcode was right
 * there in the box, correctly formatted, and we rejected it.
 *
 * Matching a substring rather than the entire value fixes the whole class:
 * postcode first, postcode last, with or without commas, house name in front.
 *
 * Takes the LAST match, because a UK address conventionally ends with its
 * postcode — if something earlier in the string also happens to fit the shape,
 * the trailing one is the real one.
 */
export function extractPostcode(value: string): string | null {
  const upper = value.toUpperCase();
  if (/\bGIR\s*0AA\b/.test(upper)) return "GIR0AA";

  // \b at the end would not fire after a letter followed by end-of-string in
  // some inputs, so the inward code is bounded by a non-alphanumeric or the end.
  const pattern =
    /(?:^|[^A-Z0-9])([A-Z]{1,2}\d[A-Z\d]?)\s*(\d[A-Z]{2})(?![A-Z0-9])/g;
  let match: RegExpExecArray | null;
  let last: string | null = null;
  while ((match = pattern.exec(upper)) !== null) {
    last = `${match[1]}${match[2]}`;
  }
  return last;
}

/**
 * Rough UK postcode shape (outward + inward).
 *
 * True when the value CONTAINS a postcode, not only when it is one — see
 * extractPostcode. Callers that need the postcode itself should use that
 * directly rather than passing the raw value on to an API.
 */
export function looksLikeUkPostcode(value: string): boolean {
  return extractPostcode(value) !== null;
}

/**
 * Why a postcode was rejected, phrased for a homeowner.
 *
 * One message for every failure ("Enter a valid UK postcode to get a quote")
 * told someone who had typed most of their postcode the same thing as someone
 * who had typed nothing, and read as a rebuke either way. These name the actual
 * problem and stay short enough to sit under the field without wrapping.
 *
 * Returns null when the value is fine.
 */
export function postcodeError(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return "Enter your postcode";
  if (extractPostcode(trimmed)) return null;

  // Started a real postcode and stopped short — "HP13", "HP13 5B". Far more
  // common than nonsense, and worth distinguishing: they need one more
  // character, not a correction.
  const compact = normalisePostcode(trimmed);
  if (/^[A-Z]{1,2}\d[A-Z\d]?\d?[A-Z]?$/.test(compact)) {
    return "That postcode looks unfinished";
  }

  return "That doesn’t look like a UK postcode";
}

/**
 * "SW194EH" -> "SW19 4EH" for display.
 *
 * Prefers the extracted postcode, so pasting a whole address displays the
 * postcode rather than the address with its spaces removed.
 */
export function prettyPostcode(value: string): string {
  const compact = extractPostcode(value) ?? normalisePostcode(value);
  if (compact.length < 5) return value.trim().toUpperCase();
  return `${compact.slice(0, -3)} ${compact.slice(-3)}`;
}
