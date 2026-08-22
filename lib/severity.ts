/**
 * How a photo-derived severity score reshapes an estimate.
 *
 * The rule the product asks for is "same money, tighter range, sitting high or
 * low" — never a visible "severity surcharge" line. So this does not add a line
 * item and does not touch the rate table. It takes the band the engine already
 * produced and picks a narrower sub-range of it, positioned by severity:
 *
 *     severity 1  |####------------|   sits low
 *     severity 3  |------####------|   centred
 *     severity 5  |------------####|   sits high
 *
 * Because it operates on a finished QuoteResult, a null severity is a literal
 * early return of the same object — "customer skipped photos" cannot diverge
 * from "before this feature existed" even by a rounding error. The tests assert
 * exactly that.
 *
 * Why these magnitudes:
 *
 *  - SKEW ±0.70 keeps severity 1 and 5 near the ends of the band the engine
 *    already thought was plausible, rather than inventing a new price. The
 *    overshoot past the old end is ~4-6%, comfortably inside the 10-15%
 *    contingency UK renovation guidance says to hold for standard work (and
 *    far inside the 20-25% advised for older properties).
 *  - NARROWING 0.35 is deliberately modest. Photographs resolve *extent*, not
 *    the hidden batten and felt condition that drives the biggest overruns —
 *    UK sources are consistent that rotten battens and perished felt are only
 *    found once the covering is lifted. The range has to stay wide enough to
 *    survive the site visit.
 *
 * Both numbers are reasoned from published cost spreads, not measured against
 * this company's own outcomes. The dashboard already records
 * leads.actual_price_ex_vat and computes won-price variance against the
 * estimate; recalibrate from that once ~50 severity-scored jobs have closed.
 */
import type { DamageSeverity, QuoteResult } from "@/lib/types";

/** Where in the existing band each score sits, as a fraction of half-width. */
const SEVERITY_SKEW: Record<DamageSeverity["score"], number> = {
  1: -0.7,
  2: -0.35,
  3: 0,
  4: 0.35,
  5: 0.7,
};

/** How much tighter the band gets once photos have resolved the extent. */
const SEVERITY_NARROWING = 0.35;

/** Matches roundToNearestFifty in lib/quote.ts — estimates are shown in £50s. */
function roundToNearestFifty(value: number): number {
  return Math.max(50, Math.round(value / 50) * 50);
}

/**
 * Reposition and tighten a quote's range according to graded severity.
 *
 * Returns the input unchanged when there is no usable severity — no photos, a
 * grader failure, or a low-confidence verdict (which never reaches this type).
 */
export function applySeverityToQuote(
  quote: QuoteResult,
  severity: DamageSeverity | null,
): QuoteResult {
  if (!severity) return quote;

  const skew = SEVERITY_SKEW[severity.score];
  if (skew === undefined) return quote;

  const midpoint = (quote.min + quote.max) / 2;
  const halfWidth = (quote.max - quote.min) / 2;
  if (!(halfWidth > 0)) return quote;

  const centre = midpoint + skew * halfWidth;
  const narrowed = halfWidth * (1 - SEVERITY_NARROWING);

  const min = roundToNearestFifty(centre - narrowed);
  const max = roundToNearestFifty(Math.max(centre + narrowed, min + 100));

  return {
    ...quote,
    min,
    max,
    // Keep confidenceWidth honest — quoteBandedLineItems() re-derives the
    // per-line bands from the headline, so the breakdown follows this.
    confidenceWidth: quote.confidenceWidth * (1 - SEVERITY_NARROWING),
    modelAssumptions: [
      ...quote.modelAssumptions,
      `Your photos were graded ${severity.score}/5 for visible severity, which narrows this range and positions it ${
        skew > 0 ? "towards the upper end" : skew < 0 ? "towards the lower end" : "around the middle"
      }. It remains an indicative estimate, not a fixed price.`,
    ],
  };
}

/** Colour ramp for the severity readout. Green (mild) → red (urgent). */
export function severityTone(score: DamageSeverity["score"]): {
  fg: string;
  bg: string;
} {
  switch (score) {
    case 1:
      return { fg: "#0d6b3c", bg: "#e6f6ee" };
    case 2:
      return { fg: "#0f766e", bg: "#f0fdfa" };
    case 3:
      return { fg: "#b45309", bg: "#fffbeb" };
    case 4:
      return { fg: "#c2410c", bg: "#fff3ed" };
    case 5:
      return { fg: "#c02626", bg: "#fdeaea" };
  }
}

export function severityLabel(score: DamageSeverity["score"]): string {
  switch (score) {
    case 1:
      return "Minimal";
    case 2:
      return "Minor";
    case 3:
      return "Moderate";
    case 4:
      return "Significant";
    case 5:
      return "Severe";
  }
}
