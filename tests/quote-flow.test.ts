import { describe, expect, it } from "vitest";

import { pathFromBounds } from "@/lib/roof-geometry";
import {
  REPAIR_BANDS,
  buildLeadPayload,
  computeFlowQuote,
  JOB_TYPE_OPTIONS,
  createFlowAnswers,
  displayAddress,
  drawApproach,
  emptyDrawnRoof,
  flowPath,
  measureRoofs,
  measureWholeRoof,
  nextStep,
  previousStep,
  progressPercent,
  repairBandById,
  stepSequence,
  type QuoteFlowAnswers,
} from "@/lib/quote-flow";
import type { GeoBounds, RoofSegment, SolarScan } from "@/lib/types";

const BUILDING: GeoBounds = {
  north: 52.0002,
  south: 52,
  east: 0.0004,
  west: 0,
};

function segment(
  boundingBox: GeoBounds,
  groundAreaMeters2: number,
  pitchDegrees = 0,
  azimuthDegrees = 90,
): RoofSegment {
  const multiplier = 1 / Math.cos((pitchDegrees * Math.PI) / 180);
  return {
    pitchDegrees,
    azimuthDegrees,
    groundAreaMeters2,
    areaMeters2: groundAreaMeters2 * multiplier,
    boundingBox,
  };
}

function flatScan(): SolarScan {
  const leftBounds: GeoBounds = { ...BUILDING, east: 0.0002 };
  const rightBounds: GeoBounds = { ...BUILDING, west: 0.0002 };
  return {
    center: { lat: 52.0001, lng: 0.0002 },
    boundingBox: BUILDING,
    imageryQuality: "HIGH",
    imageryDate: "2026-01-01",
    wholeRoofStats: { areaMeters2: 100, groundAreaMeters2: 100 },
    roofSegmentStats: [
      segment(leftBounds, 50, 0, 90),
      segment(rightBounds, 50, 0, 270),
    ],
  };
}

function measuredAnswers(): QuoteFlowAnswers {
  const answers = createFlowAnswers("roofer-123", {
    line: "10 Downing Street",
    postcode: "SW1A 2AA",
    formatted: "10 Downing St, London SW1A 2AA, UK",
  });
  answers.jobType = "full_replacement";
  answers.propertyType = "detached";
  answers.storeys = 2;
  answers.condition = null;
  answers.coords = { lat: 51.5, lng: -0.12 };
  answers.scan = flatScan();
  answers.roofs = [emptyDrawnRoof(pathFromBounds(BUILDING))];
  answers.material = "concrete_tile";
  answers.contact = {
    name: "Ada Lovelace",
    phone: "07700 900123",
    email: "ada@example.com",
  };
  return answers;
}

