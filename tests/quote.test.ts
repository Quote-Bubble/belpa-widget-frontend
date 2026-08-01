import { describe, expect, it } from "vitest";

import {
  calculateRepairEstimate,
  calculateReplacementEstimate,
  quoteBaseSubtotal,
  repairSizeAdjustment,
} from "@/lib/quote";

describe("replacement estimate", () => {
  const baseInput = {
    areaM2: 84.2,
    roofType: "gable" as const,
    material: "natural_slate" as const,
    storeys: 2,
    scaffoldWeeks: 1,
    includeSkip: true,
    imageryQuality: "HIGH",
    imageryDateIsOld: false,
    polygonWasEdited: false,
    conditionAnswer: "no" as const,
  };

  it("uses one pricing area consistently in output and covering line item", () => {
    const quote = calculateReplacementEstimate(baseInput);
    const covering = quote.lineItems.find((item) => item.unit === "m²");

    expect(quote.estimateType).toBe("indicative_estimate");
    expect(quote.pricingMode).toBe("replacement");
    expect(quote.pricingAreaM2).toBe(84.2);
    expect(covering?.quantityM2).toBe(84.2);
    expect(covering?.detail).toContain("84.20m²");
    expect(covering?.min).toBeCloseTo(84.2 * 160, 8);
    expect(covering?.max).toBeCloseTo(84.2 * 210, 8);
    expect(covering?.sourceTitle).toContain("Checkatrade roof replacement");
  });

  it("uses the roofer's own £/m² when they've set a custom rate", () => {
    const quote = calculateReplacementEstimate({
      ...baseInput,
      pricing: {
        materials: [{ key: "natural_slate", rate: 120 }],
        labourPerDay: null,
        minimumCallout: null,
        skipHire: null,
        scaffoldPerWeek: null,
        vatRegistered: true,
      },
    });
    const covering = quote.lineItems.find((item) => item.unit === "m²");
    // Their single rate becomes both ends of the covering line (the confidence
    // band still spreads the final quote).
    expect(covering?.unitRateMin).toBe(120);
    expect(covering?.unitRateMax).toBe(120);
    expect(covering?.min).toBeCloseTo(84.2 * 120, 8);
  });

  it("floors the low estimate at the roofer's minimum call-out", () => {
    const quote = calculateReplacementEstimate({
      ...baseInput,
      areaM2: 2,
      pricing: {
        materials: [],
        labourPerDay: null,
        minimumCallout: 5000,
        skipHire: null,
        scaffoldPerWeek: null,
        vatRegistered: true,
      },
    });
    expect(quote.min).toBeGreaterThanOrEqual(5000);
  });

  it("raises only the upper estimate for a flagged condition", () => {
    const normal = calculateReplacementEstimate(baseInput);
    const flagged = calculateReplacementEstimate({
      ...baseInput,
      conditionAnswer: "yes",
    });

    expect(flagged.min).toBe(normal.min);
    expect(flagged.max).toBeGreaterThanOrEqual(normal.max * 1.09);
  });

  it("widens confidence for edited polygons and unknown material", () => {
    const confident = calculateReplacementEstimate({
      ...baseInput,
      material: "concrete_tile",
    });
    const uncertain = calculateReplacementEstimate({
      ...baseInput,
      material: "not_sure",
      polygonWasEdited: true,
      imageryQuality: "MEDIUM",
      imageryDateIsOld: true,
    });

    expect(confident.confidenceWidth).toBe(0.12);
    expect(uncertain.confidenceWidth).toBeCloseTo(0.43, 8);
  });
});

describe("repair estimate", () => {
  const baseRepair = {
    areaM2: 3,
    material: "concrete_tile" as const,
    storeys: 2,
    scaffoldWeeks: 0,
    includeSkip: false,
    conditionAnswer: "no" as const,
  };

  it("uses sourced repair rates directly up to 3m²", () => {
    const quote = calculateRepairEstimate(baseRepair);
    const covering = quote.lineItems[0];

    expect(quote.pricingMode).toBe("repair");
    expect(covering.min).toBe(270);
    expect(covering.max).toBe(360);
    expect(covering.unitRateMin).toBe(90);
    expect(covering.unitRateMax).toBe(120);
    expect(covering.sourceTitle).toContain("Checkatrade");
  });

  it("applies explicit piecewise size decay instead of a fixed band", () => {
    expect(repairSizeAdjustment(3).rateMultiplier).toBe(1);
    expect(repairSizeAdjustment(4).rateMultiplier).toBe(0.9);
    expect(repairSizeAdjustment(12).rateMultiplier).toBe(0.8);
    expect(repairSizeAdjustment(30).rateMultiplier).toBe(0.7);

    const larger = calculateRepairEstimate({
      ...baseRepair,
      areaM2: 12,
    });
    expect(larger.lineItems[0].unitRateMin).toBe(72);
    expect(larger.modelAssumptions.join(" ")).toContain(
      "explicit internal assumption",
    );
  });

  it("prices optional linear items from sourced per-metre rates", () => {
    const quote = calculateRepairEstimate({
      ...baseRepair,
      linearItems: [{ rateId: "dry_ridge_m", quantityM: 5 }],
    });
    const ridge = quote.lineItems.find((item) => item.rateId === "dry_ridge_m");

    expect(ridge?.min).toBe(250);
    expect(ridge?.max).toBe(350);
    expect(ridge?.unit).toBe("m");
  });
});

describe("estimate breakdown reconciliation", () => {
  it("sums line items to the base subtotal before the confidence band", () => {
    const quote = calculateReplacementEstimate({
      areaM2: 84.2,
      roofType: "gable",
      material: "natural_slate",
      storeys: 2,
      scaffoldWeeks: 1,
      includeSkip: true,
      imageryQuality: "HIGH",
      imageryDateIsOld: false,
      polygonWasEdited: false,
      conditionAnswer: "no",
    });
    const base = quoteBaseSubtotal(quote);
    const summedMin = quote.lineItems.reduce((sum, item) => sum + item.min, 0);
    const summedMax = quote.lineItems.reduce((sum, item) => sum + item.max, 0);

    expect(base.min).toBeCloseTo(summedMin, 8);
    expect(base.max).toBeCloseTo(summedMax, 8);
    // Headline range is the confidence-adjusted band around that base — not
    // the raw line-item sum — so the UI labels the subtotal explicitly.
    expect(quote.min).toBeLessThanOrEqual(base.min);
    expect(quote.max).toBeGreaterThanOrEqual(base.max);
  });
});
