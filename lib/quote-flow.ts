import { assessAccess } from "@/lib/access";
import {
  boundsAreaM2,
  edgeLengthM,
  pathLengthM,
  polygonPerimeterM,
} from "@/lib/geo";
import {
  calculateCleaningEstimate,
  calculateFlatEstimate,
  calculateRepairEstimate,
  calculateReplacementEstimate,
  calculateRooflineEstimate,
  type PricingContext,
} from "@/lib/quote";
import { materialOptionsFor } from "@/lib/materials";
import {
  configFingerprint,
  type QuoteConfig,
  type ServiceKey,
} from "@/lib/quote-config";
import {
  buildRateTable,
  resolveAccessForService,
} from "@/lib/rate-table";
import {
  isImageryOlderThanThreeYears,
  measureBoundary,
  measureDetached,
  pathFromBounds,
  ringsOverlapExcessively,
} from "@/lib/roof-geometry";
import type {
  ConditionAnswer,
  ContactDetails,
  DrawnRoof,
  JobType,
  LatLng,
  LeadPayload,
  Material,
  PropertyType,
  QuoteResult,
  RepairMaterial,
  ReplacementMaterial,
  RoofMeasurement,
  RooflineScope,
  RoofType,
  SolarScan,
  StoreyBand,
} from "@/lib/types";

export type { PropertyType, StoreyBand };

export type FlowStepId =
  | "address"
  | "job_type"
  | "property_type"
  | "storeys"
  | "locate"
  | "draw_roof"
  | "repair_size"
  | "material"
  | "roofline_scope"
  | "contact"
  | "estimate"
  | "quote_next"
  | "consultation";

export type FlowPath =
  | "measured"
  | "repair"
  | "roofline"
  | "flat"
  | "consultation";

export type QuoteFlowAnswers = {
  rooferId: string;
  address: { line: string; postcode: string; formatted: string | null };
  jobType: JobType | null;
  otherJobDescription: string;
  propertyType: PropertyType | null;
  storeys: StoreyBand | null;
  /** Kept for lead payload compatibility; the condition question is removed. */
  condition: ConditionAnswer | null;
  coords: LatLng | null;
  scan: SolarScan | null;
  /** Set when the measured path had to degrade (scan failed, maps unavailable). */
  fallbackReason: string | null;
  /** Closed user-drawn roof outlines with gutter edges and obstructions.
   *  Used only when drawApproach() is "outline" (see below). */
  roofs: DrawnRoof[];
  /** Open gutter-run polylines, drawn directly rather than clicked off a
   *  face's edges. Used when drawApproach() is "gutter_lines". */
  gutterRuns: LatLng[][];
  chimneyCount: number;
  rooflightCount: number;
  repairBandId: string | null;
  material: Material | null;
  rooflineScope: RooflineScope | null;
  contact: ContactDetails;
};

export function createFlowAnswers(
  rooferId: string,
  address?: Partial<QuoteFlowAnswers["address"]>,
): QuoteFlowAnswers {
  return {
    rooferId,
    address: { line: "", postcode: "", formatted: null, ...address },
    jobType: null,
    otherJobDescription: "",
    propertyType: null,
    storeys: null,
    condition: null,
    coords: null,
    scan: null,
    fallbackReason: null,
    roofs: [],
    gutterRuns: [],
    chimneyCount: 0,
    rooflightCount: 0,
    repairBandId: null,
    material: null,
    rooflineScope: null,
    contact: { name: "", phone: "", email: "" },
  };
}

/** Human-readable location for quote screens when no pin-derived address exists. */
export function displayAddress(
  address: QuoteFlowAnswers["address"],
): string {
  return address.formatted?.trim() || address.line.trim() || address.postcode;
}

