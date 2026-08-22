import { describe, expect, it } from "vitest";

import { applySeverityToQuote, severityLabel, severityTone } from "@/lib/severity";
import { computeFlowQuote, createFlowAnswers } from "@/lib/quote-flow";
import type { DamageSeverity, QuoteResult } from "@/lib/types";

function quote(min: number, max: number): QuoteResult {
  return {
    estimateType: "indicative_estimate",
    pricingMode: "repair",
    min,
    max,
    pricingAreaM2: 6,
    confidenceWidth: 0.15,
    modelAssumptions: ["base assumption"],
    lineItems: [],
  };
}

function severity(score: DamageSeverity["score"]): DamageSeverity {
  return { score, confidence: "high", visibleIssues: [], model: "test" };
}

describe("applySeverityToQuote — the no-photos guarantee", () => {
  it("returns the identical object when there is no severity", () => {
    // Not just an equal object — the same reference, so "customer skipped
    // photos" cannot drift from "this feature does not exist" even by a
    // rounding error. This is the single most important test in the feature.
    const original = quote(850, 1150);
    expect(applySeverityToQuote(original, null)).toBe(original);
  });

  it("leaves a degenerate band alone rather than inventing a spread", () => {
    const flat = quote(500, 500);
    expect(applySeverityToQuote(flat, severity(5))).toBe(flat);
  });
});

describe("applySeverityToQuote — repositioning", () => {
  const base = quote(850, 1150); // midpoint 1000, half-width 150

  it("narrows the range at every severity", () => {
    const baseWidth = base.max - base.min;
    for (const score of [1, 2, 3, 4, 5] as const) {
      const result = applySeverityToQuote(base, severity(score));
      expect(result.max - result.min).toBeLessThan(baseWidth);
    }
  });

  it("sits low for mild damage and high for severe", () => {
    const mild = applySeverityToQuote(base, severity(1));
    const mid = applySeverityToQuote(base, severity(3));
    const severe = applySeverityToQuote(base, severity(5));

    const centre = (q: QuoteResult) => (q.min + q.max) / 2;
    expect(centre(mild)).toBeLessThan(centre(mid));
    expect(centre(mid)).toBeLessThan(centre(severe));
    // Severity 3 is "no opinion" — it should not move the money, only tighten.
    expect(centre(mid)).toBeCloseTo(1000, 0);
  });

  it("moves monotonically with the score", () => {
    const centres = ([1, 2, 3, 4, 5] as const).map((s) => {
      const q = applySeverityToQuote(base, severity(s));
      return (q.min + q.max) / 2;
    });
    for (let i = 1; i < centres.length; i++) {
      expect(centres[i]!).toBeGreaterThan(centres[i - 1]!);
    }
  });

  it("keeps the overshoot past the original band small", () => {
    // The skew is meant to reposition within a plausible band, not to invent a
    // new price. Anything beyond ~15% would exceed the contingency UK guidance
    // says to hold and would need re-justifying.
    const severe = applySeverityToQuote(base, severity(5));
    const mild = applySeverityToQuote(base, severity(1));
    expect(severe.max).toBeLessThanOrEqual(base.max * 1.15);
    expect(mild.min).toBeGreaterThanOrEqual(base.min * 0.85);
  });

  it("still rounds to £50 and keeps a non-degenerate band", () => {
    for (const score of [1, 2, 3, 4, 5] as const) {
      const result = applySeverityToQuote(base, severity(score));
      expect(result.min % 50).toBe(0);
      expect(result.max % 50).toBe(0);
      expect(result.max).toBeGreaterThan(result.min);
    }
  });

  it("records what happened in the assumptions", () => {
    const result = applySeverityToQuote(base, severity(4));
    expect(result.modelAssumptions).toContain("base assumption");
    expect(result.modelAssumptions.join(" ")).toContain("4/5");
    expect(result.modelAssumptions.join(" ")).toContain("indicative estimate");
  });

  it("does not add a line item — the impact stays invisible", () => {
    const withItems: QuoteResult = {
      ...base,
      lineItems: [{ label: "Repair", min: 800, max: 1100 }],
    };
    const result = applySeverityToQuote(withItems, severity(5));
    expect(result.lineItems).toHaveLength(1);
    expect(result.lineItems[0]?.label).toBe("Repair");
  });
});

describe("computeFlowQuote integration", () => {
  function repairAnswers() {
    const answers = createFlowAnswers("demo");
    answers.jobType = "tile_or_slate_repair";
    answers.propertyType = "semi_detached";
    answers.storeys = 2;
    answers.repairBandId = "section";
    answers.material = "concrete_tile";
    return answers;
  }

  it("prices identically with no photos and with photos that failed to grade", () => {
    const withoutPhotos = computeFlowQuote(repairAnswers(), null);

    const attempted = repairAnswers();
    attempted.photoPaths = ["demo/sub/1.jpg"];
    attempted.severity = null; // uploaded, but grading failed or was unsure
    const withFailedGrading = computeFlowQuote(attempted, null);

    expect(withoutPhotos).not.toBeNull();
    expect(withFailedGrading).toEqual(withoutPhotos);
  });

  it("shifts the range once a severity is present", () => {
    const baseline = computeFlowQuote(repairAnswers(), null);

    const graded = repairAnswers();
    graded.severity = severity(5);
    const result = computeFlowQuote(graded, null);

    expect(baseline).not.toBeNull();
    expect(result).not.toBeNull();
    expect(result!.max - result!.min).toBeLessThan(baseline!.max - baseline!.min);
    expect(result!.min).toBeGreaterThan(baseline!.min);
  });
});

describe("severity presentation", () => {
  it("has a distinct tone and label for each score", () => {
    const tones = new Set<string>();
    const labels = new Set<string>();
    for (const score of [1, 2, 3, 4, 5] as const) {
      tones.add(severityTone(score).fg);
      labels.add(severityLabel(score));
    }
    expect(tones.size).toBe(5);
    expect(labels.size).toBe(5);
  });

  it("runs green at the mild end and red at the severe end", () => {
    expect(severityTone(1).fg).toBe("#0d6b3c");
    expect(severityTone(5).fg).toBe("#c02626");
  });
});