describe("step sequencing", () => {
  it("routes measured jobs through locate, draw, material, contact, estimate", () => {
    const answers = createFlowAnswers("r");
    answers.jobType = "full_replacement";
    expect(stepSequence(answers)).toEqual([
      "address",
      "job_type",
      "property_type",
      "storeys",
      "locate",
      "draw_roof",
      "material",
      "contact",
      "estimate",
      "quote_next",
    ]);
    expect(stepSequence(answers)).not.toContain("condition");
    expect(stepSequence(answers)).not.toContain("scanning");
  });

  it("advances past an orphaned draw_roof on scan_only paths (Done must not no-op)", () => {
    const answers = createFlowAnswers("r");
    answers.jobType = "full_replacement";
    answers.propertyType = "detached";
    expect(stepSequence(answers)).not.toContain("draw_roof");
    expect(nextStep(answers, "draw_roof")).toBe("material");
    expect(nextStep(answers, "locate")).toBe("material");
  });

  it("routes repairs through the size-band question instead of the map", () => {
    const answers = createFlowAnswers("r");
    answers.jobType = "tile_or_slate_repair";
    const sequence = stepSequence(answers);
    expect(sequence).toContain("repair_size");
    expect(sequence).not.toContain("locate");
    expect(sequence).not.toContain("draw_roof");
    expect(sequence).not.toContain("condition");
  });

  it("routes gutters through the roofline measured path", () => {
    const answers = createFlowAnswers("r");
    answers.jobType = "gutters_fascias_soffits";
    expect(flowPath(answers)).toBe("roofline");
    expect(stepSequence(answers)).toEqual([
      "address",
      "job_type",
      "property_type",
      "storeys",
      "locate",
      "draw_roof",
      "roofline_scope",
      "photos",
      "contact",
      "estimate",
      "quote_next",
    ]);
  });

  it("offers the photo step only on the job types with no measured area", () => {
    const withPhotos = [
      "tile_or_slate_repair",
      "gutters_fascias_soffits",
      "gutter_clearing",
    ] as const;
    for (const jobType of withPhotos) {
      const answers = createFlowAnswers("r");
      answers.jobType = jobType;
      expect(stepSequence(answers)).toContain("photos");
    }

    // Everything with a measured area, plus the unpriced consultation paths.
    const withoutPhotos = [
      "full_replacement",
      "flat_roof_replacement",
      "roof_soft_wash",
      "roof_biocide_treatment",
      "leak_investigation",
      "other",
    ] as const;
    for (const jobType of withoutPhotos) {
      const answers = createFlowAnswers("r");
      answers.jobType = jobType;
      expect(stepSequence(answers)).not.toContain("photos");
    }
  });

  it("puts the photo step after material and before contact", () => {
    const answers = createFlowAnswers("r");
    answers.jobType = "tile_or_slate_repair";
    const sequence = stepSequence(answers);
    expect(sequence.indexOf("photos")).toBeGreaterThan(
      sequence.indexOf("material"),
    );
    expect(sequence.indexOf("photos")).toBeLessThan(
      sequence.indexOf("contact"),
    );
    expect(nextStep(answers, "photos")).toBe("contact");
    expect(previousStep(answers, "photos")).toBe("material");
  });

  it("routes non-quotable jobs to a consultation without the condition step", () => {
    const answers = createFlowAnswers("r");
    answers.jobType = "leak_investigation";
    expect(flowPath(answers)).toBe("consultation");
    expect(stepSequence(answers)).toEqual([
      "address",
      "job_type",
      "contact",
      "consultation",
    ]);
  });

  it("downgrades a measured or roofline job to consultation when a fallback reason is set", () => {
    const answers = createFlowAnswers("r");
    answers.jobType = "full_replacement";
    answers.fallbackReason = "Satellite measurement unavailable.";
    expect(flowPath(answers)).toBe("consultation");

    answers.jobType = "gutters_fascias_soffits";
    expect(flowPath(answers)).toBe("consultation");
  });

  it("walks forward and backward through the sequence, skipping locate on back", () => {
    // Detached: nothing to draw, so locate leads straight to material.
    const answers = measuredAnswers();
    expect(answers.propertyType).toBe("detached");
    expect(stepSequence(answers)).not.toContain("draw_roof");
    expect(nextStep(answers, "storeys")).toBe("locate");
    expect(nextStep(answers, "locate")).toBe("material");
    // Back over the transient scan screen, not into it.
    expect(previousStep(answers, "material")).toBe("storeys");
    expect(previousStep(answers, "address")).toBeNull();
    expect(nextStep(answers, "estimate")).toBe("quote_next");
    expect(nextStep(answers, "quote_next")).toBeNull();
  });

  it("keeps the draw step where the roof outline is genuinely ambiguous", () => {
    // Semi-detached shares a roof structure with next door, so the scan cannot
    // tell whose half is whose and the outline still has to be traced.
    const answers = measuredAnswers();
    answers.propertyType = "semi_detached";
    expect(stepSequence(answers)).toContain("draw_roof");
    expect(nextStep(answers, "locate")).toBe("draw_roof");
    expect(previousStep(answers, "draw_roof")).toBe("storeys");
  });

  it("reports monotonically increasing progress along the sequence", () => {
    const answers = measuredAnswers();
    const sequence = stepSequence(answers);
    const values = sequence.map((step) => progressPercent(answers, step));
    for (let index = 1; index < values.length; index += 1) {
      expect(values[index]).toBeGreaterThan(values[index - 1]);
    }
    expect(values[0]).toBe(0);
    expect(values[values.length - 1]).toBe(100);
  });
});

