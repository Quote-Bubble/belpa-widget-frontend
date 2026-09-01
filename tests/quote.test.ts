import { describe, expect, it } from "vitest";

import { MODEL_DEFAULTS, PRICE_LIST } from "@/config/rates";
import {
  defaultBiocide,
  defaultGutterClearing,
  defaultSoftWash,
} from "@/lib/quote-config";
import {
  calculateCleaningEstimate,
  calculateFlatEstimate,
  calculateRepairEstimate,
  calculateReplacementEstimate,
  quoteBandedLineItems,
  quoteBaseSubtotal,
  repairSizeAdjustment,
  type PricingContext,
} from "@/lib/quote";

function pricingWithSlateRate(rate: number): PricingContext {
  const table = PRICE_LIST.map((r) => ({
    ...r,
    source: { ...r.source },
    notes: [...r.notes],
  }));
  const slate = table.find((r) => r.id === "replacement_slate_m2");
  if (slate) {
    slate.min = rate;
    slate.max = rate;
  }
  return {
    table,
    model: {
      stripOffPerM2: MODEL_DEFAULTS.stripOffPerM2,
      stripOffMin: MODEL_DEFAULTS.stripOffMin,
      stripOffMax: MODEL_DEFAULTS.stripOffMax,
      vatRate: MODEL_DEFAULTS.vatRate,
      confidenceWidth: null,
    },
  };
}

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
      pricing: pricingWithSlateRate(120),
    });
    const covering = quote.lineItems.find((item) => item.unit === "m²");
    // Their single rate becomes both ends of the covering line (the confidence
    // band still spreads the final quote).
    expect(covering?.unitRateMin).toBe(120);
    expect(covering?.unitRateMax).toBe(120);
    expect(covering?.min).toBeCloseTo(84.2 * 120, 8);
  });

  it("uses a fixed access allowance instead of scaffold weeks", () => {
    const quote = calculateReplacementEstimate({
      ...baseInput,
      scaffoldWeeks: 0,
      fixedAccessExVat: 450,
    });
    const access = quote.lineItems.find((item) => item.rateId === "fixed_access");
    expect(access?.min).toBe(450);
    expect(access?.max).toBe(450);
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

describe("cleaning estimate", () => {
  it("prices soft wash from area × rate, ex-VAT", () => {
    const quote = calculateCleaningEstimate({
      areaM2: 100,
      ratePerM2ExVat: 14,
      minCalloutExVat: 150,
      label: "Roof soft wash",
    });
    expect(quote.pricingMode).toBe("cleaning");
    expect(quote.pricingAreaM2).toBe(100);
    // 100 × £14 = £1,400 base; band ±15% then rounded to nearest £50.
    expect(quote.min).toBeGreaterThan(1000);
    expect(quote.max).toBeGreaterThan(quote.min);
    expect(quote.lineItems[0].unitRateMin).toBe(14);
  });

  it("floors a tiny job at the minimum call-out", () => {
    const quote = calculateCleaningEstimate({
      areaM2: 2,
      ratePerM2ExVat: 14,
      minCalloutExVat: 150,
      label: "Roof soft wash",
    });
    // 2 × £14 = £28, floored to £150 before the band.
    expect(quote.max).toBeGreaterThanOrEqual(150);
  });

  it("prices a flat service as a tight band around the fixed amount", () => {
    const quote = calculateFlatEstimate({
      amountExVat: 120,
      label: "Gutter clearing",
    });
    expect(quote.pricingMode).toBe("cleaning");
    expect(quote.pricingAreaM2).toBeNull();
    expect(quote.min).toBeLessThanOrEqual(120);
    expect(quote.max).toBeGreaterThanOrEqual(120);
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

  it("spreads the headline range across the lines so the parts sum to the whole", () => {
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
      // "yes" applies a condition multiplier to the max only, which a per-line
      // confidence band would not reproduce. This is precisely the case the
      // ratio approach exists to survive.
      conditionAnswer: "yes",
    });

    const banded = quoteBandedLineItems(quote);
    const summedMin = banded.reduce((sum, item) => sum + item.min, 0);
    const summedMax = banded.reduce((sum, item) => sum + item.max, 0);

    expect(summedMin).toBeCloseTo(quote.min, 6);
    expect(summedMax).toBeCloseTo(quote.max, 6);
  });

  it("gives every line a real interval rather than a repeated number", () => {
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

    // The reported bug: fixed rates give min === max, so the breakdown printed
    // "£1,800 – £1,800" on row after row.
    expect(quote.lineItems.some((item) => item.min === item.max)).toBe(true);
    for (const item of quoteBandedLineItems(quote)) {
      expect(item.max).toBeGreaterThan(item.min);
    }
  });
});

/* The cleaning defaults have to land inside the published UK market, using the
 * areas THIS engine measures rather than the areas the cost guides assume.
 *
 * The guides disagree with themselves: their own totals divided by their own
 * areas give £4.50–£7.30/m², while the rate they print is £8.50–£16. The
 * totals agree across Checkatrade, MyJobQuote, FixMyRoof and N&J, so the
 * totals are the evidence. Cleaning always traces an outline, so the customer
 * marks their own roof — measured medians across real leads are 42 m² for a
 * terrace and 49 m² for a semi, roughly half what a guide calls a semi's roof.
 *
 * If someone retunes these rates, this test says whether the quote a homeowner
 * actually sees still resembles the market. */
describe("roof cleaning defaults against the UK market", () => {
  const MEDIAN_TERRACE_M2 = 42;
  const MEDIAN_SEMI_M2 = 49;

  function quote(areaM2: number, cfg: { ratePerM2ExVat: number; minCalloutExVat: number }) {
    return calculateCleaningEstimate({
      areaM2,
      ratePerM2ExVat: cfg.ratePerM2ExVat,
      minCalloutExVat: cfg.minCalloutExVat,
      label: "Roof clean",
    });
  }

  it("prices a soft wash within the published range for a semi and a terrace", () => {
    // Market: semi £350–£650, terrace £250–£550 (four independent guides).
    const semi = quote(MEDIAN_SEMI_M2, defaultSoftWash());
    expect(semi.min).toBeGreaterThanOrEqual(350);
    expect(semi.max).toBeLessThanOrEqual(650);

    const terrace = quote(MEDIAN_TERRACE_M2, defaultSoftWash());
    expect(terrace.min).toBeGreaterThanOrEqual(250);
    expect(terrace.max).toBeLessThanOrEqual(550);
  });

  it("never quotes a roof clean below the price one can actually be done for", () => {
    // Every source agrees nothing under ~£250 is a clean rather than a scrape,
    // so a very small traced area must still hit the call-out floor.
    const tiny = quote(4, defaultSoftWash());
    expect(tiny.min).toBeGreaterThanOrEqual(200);
  });

  it("keeps standalone biocide inside its own, much lower range", () => {
    // Market: £100–£250 standalone. It is the least labour on the list and
    // must not creep towards the price of a full wash.
    const semi = quote(MEDIAN_SEMI_M2, defaultBiocide());
    expect(semi.min).toBeGreaterThanOrEqual(100);
    expect(semi.max).toBeLessThanOrEqual(250);

    expect(defaultBiocide().ratePerM2ExVat).toBeLessThan(
      defaultSoftWash().ratePerM2ExVat,
    );
  });

  it("keeps gutter clearing at the modal UK figure", () => {
    // £70–£130 across the guides, most commonly £100.
    const fixed = defaultGutterClearing().fixedExVat;
    expect(fixed).toBeGreaterThanOrEqual(70);
    expect(fixed).toBeLessThanOrEqual(130);
  });
});