function newRoofId(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `roof-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function emptyDrawnRoof(path: LatLng[] = []): DrawnRoof {
  return { id: newRoofId(), path, gutterEdgeIndices: [], obstructions: [] };
}

/**
 * Whether the draw step should have the user trace their roof's area, or
 * only mark where the gutters run.
 *
 * - "gutters_fascias_soffits" only ever prices gutter length, tracing a
 *   footprint first was always just a mechanism for clicking its edges, not
 *   something the pricing needed, so gutter lines are drawn directly for
 *   every property type.
 * - A detached house or bungalow's whole-building envelope from the Solar
 *   scan already *is* the customer's complete roof, with no neighbour to
 *   disambiguate, so its area comes straight from the scan and there's
 *   nothing to trace. Semi-detached, terraced, and flats often share a
 *   roof structure with next door, so the scan can't tell whose portion is
 *   whose; those still need a manual outline.
 */
export type DrawApproach = "outline" | "gutter_lines";

export function drawApproach(
  jobType: JobType | null,
  propertyType: PropertyType | null,
): DrawApproach {
  if (jobType === "gutters_fascias_soffits") return "gutter_lines";
  // Cleaning is priced off roof area — always trace the outline.
  if (jobType === "roof_soft_wash" || jobType === "roof_biocide_treatment") {
    return "outline";
  }
  if (propertyType === "detached" || propertyType === "bungalow") {
    return "gutter_lines";
  }
  return "outline";
}

/* ------------------------------------------------------------------ */
/* Question options (single source of truth for steps + tests)         */
/* ------------------------------------------------------------------ */

export type FlowOption<Value extends string | number> = {
  value: Value;
  label: string;
  hint?: string;
};

export const JOB_TYPE_OPTIONS: FlowOption<JobType>[] = [
  { value: "full_replacement", label: "Full roof replacement" },
  { value: "tile_or_slate_repair", label: "Tile or slate repair" },
  { value: "flat_roof_replacement", label: "New flat roof" },
  { value: "leak_investigation", label: "Leak investigation" },
  { value: "gutters_fascias_soffits", label: "Gutters, fascias & soffits" },
  { value: "roof_soft_wash", label: "Roof soft wash / moss removal" },
  { value: "roof_biocide_treatment", label: "Biocide treatment" },
  { value: "gutter_clearing", label: "Gutter clearing" },
  { value: "other", label: "Something else" },
];

/** Cleaning jobs priced per m² of measured roof (draw the roof, no material). */
export const CLEANING_MEASURED_JOB_TYPES: JobType[] = [
  "roof_soft_wash",
  "roof_biocide_treatment",
];

export const PROPERTY_TYPE_OPTIONS: FlowOption<PropertyType>[] = [
  { value: "detached", label: "Detached" },
  { value: "semi_detached", label: "Semi-detached" },
  { value: "end_of_terrace", label: "End of terrace" },
  { value: "terraced", label: "Terraced" },
  { value: "bungalow", label: "Bungalow" },
  { value: "flat", label: "Flat" },
];

export const STOREY_OPTIONS: FlowOption<StoreyBand>[] = [
  { value: 1, label: "One" },
  { value: 2, label: "Two" },
  { value: 3, label: "Three" },
  { value: 4, label: "Four or more" },
];

export const ROOFLINE_SCOPE_OPTIONS: FlowOption<RooflineScope>[] = [
  { value: "gutters_only", label: "Just gutters", hint: "Replace the gutter runs you marked" },
  {
    value: "gutters_fascias",
    label: "Gutters + fascias & soffits",
    hint: "Gutter runs plus matching fascia / soffit length",
  },
];

export type RepairBand = {
  id: string;
  label: string;
  hint: string;
  representativeAreaM2: number;
};

export const REPAIR_BANDS: RepairBand[] = [
  {
    id: "patch",
    label: "A small patch",
    hint: "A few tiles, up to about 3 m²",
    representativeAreaM2: 2,
  },
  {
    id: "section",
    label: "A section of the roof",
    hint: "Roughly 3–10 m²",
    representativeAreaM2: 6,
  },
  {
    id: "large",
    label: "A large area",
    hint: "Roughly 10–25 m²",
    representativeAreaM2: 17,
  },
  {
    id: "half_roof",
    label: "Half the roof or more",
    hint: "Over 25 m²",
    representativeAreaM2: 35,
  },
];

export function repairBandById(id: string | null): RepairBand | null {
  return REPAIR_BANDS.find((band) => band.id === id) ?? null;
}

/* ------------------------------------------------------------------ */
/* Step sequencing                                                     */
/* ------------------------------------------------------------------ */

const MEASURED_JOB_TYPES: JobType[] = [
  "full_replacement",
  "flat_roof_replacement",
];

export function flowPath(answers: QuoteFlowAnswers): FlowPath {
  const { jobType } = answers;
  if (jobType === null) return "measured";
  if (MEASURED_JOB_TYPES.includes(jobType)) {
    return answers.fallbackReason ? "consultation" : "measured";
  }
  if (CLEANING_MEASURED_JOB_TYPES.includes(jobType)) {
    return answers.fallbackReason ? "consultation" : "measured";
  }
  if (jobType === "gutter_clearing") return "flat";
  if (jobType === "tile_or_slate_repair") return "repair";
  if (jobType === "gutters_fascias_soffits") {
    return answers.fallbackReason ? "consultation" : "roofline";
  }
  return "consultation";
}

export function stepSequence(answers: QuoteFlowAnswers): FlowStepId[] {
  const steps = ((): FlowStepId[] => {
    switch (flowPath(answers)) {
      case "measured": {
        const measured: FlowStepId[] = [
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
        ];
        // Cleaning is measured by area but has no material choice.
        const isCleaning =
          answers.jobType === "roof_soft_wash" ||
          answers.jobType === "roof_biocide_treatment";
        return isCleaning
          ? measured.filter((step) => step !== "material")
          : measured;
      }
      case "repair":
        return [
          "address",
          "job_type",
          "property_type",
          "storeys",
          "repair_size",
          "material",
          "contact",
          "estimate",
          "quote_next",
        ];
      case "roofline":
        return [
          "address",
          "job_type",
          "property_type",
          "storeys",
          "locate",
          "draw_roof",
          "roofline_scope",
          "contact",
          "estimate",
          "quote_next",
        ];
      case "flat":
        return ["address", "job_type", "contact", "estimate", "quote_next"];
      case "consultation":
        return ["address", "job_type", "contact", "consultation"];
    }
  })();
  // A bungalow is single-storey by definition, asking would be redundant.
  return answers.propertyType === "bungalow"
    ? steps.filter((step) => step !== "storeys")
    : steps;
}

export function nextStep(
  answers: QuoteFlowAnswers,
  current: FlowStepId,
): FlowStepId | null {
  const sequence = stepSequence(answers);
  const index = sequence.indexOf(current);
  if (index === -1 || index === sequence.length - 1) return null;
  return sequence[index + 1];
}

export function previousStep(
  answers: QuoteFlowAnswers,
  current: FlowStepId,
): FlowStepId | null {
  const sequence = stepSequence(answers);
  const index = sequence.indexOf(current);
  if (index <= 0) return null;
  const previous = sequence[index - 1];
  // Never step "back" into the transient locate/scan screen; skip over it.
  return previous === "locate" ? sequence[index - 2] ?? null : previous;
}

export function progressPercent(
  answers: QuoteFlowAnswers,
  current: FlowStepId,
): number {
  const sequence = stepSequence(answers);
  const index = sequence.indexOf(current);
  if (index <= 0) return 0;
  return Math.round((index / (sequence.length - 1)) * 100);
}

/* ------------------------------------------------------------------ */
/* Measurement across one or more drawn roofs                          */
/* ------------------------------------------------------------------ */

export type CombinedMeasurement = {
  surfaceAreaM2: number;
  groundAreaM2: number;
  averagePitchDegrees: number;
  roofType: RoofType;
  method: RoofMeasurement["method"];
  perRoof: RoofMeasurement[];
  perimeterM: number;
  gutterLengthM: number;
  chimneyCount: number;
  rooflightCount: number;
};

function pitchMultiplier(averagePitchDegrees: number): number {
  const radians = (averagePitchDegrees * Math.PI) / 180;
  const cos = Math.cos(radians);
  if (!Number.isFinite(cos) || cos <= 0.05) return 1;
  return 1 / cos;
}

export function measureRoofs(
  scan: SolarScan,
  roofs: DrawnRoof[],
): CombinedMeasurement | null {
  const perRoof: RoofMeasurement[] = [];
  let perimeterM = 0;
  let gutterLengthM = 0;
  let chimneyCount = 0;
  let rooflightCount = 0;
  let obstructionSurfaceM2 = 0;
  const acceptedPaths: LatLng[][] = [];

  for (const roof of roofs) {
    if (roof.path.length < 3) continue;
    // Reject outlines that overlap an already-accepted roof by >10% of the
    // new ring's area (defence in depth, DrawRoofStep also blocks this).
    if (
      acceptedPaths.some((existing) =>
        ringsOverlapExcessively(roof.path, existing),
      )
    ) {
      return null;
    }
    try {
      const measured = measureBoundary(scan, roof.path);
      perRoof.push(measured);
      acceptedPaths.push(roof.path);
      perimeterM += polygonPerimeterM(roof.path);
      for (const edgeIndex of roof.gutterEdgeIndices) {
        gutterLengthM += edgeLengthM(roof.path, edgeIndex);
      }
      const multiplier = pitchMultiplier(measured.averagePitchDegrees);
      for (const obstruction of roof.obstructions) {
        obstructionSurfaceM2 += boundsAreaM2(obstruction.bounds) * multiplier;
        if (obstruction.kind === "chimney") chimneyCount += 1;
        else rooflightCount += 1;
      }
    } catch {
      // Skip degenerate outlines; remaining roofs still measure.
    }
  }
  if (perRoof.length === 0) return null;

  const rawSurface = perRoof.reduce((sum, m) => sum + m.surfaceAreaM2, 0);
  const surfaceAreaM2 = Math.max(0, rawSurface - obstructionSurfaceM2);
  const groundAreaM2 = perRoof.reduce((sum, m) => sum + m.groundAreaM2, 0);
  const averagePitchDegrees =
    rawSurface > 0
      ? perRoof.reduce(
          (sum, m) => sum + m.averagePitchDegrees * m.surfaceAreaM2,
          0,
        ) / rawSurface
      : 0;
  const largest = perRoof.reduce((a, b) =>
    b.surfaceAreaM2 > a.surfaceAreaM2 ? b : a,
  );

  return {
    surfaceAreaM2,
    groundAreaM2,
    averagePitchDegrees,
    roofType: largest.roofType,
    method: largest.method,
    perRoof,
    perimeterM,
    gutterLengthM,
    chimneyCount,
    rooflightCount,
  };
}

/**
 * Area/pitch/type for the "gutter_lines" approach: taken directly from the
 * Solar scan's whole-roof stats (no user-drawn polygon involved). Gutter
 * length is the sum of whatever open gutter-run lines were drawn; chimney
 * and rooflight counts come from the step's simple counters rather than
 * spatially-marked boxes.
 */
export function measureWholeRoof(
  scan: SolarScan,
  gutterRuns: LatLng[][],
  chimneyCount: number,
  rooflightCount: number,
): CombinedMeasurement {
  const whole = measureDetached(scan);
  const gutterLengthM = gutterRuns.reduce(
    (sum, run) => sum + pathLengthM(run),
    0,
  );
  return {
    surfaceAreaM2: whole.surfaceAreaM2,
    groundAreaM2: whole.groundAreaM2,
    averagePitchDegrees: whole.averagePitchDegrees,
    roofType: whole.roofType,
    method: whole.method,
    perRoof: [whole],
    perimeterM: 0,
    gutterLengthM,
    chimneyCount,
    rooflightCount,
  };
}

/* ------------------------------------------------------------------ */
/* Quote + lead payload                                                */
/* ------------------------------------------------------------------ */

function isFinitePositive(value: number): boolean {
  return Number.isFinite(value) && value > 0;
}

function isValidMaterialForJob(
  jobType: JobType | null,
  material: Material | null,
  config?: QuoteConfig | null,
): material is Material {
  if (material === null) return false;
  return materialOptionsFor(jobType, config).some(
    (option) => option.value === material,
  );
}

export function computeFlowQuote(
  answers: QuoteFlowAnswers,
  measurement: CombinedMeasurement | null,
  quoteConfig?: QuoteConfig | null,
): QuoteResult | null {
  const path = flowPath(answers);
  const condition = answers.condition ?? "not_sure";
  const access = assessAccess(
    answers.scan,
    answers.storeys,
    answers.propertyType,
    path,
  );
  const storeys = access.estimatedStoreys;
  const { table, model, config } = buildRateTable(quoteConfig ?? null);
  const pricing: PricingContext = { table, model };
  const service = answers.jobType as ServiceKey | null;
  const resolved = resolveAccessForService(
    service,
    config,
    access.scaffoldWeeks,
    access.accessMultiplier,
  );

  // Roof cleaning — priced per m² of measured roof area, no material step.
  if (service === "roof_soft_wash" || service === "roof_biocide_treatment") {
    if (!measurement || !isFinitePositive(measurement.surfaceAreaM2)) {
      return null;
    }
    const clean =
      service === "roof_soft_wash"
        ? config.services.roof_soft_wash
        : config.services.roof_biocide_treatment;
    if (!clean) return null;
    try {
      return calculateCleaningEstimate({
        areaM2: measurement.surfaceAreaM2,
        ratePerM2ExVat: clean.ratePerM2ExVat,
        minCalloutExVat: clean.minCalloutExVat,
        label:
          service === "roof_soft_wash"
            ? "Roof soft wash / moss removal"
            : "Biocide treatment",
        extraAssumptions: access.notes,
      });
    } catch {
      return null;
    }
  }

  // Flat-price services (e.g. gutter clearing) — no measurement needed.
  if (service === "gutter_clearing") {
    const flat = config.services.gutter_clearing;
    if (!flat) return null;
    return calculateFlatEstimate({
      amountExVat: flat.fixedExVat,
      label: "Gutter clearing",
    });
  }

  if (path === "repair") {
    if (!isValidMaterialForJob(answers.jobType, answers.material, config))
      return null;
    const band = repairBandById(answers.repairBandId);
    if (!band || !isFinitePositive(band.representativeAreaM2)) return null;
    try {
      return calculateRepairEstimate({
        areaM2: band.representativeAreaM2,
        material: answers.material as RepairMaterial,
        storeys,
        scaffoldWeeks: resolved.scaffoldWeeks,
        fixedAccessExVat: resolved.fixedAccessExVat,
        includeSkip: false,
        conditionAnswer: condition,
        accessMultiplier: resolved.accessMultiplier,
        extraAssumptions: access.notes,
        extraConfidence: access.extraConfidence,
        pricing,
      });
    } catch {
      return null;
    }
  }

  if (path === "roofline") {
    if (!measurement || answers.rooflineScope === null) return null;
    if (
      !Number.isFinite(measurement.gutterLengthM) ||
      measurement.gutterLengthM <= 0
    ) {
      return null;
    }
    try {
      return calculateRooflineEstimate({
        gutterLengthM: measurement.gutterLengthM,
        includeFascias: answers.rooflineScope === "gutters_fascias",
        storeys,
        scaffoldWeeks: resolved.scaffoldWeeks,
        fixedAccessExVat: resolved.fixedAccessExVat,
        accessMultiplier: resolved.accessMultiplier,
        extraAssumptions: access.notes,
        extraConfidence: access.extraConfidence,
        pricing,
      });
    } catch {
      return null;
    }
  }

  if (path !== "measured" || !answers.scan || !measurement) return null;
  if (!isValidMaterialForJob(answers.jobType, answers.material, config))
    return null;
  if (
    !Number.isFinite(measurement.surfaceAreaM2) ||
    measurement.surfaceAreaM2 <= 0
  ) {
    return null;
  }

  const svcCfg =
    answers.jobType === "flat_roof_replacement"
      ? config.services.flat_roof_replacement
      : config.services.full_replacement;
  const includeSkip = svcCfg?.includeSkip ?? true;
  const includeGutters = svcCfg?.includeGutters ?? true;
  const includeChimney = svcCfg?.includeChimneyAllowance ?? true;

  const linearItems: {
    rateId: "gutter_replace_m";
    quantityM: number;
  }[] = [];
  if (
    includeGutters &&
    Number.isFinite(measurement.gutterLengthM) &&
    measurement.gutterLengthM > 0
  ) {
    linearItems.push({
      rateId: "gutter_replace_m",
      quantityM: measurement.gutterLengthM,
    });
  }

  try {
    return calculateReplacementEstimate({
      areaM2: measurement.surfaceAreaM2,
      roofType:
        answers.jobType === "flat_roof_replacement"
          ? "flat"
          : measurement.roofType,
      material: answers.material as ReplacementMaterial,
      storeys,
      scaffoldWeeks: resolved.scaffoldWeeks,
      fixedAccessExVat: resolved.fixedAccessExVat,
      includeSkip,
      imageryQuality: answers.scan.imageryQuality,
      imageryDateIsOld: isImageryOlderThanThreeYears(answers.scan.imageryDate),
      // Homeowner-drawn outlines keep the wider confidence band on purpose.
      polygonWasEdited: true,
      conditionAnswer: condition,
      linearItems,
      chimneyCount: measurement.chimneyCount,
      includeChimneyAllowance: includeChimney,
      accessMultiplier: resolved.accessMultiplier,
      extraAssumptions: access.notes,
      extraConfidence: access.extraConfidence,
      pricing,
    });
  } catch {
    return null;
  }
}

export function buildLeadPayload(
  answers: QuoteFlowAnswers,
  measurement: CombinedMeasurement | null,
  quote: QuoteResult | null,
  intent: LeadPayload["intent"],
  /** Map framing at submit time. Optional so existing callers/tests that
   *  never showed a map keep working — it stores as null. */
  mapView: LeadPayload["mapView"] = null,
  quoteConfig?: QuoteConfig | null,
): LeadPayload {
  const path = flowPath(answers);
  const primaryRoofPath =
    answers.roofs.length > 0
      ? answers.roofs.reduce((a, b) => (b.path.length > a.path.length ? b : a))
          .path
      : answers.scan
        ? pathFromBounds(answers.scan.boundingBox)
        : null;

  const cfg = quoteConfig ? buildRateTable(quoteConfig).config : null;

  return {
    rooferId: answers.rooferId,
    leadType: path === "consultation" ? "manual_consultation" : "quote",
    intent,
    jobType: answers.jobType ?? "other",
    otherJobDescription:
      answers.otherJobDescription.trim() === ""
        ? null
        : answers.otherJobDescription.trim(),
    address: {
      postcode: answers.address.postcode,
      line: answers.address.line,
      formatted: answers.address.formatted,
    },
    coords: answers.coords,
    solar: {
      areaM2: measurement?.surfaceAreaM2 ?? null,
      groundAreaM2: measurement?.groundAreaM2 ?? null,
      pitchDegrees: measurement?.averagePitchDegrees ?? null,
      roofType: measurement?.roofType ?? null,
      measurementMethod: measurement?.method ?? null,
      segmentContributions: measurement?.perRoof.flatMap(
        (roof) => roof.contributions,
      ) ?? [],
      segments: answers.scan?.roofSegmentStats ?? [],
      wholeRoofStats: answers.scan?.wholeRoofStats ?? null,
      imageryQuality: answers.scan?.imageryQuality ?? null,
      imageryDate: answers.scan?.imageryDate ?? null,
    },
    polygonCoords: primaryRoofPath,
    mapView,
    conditionAnswer: answers.condition,
    conditionFlagged: answers.condition === "yes",
    material: answers.material,
    propertyType: answers.propertyType,
    storeys: answers.storeys,
    quoteRange: quote ? { minExVat: quote.min, maxExVat: quote.max } : null,
    contact: {
      name: answers.contact.name.trim(),
      phone: answers.contact.phone.trim(),
      email: answers.contact.email.trim(),
    },
    fallbackReason: answers.fallbackReason,
    timestamp: new Date().toISOString(),
    roofline:
      path === "roofline" || (measurement && measurement.gutterLengthM > 0)
        ? {
            perimeterM: measurement?.perimeterM ?? null,
            gutterLengthM: measurement?.gutterLengthM ?? null,
            scope: answers.rooflineScope,
          }
        : null,
    obstructions: measurement
      ? {
          chimneys: measurement.chimneyCount,
          rooflights: measurement.rooflightCount,
        }
      : null,
    pricingSnapshot: cfg
      ? {
          version: 1 as const,
          fingerprint: configFingerprint(cfg),
          enabledServices: cfg.enabledServices,
        }
      : null,
  };
}