describe("address display", () => {
  it("uses the postcode when a postcode-only flow has no resolved address", () => {
    const answers = createFlowAnswers("r", { postcode: "LS1 1AA" });
    expect(displayAddress(answers.address)).toBe("LS1 1AA");
  });

  it("prefers the pin-derived formatted address", () => {
    const answers = createFlowAnswers("r", {
      postcode: "LS1 1AA",
      formatted: "12 Example Street, Leeds LS1 1AA, UK",
    });
    expect(displayAddress(answers.address)).toBe(
      "12 Example Street, Leeds LS1 1AA, UK",
    );
  });
});

describe("repair bands", () => {
  it("maps every band to a representative area inside its label range", () => {
    expect(repairBandById("patch")?.representativeAreaM2).toBeLessThanOrEqual(
      3,
    );
    expect(repairBandById("half_roof")?.representativeAreaM2).toBeGreaterThan(
      25,
    );
    expect(repairBandById("missing")).toBeNull();
    expect(REPAIR_BANDS.length).toBeGreaterThanOrEqual(3);
  });
});

describe("measureRoofs", () => {
  it("sums surface area across multiple drawn roof faces", () => {
    const scan = flatScan();
    const leftBounds: GeoBounds = { ...BUILDING, east: 0.0002 };
    const rightBounds: GeoBounds = { ...BUILDING, west: 0.0002 };
    const combined = measureRoofs(scan, [
      emptyDrawnRoof(pathFromBounds(leftBounds)),
      emptyDrawnRoof(pathFromBounds(rightBounds)),
    ]);
    expect(combined).not.toBeNull();
    expect(combined!.surfaceAreaM2).toBeCloseTo(100, 3);
    expect(combined!.perRoof).toHaveLength(2);
    expect(combined!.perimeterM).toBeGreaterThan(0);
    expect(combined!.gutterLengthM).toBe(0);
  });

  it("subtracts obstruction plan area and sums marked gutter edges", () => {
    const scan = flatScan();
    const path = pathFromBounds(BUILDING);
    const chimneyBounds: GeoBounds = {
      north: 52.00005,
      south: 52.00002,
      east: 0.00005,
      west: 0.00002,
    };
    const withExtras = measureRoofs(scan, [
      {
        id: "roof-with-extras",
        path,
        gutterEdgeIndices: [0, 2],
        obstructions: [{ kind: "chimney", bounds: chimneyBounds }],
      },
    ]);
    const plain = measureRoofs(scan, [emptyDrawnRoof(path)]);
    expect(withExtras).not.toBeNull();
    expect(plain).not.toBeNull();
    expect(withExtras!.surfaceAreaM2).toBeLessThan(plain!.surfaceAreaM2);
    expect(withExtras!.chimneyCount).toBe(1);
    expect(withExtras!.gutterLengthM).toBeGreaterThan(0);
  });

  it("ignores degenerate outlines and returns null when nothing measures", () => {
    const scan = flatScan();
    expect(
      measureRoofs(scan, [emptyDrawnRoof([{ lat: 52, lng: 0 }])]),
    ).toBeNull();
  });

  it("rejects roofs that overlap each other by more than 10%", () => {
    const scan = flatScan();
    const full = emptyDrawnRoof(pathFromBounds(BUILDING));
    const almostSame = emptyDrawnRoof(
      pathFromBounds({ ...BUILDING, east: BUILDING.east - 0.00001 }),
    );
    expect(measureRoofs(scan, [full, almostSame])).toBeNull();
  });
});

describe("drawApproach", () => {
  it("draws nothing at all for detached and bungalow replacements", () => {
    // The scan gives the whole roof area, and area is what a replacement is
    // priced on — so there is nothing left to collect. Gutter length used to be
    // gathered here and is now left to the survey.
    expect(drawApproach("full_replacement", "detached")).toBe("scan_only");
    expect(drawApproach("full_replacement", "bungalow")).toBe("scan_only");
    expect(drawApproach("flat_roof_replacement", "detached")).toBe("scan_only");
  });

  it("still requires a manual outline for shared/ambiguous roof structures", () => {
    expect(drawApproach("full_replacement", "semi_detached")).toBe("outline");
    expect(drawApproach("full_replacement", "terraced")).toBe("outline");
    expect(drawApproach("full_replacement", "flat")).toBe("outline");
  });

  it("always draws gutter lines directly for a gutters-only job, regardless of property type", () => {
    expect(drawApproach("gutters_fascias_soffits", "semi_detached")).toBe(
      "gutter_lines",
    );
    expect(drawApproach("gutters_fascias_soffits", "terraced")).toBe(
      "gutter_lines",
    );
    expect(drawApproach("gutters_fascias_soffits", "detached")).toBe(
      "gutter_lines",
    );
  });
});

describe("measureWholeRoof", () => {
  it("takes area straight from the scan's whole-roof stats, not a drawn polygon", () => {
    const scan = flatScan();
    const measurement = measureWholeRoof(scan, [], 0, 0);
    expect(measurement.surfaceAreaM2).toBeCloseTo(
      scan.wholeRoofStats.areaMeters2,
      5,
    );
    expect(measurement.method).toBe("solar_whole_roof");
    expect(measurement.gutterLengthM).toBe(0);
  });

  it("sums gutter length across multiple drawn runs", () => {
    const scan = flatScan();
    const runA = [
      { lat: 52, lng: 0 },
      { lat: 52, lng: 0.0002 },
    ];
    const runB = [
      { lat: 52.0001, lng: 0 },
      { lat: 52.0001, lng: 0.0001 },
      { lat: 52.0002, lng: 0.0001 },
    ];
    const measurement = measureWholeRoof(scan, [runA, runB], 2, 1);
    expect(measurement.gutterLengthM).toBeGreaterThan(0);
    expect(measurement.chimneyCount).toBe(2);
    expect(measurement.rooflightCount).toBe(1);
  });
});

describe("computeFlowQuote", () => {
  it("prices a measured replacement from drawn roofs", () => {
    const answers = measuredAnswers();
    const measurement = measureRoofs(answers.scan!, answers.roofs);
    const quote = computeFlowQuote(answers, measurement);
    expect(quote).not.toBeNull();
    expect(quote!.pricingMode).toBe("replacement");
    expect(quote!.min).toBeGreaterThan(0);
    expect(quote!.max).toBeGreaterThan(quote!.min);
    expect(quote!.pricingAreaM2).toBeCloseTo(100, 1);
  });

  it("prices a detached replacement from the scan's whole-roof stats, without any drawn roofs", () => {
    const answers = measuredAnswers();
    answers.propertyType = "detached";
    answers.roofs = [];
    answers.gutterRuns = [
      [
        { lat: 52, lng: 0 },
        { lat: 52, lng: 0.0002 },
      ],
    ];
    answers.chimneyCount = 1;
    expect(drawApproach(answers.jobType, answers.propertyType)).toBe(
      "scan_only",
    );
    const measurement = measureWholeRoof(
      answers.scan!,
      answers.gutterRuns,
      answers.chimneyCount,
      answers.rooflightCount,
    );
    const quote = computeFlowQuote(answers, measurement);
    expect(quote).not.toBeNull();
    expect(quote!.pricingMode).toBe("replacement");
    expect(quote!.pricingAreaM2).toBeCloseTo(
      answers.scan!.wholeRoofStats.areaMeters2,
      1,
    );
    expect(
      quote!.lineItems.some(
        (item) => item.rateId === "chimney_flashing_allowance",
      ),
    ).toBe(true);
  });

  it("adds gutter replace line items when edges are marked", () => {
    const answers = measuredAnswers();
    answers.roofs = [
      {
        ...emptyDrawnRoof(pathFromBounds(BUILDING)),
        gutterEdgeIndices: [0],
      },
    ];
    const measurement = measureRoofs(answers.scan!, answers.roofs);
    const quote = computeFlowQuote(answers, measurement);
    expect(
      quote!.lineItems.some((item) => item.rateId === "gutter_replace_m"),
    ).toBe(true);
  });

  it("prices a roofline job from marked gutter length", () => {
    const answers = createFlowAnswers("r");
    answers.jobType = "gutters_fascias_soffits";
    answers.propertyType = "terraced";
    answers.storeys = 2;
    answers.scan = flatScan();
    answers.roofs = [
      {
        ...emptyDrawnRoof(pathFromBounds(BUILDING)),
        gutterEdgeIndices: [0, 1],
      },
    ];
    answers.rooflineScope = "gutters_fascias";
    const measurement = measureRoofs(answers.scan, answers.roofs);
    const quote = computeFlowQuote(answers, measurement);
    expect(quote).not.toBeNull();
    expect(quote!.pricingMode).toBe("roofline");
    expect(
      quote!.lineItems.some((item) => item.rateId === "gutter_replace_m"),
    ).toBe(true);
    expect(
      quote!.lineItems.some((item) => item.rateId === "fascia_soffit_m"),
    ).toBe(true);
  });

  it("prices a repair from the selected size band without a scan", () => {
    const answers = createFlowAnswers("r");
    answers.jobType = "tile_or_slate_repair";
    answers.storeys = 1;
    answers.propertyType = "bungalow";
    answers.repairBandId = "patch";
    answers.material = "concrete_tile";
    const quote = computeFlowQuote(answers, null);
    expect(quote).not.toBeNull();
    expect(quote!.pricingMode).toBe("repair");
    expect(quote!.min).toBeGreaterThan(0);
  });

  it("returns null when required inputs are missing", () => {
    const answers = createFlowAnswers("r");
    answers.jobType = "full_replacement";
    expect(computeFlowQuote(answers, null)).toBeNull();
  });

  it("returns null when material is not valid for the job type", () => {
    const answers = measuredAnswers();
    answers.jobType = "flat_roof_replacement";
    // Concrete tile is pitched-only — not in flat replacement options.
    answers.material = "concrete_tile";
    const measurement = measureRoofs(answers.scan!, answers.roofs);
    expect(computeFlowQuote(answers, measurement)).toBeNull();
  });
});

describe("buildLeadPayload", () => {
  it("builds a valid quote lead for the measured path", () => {
    const answers = measuredAnswers();
    const measurement = measureRoofs(answers.scan!, answers.roofs);
    const quote = computeFlowQuote(answers, measurement);
    const payload = buildLeadPayload(
      answers,
      measurement,
      quote,
      "estimate_viewed",
    );

    expect(payload.rooferId).toBe("roofer-123");
    expect(payload.leadType).toBe("quote");
    expect(payload.intent).toBe("estimate_viewed");
    expect(payload.jobType).toBe("full_replacement");
    expect(payload.contact.name).toBe("Ada Lovelace");
    expect(payload.contact.phone).toBe("07700 900123");
    expect(payload.address.postcode).toBe("SW1A 2AA");
    expect(payload.solar.areaM2).toBeCloseTo(100, 1);
    expect(payload.polygonCoords).toHaveLength(4);
    expect(payload.quoteRange).not.toBeNull();
    expect(payload.quoteRange!.maxExVat).toBeGreaterThanOrEqual(
      payload.quoteRange!.minExVat,
    );
    expect(payload.conditionFlagged).toBe(false);
    expect(payload.obstructions).toEqual({ chimneys: 0, rooflights: 0 });
    expect(Number.isNaN(Date.parse(payload.timestamp))).toBe(false);
  });

  // The dashboard reopens the roof on this framing, so it has to survive the
  // trip rather than being inferred from the polygon later.
  it("carries the map framing the customer drew on", () => {
    const answers = measuredAnswers();
    const measurement = measureRoofs(answers.scan!, answers.roofs);
    const view = { center: { lat: 51.5014, lng: -0.1419 }, zoom: 20 };
    const payload = buildLeadPayload(
      answers,
      measurement,
      computeFlowQuote(answers, measurement),
      "estimate_viewed",
      view,
    );

    expect(payload.mapView).toEqual(view);
  });

  it("stores a null map view when the flow never showed a map", () => {
    const answers = measuredAnswers();
    const payload = buildLeadPayload(answers, null, null, "estimate_viewed");

    expect(payload.mapView).toBeNull();
  });

  it("builds a manual-consultation lead for non-quotable jobs", () => {
    const answers = createFlowAnswers("roofer-9", {
      line: "4 Elm Grove",
      postcode: "BS5 6AB",
    });
    answers.jobType = "leak_investigation";
    answers.contact = { name: "Sam", phone: "0117 111 2222", email: "" };
    const payload = buildLeadPayload(answers, null, null, "callback_requested");

    expect(payload.leadType).toBe("manual_consultation");
    expect(payload.intent).toBe("callback_requested");
    expect(payload.quoteRange).toBeNull();
    expect(payload.solar.areaM2).toBeNull();
    expect(payload.roofline).toBeNull();
    expect(payload.otherJobDescription).toBeNull();
  });
});

describe("unpriced job types are signposted", () => {
  it("hints every option that cannot end in a price", () => {
    // A tester chose Leak investigation, reached "your roofer will call you
    // back", and could not tell how to get a quote. Nothing before that point
    // said the branch had no price at the end of it.
    //
    // This is the guard, not the two assertions below it: if a new service
    // routes to consultation and nobody adds a hint, this fails.
    for (const option of JOB_TYPE_OPTIONS) {
      const answers = createFlowAnswers("roofer-123", {
        line: "1 Test St",
        postcode: "SW1A 1AA",
        formatted: "1 Test St, SW1A 1AA",
      });
      answers.jobType = option.value;
      if (flowPath(answers) === "consultation") {
        expect(
          option.hint,
          `"${option.label}" ends in a callback with no hint saying so`,
        ).toBeTruthy();
      }
    }
  });

  it("leaves priced options unhinted so the two stand out", () => {
    const byValue = Object.fromEntries(
      JOB_TYPE_OPTIONS.map((o) => [o.value, o]),
    );
    expect(byValue.leak_investigation.hint).toBeTruthy();
    expect(byValue.other.hint).toBeTruthy();
    expect(byValue.full_replacement.hint).toBeUndefined();
    expect(byValue.tile_or_slate_repair.hint).toBeUndefined();
  });
});

describe("site access does not disturb the existing engine", () => {
  it("prices identically when nothing was observed", () => {
    // The guard that matters most. This feature must be additive: with no
    // observation — feature off, request in flight, imagery unavailable — the
    // estimate has to be byte-for-byte what it was before it existed.
    const answers = measuredAnswers();
    const measurement = measureWholeRoof(answers.scan!, [], 0, 0);

    const before = computeFlowQuote(answers, measurement);
    answers.siteObservation = null;
    const after = computeFlowQuote(answers, measurement);

    expect(after!.min).toBe(before!.min);
    expect(after!.max).toBe(before!.max);
  });

  it("raises the estimate once a hard site is confidently observed", () => {
    const answers = measuredAnswers();
    const measurement = measureWholeRoof(answers.scan!, [], 0, 0);
    const plain = computeFlowQuote(answers, measurement);

    answers.siteObservation = {
      frontage: "on_pavement",
      vehicleAccess: "restricted",
      parkingRestriction: "double_yellow",
      sideAccess: "none_visible",
      obstructions: [],
      imageryUsable: true,
      imageryYear: new Date().getFullYear(),
      confidence: {
        frontage: 0.9,
        vehicleAccess: 0.9,
        parkingRestriction: 0.9,
        sideAccess: 0.9,
      },
    };
    const hard = computeFlowQuote(answers, measurement);

    expect(hard!.max).toBeGreaterThan(plain!.max);
  });

  it("leaves the price alone when the model was unsure", () => {
    const answers = measuredAnswers();
    const measurement = measureWholeRoof(answers.scan!, [], 0, 0);
    const plain = computeFlowQuote(answers, measurement);

    answers.siteObservation = {
      frontage: "on_pavement",
      vehicleAccess: "restricted",
      parkingRestriction: "double_yellow",
      sideAccess: "none_visible",
      obstructions: [],
      imageryUsable: true,
      imageryYear: new Date().getFullYear(),
      // Everything seen, nothing seen CLEARLY. Must widen, never charge.
      confidence: {
        frontage: 0.4,
        vehicleAccess: 0.4,
        parkingRestriction: 0.4,
        sideAccess: 0.4,
      },
    };
    const unsure = computeFlowQuote(answers, measurement);

    expect(unsure!.min).toBeLessThanOrEqual(plain!.min);
    expect(unsure!.max).toBeGreaterThanOrEqual(plain!.max);
  });
});
